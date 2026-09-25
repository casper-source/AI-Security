// NodeLine Tech - Main Website JavaScript
class NLTWebsite {
    constructor() {
        this.currentUser = null;
        this.init();
    }
    
    init() {
        this.setupNavigation();
        this.setupUserAuthentication();
    }
    
    setupNavigation() {
        const navToggle = document.getElementById('nav-toggle');
        const navMenu = document.getElementById('nav-menu');
        
        if (navToggle && navMenu) {
            navToggle.addEventListener('click', () => {
                navMenu.classList.toggle('active');
                navToggle.classList.toggle('active');
            });
        }
    }
    
    setupUserAuthentication() {
        // Login/logout functionality is now handled in base.html
        // This method is kept for future authentication-related features
    }
    
    showModal(type) {
        const modalId = type === 'login' ? 'login-modal' : 'register-modal';
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'flex';
        }
    }
    
    hideModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'none';
            const form = modal.querySelector('form');
            if (form) form.reset();
        }
    }
    
    async logout() {
        // Logout functionality is now handled in base.html
        // This method is kept for compatibility
    }
    
    async checkUserStatus() {
        try {
            const response = await fetch('/api/user');
            const data = await response.json();
            
            if (data.success) {
                this.currentUser = data.user;
                this.updateUserUI();
            }
        } catch (error) {
            console.log('User not authenticated');
        }
    }
    
    updateUserUI() {
        const authBtn = document.getElementById('auth-btn');
        const userGreeting = document.getElementById('user-greeting');
        const userName = document.getElementById('user-name');
        const ticketsLink = document.getElementById('tickets-link');
        
        if (this.currentUser) {
            if (authBtn) {
                authBtn.textContent = 'Logout';
                authBtn.title = 'Click to logout';
            }
            if (userGreeting) userGreeting.style.display = 'inline';
            if (userName) userName.textContent = this.currentUser.name;
            if (ticketsLink) ticketsLink.style.display = 'inline-block';
        } else {
            if (authBtn) {
                authBtn.textContent = 'Login';
                authBtn.title = 'Click to login';
            }
            if (userGreeting) userGreeting.style.display = 'none';
            if (ticketsLink) ticketsLink.style.display = 'none';
        }
    }
}

// Initialize website functionality when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    new NLTWebsite();
});
