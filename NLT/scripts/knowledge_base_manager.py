"""
Knowledge Base Manager for NodeLine Tech
Handles loading, organizing, and managing company knowledge documents
"""

import os
import json
import hashlib
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional, Tuple

class KnowledgeBaseManager:
    def __init__(self, knowledge_base_path: str = "knowledge_base"):
        """Initialize the knowledge base manager"""
        self.kb_path = Path(knowledge_base_path)
        self.documents = {}
        self.document_index = {}
        self.metadata_file = self.kb_path / "metadata.json"
        
        # Ensure knowledge base directory exists
        self.kb_path.mkdir(exist_ok=True)
        
        # Load existing metadata if it exists
        self.load_metadata()
    
    def load_metadata(self):
        """Load document metadata from file"""
        if self.metadata_file.exists():
            try:
                with open(self.metadata_file, 'r', encoding='utf-8') as f:
                    metadata = json.load(f)
                    self.document_index = metadata.get('documents', {})
            except Exception as e:
                print(f"Error loading metadata: {e}")
                self.document_index = {}
    
    def save_metadata(self):
        """Save document metadata to file"""
        metadata = {
            'last_updated': datetime.now().isoformat(),
            'total_documents': len(self.document_index),
            'documents': self.document_index
        }
        
        try:
            with open(self.metadata_file, 'w', encoding='utf-8') as f:
                json.dump(metadata, f, indent=2)
        except Exception as e:
            print(f"Error saving metadata: {e}")
    
    def scan_documents(self) -> Dict[str, Dict]:
        """Scan knowledge base directory and catalog all documents"""
        documents = {}
        
        # Define document categories and their directories
        categories = {
            'faqs': 'Frequently Asked Questions',
            'policies': 'Company Policies', 
            'product_manuals': 'Product Manuals',
            'troubleshooting': 'Troubleshooting Guides',
            'development': 'Internal Development Documentation'
        }
        
        for category, description in categories.items():
            category_path = self.kb_path / category
            if category_path.exists():
                documents[category] = {
                    'description': description,
                    'documents': []
                }
                
                # Scan for markdown files in category
                for file_path in category_path.glob('*.md'):
                    doc_info = self.analyze_document(file_path, category)
                    if doc_info:
                        documents[category]['documents'].append(doc_info)
        
        self.documents = documents
        return documents
    
    def analyze_document(self, file_path: Path, category: str) -> Optional[Dict]:
        """Analyze a document and extract metadata"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Calculate file hash for change detection
            file_hash = hashlib.md5(content.encode()).hexdigest()
            
            # Extract title (first # heading)
            title = "Unknown Document"
            for line in content.split('\n'):
                if line.strip().startswith('# '):
                    title = line.strip()[2:].strip()
                    break
            
            # Get file stats
            stats = file_path.stat()
            
            doc_info = {
                'filename': file_path.name,
                'title': title,
                'category': category,
                'path': str(file_path.relative_to(self.kb_path)),
                'size': stats.st_size,
                'modified': datetime.fromtimestamp(stats.st_mtime).isoformat(),
                'hash': file_hash,
                'word_count': len(content.split()),
                'char_count': len(content)
            }
            
            return doc_info
            
        except Exception as e:
            print(f"Error analyzing document {file_path}: {e}")
            return None
    
    def load_document_content(self, document_path: str) -> Optional[str]:
        """Load the full content of a specific document"""
        try:
            full_path = self.kb_path / document_path
            with open(full_path, 'r', encoding='utf-8') as f:
                return f.read()
        except Exception as e:
            print(f"Error loading document {document_path}: {e}")
            return None
    
    def search_documents(self, query: str, category: Optional[str] = None) -> List[Dict]:
        """Search documents for relevant content"""
        results = []
        query_lower = query.lower()
        
        for cat_name, cat_info in self.documents.items():
            # Skip if category filter specified and doesn't match
            if category and cat_name != category:
                continue
                
            for doc in cat_info['documents']:
                # Load document content for search
                content = self.load_document_content(doc['path'])
                if not content:
                    continue
                
                content_lower = content.lower()
                
                # Simple text search - could be enhanced with fuzzy matching
                if query_lower in content_lower or query_lower in doc['title'].lower():
                    # Calculate relevance score (simple word count for now)
                    relevance = content_lower.count(query_lower)
                    
                    result = doc.copy()
                    result['relevance_score'] = relevance
                    result['category_description'] = cat_info['description']
                    
                    # Extract context around matches
                    result['context_snippets'] = self.extract_context(content, query, max_snippets=3)
                    
                    results.append(result)
        
        # Sort by relevance score
        results.sort(key=lambda x: x['relevance_score'], reverse=True)
        return results
    
    def extract_context(self, content: str, query: str, max_snippets: int = 3, context_length: int = 200) -> List[str]:
        """Extract context snippets around query matches"""
        snippets = []
        content_lower = content.lower()
        query_lower = query.lower()
        
        start = 0
        snippet_count = 0
        
        while snippet_count < max_snippets:
            # Find next occurrence of query
            pos = content_lower.find(query_lower, start)
            if pos == -1:
                break
            
            # Extract context around the match
            context_start = max(0, pos - context_length // 2)
            context_end = min(len(content), pos + len(query) + context_length // 2)
            
            snippet = content[context_start:context_end].strip()
            
            # Add ellipsis if not at beginning/end
            if context_start > 0:
                snippet = "..." + snippet
            if context_end < len(content):
                snippet = snippet + "..."
            
            snippets.append(snippet)
            snippet_count += 1
            start = pos + len(query)
        
        return snippets
    
    def get_document_by_category(self, category: str) -> List[Dict]:
        """Get all documents in a specific category"""
        if category in self.documents:
            return self.documents[category]['documents']
        return []
    
    def get_document_categories(self) -> Dict[str, str]:
        """Get available document categories"""
        return {cat: info['description'] for cat, info in self.documents.items()}
    
    def get_stats(self) -> Dict:
        """Get knowledge base statistics"""
        total_docs = sum(len(cat['documents']) for cat in self.documents.values())
        total_words = sum(doc['word_count'] for cat in self.documents.values() for doc in cat['documents'])
        total_size = sum(doc['size'] for cat in self.documents.values() for doc in cat['documents'])
        
        return {
            'total_documents': total_docs,
            'total_categories': len(self.documents),
            'total_words': total_words,
            'total_size_bytes': total_size,
            'categories': {
                cat: len(info['documents']) 
                for cat, info in self.documents.items()
            }
        }
    
    def update_index(self):
        """Scan documents and update the index"""
        print("Scanning knowledge base documents...")
        self.scan_documents()
        
        # Update metadata with document index
        for category, cat_info in self.documents.items():
            for doc in cat_info['documents']:
                doc_id = f"{category}/{doc['filename']}"
                self.document_index[doc_id] = doc
        
        self.save_metadata()
        print(f"Updated index with {len(self.document_index)} documents")
    
    def get_relevant_documents(self, query: str, max_results: int = 5) -> List[Tuple[str, str, float]]:
        """Get documents most relevant to a query for RAG implementation"""
        results = self.search_documents(query)
        
        relevant_docs = []
        for result in results[:max_results]:
            content = self.load_document_content(result['path'])
            if content:
                relevant_docs.append((
                    result['title'],
                    content,
                    result['relevance_score']
                ))
        
        return relevant_docs

def main():
    """Test the knowledge base manager"""
    kb = KnowledgeBaseManager()
    
    # Update the index
    kb.update_index()
    
    # Show statistics
    stats = kb.get_stats()
    print("\nKnowledge Base Statistics:")
    print(f"Total Documents: {stats['total_documents']}")
    print(f"Total Categories: {stats['total_categories']}")
    print(f"Total Words: {stats['total_words']:,}")
    print(f"Total Size: {stats['total_size_bytes']:,} bytes")
    
    print("\nCategories:")
    for category, count in stats['categories'].items():
        print(f"  {category}: {count} documents")
    
    # Test search functionality
    print("\nTesting search for 'USB-C charging':")
    results = kb.search_documents("USB-C charging")
    for result in results[:3]:
        print(f"  - {result['title']} (relevance: {result['relevance_score']})")
        if result['context_snippets']:
            print(f"    Context: {result['context_snippets'][0][:100]}...")

if __name__ == "__main__":
    main()
