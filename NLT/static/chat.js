// Chat functionality for NodeLine Tech customer service
class ChatInterface {
    constructor() {
        this.chatMessages = document.getElementById('chat-messages');
        this.messageInput = document.getElementById('message-input');
        this.sendButton = document.getElementById('send-button');
        this.chatForm = document.getElementById('chat-form');
        this.clearButton = document.getElementById('clear-chat');
        this.typingIndicator = document.getElementById('typing-indicator');
        this.statusDot = document.getElementById('status-dot');
        this.statusText = document.getElementById('status-text');
        this.agentStatus = document.getElementById('agent-status');
        
        this.conversationId = null;
        this.isConnected = false;
        this._inFlight = false;
        
        this.init();
    }
    
    init() {
        this.checkConnection();
        this.setupEventListeners();
        this.loadConversationHistory();
    }
    
    setupEventListeners() {
        document.addEventListener('submit', (e) => {
            if (e.target && e.target.id === 'chat-form') {
                e.preventDefault();
                e.stopPropagation();
            }
        }, true);

        // Form submission (Enter must not navigate; Send is type=button)
        if (this.chatForm) {
            this.chatForm.addEventListener('submit', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.sendMessage();
            });
        }
        if (this.sendButton) {
            this.sendButton.addEventListener('click', (e) => {
                e.preventDefault();
                this.sendMessage();
            });
        }
        
        // Clear chat
        if (this.clearButton) {
            this.clearButton.addEventListener('click', () => {
                this.clearConversation();
            });
        }
        
        // End conversation
        const endConversationButton = document.getElementById('end-conversation-button');
        if (endConversationButton) {
            console.log('End conversation button found and event listener added');
            endConversationButton.addEventListener('click', () => {
                this.endConversation();
            });
        } else {
            console.log('End conversation button NOT found in DOM');
        }
        
        // Auto-resize textarea
        if (this.messageInput) {
            this.messageInput.addEventListener('input', () => {
                this.autoResizeTextarea();
                this.toggleSendButton();
            });
            
            // Enter key handling
            const sendOnEnter = (e) => {
                if (e.isComposing) return;
                if ((e.key === 'Enter' || e.key === 'NumpadEnter') && !e.shiftKey) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    this.sendMessage();
                }
            };
            this.messageInput.addEventListener('keydown', sendOnEnter, true);
            this.messageInput.addEventListener('keypress', sendOnEnter, true);
        }
    }
    
    async checkConnection() {
        try {
            const response = await fetch('/api/health');
            if (response.ok) {
                this.updateConnectionStatus(true);
            } else {
                this.updateConnectionStatus(false);
            }
        } catch (error) {
            console.error('Connection check failed:', error);
            this.updateConnectionStatus(false);
        }
    }
    
    updateConnectionStatus(connected) {
        this.isConnected = connected;
        
        if (this.statusDot && this.statusText) {
            if (connected) {
                this.statusDot.className = 'status-dot connected';
                this.statusText.textContent = 'Connected';
            } else {
                this.statusDot.className = 'status-dot disconnected';
                this.statusText.textContent = 'Connection issues';
            }
        }
        
        if (this.agentStatus) {
            this.agentStatus.textContent = connected ? 'Online' : 'Offline';
        }
    }
    
    autoResizeTextarea() {
        if (this.messageInput) {
            this.messageInput.style.height = 'auto';
            this.messageInput.style.height = Math.min(this.messageInput.scrollHeight, 120) + 'px';
        }
    }
    
    toggleSendButton() {
        if (this.sendButton && this.messageInput) {
            this.sendButton.disabled = this.messageInput.value.trim().length === 0;
        }
    }
    
    async sendMessage() {
        const message = this.messageInput.value.trim();
        if (!message || !this.isConnected || this._inFlight) return;
        this._inFlight = true;
        
        // Add user message to chat
        this.addMessage(message, 'user');
        
        // Clear input and disable send button
        this.messageInput.value = '';
        this.messageInput.style.height = 'auto';
        this.toggleSendButton();
        
        // Show typing indicator
        this.showTypingIndicator();
        
        try {
            // Create abort controller for timeout (20 minutes to match backend)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1200000); // 20 minutes
            
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: message,
                    conversation_id: this.conversationId
                }),
                signal: controller.signal,
                credentials: 'same-origin'
            });
            
            // Clear timeout if request completes successfully
            clearTimeout(timeoutId);
            
            const data = await response.json();
            
            if (data.success) {
                // Store conversation ID for future messages
                this.conversationId = data.conversation_id;
                
                // Update ticket integration with conversation ID
                if (typeof updateConversationId === 'function') {
                    updateConversationId(this.conversationId);
                }
                
                // Add assistant response
                this.addMessage(data.response, 'assistant', {
                    responseTime: data.response_time_ms,
                    model: data.model_used
                });
            } else {
                // Display the actual error message from the API
                const errorMessage = data.error || 'Sorry, I encountered an error. Please try again or contact our support team.';
                this.addMessage(errorMessage, 'assistant', { isError: true });
            }
        } catch (error) {
            console.error('Error sending message:', error);
            this.addMessage('Connection error. Please check your internet connection and try again.', 'assistant', { isError: true });
        } finally {
            this._inFlight = false;
            this.hideTypingIndicator();
        }
    }
    
    addMessage(content, role, metadata = {}) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}-message`;
        
        const timestamp = new Date().toLocaleTimeString();
        
        let messageHTML = '';
        
        if (role === 'user') {
            messageHTML = `
                <div class="message-content">
                    <div class="message-text">${this.escapeHtml(content)}</div>
                    <div class="message-time">${timestamp}</div>
                </div>
                <div class="message-avatar">👤</div>
            `;
        } else {
            const errorClass = metadata.isError ? ' error' : '';
            const responseTimeText = metadata.responseTime ? ` (${metadata.responseTime}ms)` : '';
            
            messageHTML = `
                <div class="message-avatar">🤖</div>
                <div class="message-content${errorClass}">
                    <div class="message-text">${this.escapeHtml(content)}</div>
                    <div class="message-time">${timestamp}${responseTimeText}</div>
                </div>
            `;
        }
        
        messageDiv.innerHTML = messageHTML;
        
        if (this.chatMessages) {
            this.chatMessages.appendChild(messageDiv);
            this.scrollToBottom();
        }
    }
    
    showTypingIndicator() {
        if (this.typingIndicator) {
            this.typingIndicator.style.display = 'flex';
            this.scrollToBottom();
        }
    }
    
    hideTypingIndicator() {
        if (this.typingIndicator) {
            this.typingIndicator.style.display = 'none';
        }
    }
    
    scrollToBottom() {
        if (this.chatMessages) {
            this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
        }
    }
    
    async clearConversation() {
        if (!this.conversationId) {
            // Just clear the UI if no conversation ID
            this.clearChatUI();
            return;
        }
        
        if (confirm('Are you sure you want to clear this conversation?')) {
            try {
                const response = await fetch(`/api/conversation/${this.conversationId}/clear`, {
                    method: 'POST'
                });
                
                if (response.ok) {
                    this.clearChatUI();
                    this.conversationId = null;
                } else {
                    alert('Failed to clear conversation. Please try again.');
                }
            } catch (error) {
                console.error('Error clearing conversation:', error);
                alert('Error clearing conversation. Please try again.');
            }
        }
    }
    
    async endConversation() {
        if (!this.conversationId) {
            alert('No active conversation to end.');
            return;
        }
        
        if (confirm('End this conversation and save a summary to any mentioned tickets?')) {
            try {
                const response = await fetch('/api/conversation/end', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        conversation_id: this.conversationId
                    })
                });
                
                if (response.ok) {
                    const result = await response.json();
                    if (result.success) {
                        alert(result.message || 'Conversation ended successfully!');
                        this.clearChatUI();
                        this.conversationId = null;
                    } else {
                        alert(result.message || 'Failed to end conversation properly.');
                    }
                } else {
                    alert('Failed to end conversation. Please try again.');
                }
            } catch (error) {
                console.error('Error ending conversation:', error);
                alert('Error ending conversation. Please try again.');
            }
        }
    }
    
    clearChatUI() {
        if (this.chatMessages) {
            // Keep only the welcome message
            const welcomeMessage = this.chatMessages.querySelector('.welcome-message');
            this.chatMessages.innerHTML = '';
            if (welcomeMessage) {
                this.chatMessages.appendChild(welcomeMessage);
            }
        }
    }
    
    async loadConversationHistory() {
        // Only load history if user is authenticated
        try {
            const response = await fetch('/api/user');
            if (response.ok) {
                const userData = await response.json();
                if (userData.success) {
                    // User is logged in, could load recent conversations here
                    console.log('User authenticated:', userData.user.name);
                }
            }
        } catch (error) {
            // User not authenticated, that's fine
            console.log('User not authenticated');
        }
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize chat interface when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    if (document.getElementById('chat-messages')) {
        new ChatInterface();
    }
});
