"""
Vector RAG Manager for NodeLine Tech
Implements true RAG with embeddings and vector database using ChromaDB
"""

import os
import json
import uuid
import hashlib
import logging
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional, Tuple, Any

# Disable all external telemetry BEFORE importing chromadb to avoid PostHog issues
os.environ.setdefault('ANONYMIZED_TELEMETRY', 'False')
os.environ.setdefault('CHROMA_TELEMETRY_ENABLED', 'false')
os.environ.setdefault('CHROMADB_TELEMETRY_DISABLED', 'true')
os.environ.setdefault('POSTHOG_DISABLED', 'true')

# Set HuggingFace cache directories BEFORE importing transformers/sentence-transformers
os.environ['TRANSFORMERS_CACHE'] = '/app/data/transformers_cache'
os.environ['HF_HOME'] = '/app/data/huggingface_cache'
os.environ['HF_DATASETS_CACHE'] = '/app/data/huggingface_cache'
os.environ['SENTENCE_TRANSFORMERS_HOME'] = '/app/data/sentence_transformers_cache'

import chromadb
from chromadb.config import Settings
from sentence_transformers import SentenceTransformer
import numpy as np

from .knowledge_base_manager import KnowledgeBaseManager

class VectorRAGManager:
    def __init__(self, 
                 knowledge_base_path: str = "knowledge_base",
                 vector_db_path: str = "vector_db",
                 embedding_model: str = "all-MiniLM-L6-v2"):
        """Initialize Vector RAG Manager with ChromaDB and embeddings"""
        
        self.kb_path = Path(knowledge_base_path)
        self.vector_db_path = Path(vector_db_path)
        self.embedding_model_name = embedding_model
        
        # Create directories
        self.kb_path.mkdir(exist_ok=True)
        self.vector_db_path.mkdir(exist_ok=True)
        
        # Initialize knowledge base manager
        self.kb_manager = KnowledgeBaseManager(knowledge_base_path)
        
        # Initialize ChromaDB client (explicitly disable telemetry)
        self.chroma_client = chromadb.PersistentClient(
            path=str(self.vector_db_path),
            settings=Settings(
                anonymized_telemetry=False,
                allow_reset=True
            )
        )
        
        # Initialize embedding model
        logging.info(f"Loading embedding model: {embedding_model}")
        self.embedding_model = SentenceTransformer(embedding_model)
        logging.info(f"Embedding model loaded. Dimension: {self.embedding_model.get_sentence_embedding_dimension()}")
        
        # Collection name for document chunks
        self.collection_name = "nlt_documents"
        
        # Document chunking parameters (token-based for better quality)
        # Reduced from 300 to 200 tokens for more focused, relevant chunks
        self.chunk_size_tokens = 200  # target tokens per chunk (smaller = more focused)
        self.chunk_overlap_tokens = 30  # ~15% overlap (maintains context)
        
        # Approximate token conversion (rough estimate: 1 token ≈ 4 characters)
        self.chunk_size = self.chunk_size_tokens * 4  # ~800 chars
        self.chunk_overlap = self.chunk_overlap_tokens * 4  # ~120 chars
        
        # Initialize or get collection
        self._init_collection()
    
    def _init_collection(self):
        """Initialize or get the ChromaDB collection"""
        try:
            self.collection = self.chroma_client.get_collection(
                name=self.collection_name
            )
            logging.info(f"Loaded existing collection '{self.collection_name}' with {self.collection.count()} documents")
        except Exception:
            # Collection doesn't exist, create it (handle older/newer API differences)
            try:
                self.collection = self.chroma_client.create_collection(
                    name=self.collection_name,
                    metadata={"description": "NodeLine Tech knowledge base embeddings"}
                )
            except Exception:
                # Fallback without metadata
                self.collection = self.chroma_client.create_collection(
                    name=self.collection_name
                )
            logging.info(f"Created new collection '{self.collection_name}'")
    
    def estimate_tokens(self, text: str) -> int:
        """Rough token estimation: ~1 token per 4 characters for English text"""
        return max(1, len(text) // 4)
    
    def normalize_content(self, content: str) -> str:
        """
        Clean and normalize content before chunking
        Removes boilerplate, headers/footers, nav menus, TOCs, contact blocks
        """
        import re
        
        # Remove common boilerplate patterns
        boilerplate_patterns = [
            r'Copyright \d{4}.*?All rights reserved\.?',
            r'© \d{4}.*?(?:\n|$)',
            r'Contact us:.*?(?:\n\n|$)',
            r'For more information.*?(?:\n\n|$)',
            r'Visit our website.*?(?:\n\n|$)',
            r'Call us at.*?(?:\n\n|$)',
            r'Email:.*?(?:\n\n|$)',
            r'Phone:.*?(?:\n\n|$)',
            r'Address:.*?(?:\n\n|$)',
            r'Table of Contents.*?(?:\n\n|\n(?=[A-Z]))',
            r'TOC:.*?(?:\n\n|\n(?=[A-Z]))',
            r'Navigation:.*?(?:\n\n|$)',
            r'Home \| Products \| Support.*?(?:\n|$)',
            r'Back to top.*?(?:\n|$)',
            r'Print this page.*?(?:\n|$)',
            r'Share:.*?(?:\n|$)',
            r'Related articles:.*?(?:\n\n|$)',
            r'See also:.*?(?:\n\n|$)',
            r'Last updated:.*?(?:\n|$)',
            r'Page \d+ of \d+.*?(?:\n|$)',
        ]
        
        cleaned_content = content
        for pattern in boilerplate_patterns:
            cleaned_content = re.sub(pattern, '', cleaned_content, flags=re.IGNORECASE | re.DOTALL)
        
        # Remove excessive whitespace and normalize line breaks
        cleaned_content = re.sub(r'\n\s*\n\s*\n+', '\n\n', cleaned_content)  # Max 2 consecutive newlines
        cleaned_content = re.sub(r'[ \t]+', ' ', cleaned_content)  # Normalize spaces
        cleaned_content = re.sub(r'\n ', '\n', cleaned_content)  # Remove leading spaces on lines
        
        # Remove repetitive elements (like repeated contact info)
        lines = cleaned_content.split('\n')
        deduped_lines = []
        seen_lines = set()
        
        for line in lines:
            line_clean = line.strip().lower()
            # Skip very short lines or highly repetitive content
            if len(line_clean) < 10:  
                deduped_lines.append(line)
                continue
                
            # Check for repetitive patterns
            if line_clean not in seen_lines:
                deduped_lines.append(line)
                seen_lines.add(line_clean)
            elif len(seen_lines) < 50:  # Allow some repetition in small docs
                deduped_lines.append(line)
        
        return '\n'.join(deduped_lines).strip()
    
    def chunk_text(self, text: str, chunk_size_tokens: Optional[int] = None, 
                   chunk_overlap_tokens: Optional[int] = None) -> List[str]:
        """
        Split text into overlapping chunks optimized for RAG retrieval
        Uses token-based sizing (200-400 tokens) with 10-15% overlap
        Enhanced with product manual structure awareness
        """
        target_tokens = chunk_size_tokens or self.chunk_size_tokens
        overlap_tokens = chunk_overlap_tokens or self.chunk_overlap_tokens
        
        # Convert to character estimates
        target_chars = target_tokens * 4
        overlap_chars = overlap_tokens * 4
        
        if self.estimate_tokens(text) <= target_tokens:
            return [text]
        
        chunks = []
        start = 0
        
        while start < len(text):
            end = start + target_chars
            
            # Try to end at optimal boundaries (product sections > sentences > paragraphs > words)
            if end < len(text):
                # Priority 1: Product section boundaries (for product manuals)
                product_boundaries = [
                    '\n### NLT-',  # Product headers like ### NLT-HDMI-8K-10FT
                    '\n## Product ',  # Section headers like ## Product Overview
                    '\n## Compatibility',  # Other major sections
                    '\n## Installation',
                    '\n## Troubleshooting'
                ]
                best_end = end
                
                # Look for product boundaries within last 30% of chunk
                search_range = int(target_chars * 0.3)
                for i in range(max(end - search_range, start), end):
                    for boundary in product_boundaries:
                        if text[i:].startswith(boundary):
                            best_end = i
                            break
                    if best_end != end:
                        break
                
                # Priority 2: Sentence boundaries within reasonable range
                if best_end == end:
                    sentence_ends = ['. ', '! ', '? ', '.\n', '!\n', '?\n']
                    # Look for sentence endings within last 20% of chunk
                    search_range = int(target_chars * 0.2)
                    for i in range(max(end - search_range, start), end):
                        for sentence_end in sentence_ends:
                            if text[i:i+len(sentence_end)] == sentence_end:
                                best_end = i + len(sentence_end)
                                break
                        if best_end != end:
                            break
                
                # Priority 3: Paragraph boundaries if no sentence found
                if best_end == end:
                    search_range = int(target_chars * 0.2)
                    for i in range(max(end - search_range, start), end):
                        if text[i:i+2] == '\n\n':
                            best_end = i + 2
                            break
                
                # Priority 4: Word boundaries as fallback
                if best_end == end:
                    for i in range(end - 1, max(end - 50, start), -1):
                        if text[i] == ' ':
                            best_end = i + 1
                            break
                
                end = best_end
            
            chunk = text[start:end].strip()
            if chunk and len(chunk) > 50:  # Only include meaningful chunks
                # Verify token count is reasonable
                chunk_tokens = self.estimate_tokens(chunk)
                if chunk_tokens >= 50:  # Minimum chunk size
                    chunks.append(chunk)
            
            # Move start position with overlap
            start = end - overlap_chars
            if start >= len(text):
                break
        
        return chunks
    
    def generate_embedding(self, text: str) -> List[float]:
        """Generate embedding for a text using sentence transformer"""
        embedding = self.embedding_model.encode(text, convert_to_tensor=False)
        return embedding.tolist()
    
    def index_documents(self, force_reindex: bool = False) -> Dict[str, int]:
        """
        Index all documents in the knowledge base into ChromaDB
        """
        logging.info("Starting document indexing...")
        
        # Scan knowledge base
        self.kb_manager.scan_documents()
        
        # Check if we need to reindex
        if not force_reindex:
            current_count = self.collection.count()
            total_docs = sum(len(cat['documents']) for cat in self.kb_manager.documents.values())
            
            if current_count > 0:
                logging.info(f"Collection already has {current_count} chunks. Use force_reindex=True to rebuild.")
                return {"existing_chunks": current_count, "documents": total_docs}
        
        # Clear existing collection if force reindex
        if force_reindex and self.collection.count() > 0:
            logging.info("Clearing existing collection for reindexing...")
            self.chroma_client.delete_collection(self.collection_name)
            self.collection = self.chroma_client.create_collection(
                name=self.collection_name,
                metadata={"description": "NodeLine Tech knowledge base embeddings"}
            )
        
        # Process all documents
        stats = {"documents": 0, "chunks": 0, "categories": {}}
        
        for category, cat_info in self.kb_manager.documents.items():
            stats["categories"][category] = 0
            
            for doc_info in cat_info["documents"]:
                logging.info(f"Processing: {doc_info['title']}")
                
                # Load document content
                content = self.kb_manager.load_document_content(doc_info['path'])
                if not content:
                    continue
                
                # Normalize and clean content before chunking
                normalized_content = self.normalize_content(content)
                if not normalized_content or len(normalized_content) < 100:
                    logging.warning(f"Skipping {doc_info['title']} - content too short after normalization")
                    continue
                
                # Chunk the normalized document
                chunks = self.chunk_text(normalized_content)
                
                # Process each chunk
                chunk_ids = []
                chunk_texts = []
                chunk_embeddings = []
                chunk_metadatas = []
                
                for i, chunk in enumerate(chunks):
                    chunk_id = f"{doc_info['filename']}_{i}"
                    
                    chunk_ids.append(chunk_id)
                    chunk_texts.append(chunk)
                    
                    # Generate embedding
                    embedding = self.generate_embedding(chunk)
                    chunk_embeddings.append(embedding)
                    
                    # Create metadata
                    metadata = {
                        "document_title": doc_info['title'],
                        "document_path": doc_info['path'],
                        "category": category,
                        "chunk_index": i,
                        "total_chunks": len(chunks),
                        "document_filename": doc_info['filename']
                    }
                    chunk_metadatas.append(metadata)
                
                # Add chunks to collection
                if chunk_ids:
                    self.collection.add(
                        ids=chunk_ids,
                        embeddings=chunk_embeddings,
                        documents=chunk_texts,
                        metadatas=chunk_metadatas
                    )
                    
                    stats["chunks"] += len(chunk_ids)
                    stats["categories"][category] += len(chunk_ids)
                
                stats["documents"] += 1
        
        logging.info(f"Indexing complete! Processed {stats['documents']} documents into {stats['chunks']} chunks")
        return stats
    
    def calculate_relevance_score(self, query: str, chunk: str, metadata: Dict) -> float:
        """
        Calculate enhanced relevance score using multiple signals
        """
        query_lower = query.lower()
        chunk_lower = chunk.lower()
        
        score = 0.0
        
        # Exact phrase matches (high value)
        for word in query_lower.split():
            if len(word) > 3:  # Skip short words
                if word in chunk_lower:
                    score += 0.3
                    # Bonus for multiple occurrences
                    score += 0.1 * (chunk_lower.count(word) - 1)
        
        # Category relevance bonus
        category = metadata.get('category', '').lower()
        if 'policy' in query_lower and 'policies' in category:
            score += 0.2
        elif 'manual' in query_lower and 'manual' in category:
            score += 0.2
        elif 'faq' in query_lower and 'faq' in category:
            score += 0.2
        
        # Policy-specific query matching (warranty, return, shipping)
        policy_types = {
            'warranty': ['warranty', 'guarantee', 'defect', 'lifetime', 'coverage', 'claim'],
            'return': ['return', 'refund', 'money-back', 'exchange'],
            'shipping': ['shipping', 'delivery', 'freight', 'ship']
        }
        
        # Detect policy type in query
        detected_policy = None
        for policy_type, keywords in policy_types.items():
            if any(kw in query_lower for kw in keywords):
                detected_policy = policy_type
                break
        
        # Boost chunks that match the detected policy type
        if detected_policy:
            policy_keywords = policy_types[detected_policy]
            matches = sum(1 for kw in policy_keywords if kw in chunk_lower)
            score += 0.20 * matches  # Increased from 0.15 to boost correct policy type more
            
            # Penalize chunks about OTHER policy types (stronger penalty)
            for other_type, other_keywords in policy_types.items():
                if other_type != detected_policy:
                    # Count how many keywords from the WRONG policy appear
                    wrong_matches = sum(1 for kw in other_keywords[:3] if kw in chunk_lower)
                    if wrong_matches > 0:
                        score -= 0.25 * wrong_matches  # Much stronger penalty
        
        # Penalize boilerplate/footer content more aggressively
        boilerplate_indicators = [
            'contact our customer service',
            'email:',
            'phone:',
            'mailing address',
            'policy effective',
            'subject to change',
            '@nodelinetech.com',
            'live chat:',
            'social media:',
            '[corporate'
        ]
        boilerplate_count = sum(1 for indicator in boilerplate_indicators if indicator in chunk_lower)
        if boilerplate_count > 0:
            score -= 0.25 * boilerplate_count  # Stronger penalty, scales with amount of boilerplate
        
        # Product type matching
        product_terms = {
            'usb-c': ['usb-c', 'usbc', 'type-c'],
            'hdmi': ['hdmi', '4k', '8k', 'display'],
            'lightning': ['lightning', 'iphone', 'apple'],
            'usb-a': ['usb-a', 'usba', 'standard usb']
        }
        
        for product, variants in product_terms.items():
            if any(variant in query_lower for variant in variants):
                if any(variant in chunk_lower for variant in variants):
                    score += 0.25
        
        # Length penalty for very long chunks (prefer concise answers)
        if len(chunk) > 800:
            score -= 0.1
        
        # Chunk position bonus (earlier chunks often have key info)
        chunk_index = metadata.get('chunk_index', 0)
        if chunk_index == 0:
            score += 0.1
        elif chunk_index == 1:
            score += 0.05
        
        return score
    
    def semantic_search(self, query: str, n_results: int = 5) -> List[Dict[str, Any]]:
        """
        Perform semantic search using ChromaDB
        """
        if self.collection.count() == 0:
            logging.warning("Collection is empty. Run index_documents() first.")
            return []
        
        # Generate query embedding
        query_embedding = self.generate_embedding(query)
        
        # Search in ChromaDB
        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=min(n_results, self.collection.count()),
            include=["documents", "metadatas", "distances"]
        )
        
        # Format results
        formatted_results = []
        if results['documents'] and results['documents'][0]:
            documents = results['documents'][0]
            metadatas = results['metadatas'][0]
            distances = results['distances'][0]
            
            for i, (doc, metadata, distance) in enumerate(zip(documents, metadatas, distances)):
                # ChromaDB uses L2 (squared Euclidean) distance by default
                # For normalized embeddings, we can convert L2 to cosine similarity:
                # cosine_similarity = 1 - (L2_distance^2 / 2)
                # But distances returned might already be squared, so let's use inverse distance as similarity
                # Lower distance = higher similarity
                # For L2 distance on normalized vectors: distance typically ranges 0-2
                # Convert to similarity score where 0 distance = 1.0 similarity
                if distance < 0.0001:  # Perfect match
                    similarity = 1.0
                else:
                    # For L2 distance on normalized vectors: similarity ≈ 1 - (distance²/2)
                    # But ChromaDB already returns squared distance, so: similarity = 1 - (distance/2)
                    similarity = max(0.0, 1.0 - (distance / 2.0))
                
                formatted_results.append({
                    "document": doc,
                    "metadata": metadata,
                    "similarity": similarity,
                    "distance": distance,  # Keep original distance for debugging
                    "rank": i + 1
                })
        
        return formatted_results
    
    def retrieve_and_rerank(self, query: str, initial_k: int = 20, final_k: int = 5, 
                          similarity_threshold: float = 0.30) -> List[Dict[str, Any]]:
        """
        Retrieve top-k candidates and re-rank to final top results
        This is the core optimization for better RAG quality
        
        Args:
            query: Search query
            initial_k: Number of candidates to retrieve initially
            final_k: Number of final results to return
            similarity_threshold: Minimum similarity score (0.20 for L2 distance conversion)
        """
        # Step 1: Retrieve top 20 candidates using vector similarity
        candidates = self.semantic_search(query, n_results=initial_k)
        
        if not candidates:
            return []
        
        # Filter by similarity threshold before reranking
        candidates = [c for c in candidates if c['similarity'] >= similarity_threshold]
        
        if not candidates:
            logging.info(f"No candidates meet similarity threshold {similarity_threshold}")
            return []
        
        logging.debug(f"Filtered to {len(candidates)} candidates meeting threshold {similarity_threshold}")
        
        # Step 2: Re-rank using enhanced relevance scoring
        for candidate in candidates:
            # Combine vector similarity with relevance scoring
            relevance_score = self.calculate_relevance_score(
                query, 
                candidate['document'], 
                candidate['metadata']
            )
            
            # Weighted combination: 70% vector similarity + 30% relevance features
            candidate['final_score'] = (0.7 * candidate['similarity']) + (0.3 * relevance_score)
            candidate['relevance_score'] = relevance_score
            
            # Debug logging for top candidates
            if candidate['similarity'] > 0.40:
                doc_title = candidate['metadata'].get('document_title', 'Unknown')[:30]
                content_preview = candidate['document'][:50].replace('\n', ' ')
                logging.debug(f"Rerank: '{doc_title}' sim={candidate['similarity']:.3f}, rel={relevance_score:.3f}, final={candidate['final_score']:.3f}, preview='{content_preview}'")
        
        # Step 3: Re-sort by final score and take top results
        reranked = sorted(candidates, key=lambda x: x['final_score'], reverse=True)
        
        # Step 4: Diversity filtering - avoid too many chunks from same document
        final_results = []
        seen_documents = set()
        
        for result in reranked:
            doc_title = result['metadata']['document_title']
            
            # Allow max 2 chunks per document in final results
            doc_count = sum(1 for r in final_results if r['metadata']['document_title'] == doc_title)
            
            if doc_count < 2 or len(final_results) < final_k // 2:
                final_results.append(result)
                seen_documents.add(doc_title)
                
                if len(final_results) >= final_k:
                    break
        
        return final_results
    
    def retrieve_and_rerank_filtered(self, query: str, target_categories: List[str], 
                                   initial_k: int = 20, final_k: int = 5, 
                                   similarity_threshold: float = 0.30) -> List[Dict[str, Any]]:
        """
        Category-filtered retrieve and rerank for section routing
        
        Args:
            query: Search query
            target_categories: Categories to filter by
            initial_k: Number of candidates to retrieve initially
            final_k: Number of final results to return
            similarity_threshold: Minimum similarity score (0.20 for L2 distance conversion)
        """
        if self.collection.count() == 0:
            logging.warning("Collection is empty. Run index_documents() first.")
            return []
        
        # Generate query embedding
        query_embedding = self.generate_embedding(query)
        
        # Search with larger initial pool for filtering
        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=min(initial_k * 2, self.collection.count()),  # Get more for filtering
            include=["documents", "metadatas", "distances"]
        )
        
        # Filter by target categories first
        category_filtered = []
        if results['documents'] and results['documents'][0]:
            documents = results['documents'][0]
            metadatas = results['metadatas'][0]
            distances = results['distances'][0]
            
            for doc, metadata, distance in zip(documents, metadatas, distances):
                if metadata.get('category', '').lower() in [cat.lower() for cat in target_categories]:
                    # Use same similarity calculation as semantic_search
                    if distance < 0.0001:
                        similarity = 1.0
                    else:
                        similarity = max(0.0, 1.0 - (distance / 2.0))
                    
                    # Apply similarity threshold to filter out low-similarity documents
                    if similarity >= similarity_threshold:
                        category_filtered.append({
                            "document": doc,
                            "metadata": metadata,
                            "similarity": similarity
                        })
                    else:
                        # Log filtered documents at debug level
                        doc_title = metadata.get('document_title', 'Unknown')[:40]
                        logging.debug(f"Filtered out '{doc_title}': similarity={similarity:.3f} < threshold {similarity_threshold}")
        
        # If we don't have enough results from target categories, fall back to general search
        if len(category_filtered) < final_k:
            logging.info(f"Only {len(category_filtered)} results in target categories meet threshold, falling back to general search")
            return self.retrieve_and_rerank(query, initial_k, final_k, similarity_threshold)
        
        # Apply reranking to filtered results
        for candidate in category_filtered[:initial_k]:  # Limit to initial_k for reranking
            relevance_score = self.calculate_relevance_score(
                query, 
                candidate['document'], 
                candidate['metadata']
            )
            candidate['final_score'] = (0.7 * candidate['similarity']) + (0.3 * relevance_score)
            candidate['relevance_score'] = relevance_score
        
        # Sort by final score and apply diversity filtering
        reranked = sorted(category_filtered[:initial_k], key=lambda x: x['final_score'], reverse=True)
        
        # Log top results for debugging
        if reranked:
            logging.info(f"Top result: similarity={reranked[0]['similarity']:.3f}, final_score={reranked[0]['final_score']:.3f}")
        
        # Diversity filtering
        final_results = []
        seen_documents = set()
        
        for result in reranked:
            doc_title = result['metadata']['document_title']
            doc_count = sum(1 for r in final_results if r['metadata']['document_title'] == doc_title)
            
            if doc_count < 2 or len(final_results) < final_k // 2:
                final_results.append(result)
                seen_documents.add(doc_title)
                
                if len(final_results) >= final_k:
                    break
        
        return final_results
    
    def get_relevant_context(self, query: str, n_results: int = 5, 
                           similarity_threshold: float = 0.20) -> str:
        """
        Get relevant context for a query using semantic search
        
        Args:
            query: Search query
            n_results: Maximum number of results to return
            similarity_threshold: Minimum similarity score (0.20 for L2 distance conversion)
        """
        # Perform semantic search
        results = self.semantic_search(query, n_results)
        
        # Filter by similarity threshold
        relevant_results = [
            r for r in results 
            if r["similarity"] >= similarity_threshold
        ]
        
        if not relevant_results:
            return ""
        
        # Build context string
        context_parts = []
        total_length = 0
        max_context_length = 2000
        
        # Group chunks by document to avoid repetition
        doc_chunks = {}
        for result in relevant_results:
            doc_title = result["metadata"]["document_title"]
            if doc_title not in doc_chunks:
                doc_chunks[doc_title] = []
            doc_chunks[doc_title].append(result)
        
        # Build context from best chunks per document
        for doc_title, chunks in doc_chunks.items():
            # Sort chunks by similarity
            chunks.sort(key=lambda x: x["similarity"], reverse=True)
            
            # Take best chunk from this document
            best_chunk = chunks[0]
            
            doc_header = f"\n--- {doc_title} (Category: {best_chunk['metadata']['category']}) ---\n"
            chunk_content = best_chunk["document"]
            
            combined_length = len(doc_header) + len(chunk_content)
            
            if total_length + combined_length > max_context_length:
                # Truncate to fit
                remaining_space = max_context_length - total_length - len(doc_header)
                if remaining_space > 100:
                    chunk_content = chunk_content[:remaining_space] + "..."
                    context_parts.append(doc_header + chunk_content)
                break
            
            context_parts.append(doc_header + chunk_content)
            total_length += combined_length
        
        return "".join(context_parts)
    
    def get_collection_stats(self) -> Dict[str, Any]:
        """Get statistics about the vector database"""
        try:
            count = self.collection.count()
            
            # Get sample of metadata to analyze categories
            if count > 0:
                sample_results = self.collection.get(limit=min(count, 100))
                categories = {}
                
                if sample_results["metadatas"]:
                    for metadata in sample_results["metadatas"]:
                        cat = metadata.get("category", "unknown")
                        categories[cat] = categories.get(cat, 0) + 1
                
                return {
                    "total_chunks": count,
                    "categories": categories,
                    "embedding_dimension": self.embedding_model.get_sentence_embedding_dimension(),
                    "collection_name": self.collection_name
                }
            else:
                return {
                    "total_chunks": 0,
                    "categories": {},
                    "embedding_dimension": self.embedding_model.get_sentence_embedding_dimension(),
                    "collection_name": self.collection_name
                }
        
        except Exception as e:
            return {"error": str(e)}

# Production ready - no test code included
