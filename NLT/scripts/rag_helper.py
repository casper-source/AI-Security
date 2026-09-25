"""
RAG (Retrieval-Augmented Generation) Helper for NodeLine Tech Chatbot
Integrates knowledge base search with chatbot responses
Now supports both simple keyword search and advanced vector-based semantic search
"""

import json
import logging
from typing import List, Dict, Optional, Tuple
from .knowledge_base_manager import KnowledgeBaseManager

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Try to import vector RAG components (fallback to keyword search if not available)
try:
    from .vector_rag_manager import VectorRAGManager
    VECTOR_RAG_AVAILABLE = True
except ImportError:
    VECTOR_RAG_AVAILABLE = False
    print("Vector RAG dependencies not available. Using keyword search fallback.")

class RAGHelper:
    def __init__(self, knowledge_base_path: str = "knowledge_base", use_vector_search: bool = True):
        """Initialize RAG helper with knowledge base and optional vector search"""
        self.knowledge_base_path = knowledge_base_path
        self.use_vector_search = use_vector_search and VECTOR_RAG_AVAILABLE
        
        # Initialize knowledge base manager (always needed)
        self.kb_manager = KnowledgeBaseManager(knowledge_base_path)
        self.kb_manager.scan_documents()
        
        # Initialize vector RAG if available and requested
        self.vector_rag = None
        if self.use_vector_search:
            try:
                print("Initializing Vector RAG Manager...")
                # Use /app/data/vector_db for writable storage in Docker container
                vector_db_path = "/app/data/vector_db"
                self.vector_rag = VectorRAGManager(knowledge_base_path, vector_db_path=vector_db_path)
                print("Vector RAG Manager initialized successfully!")
            except Exception as e:
                print(f"Failed to initialize Vector RAG: {e}")
                self.use_vector_search = False
        
        # Configuration for RAG
        self.max_context_docs = 2
        self.max_context_length = 1000
        self._query_cache = {}
        self.relevance_threshold = 1  # Minimum relevance score to include (for keyword search)
        self.similarity_threshold = 0.30  # Increased from 0.20 - be more selective about what's relevant
        
    def _route_query_to_categories(self, query: str) -> List[str]:
        """
        Route queries to specific KB categories for focused retrieval
        Enhanced with specific product type detection
        """
        query_lower = query.lower()
        prioritized_categories = []
        
        # Check for specific product types first (highest priority)
        product_type_keywords = {
            'lightning': ['lightning', 'iphone', 'ipad', 'ipod', 'apple', 'mfi'],
            'usb-c': ['usb-c', 'usbc', 'type-c', 'usb c'],
            'hdmi': ['hdmi', '4k', '8k', 'video', 'display', 'monitor', 'tv'],
            'audio': ['audio', '3.5mm', 'headphone', 'speaker', 'aux'],
        }
        
        # If query mentions specific products, prioritize product_manuals
        for product_type, keywords in product_type_keywords.items():
            if any(keyword in query_lower for keyword in keywords):
                prioritized_categories = ['product_manuals', 'faqs', 'policies']
                logger.info(f"🎯 Product-specific query detected ({product_type}) - prioritizing product_manuals")
                return prioritized_categories
        
        # Category routing rules (existing logic)
        category_keywords = {
            'policies': [
                'return', 'refund', 'warranty', 'guarantee', 'exchange', 
                'policy', 'shipping', 'delivery', 'payment',
                'money back', 'cancel', 'replacement'
            ],
            'faqs': [
                'how to', 'what is', 'why does', 'when should', 'where can',
                'help', 'problem', 'issue', 'troubleshoot', 'not working',
                'question', 'support', 'compatibility'
            ],
            'product_manuals': [
                'specifications', 'specs', 'technical', 'manual', 'guide',
                'installation', 'setup', 'configure', 'use', 'connect',
                'length', 'size', 'connector', 'pin', 'voltage', 'model', 'recommend'
            ],
            'development': [
                'api', 'endpoint', 'authentication', 'token', 'key', 'secret',
                'development', 'internal', 'admin', 'credentials', 'login',
                'password', 'database', 'security', 'vulnerability', 'documentation'
            ]
        }
        
        # Score each category
        category_scores = {}
        for category, keywords in category_keywords.items():
            score = sum(1 for keyword in keywords if keyword in query_lower)
            if score > 0:
                category_scores[category] = score
        
        # Sort by relevance score
        if category_scores:
            prioritized_categories = sorted(
                category_scores.keys(), 
                key=lambda x: category_scores[x], 
                reverse=True
            )
            logger.info(f"🎯 Query routed to categories: {prioritized_categories} (scores: {category_scores})")
        else:
            # No specific routing, search all categories
            prioritized_categories = ['policies', 'faqs', 'product_manuals', 'development']
            logger.info("🔄 No category match - searching all categories")
        
        return prioritized_categories
    
    def get_relevant_context(self, query: str, max_docs: Optional[int] = None) -> str:
        """
        Get relevant context from knowledge base for a query
        Uses section routing + vector search if available, falls back to keyword search
        Returns formatted context string for LLM
        """
        max_docs = max_docs or self.max_context_docs
        cache_key = (query.strip().lower(), max_docs)
        cached = self._query_cache.get(cache_key)
        if cached is not None:
            logger.info("RAG cache hit")
            return cached
        
        logger.info(f"🔍 RAG LOOKUP TRIGGERED - Query: '{query}' (max_docs: {max_docs})")
        
        # Step 1: Route query to relevant categories
        target_categories = self._route_query_to_categories(query)
        
        # Use vector search with section routing if available
        if self.use_vector_search and self.vector_rag:
            try:
                logger.info(f"📊 Using SECTION-ROUTED RETRIEVE-AND-RERANK (categories: {target_categories}, threshold: {self.similarity_threshold})")
                
                # Use category-filtered retrieve-and-rerank pipeline
                reranked_results = self.vector_rag.retrieve_and_rerank_filtered(
                    query, 
                    target_categories=target_categories,
                    initial_k=8,
                    final_k=max_docs,
                    similarity_threshold=self.similarity_threshold
                )
                
                if reranked_results:
                    # Log reranking effectiveness
                    scores_info = []
                    for r in reranked_results[:3]:
                        vec_sim = r['similarity']
                        rel_score = r['relevance_score']
                        final_score = r['final_score']
                        category = r['metadata']['category']
                        doc_title = r['metadata']['document_title'][:30]  # Truncate title
                        scores_info.append(f"{doc_title}(sim:{vec_sim:.3f},final:{final_score:.3f})")
                    logger.info(f"🎯 Top {len(reranked_results)} results: {', '.join(scores_info)}")
                else:
                    logger.info(f"⚠️ No results met similarity threshold {self.similarity_threshold}")
                
                # Apply content-specific filtering to prioritize most relevant chunks
                filtered_results = self._filter_results_by_content_relevance(reranked_results, query)
                logger.info(f"🔍 Content filtering retained {len(filtered_results)} of {len(reranked_results)} results")
                
                # Build context from filtered results
                context = self._build_context_from_results(filtered_results)
                logger.info(f"✅ Section-routed search returned {len(context)} characters of context")
                return self._cache_context(cache_key, context)
            except Exception as e:
                logger.warning(f"❌ Section-routed search failed, falling back to keyword search: {e}")
                # Fall through to keyword search
        
        # Fallback to keyword search
        logger.info("📝 Using KEYWORD SEARCH for RAG lookup")
        context = self._get_keyword_context(query, max_docs)
        logger.info(f"✅ Keyword search returned {len(context)} characters of context")
        return self._cache_context(cache_key, context)

    def _cache_context(self, cache_key, context):
        if len(self._query_cache) >= 64:
            self._query_cache.pop(next(iter(self._query_cache)))
        self._query_cache[cache_key] = context
        return context
    
    def _get_keyword_context(self, query: str, max_docs: int) -> str:
        """
        Original keyword-based context retrieval (fallback method)
        Enhanced with specific product detection
        """
        query_lower = query.lower()
        
        # Check for specific product requests and force load relevant files
        if any(keyword in query_lower for keyword in ['lightning', 'iphone', 'ipad', 'apple', 'mfi']):
            logger.info("🍎 Lightning cable query detected - loading lightning_cables.md")
            lightning_results = self._force_load_specific_document('product_manuals/lightning_cables.md')
            if lightning_results:
                return lightning_results
        
        # Search knowledge base with full query first
        results = self.kb_manager.search_documents(query)
        
        # If no results with full query, try individual important words
        if not results:
            important_words = [
                word.lower().strip('.,!?') for word in query.split() 
                if len(word) > 3 and word.lower() not in ['what', 'how', 'when', 'where', 'why', 'can', 'will', 'would', 'could', 'should', 'the', 'and', 'for', 'with']
            ]
            
            # Try each important word and combine results
            all_results = {}
            for word in important_words:
                word_results = self.kb_manager.search_documents(word)
                for result in word_results:
                    doc_key = result['path']
                    if doc_key in all_results:
                        all_results[doc_key]['relevance_score'] += result['relevance_score']
                    else:
                        all_results[doc_key] = result
            
            results = list(all_results.values())
            results.sort(key=lambda x: x['relevance_score'], reverse=True)
        
        # Filter by relevance and limit results
        relevant_results = [
            r for r in results 
            if r['relevance_score'] >= self.relevance_threshold
        ][:max_docs]
        
        if not relevant_results:
            return ""
        
        # Build context string
        context_parts = []
        total_length = 0
        
        for result in relevant_results:
            # Load document content
            content = self.kb_manager.load_document_content(result['path'])
            if not content:
                continue
            
            # Add document header
            doc_header = f"\n--- {result['title']} (Category: {result['category']}) ---\n"
            
            # Clean markdown formatting but preserve content
            cleaned_content = self._clean_markdown_simple(content)
            
            # Check if adding this document would exceed length limit
            doc_content = cleaned_content[:1200]  # Allow more content since we're not over-compressing
            combined_length = len(doc_header) + len(doc_content)
            
            if total_length + combined_length > self.max_context_length:
                # Truncate to fit within limit
                remaining_space = self.max_context_length - total_length - len(doc_header)
                if remaining_space > 200:  # Only add if we have meaningful space
                    # Try to break at a natural boundary
                    truncated_content = cleaned_content[:remaining_space]
                    last_newline = truncated_content.rfind('\n')
                    if last_newline > remaining_space * 0.7:
                        truncated_content = truncated_content[:last_newline]
                    doc_content = truncated_content + "..."
                    context_parts.append(doc_header + doc_content)
                break
            
            context_parts.append(doc_header + doc_content)
            total_length += combined_length
        
        return "".join(context_parts)
    
    def _compress_chunk(self, chunk: str, doc_title: str) -> str:
        """
        Compress chunk content into clean bulletized facts, removing markdown formatting
        Converts headers and structured content into concise factual statements
        """
        import re
        
        # Step 1: Clean up markdown formatting
        # Remove markdown headers (###, ####, etc.) and convert to clean text
        cleaned_chunk = re.sub(r'^#{1,6}\s+', '', chunk, flags=re.MULTILINE)
        
        # Convert markdown bold (**text** or __text__) to plain text
        cleaned_chunk = re.sub(r'\*\*([^*]+)\*\*', r'\1', cleaned_chunk)
        cleaned_chunk = re.sub(r'__([^_]+)__', r'\1', cleaned_chunk)
        
        # Convert markdown list items (- or *) to our bullet format
        cleaned_chunk = re.sub(r'^[\s]*[-*]\s+', '• ', cleaned_chunk, flags=re.MULTILINE)
        
        # Handle structured content like "**Key**: Value" -> "Key: Value"
        cleaned_chunk = re.sub(r'\*\*([^:*]+):\*\*\s*', r'\1: ', cleaned_chunk)
        
        # Step 2: Extract and normalize key facts
        lines = [line.strip() for line in cleaned_chunk.split('\n') if line.strip()]
        compressed_points = []
        
        # Process each line to create bulletized facts
        for line in lines:
            if len(line) < 15:  # Skip very short fragments
                continue
                
            # Skip empty bullets or redundant content
            if line in ['•', '• ', '•  '] or line.startswith('•') and len(line) < 20:
                continue
                
            # Priority patterns that should be preserved
            key_patterns = [
                r'\d+\s*(days?|hours?|minutes?|months?|years?)',  # Time periods
                r'\$\d+(?:\.\d{2})?',  # Prices
                r'\d+(?:\.\d+)?\s*(?:ft|feet|inch|inches|cm|mm|gb|mb|kb|AM|PM)',  # Measurements/times
                r'warranty|guarantee|return|refund|shipping|delivery|processing',  # Policy terms
                r'compatible|supports?|works?\s+with',  # Compatibility
                r'specifications?|specs?|technical|coverage|tracking',  # Technical info
                r'cutoff|deadline|availability|monday|tuesday|wednesday|thursday|friday',  # Schedule
                r'contact|call|email|support|customer\s+service',  # Contact info
                r'free|cost|price|charge',  # Cost information
            ]
            
            # Check if line contains key information
            line_lower = line.lower()
            is_important = any(re.search(pattern, line_lower) for pattern in key_patterns)
            
            # Also preserve lines with specific product mentions or structured data
            product_terms = ['usb-c', 'hdmi', 'lightning', 'ethernet', 'displayport', 'thunderbolt', 'cable']
            has_product = any(term in line_lower for term in product_terms)
            
            # Handle structured content (like "Processing Time: ...")
            has_structure = ':' in line and len(line.split(':')) == 2
            
            if is_important or has_product or has_structure or len(compressed_points) < 2:
                # Ensure line starts with bullet point
                if not line.startswith('• '):
                    line = f"• {line}"
                
                # Clean up extra whitespace
                clean_line = re.sub(r'\s+', ' ', line).strip()
                
                # Remove redundant "•" if already present
                if clean_line.count('•') > 1:
                    clean_line = clean_line.replace('• •', '•', 1)
                
                if len(clean_line) > 20 and clean_line not in compressed_points:
                    compressed_points.append(clean_line)
        
        # If no good points found, extract from first meaningful content
        if not compressed_points and lines:
            for line in lines[:3]:  # Check first 3 lines
                if len(line.strip()) > 20:
                    clean_line = f"• {line.strip()}"
                    compressed_points.append(clean_line)
                    break
        
        # Add source citation
        citation = f"[Source: {doc_title}]"
        
        # Combine into clean format
        result = '\n'.join(compressed_points)
        if result:
            return f"{result}\n{citation}"
        else:
            return f"• {cleaned_chunk[:100]}...\n{citation}"
    
    def _force_load_specific_document(self, doc_path: str) -> str:
        """
        Force load a specific document for product-specific queries
        """
        try:
            import os
            full_path = os.path.join(self.knowledge_base_path, doc_path)
            if os.path.exists(full_path):
                with open(full_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                # Extract document name for header
                doc_name = os.path.basename(doc_path).replace('.md', '').replace('_', ' ').title()
                
                # Format the content
                header = f"--- {doc_name} (Category: product_manuals) ---"
                cleaned_content = self._clean_markdown_simple(content)
                
                return f"{header}\n{cleaned_content}"
        except Exception as e:
            logger.error(f"Error force loading document {doc_path}: {e}")
        
        return ""
    
    def _clean_markdown_simple(self, content: str) -> str:
        """
        Clean markdown formatting but preserve content structure and details
        Simple cleanup that maintains all important information
        """
        import re
        
        # Remove markdown headers (###, ####, etc.) but keep the text
        cleaned = re.sub(r'^#{1,6}\s+', '', content, flags=re.MULTILINE)
        
        # Remove markdown bold/italic formatting but keep the text
        cleaned = re.sub(r'\*\*([^*]+)\*\*', r'\1', cleaned)  # **bold** -> bold
        cleaned = re.sub(r'__([^_]+)__', r'\1', cleaned)      # __bold__ -> bold
        cleaned = re.sub(r'\*([^*]+)\*', r'\1', cleaned)      # *italic* -> italic
        cleaned = re.sub(r'_([^_]+)_', r'\1', cleaned)        # _italic_ -> italic
        
        # Convert markdown list items to clean bullets
        cleaned = re.sub(r'^[\s]*[-*+]\s+', '• ', cleaned, flags=re.MULTILINE)
        
        # Clean up numbered lists to bullets for consistency
        cleaned = re.sub(r'^\s*\d+\.\s+', '• ', cleaned, flags=re.MULTILINE)
        
        # Remove extra whitespace but preserve structure
        lines = [line.rstrip() for line in cleaned.split('\n')]
        cleaned_lines = []
        
        for line in lines:
            # Skip empty lines between sections but keep one empty line for readability
            if not line.strip():
                if cleaned_lines and cleaned_lines[-1] != '':
                    cleaned_lines.append('')
            else:
                cleaned_lines.append(line)
        
        # Remove trailing empty lines
        while cleaned_lines and cleaned_lines[-1] == '':
            cleaned_lines.pop()
            
        return '\n'.join(cleaned_lines)

    def _build_context_from_results(self, results: List[Dict]) -> str:
        """
        Build clean, formatted context string from reranked search results
        Cleans markdown formatting but preserves all important details and specifications
        Includes document source/title for transparency
        """
        if not results:
            return ""
        
        context_parts = []
        total_length = 0
        max_context_length = self.max_context_length  # Use class setting instead of hardcoded value
        
        for result in results:
            doc_title = result['metadata']['document_title']
            category = result['metadata']['category']
            chunk_content = result['document']
            
            # Clean markdown formatting but preserve content structure
            cleaned_content = self._clean_markdown_simple(chunk_content)
            
            # FRAGMENT CLEANUP: Fix obvious fragmentation issues
            cleaned_content = self._cleanup_content_fragments(cleaned_content)
            
            # Create clean section header with source document (company policy format)
            section_type = category.replace('_', ' ').upper()
            if 'shipping' in category.lower():
                section_header = f"\nCOMPANY POLICY – SHIPPING (Source: {doc_title}):\n"
            elif 'return' in category.lower() or 'warranty' in category.lower():
                section_header = f"\nCOMPANY POLICY – RETURNS/WARRANTY (Source: {doc_title}):\n"
            elif 'product' in category.lower() or 'manual' in category.lower():
                section_header = f"\nPRODUCT SPECIFICATIONS (Source: {doc_title}):\n"
            elif 'troubleshooting' in category.lower():
                section_header = f"\nTROUBLESHOOTING GUIDE (Source: {doc_title}):\n"
            else:
                section_header = f"\nCOMPANY POLICY – {section_type} (Source: {doc_title}):\n"
            
            # Check length constraints
            combined_length = len(section_header) + len(cleaned_content)
            
            if total_length + combined_length > max_context_length:
                # Truncate content to fit, but keep the most important parts
                remaining_space = max_context_length - total_length - len(section_header)
                if remaining_space > 200:  # Only add if we have meaningful space
                    # Try to break at a natural boundary (end of line)
                    truncated_content = cleaned_content[:remaining_space]
                    last_newline = truncated_content.rfind('\n')
                    if last_newline > remaining_space * 0.7:  # If we can keep most content
                        truncated_content = truncated_content[:last_newline]
                    context_parts.append(section_header + truncated_content + "...")
                break
            
            context_parts.append(section_header + cleaned_content)
            total_length += combined_length
        
        return '\n'.join(context_parts)
    
    def _cleanup_content_fragments(self, content: str) -> str:
        """
        Clean up obvious fragmentation issues in retrieved content
        """
        if not content:
            return content
            
        lines = content.split('\n')
        cleaned_lines = []
        
        for line in lines:
            # Skip lines that start with obvious fragments
            line = line.strip()
            if not line:
                cleaned_lines.append('')
                continue
                
            # Fix common fragmentation patterns
            if line.startswith('lby '):  # "lby TrueHD" -> "Dolby TrueHD"
                line = 'Do' + line
            elif line.startswith('dth '):  # "dth: 18 Gbps" -> "Bandwidth: 18 Gbps"
                line = 'Bandwi' + line
            elif line.startswith('ort: '):  # "ort: HDR10" -> "Support: HDR10"
                line = 'Supp' + line
            elif line.startswith('res: '):  # "res: VRR, ALLM" -> "Features: VRR, ALLM"
                line = 'Featu' + line
                
            # Skip lines that are clearly incomplete fragments (less than 4 chars)
            if len(line.strip()) >= 4:
                cleaned_lines.append(line)
        
        return '\n'.join(cleaned_lines)
    
    def _filter_results_by_content_relevance(self, results: List[Dict], query: str) -> List[Dict]:
        """
        Filter and prioritize results based on content-specific keywords in the query
        This helps focus on the most relevant product specs when multiple products are retrieved
        """
        if not results:
            return results
            
        query_lower = query.lower()
        
        # Extract product-specific keywords from query
        product_keywords = {
            'hdmi': ['hdmi', '8k', '4k', '2.1', '2.0', 'ultra high speed', 'high speed'],
            'usb': ['usb-c', 'usb c', 'usb', 'charging', 'power delivery', 'pd'],
            'lightning': ['lightning', 'iphone', 'ipad', 'apple', 'mfi'],
            'audio': ['audio', '3.5mm', 'aux', 'headphone', 'speaker'],
            'ethernet': ['ethernet', 'cat5', 'cat6', 'network', 'gigabit']
        }
        
        # Determine primary product type from query
        primary_product = None
        max_matches = 0
        
        for product_type, keywords in product_keywords.items():
            matches = sum(1 for kw in keywords if kw in query_lower)
            if matches > max_matches:
                max_matches = matches
                primary_product = product_type
        
        if not primary_product:
            # If no specific product detected, return original results
            return results
        
        # Filter results to prioritize chunks containing the primary product keywords
        relevant_results = []
        secondary_results = []
        
        primary_keywords = product_keywords[primary_product]
        
        for result in results:
            content_lower = result['document'].lower()
            content_matches = sum(1 for kw in primary_keywords if kw in content_lower)
            
            # Prioritize chunks that contain multiple keywords from the primary product
            if content_matches >= 2:  # Strong match - multiple keywords
                relevant_results.append(result)
            elif content_matches >= 1:  # Weak match - single keyword
                secondary_results.append(result)
        
        # Return prioritized results: strong matches first, then weak matches, limit to original count
        final_results = relevant_results + secondary_results
        original_count = len(results)
        return final_results[:original_count]
    
    def enhance_prompt(self, user_message: str, base_prompt: str) -> str:
        """
        Enhance a prompt with relevant context from knowledge base
        """
        logger.info(f"🚀 PROMPT ENHANCEMENT REQUESTED for query: '{user_message}'")
        context = self.get_relevant_context(user_message)
        
        if not context:
            logger.info("❌ No relevant context found - returning base prompt")
            return base_prompt + f"\n\nUser Query: {user_message}"
        
        logger.info("✅ Context found - enhancing prompt with RAG data")
        
        # Place the provided base_prompt at the very top and append compressed RAG context
        # Do NOT re-introduce a duplicate system lead-in here; `base_prompt` should contain that.
        enhanced_prompt = f"""{base_prompt}

        COMPANY KNOWLEDGE BASE:
        {context}

        Please use the information above to create your answer.

        """

        return enhanced_prompt
    
    def get_suggested_questions(self, category: Optional[str] = None) -> List[str]:
        """
        Get suggested questions based on knowledge base content
        """
        suggestions = []
        
        # Get documents by category or all
        if category:
            docs = self.kb_manager.get_document_by_category(category)
        else:
            docs = []
            for cat_docs in self.kb_manager.documents.values():
                docs.extend(cat_docs['documents'])
        
        # Generate suggestions based on document titles and content
        common_questions = [
            "What types of cables do you sell?",
            "What is your return policy?",
            "How long is the warranty on your products?",
            "Do you offer free shipping?",
            "How do I troubleshoot a cable that isn't working?",
            "What's the difference between USB-C and USB-A?",
            "Do you sell HDMI cables for 4K displays?",
            "How do I contact customer service?",
            "Can I return a cable if it doesn't fit my device?",
            "What payment methods do you accept?"
        ]
        
        return common_questions[:5]  # Return top 5 suggestions
    
    def analyze_query_intent(self, query: str) -> Dict[str, any]:
        """
        Analyze user query to determine intent and relevant categories
        """
        query_lower = query.lower()
        
        intent_analysis = {
            'categories': [],
            'product_types': [],
            'intent_type': 'general',
            'keywords': []
        }
        
        # Category mapping
        category_keywords = {
            'product_manuals': ['how to use', 'specifications', 'specs', 'manual', 'guide'],
            'policies': ['return', 'warranty', 'shipping', 'policy', 'refund', 'exchange'],
            'faqs': ['question', 'help', 'what is', 'how do', 'troubleshoot', 'problem']
        }
        
        # Product type keywords
        product_keywords = {
            'usb-c': ['usb-c', 'usbc', 'usb c', 'type-c'],
            'hdmi': ['hdmi', 'display', '4k', '8k', 'monitor', 'tv'],
            'usb-a': ['usb-a', 'usba', 'usb a', 'standard usb'],
            'lightning': ['lightning', 'iphone', 'ipad', 'apple']
        }
        
        # Intent type keywords
        intent_keywords = {
            'troubleshooting': ['not working', 'broken', 'fix', 'problem', 'issue', 'troubleshoot'],
            'product_inquiry': ['buy', 'purchase', 'price', 'cost', 'available', 'sell'],
            'support': ['help', 'support', 'contact', 'customer service'],
            'policy': ['return', 'warranty', 'shipping', 'policy']
        }
        
        # Analyze categories
        for category, keywords in category_keywords.items():
            if any(keyword in query_lower for keyword in keywords):
                intent_analysis['categories'].append(category)
        
        # Analyze product types
        for product, keywords in product_keywords.items():
            if any(keyword in query_lower for keyword in keywords):
                intent_analysis['product_types'].append(product)
        
        # Analyze intent type
        for intent, keywords in intent_keywords.items():
            if any(keyword in query_lower for keyword in keywords):
                intent_analysis['intent_type'] = intent
                break
        
        # Extract key terms
        important_words = [
            word for word in query_lower.split() 
            if len(word) > 3 and word not in ['what', 'how', 'when', 'where', 'why', 'can', 'will', 'would', 'could', 'should']
        ]
        intent_analysis['keywords'] = important_words[:5]
        
        return intent_analysis
    
    def get_knowledge_base_stats(self) -> Dict:
        """Get current knowledge base statistics"""
        stats = self.kb_manager.get_stats()
        
        # Add vector search information
        stats['vector_search_available'] = VECTOR_RAG_AVAILABLE
        stats['vector_search_enabled'] = self.use_vector_search
        
        if self.use_vector_search and self.vector_rag:
            try:
                vector_stats = self.vector_rag.get_collection_stats()
                stats['vector_database'] = vector_stats
            except Exception as e:
                stats['vector_database'] = {"error": str(e)}
        
        return stats
    
    def ensure_vector_index(self, force_reindex: bool = False) -> Dict:
        """
        Ensure vector index is built and up to date
        Returns indexing statistics
        """
        if not self.use_vector_search or not self.vector_rag:
            return {"error": "Vector search not available"}
        
        try:
            return self.vector_rag.index_documents(force_reindex=force_reindex)
        except Exception as e:
            return {"error": f"Failed to index documents: {e}"}

def test_rag_helper():
    """Test the RAG helper functionality"""
    print("Testing RAG Helper...")
    
    rag = RAGHelper()
    
    # Test query analysis
    test_queries = [
        "How do I return a broken USB-C cable?",
        "What HDMI cables do you sell for 4K gaming?",
        "My Lightning cable isn't charging my iPhone",
        "What is your shipping policy?"
    ]
    
    for query in test_queries:
        print(f"\n--- Testing Query: '{query}' ---")
        
        # Analyze intent
        intent = rag.analyze_query_intent(query)
        print(f"Intent Analysis: {intent}")
        
        # Get relevant context
        context = rag.get_relevant_context(query)
        print(f"Context Length: {len(context)} characters")
        
        # Show enhanced prompt (truncated)
        enhanced = rag.enhance_prompt(query)
        print(f"Enhanced Prompt Length: {len(enhanced)} characters")
        print(f"Context Preview: {context[:200]}..." if context else "No relevant context found")
    
    # Show knowledge base stats
    print(f"\nKnowledge Base Stats: {rag.get_knowledge_base_stats()}")

if __name__ == "__main__":
    test_rag_helper()
