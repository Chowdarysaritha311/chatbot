class ChatApp {
    constructor() {
        this.currentConversationId = null;
        this.isLoading = false;
        this.eventSource = null;
        
        this.initializeElements();
        this.initializeEventListeners();
        this.loadConversations();
    }
    
    initializeElements() {
        this.messageInput = document.getElementById('messageInput');
        this.sendButton = document.getElementById('sendButton');
        this.chatContainer = document.getElementById('chatContainer');
        this.conversationsList = document.getElementById('conversationsList');
        this.welcomeMessage = document.getElementById('welcomeMessage');
        this.newChatBtn = document.getElementById('newChatBtn');
        this.clearBtn = document.getElementById('clearBtn');
        this.menuToggle = document.getElementById('menuToggle');
        this.sidebar = document.querySelector('.sidebar');
    }
    
    initializeEventListeners() {
        // Send message on button click
        this.sendButton.addEventListener('click', () => this.sendMessage());
        
        // Send message on Enter (with Shift for new line)
        this.messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        
        // Auto-resize textarea
        this.messageInput.addEventListener('input', () => {
            this.messageInput.style.height = 'auto';
            this.messageInput.style.height = Math.min(this.messageInput.scrollHeight, 200) + 'px';
        });
        
        // New chat button
        this.newChatBtn.addEventListener('click', () => this.startNewChat());
        
        // Clear all conversations
        this.clearBtn.addEventListener('click', () => this.clearConversations());
        
        // Menu toggle for mobile
        this.menuToggle.addEventListener('click', () => {
            this.sidebar.classList.toggle('open');
        });
        
        // Close sidebar when clicking outside on mobile
        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 768 && 
                !this.sidebar.contains(e.target) && 
                !this.menuToggle.contains(e.target)) {
                this.sidebar.classList.remove('open');
            }
        });
        
        // Quick suggestion buttons
        document.querySelectorAll('.suggestion-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const prompt = e.target.getAttribute('data-prompt');
                this.messageInput.value = prompt;
                this.messageInput.style.height = 'auto';
                this.messageInput.style.height = Math.min(this.messageInput.scrollHeight, 200) + 'px';
                this.messageInput.focus();
            });
        });
    }
    
    async sendMessage() {
        const message = this.messageInput.value.trim();
        
        if (!message || this.isLoading) return;
        
        // Clear input
        this.messageInput.value = '';
        this.messageInput.style.height = 'auto';
        
        // Hide welcome message
        this.welcomeMessage.style.display = 'none';
        
        // Add user message to chat
        this.addMessageToChat('user', message);
        
        // Show typing indicator
        this.showTypingIndicator();
        
        // Disable send button
        this.isLoading = true;
        this.sendButton.disabled = true;
        
        try {
            // Create or continue conversation
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: message,
                    conversation_id: this.currentConversationId
                })
            });
            
            if (!response.ok) {
                throw new Error('Failed to send message');
            }
            
            // Remove typing indicator
            this.removeTypingIndicator();
            
            // Create assistant message container
            const messageId = 'msg-' + Date.now();
            const assistantMessageDiv = this.createMessageElement('assistant', '', messageId);
            this.chatContainer.appendChild(assistantMessageDiv);
            
            // Scroll to bottom
            this.scrollToBottom();
            
            // Handle streaming response
            this.eventSource = new EventSource(`/api/chat?stream=true`);
            
            let assistantMessage = '';
            
            this.eventSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    
                    if (data.content) {
                        assistantMessage += data.content;
                        this.updateMessageContent(messageId, assistantMessage);
                    }
                    
                    if (data.conversation_id) {
                        this.currentConversationId = data.conversation_id;
                        this.loadConversations();
                    }
                    
                    if (data.done) {
                        this.eventSource.close();
                        this.isLoading = false;
                        this.sendButton.disabled = false;
                        this.messageInput.focus();
                    }
                } catch (error) {
                    console.error('Error parsing SSE data:', error);
                }
            };
            
            this.eventSource.onerror = (error) => {
                console.error('SSE Error:', error);
                this.eventSource.close();
                this.isLoading = false;
                this.sendButton.disabled = false;
                this.removeTypingIndicator();
                
                if (!assistantMessage) {
                    this.addMessageToChat('assistant', 'Sorry, I encountered an error. Please try again.');
                }
            };
            
        } catch (error) {
            console.error('Error sending message:', error);
            this.removeTypingIndicator();
            this.isLoading = false;
            this.sendButton.disabled = false;
            this.addMessageToChat('assistant', 'Sorry, I encountered an error. Please try again.');
        }
    }
    
    addMessageToChat(role, content) {
        const messageDiv = this.createMessageElement(role, content);
        this.chatContainer.appendChild(messageDiv);
        this.scrollToBottom();
    }
    
    createMessageElement(role, content, id = null) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message message-${role}`;
        if (id) messageDiv.id = id;
        
        const avatarIcon = role === 'user' ? 'fas fa-user' : 'fas fa-robot';
        const senderName = role === 'user' ? 'You' : 'AI Assistant';
        
        const now = new Date();
        const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        messageDiv.innerHTML = `
            <div class="message-avatar">
                <i class="${avatarIcon}"></i>
            </div>
            <div class="message-content">
                <div class="message-header">
                    <span class="message-sender">${senderName}</span>
                    <span class="message-time">${timeString}</span>
                </div>
                <div class="message-text">${this.formatMessageContent(content)}</div>
            </div>
        `;
        
        return messageDiv;
    }
    
    updateMessageContent(messageId, content) {
        const messageDiv = document.getElementById(messageId);
        if (messageDiv) {
            const messageText = messageDiv.querySelector('.message-text');
            if (messageText) {
                messageText.innerHTML = this.formatMessageContent(content);
                this.scrollToBottom();
            }
        }
    }
    
    formatMessageContent(content) {
        // Convert markdown-like formatting to HTML
        return content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code>$1</code>')
            .replace(/\n/g, '<br>')
            .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>');
    }
    
    showTypingIndicator() {
        const typingDiv = document.createElement('div');
        typingDiv.className = 'message message-ai';
        typingDiv.id = 'typing-indicator';
        
        typingDiv.innerHTML = `
            <div class="message-avatar">
                <i class="fas fa-robot"></i>
            </div>
            <div class="message-content">
                <div class="message-header">
                    <span class="message-sender">AI Assistant</span>
                </div>
                <div class="typing-indicator">
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                </div>
            </div>
        `;
        
        this.chatContainer.appendChild(typingDiv);
        this.scrollToBottom();
    }
    
    removeTypingIndicator() {
        const typingIndicator = document.getElementById('typing-indicator');
        if (typingIndicator) {
            typingIndicator.remove();
        }
    }
    
    scrollToBottom() {
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
    }
    
    async loadConversations() {
        try {
            const response = await fetch('/api/conversations');
            const conversations = await response.json();
            
            this.conversationsList.innerHTML = '';
            
            conversations.forEach(conv => {
                const convElement = document.createElement('div');
                convElement.className = 'conversation-item';
                if (conv.id === this.currentConversationId) {
                    convElement.classList.add('active');
                }
                
                convElement.innerHTML = `
                    <i class="fas fa-message"></i>
                    <span class="conversation-title">${conv.title}</span>
                    <button class="delete-conversation" data-id="${conv.id}">
                        <i class="fas fa-trash"></i>
                    </button>
                `;
                
                convElement.addEventListener('click', () => this.loadConversation(conv.id));
                
                const deleteBtn = convElement.querySelector('.delete-conversation');
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.deleteConversation(conv.id);
                });
                
                this.conversationsList.appendChild(convElement);
            });
        } catch (error) {
            console.error('Error loading conversations:', error);
        }
    }
    
    async loadConversation(conversationId) {
        try {
            const response = await fetch(`/api/conversations/${conversationId}`);
            const conversation = await response.json();
            
            // Update current conversation
            this.currentConversationId = conversationId;
            
            // Clear chat container
            this.chatContainer.innerHTML = '';
            this.welcomeMessage.style.display = 'none';
            
            // Add all messages
            conversation.messages.forEach(msg => {
                this.addMessageToChat(msg.role, msg.content);
            });
            
            // Update active state in sidebar
            document.querySelectorAll('.conversation-item').forEach(item => {
                item.classList.remove('active');
                if (item.querySelector('.delete-conversation').getAttribute('data-id') === conversationId) {
                    item.classList.add('active');
                }
            });
            
            // Close sidebar on mobile
            if (window.innerWidth <= 768) {
                this.sidebar.classList.remove('open');
            }
            
            // Scroll to bottom
            this.scrollToBottom();
        } catch (error) {
            console.error('Error loading conversation:', error);
        }
    }
    
    async deleteConversation(conversationId) {
        if (!confirm('Are you sure you want to delete this conversation?')) return;
        
        try {
            const response = await fetch(`/api/conversations/${conversationId}`, {
                method: 'DELETE'
            });
            
            if (response.ok) {
                // If we're viewing the deleted conversation, start a new one
                if (this.currentConversationId === conversationId) {
                    this.startNewChat();
                }
                
                // Reload conversations list
                this.loadConversations();
            }
        } catch (error) {
            console.error('Error deleting conversation:', error);
        }
    }
    
    startNewChat() {
        this.currentConversationId = null;
        this.chatContainer.innerHTML = '';
        this.welcomeMessage.style.display = 'block';
        
        // Remove active state from all conversations
        document.querySelectorAll('.conversation-item').forEach(item => {
            item.classList.remove('active');
        });
        
        // Close sidebar on mobile
        if (window.innerWidth <= 768) {
            this.sidebar.classList.remove('open');
        }
        
        this.messageInput.focus();
    }
    
    async clearConversations() {
        if (!confirm('Are you sure you want to clear all conversations? This cannot be undone.')) return;
        
        try {
            const response = await fetch('/api/clear', {
                method: 'POST'
            });
            
            if (response.ok) {
                this.startNewChat();
                this.loadConversations();
            }
        } catch (error) {
            console.error('Error clearing conversations:', error);
        }
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ChatApp();
});
