"""
Database setup and management for NodeLine Tech Customer Service System
"""

import sqlite3
import os
import logging
from datetime import datetime
import hashlib
import secrets
from typing import Optional, Dict, List, Any

# Set up logger for this module
logger = logging.getLogger(__name__)

class DatabaseManager:
    def __init__(self, db_path: str = None):
        if db_path is None:
            # Use environment variable or default path
            db_path = os.environ.get('DATABASE_PATH', 'nlt_customer_service.db')
        
        self.db_path = db_path
        
        # Ensure directory exists for database file
        db_dir = os.path.dirname(self.db_path)
        if db_dir and not os.path.exists(db_dir):
            os.makedirs(db_dir, exist_ok=True)
        
        self.init_database()
    
    def get_connection(self):
        """Get database connection with row factory"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn
    
    def init_database(self):
        """Initialize database with all required tables"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            
            # Create users table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    email TEXT UNIQUE NOT NULL,
                    first_name TEXT NOT NULL,
                    last_name TEXT NOT NULL,
                    password_hash TEXT NOT NULL,
                    salt TEXT NOT NULL,
                    phone TEXT,
                    company TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    is_active BOOLEAN DEFAULT 1,
                    email_verified BOOLEAN DEFAULT 0,
                    verification_token TEXT,
                    last_login TIMESTAMP
                )
            ''')
            
            # Create sessions table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS sessions (
                    id TEXT PRIMARY KEY,
                    user_id INTEGER,
                    ip_address TEXT,
                    user_agent TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    expires_at TIMESTAMP NOT NULL,
                    logged_out_at TIMESTAMP,
                    is_active BOOLEAN DEFAULT 1,
                    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
                )
            ''')
            
            # Create conversations table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS conversations (
                    id TEXT PRIMARY KEY,
                    user_id INTEGER,
                    session_id TEXT,
                    title TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    is_active BOOLEAN DEFAULT 1,
                    escalated_to_human BOOLEAN DEFAULT 0,
                    satisfaction_rating INTEGER CHECK (satisfaction_rating BETWEEN 1 AND 5),
                    tags TEXT,
                    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
                    FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE SET NULL
                )
            ''')
            
            # Create messages table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    conversation_id TEXT NOT NULL,
                    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
                    content TEXT NOT NULL,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    model_used TEXT,
                    response_time_ms INTEGER,
                    tokens_used INTEGER,
                    confidence_score REAL,
                    rag_sources TEXT,
                    FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE
                )
            ''')
            
            # Create support tickets table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS support_tickets (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ticket_number TEXT UNIQUE NOT NULL,
                    user_id INTEGER NOT NULL,
                    conversation_id TEXT,
                    subject TEXT NOT NULL,
                    description TEXT NOT NULL,
                    category TEXT NOT NULL,
                    priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
                    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
                    assigned_agent TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    resolved_at TIMESTAMP,
                    resolution_notes TEXT,
                    customer_satisfaction INTEGER CHECK (customer_satisfaction BETWEEN 1 AND 5),
                    escalation_level INTEGER DEFAULT 0,
                    escalated_at TIMESTAMP,
                    escalation_reason TEXT,
                    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
                    FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE SET NULL
                )
            ''')
            
            # Create ticket updates/notes table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS ticket_updates (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ticket_id INTEGER NOT NULL,
                    user_id INTEGER,
                    update_type TEXT DEFAULT 'note' CHECK (update_type IN ('note', 'status_change', 'assignment', 'escalation', 'resolution')),
                    message TEXT NOT NULL,
                    old_value TEXT,
                    new_value TEXT,
                    is_internal BOOLEAN DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (ticket_id) REFERENCES support_tickets (id) ON DELETE CASCADE,
                    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
                )
            ''')
            
            # Create ticket categories table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS ticket_categories (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT UNIQUE NOT NULL,
                    description TEXT,
                    default_priority TEXT DEFAULT 'medium' CHECK (default_priority IN ('low', 'medium', 'high', 'urgent')),
                    escalation_keywords TEXT,
                    auto_assign_to TEXT,
                    is_active BOOLEAN DEFAULT 1,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # Create knowledge base documents table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS knowledge_base (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    content TEXT NOT NULL,
                    category TEXT NOT NULL,
                    subcategory TEXT,
                    tags TEXT,
                    document_type TEXT DEFAULT 'article' CHECK (document_type IN ('article', 'faq', 'manual', 'policy')),
                    version TEXT DEFAULT '1.0',
                    author TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    is_published BOOLEAN DEFAULT 1,
                    view_count INTEGER DEFAULT 0,
                    helpful_votes INTEGER DEFAULT 0,
                    unhelpful_votes INTEGER DEFAULT 0
                )
            ''')
            
            # Create document chunks table for RAG
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS document_chunks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    document_id INTEGER NOT NULL,
                    chunk_index INTEGER NOT NULL,
                    content TEXT NOT NULL,
                    embedding BLOB,
                    token_count INTEGER,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (document_id) REFERENCES knowledge_base (id) ON DELETE CASCADE
                )
            ''')
            
            # Create product information table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS products (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    sku TEXT UNIQUE NOT NULL,
                    name TEXT NOT NULL,
                    description TEXT,
                    category TEXT NOT NULL,
                    price DECIMAL(10,2),
                    is_active BOOLEAN DEFAULT 1,
                    features TEXT,
                    specifications TEXT,
                    warranty_months INTEGER DEFAULT 12,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # Create user preferences table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS user_preferences (
                    user_id INTEGER PRIMARY KEY,
                    preferred_language TEXT DEFAULT 'en',
                    timezone TEXT DEFAULT 'UTC',
                    email_notifications BOOLEAN DEFAULT 1,
                    sms_notifications BOOLEAN DEFAULT 0,
                    communication_preference TEXT DEFAULT 'email' CHECK (communication_preference IN ('email', 'sms', 'both')),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
                )
            ''')
            
            # Create indexes for better performance
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_users_email ON users (email)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations (user_id)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages (conversation_id)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON support_tickets (user_id)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets (status)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_support_tickets_priority ON support_tickets (priority)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at ON support_tickets (created_at)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned_agent ON support_tickets (assigned_agent)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_ticket_updates_ticket_id ON ticket_updates (ticket_id)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_ticket_updates_created_at ON ticket_updates (created_at)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_ticket_categories_name ON ticket_categories (name)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_knowledge_base_category ON knowledge_base (category)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id ON document_chunks (document_id)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_products_category ON products (category)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_products_sku ON products (sku)')
            
            # Run database migrations to add any missing columns
            self._run_database_migrations(cursor)
            
            conn.commit()
            print("Database initialized successfully with all tables and indexes")
            
            # Initialize default ticket categories
            self._initialize_default_categories()
    
    def _run_database_migrations(self, cursor):
        """Run database migrations to add missing columns to existing tables"""
        try:
            # Check if role column exists in users table
            cursor.execute('PRAGMA table_info(users)')
            user_columns = [col[1] for col in cursor.fetchall()]
            
            # Add role column for user authorization
            if 'role' not in user_columns:
                cursor.execute('ALTER TABLE users ADD COLUMN role TEXT DEFAULT "user" CHECK (role IN ("user", "admin", "staff"))')
                print("Added role column to users table")
                
                # Set admin role for the admin user
                cursor.execute('UPDATE users SET role = "admin" WHERE email = "admin@nodelinetech.com"')
                print("Set admin role for admin@nodelinetech.com")
            
            # Check if escalated_at column exists in support_tickets table
            cursor.execute('PRAGMA table_info(support_tickets)')
            ticket_columns = [col[1] for col in cursor.fetchall()]
            
            # Add missing columns for AI agent functionality
            if 'escalated_at' not in ticket_columns:
                cursor.execute('ALTER TABLE support_tickets ADD COLUMN escalated_at TIMESTAMP')
                print("Added escalated_at column to support_tickets table")
            
            if 'escalation_reason' not in ticket_columns:
                cursor.execute('ALTER TABLE support_tickets ADD COLUMN escalation_reason TEXT')
                print("Added escalation_reason column to support_tickets table")
                
        except Exception as e:
            print(f"Warning: Migration error (may be expected): {e}")
    
    def _initialize_default_categories(self):
        """Initialize default ticket categories if they don't exist"""
        default_categories = [
            {
                'name': 'Technical Support',
                'description': 'Technical issues, bugs, system problems',
                'default_priority': 'medium',
                'escalation_keywords': 'error,bug,crash,broken,not working,down,outage,urgent',
                'auto_assign_to': None
            },
            {
                'name': 'Account & Billing',
                'description': 'Account management, billing questions, payment issues',
                'default_priority': 'medium',
                'escalation_keywords': 'payment,billing,charge,refund,account locked,suspended',
                'auto_assign_to': None
            },
            {
                'name': 'Product Information',
                'description': 'Questions about products, features, specifications',
                'default_priority': 'low',
                'escalation_keywords': 'urgent,asap,emergency',
                'auto_assign_to': None
            },
            {
                'name': 'Service Request',
                'description': 'Service requests, feature requests, general inquiries',
                'default_priority': 'low',
                'escalation_keywords': 'urgent,critical,emergency,asap',
                'auto_assign_to': None
            },
            {
                'name': 'Complaint',
                'description': 'Customer complaints and feedback',
                'default_priority': 'high',
                'escalation_keywords': 'angry,upset,frustrated,terrible,awful,worst',
                'auto_assign_to': None
            }
        ]
        
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                for category in default_categories:
                    cursor.execute('''
                        INSERT OR IGNORE INTO ticket_categories 
                        (name, description, default_priority, escalation_keywords, auto_assign_to)
                        VALUES (?, ?, ?, ?, ?)
                    ''', (category['name'], category['description'], category['default_priority'],
                          category['escalation_keywords'], category['auto_assign_to']))
                conn.commit()
        except Exception as e:
            print(f"Error initializing default categories: {e}")
    
    def hash_password(self, password: str) -> tuple:
        """Hash password with salt"""
        salt = secrets.token_hex(32)
        password_hash = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100000)
        return password_hash.hex(), salt
    
    def verify_password(self, password: str, password_hash: str, salt: str) -> bool:
        """Verify password against hash"""
        return hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100000).hex() == password_hash
    
    def create_user(self, email: str, first_name: str, last_name: str, password: str, 
                   phone: str = None, company: str = None) -> Optional[int]:
        """Create a new user account"""
        try:
            password_hash, salt = self.hash_password(password)
            verification_token = secrets.token_urlsafe(32)
            
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    INSERT INTO users (email, first_name, last_name, password_hash, salt, 
                                     phone, company, verification_token)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ''', (email, first_name, last_name, password_hash, salt, phone, company, verification_token))
                
                user_id = cursor.lastrowid
                
                # Create default user preferences
                cursor.execute('''
                    INSERT INTO user_preferences (user_id) VALUES (?)
                ''', (user_id,))
                
                conn.commit()
                return user_id
        except sqlite3.IntegrityError:
            return None  # User already exists
    
    def authenticate_user(self, email: str, password: str) -> Optional[Dict]:
        """Authenticate user login"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT id, email, first_name, last_name, password_hash, salt, is_active
                FROM users WHERE email = ? AND is_active = 1
            ''', (email,))
            
            user = cursor.fetchone()
            if user and self.verify_password(password, user['password_hash'], user['salt']):
                # Update last login
                cursor.execute('''
                    UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?
                ''', (user['id'],))
                conn.commit()
                
                return dict(user)
            return None
    
    def create_session(self, user_id: int, ip_address: str, user_agent: str, 
                      expires_in_hours: int = 24) -> str:
        """Create user session"""
        session_id = secrets.token_urlsafe(32)
        
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO sessions (id, user_id, ip_address, user_agent, 
                                    expires_at)
                VALUES (?, ?, ?, ?, datetime('now', '+{} hours'))
            '''.format(expires_in_hours), (session_id, user_id, ip_address, user_agent))
            conn.commit()
        
        return session_id
    
    def get_user_by_session(self, session_id: str) -> Optional[Dict]:
        """Get user information by session ID"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT u.id, u.email, u.first_name, u.last_name, u.company, u.phone
                FROM users u
                JOIN sessions s ON u.id = s.user_id
                WHERE s.id = ? AND s.is_active = 1 AND s.expires_at > CURRENT_TIMESTAMP
            ''', (session_id,))
            
            result = cursor.fetchone()
            return dict(result) if result else None
    
    def cleanup_expired_sessions(self) -> int:
        """Clean up expired sessions and return count of cleaned sessions"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                UPDATE sessions 
                SET is_active = 0 
                WHERE expires_at <= CURRENT_TIMESTAMP AND is_active = 1
            ''')
            conn.commit()
            return cursor.rowcount
    
    def invalidate_user_sessions(self, user_id: int) -> int:
        """Invalidate all sessions for a user (for security purposes)"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                UPDATE sessions 
                SET is_active = 0, logged_out_at = CURRENT_TIMESTAMP 
                WHERE user_id = ? AND is_active = 1
            ''', (user_id,))
            conn.commit()
            return cursor.rowcount
    
    def refresh_session(self, session_id: str, hours: int = 24) -> bool:
        """Extend session expiration time"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                UPDATE sessions 
                SET expires_at = datetime('now', '+{} hours') 
                WHERE id = ? AND is_active = 1
            '''.format(hours), (session_id,))
            conn.commit()
            return cursor.rowcount > 0
    
    def get_active_sessions_count(self, user_id: int) -> int:
        """Get count of active sessions for a user"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT COUNT(*) FROM sessions 
                WHERE user_id = ? AND is_active = 1 AND expires_at > CURRENT_TIMESTAMP
            ''', (user_id,))
            result = cursor.fetchone()
            return result[0] if result else 0
    
    def invalidate_session(self, session_id: str) -> bool:
        """Invalidate a specific session"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    UPDATE sessions SET is_active = 0, 
                    logged_out_at = CURRENT_TIMESTAMP 
                    WHERE id = ?
                ''', (session_id,))
                conn.commit()
                return cursor.rowcount > 0
        except Exception as e:
            logger.error(f"Failed to invalidate session {session_id}: {e}")
            return False
    
    def user_owns_ticket(self, user_id: int, ticket_id: int) -> bool:
        """Verify user owns the specified ticket"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    SELECT COUNT(*) FROM support_tickets 
                    WHERE id = ? AND user_id = ?
                ''', (ticket_id, user_id))
                return cursor.fetchone()[0] > 0
        except Exception:
            return False
    
    def user_owns_conversation(self, user_id: int, conversation_id: str) -> bool:
        """Verify user owns the specified conversation"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    SELECT COUNT(*) FROM conversations 
                    WHERE id = ? AND user_id = ?
                ''', (conversation_id, user_id))
                return cursor.fetchone()[0] > 0
        except Exception:
            return False
    
    def get_user_role(self, user_id: int) -> str:
        """Get user role for authorization"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    SELECT role FROM users WHERE id = ? AND is_active = 1
                ''', (user_id,))
                result = cursor.fetchone()
                return result['role'] if result else 'user'
        except Exception:
            return 'user'
    
    def create_conversation(self, user_id: int = None, session_id: str = None, 
                          title: str = None) -> str:
        """Create a new conversation"""
        conversation_id = secrets.token_urlsafe(16)
        
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO conversations (id, user_id, session_id, title)
                VALUES (?, ?, ?, ?)
            ''', (conversation_id, user_id, session_id, title))
            conn.commit()
        
        return conversation_id
    
    def add_message(self, conversation_id: str, role: str, content: str, 
                   model_used: str = None, response_time_ms: int = None,
                   tokens_used: int = None, confidence_score: float = None,
                   rag_sources: str = None) -> int:
        """Add message to conversation"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO messages (conversation_id, role, content, model_used, 
                                    response_time_ms, tokens_used, confidence_score, rag_sources)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (conversation_id, role, content, model_used, response_time_ms, 
                  tokens_used, confidence_score, rag_sources))
            
            message_id = cursor.lastrowid
            
            # Update conversation timestamp
            cursor.execute('''
                UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?
            ''', (conversation_id,))
            
            conn.commit()
            return message_id
    
    def get_conversation_history(self, conversation_id: str, limit: int = 50) -> List[Dict]:
        """Get conversation message history - only for active conversations"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            
            # Check if conversation is active first
            cursor.execute('''
                SELECT is_active FROM conversations WHERE id = ?
            ''', (conversation_id,))
            
            conversation = cursor.fetchone()
            if not conversation or not conversation['is_active']:
                return []  # Return empty history for inactive conversations
            
            cursor.execute('''
                SELECT role, content, timestamp, model_used, confidence_score
                FROM messages
                WHERE conversation_id = ?
                ORDER BY timestamp DESC
                LIMIT ?
            ''', (conversation_id, limit))
            rows = [dict(row) for row in cursor.fetchall()]
            rows.reverse()
            return rows
    
    def get_conversation_for_ticket(self, ticket_id: int) -> List[Dict]:
        """Get conversation messages for a ticket"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            
            # First get the conversation_id for this ticket
            cursor.execute('''
                SELECT conversation_id 
                FROM support_tickets 
                WHERE id = ?
            ''', (ticket_id,))
            
            result = cursor.fetchone()
            if not result or not result['conversation_id']:
                return []
            
            conversation_id = result['conversation_id']
            
            # Get messages for this conversation
            cursor.execute('''
                SELECT role, content, timestamp, model_used
                FROM messages 
                WHERE conversation_id = ?
                ORDER BY timestamp
            ''', (conversation_id,))
            
            return [dict(row) for row in cursor.fetchall()]
    
    def get_user_conversations(self, user_id: int, limit: int = 20) -> List[Dict]:
        """Get user's conversation list"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT id, title, created_at, updated_at, escalated_to_human, satisfaction_rating
                FROM conversations 
                WHERE user_id = ? AND is_active = 1
                ORDER BY updated_at DESC
                LIMIT ?
            ''', (user_id, limit))
            
            return [dict(row) for row in cursor.fetchall()]
    
    def create_support_ticket(self, user_id: int, subject: str, description: str,
                            category: str, conversation_id: str = None,
                            priority: str = 'medium') -> str:
        """Create support ticket"""
        import random
        import string
        
        # Generate ticket number
        ticket_number = 'NLT-' + ''.join(random.choices(string.digits, k=6))
        
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO support_tickets (ticket_number, user_id, conversation_id,
                                           subject, description, category, priority)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (ticket_number, user_id, conversation_id, subject, description, category, priority))
            conn.commit()
        
        return ticket_number
    
    def add_knowledge_base_document(self, title: str, content: str, category: str,
                                  subcategory: str = None, tags: str = None,
                                  document_type: str = 'article', author: str = None) -> int:
        """Add document to knowledge base"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO knowledge_base (title, content, category, subcategory, 
                                          tags, document_type, author)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (title, content, category, subcategory, tags, document_type, author))
            
            doc_id = cursor.lastrowid
            conn.commit()
            return doc_id
    
    def search_knowledge_base(self, query: str, category: str = None, limit: int = 10) -> List[Dict]:
        """Search knowledge base documents"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            
            if category:
                cursor.execute('''
                    SELECT id, title, content, category, subcategory, document_type
                    FROM knowledge_base
                    WHERE is_published = 1 AND category = ? 
                    AND (title LIKE ? OR content LIKE ? OR tags LIKE ?)
                    ORDER BY helpful_votes DESC, view_count DESC
                    LIMIT ?
                ''', (category, f'%{query}%', f'%{query}%', f'%{query}%', limit))
            else:
                cursor.execute('''
                    SELECT id, title, content, category, subcategory, document_type
                    FROM knowledge_base
                    WHERE is_published = 1 
                    AND (title LIKE ? OR content LIKE ? OR tags LIKE ?)
                    ORDER BY helpful_votes DESC, view_count DESC
                    LIMIT ?
                ''', (f'%{query}%', f'%{query}%', f'%{query}%', limit))
            
            return [dict(row) for row in cursor.fetchall()]
    
    def add_ticket_update(self, ticket_id: int, user_id: int, message: str, 
                         update_type: str = 'note', old_value: str = None, 
                         new_value: str = None, is_internal: bool = False) -> int:
        """Add update/note to a ticket"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO ticket_updates (ticket_id, user_id, update_type, message, 
                                          old_value, new_value, is_internal)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (ticket_id, user_id, update_type, message, old_value, new_value, is_internal))
            
            update_id = cursor.lastrowid
            
            # Update the ticket's updated_at timestamp
            cursor.execute('''
                UPDATE support_tickets 
                SET updated_at = CURRENT_TIMESTAMP 
                WHERE id = ?
            ''', (ticket_id,))
            
            conn.commit()
            return update_id
    
    def get_ticket_updates(self, ticket_id: int, include_internal: bool = False) -> List[Dict]:
        """Get all updates for a ticket"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            
            if include_internal:
                cursor.execute('''
                    SELECT tu.*, u.first_name, u.last_name, u.email
                    FROM ticket_updates tu
                    LEFT JOIN users u ON tu.user_id = u.id
                    WHERE tu.ticket_id = ?
                    ORDER BY tu.created_at ASC
                ''', (ticket_id,))
            else:
                cursor.execute('''
                    SELECT tu.*, u.first_name, u.last_name, u.email
                    FROM ticket_updates tu
                    LEFT JOIN users u ON tu.user_id = u.id
                    WHERE tu.ticket_id = ? AND tu.is_internal = 0
                    ORDER BY tu.created_at ASC
                ''', (ticket_id,))
            
            return [dict(row) for row in cursor.fetchall()]
    
    def update_ticket_status(self, ticket_id: int, new_status: str, user_id: int, 
                           resolution_notes: str = None) -> bool:
        """Update ticket status with automatic logging"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                
                # Get current status
                cursor.execute('SELECT status FROM support_tickets WHERE id = ?', (ticket_id,))
                result = cursor.fetchone()
                if not result:
                    return False
                
                old_status = result['status']
                
                # Update ticket status
                if new_status in ['resolved', 'closed']:
                    cursor.execute('''
                        UPDATE support_tickets 
                        SET status = ?, resolved_at = CURRENT_TIMESTAMP, 
                            resolution_notes = ?, updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                    ''', (new_status, resolution_notes, ticket_id))
                else:
                    cursor.execute('''
                        UPDATE support_tickets 
                        SET status = ?, updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                    ''', (new_status, ticket_id))
                
                # Log the status change
                cursor.execute('''
                    INSERT INTO ticket_updates (ticket_id, user_id, update_type, message, 
                                              old_value, new_value)
                    VALUES (?, ?, 'status_change', ?, ?, ?)
                ''', (ticket_id, user_id, f'Status changed from {old_status} to {new_status}',
                      old_status, new_status))
                
                conn.commit()
                return True
        except Exception as e:
            print(f"Error updating ticket status: {e}")
            return False
    
    def get_ticket_by_number(self, ticket_number: str) -> Optional[Dict]:
        """Get ticket details by ticket number"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT st.*, u.first_name, u.last_name, u.email
                FROM support_tickets st
                JOIN users u ON st.user_id = u.id
                WHERE st.ticket_number = ?
            ''', (ticket_number,))
            
            result = cursor.fetchone()
            return dict(result) if result else None
    
    def get_tickets_by_status(self, status: str, limit: int = 50) -> List[Dict]:
        """Get tickets by status"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT st.*, u.first_name, u.last_name, u.email
                FROM support_tickets st
                JOIN users u ON st.user_id = u.id
                WHERE st.status = ?
                ORDER BY st.created_at DESC
                LIMIT ?
            ''', (status, limit))
            
            return [dict(row) for row in cursor.fetchall()]
    
    def get_user_tickets(self, user_id: int, limit: int = 10) -> List[Dict]:
        """Get tickets for a specific user"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT * FROM support_tickets
                WHERE user_id = ?
                ORDER BY created_at DESC
                LIMIT ?
            ''', (user_id, limit))
            
            return [dict(row) for row in cursor.fetchall()]
    
    def categorize_ticket_content(self, content: str) -> str:
        """Auto-categorize ticket based on content keywords"""
        content_lower = content.lower()
        
        # Get categories with their keywords
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT name, escalation_keywords FROM ticket_categories WHERE is_active = 1')
            categories = cursor.fetchall()
        
        # Check for keyword matches
        for category in categories:
            if category['escalation_keywords']:
                keywords = [kw.strip() for kw in category['escalation_keywords'].split(',')]
                for keyword in keywords:
                    if keyword.lower() in content_lower:
                        return category['name']
        
        # Default category if no matches
        return 'Service Request'
    
    def check_escalation_needed(self, ticket_id: int) -> dict:
        """Check if ticket needs escalation based on time and keywords"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT st.*, tc.escalation_keywords
                FROM support_tickets st
                LEFT JOIN ticket_categories tc ON st.category = tc.name
                WHERE st.id = ?
            ''', (ticket_id,))
            
            ticket = cursor.fetchone()
            if not ticket:
                return {'needs_escalation': False, 'reason': 'Ticket not found'}
            
            reasons = []
            needs_escalation = False
            
            # Check time-based escalation
            import datetime
            from datetime import timezone
            
            # Parse created_at handling various datetime formats
            created_at_str = ticket['created_at']
            try:
                # Try parsing with timezone info first
                if 'Z' in created_at_str:
                    created_time = datetime.datetime.fromisoformat(created_at_str.replace('Z', '+00:00'))
                elif '+' in created_at_str or created_at_str.endswith('00:00'):
                    created_time = datetime.datetime.fromisoformat(created_at_str)
                else:
                    # Assume UTC if no timezone info
                    created_time = datetime.datetime.fromisoformat(created_at_str).replace(tzinfo=timezone.utc)
            except (ValueError, AttributeError):
                # Fallback for any parsing issues
                created_time = datetime.datetime.now(timezone.utc)
            
            hours_old = (datetime.datetime.now(timezone.utc) - created_time).total_seconds() / 3600
            
            # Priority-based time thresholds
            time_thresholds = {
                'urgent': 2,    # 2 hours
                'high': 8,      # 8 hours
                'medium': 24,   # 24 hours  
                'low': 72       # 72 hours
            }
            
            threshold = time_thresholds.get(ticket['priority'], 24)
            if hours_old > threshold and ticket['status'] not in ['resolved', 'closed']:
                needs_escalation = True
                reasons.append(f"Ticket is {hours_old:.1f} hours old (threshold: {threshold}h)")
            
            # Check keyword-based escalation in recent updates
            cursor.execute('''
                SELECT message FROM ticket_updates
                WHERE ticket_id = ? AND created_at > datetime('now', '-24 hours')
                ORDER BY created_at DESC LIMIT 5
            ''', (ticket_id,))
            
            recent_messages = [row['message'].lower() for row in cursor.fetchall()]
            all_text = ' '.join(recent_messages + [ticket['description'].lower()])
            
            # High-priority escalation keywords
            escalation_keywords = ['angry', 'furious', 'terrible', 'awful', 'lawsuit', 'attorney', 
                                 'manager', 'supervisor', 'corporate', 'complaint', 'refund', 
                                 'cancel', 'emergency', 'urgent', 'critical']
            
            found_keywords = [kw for kw in escalation_keywords if kw in all_text]
            if found_keywords:
                needs_escalation = True
                reasons.append(f"Escalation keywords found: {', '.join(found_keywords)}")
            
            return {
                'needs_escalation': needs_escalation,
                'reasons': reasons,
                'hours_old': hours_old,
                'priority': ticket['priority'],
                'status': ticket['status']
            }
    
    def escalate_ticket(self, ticket_id: int, escalation_reason: str, escalated_by_user_id: int = None) -> bool:
        """Escalate a ticket to higher priority/level"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                
                # Get current ticket info
                cursor.execute('SELECT * FROM support_tickets WHERE id = ?', (ticket_id,))
                ticket = cursor.fetchone()
                if not ticket:
                    return False
                
                # Determine new escalation level and priority
                current_level = ticket['escalation_level'] or 0
                new_level = current_level + 1
                
                # Escalate priority if not already urgent
                new_priority = ticket['priority']
                if ticket['priority'] == 'low':
                    new_priority = 'medium'
                elif ticket['priority'] == 'medium':
                    new_priority = 'high'
                elif ticket['priority'] == 'high':
                    new_priority = 'urgent'
                
                # Update ticket
                cursor.execute('''
                    UPDATE support_tickets 
                    SET escalation_level = ?, priority = ?, escalated_at = CURRENT_TIMESTAMP,
                        escalation_reason = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                ''', (new_level, new_priority, escalation_reason, ticket_id))
                
                # Log escalation
                cursor.execute('''
                    INSERT INTO ticket_updates (ticket_id, user_id, update_type, message, 
                                              old_value, new_value)
                    VALUES (?, ?, 'escalation', ?, ?, ?)
                ''', (ticket_id, escalated_by_user_id, 
                     f'Ticket escalated: {escalation_reason}',
                     f'Level {current_level}, Priority {ticket["priority"]}',
                     f'Level {new_level}, Priority {new_priority}'))
                
                conn.commit()
                return True
                
        except Exception as e:
            print(f"Error escalating ticket: {e}")
            return False
    
    def get_sla_metrics(self, ticket_id: int = None) -> dict:
        """Get SLA metrics for tickets"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            
            if ticket_id:
                # Single ticket SLA
                cursor.execute('''
                    SELECT *, 
                           ROUND((julianday('now') - julianday(created_at)) * 24, 2) as hours_open,
                           ROUND((julianday(resolved_at) - julianday(created_at)) * 24, 2) as resolution_hours
                    FROM support_tickets WHERE id = ?
                ''', (ticket_id,))
                
                ticket = cursor.fetchone()
                if not ticket:
                    return {}
                
                # SLA targets by priority (hours)
                sla_targets = {'urgent': 4, 'high': 8, 'medium': 24, 'low': 72}
                target = sla_targets.get(ticket['priority'], 24)
                
                if ticket['status'] in ['resolved', 'closed']:
                    met_sla = ticket['resolution_hours'] <= target
                    time_to_resolution = ticket['resolution_hours']
                else:
                    met_sla = ticket['hours_open'] <= target
                    time_to_resolution = None
                
                return {
                    'ticket_number': ticket['ticket_number'],
                    'priority': ticket['priority'],
                    'status': ticket['status'],
                    'sla_target_hours': target,
                    'hours_open': ticket['hours_open'],
                    'resolution_hours': time_to_resolution,
                    'sla_met': met_sla,
                    'sla_breach_hours': max(0, ticket['hours_open'] - target) if not met_sla else 0
                }
            else:
                # Overall SLA metrics
                cursor.execute('''
                    SELECT priority, status,
                           COUNT(*) as total_tickets,
                           AVG(CASE WHEN status IN ('resolved', 'closed') 
                               THEN (julianday(resolved_at) - julianday(created_at)) * 24 
                               ELSE NULL END) as avg_resolution_hours,
                           COUNT(CASE WHEN status IN ('resolved', 'closed') THEN 1 END) as resolved_tickets
                    FROM support_tickets
                    WHERE created_at > datetime('now', '-30 days')
                    GROUP BY priority, status
                ''')
                
                metrics = cursor.fetchall()
                return [dict(row) for row in metrics]

# Initialize database when module is imported
if __name__ == "__main__":
    db = DatabaseManager()
    print("Database setup complete!")
