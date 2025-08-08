/**
 * WAutoSend Content Script
 * Main entry point for the Chrome extension on WhatsApp Web
 * Coordinates all modules and ensures proper initialization
 */

class WASMain {
    constructor() {
        this.isInitialized = false;
        this.retryCount = 0;
        this.maxRetries = 5;
        
        this.init();
    }

    /**
     * Initialize the extension
     */
    async init() {
        try {
            // Check if we're on WhatsApp Web
            if (!this.isWhatsAppWeb()) {
                console.log('[WAS] Not on WhatsApp Web, extension inactive');
                return;
            }

            console.log('[WAS] Starting WAutoSend extension...');
            
            // Wait for page to be ready
            await this.waitForWhatsAppReady();
            
            // Initialize modules in order
            await this.initializeModules();
            
            // Set up global error handling
            this.setupErrorHandling();
            
            this.isInitialized = true;
            console.log('[WAS] Extension fully initialized and ready');
            
        } catch (error) {
            console.error('[WAS] Initialization failed:', error);
            this.handleInitializationError(error);
        }
    }

    /**
     * Check if current page is WhatsApp Web
     * @returns {boolean} True if on WhatsApp Web
     */
    isWhatsAppWeb() {
        return window.location.hostname === 'web.whatsapp.com';
    }

    /**
     * Wait for WhatsApp Web to be ready
     * @returns {Promise<void>} Resolves when ready
     */
    async waitForWhatsAppReady() {
        const checkReady = () => {
            // Check for key WhatsApp elements
            const chatArea = document.querySelector('[data-testid="conversation-panel-messages"]');
            const inputBox = document.querySelector('[contenteditable="true"][data-tab]');
            
            return chatArea !== null || inputBox !== null;
        };

        // Wait up to 30 seconds for WhatsApp to load
        let attempts = 0;
        const maxAttempts = 60; // 30 seconds with 500ms intervals
        
        while (!checkReady() && attempts < maxAttempts) {
            await this.sleep(500);
            attempts++;
        }

        if (!checkReady()) {
            throw new Error('WhatsApp Web did not load properly');
        }

        console.log('[WAS] WhatsApp Web is ready');
    }    /**
     * Initialize all modules
     */
    async initializeModules() {
        try {
            // Wait for storage module to be available
            let attempts = 0;
            while (!window.wasStorage && attempts < 20) {
                await this.sleep(100);
                attempts++;
            }
            
            if (!window.wasStorage) {
                throw new Error('Storage module not available');
            }

            console.log('[WAS] Storage module ready');

            // Wait for scheduler module to be available
            attempts = 0;
            while (!window.wasScheduler && attempts < 20) {
                await this.sleep(100);
                attempts++;
            }

            if (!window.wasScheduler) {
                throw new Error('Scheduler module not available');
            }

            console.log('[WAS] Scheduler module ready');

            // Wait a bit more for UI to be ready
            await this.sleep(1000);
            
            if (!window.wasUI) {
                // Give UI module more time to initialize
                attempts = 0;
                while (!window.wasUI && attempts < 30) {
                    await this.sleep(100);
                    attempts++;
                }
                
                if (!window.wasUI) {
                    throw new Error('UI module not available');
                }
            }

            console.log('[WAS] All modules initialized successfully');
            
        } catch (error) {
            console.error('[WAS] Module initialization failed:', error);
            throw error;
        }
    }

    /**
     * Set up global error handling
     */
    setupErrorHandling() {
        // Handle unhandled errors
        window.addEventListener('error', (event) => {
            if (event.filename && event.filename.includes('was')) {
                console.error('[WAS] Runtime error:', event.error);
                this.handleRuntimeError(event.error);
            }
        });

        // Handle unhandled promise rejections
        window.addEventListener('unhandledrejection', (event) => {
            console.error('[WAS] Unhandled promise rejection:', event.reason);
            this.handleRuntimeError(event.reason);
        });

        // Monitor WhatsApp navigation changes
        this.setupNavigationMonitoring();
    }

    /**
     * Monitor for navigation changes in WhatsApp
     */
    setupNavigationMonitoring() {
        let lastUrl = window.location.href;
        
        const checkUrlChange = () => {
            const currentUrl = window.location.href;
            if (currentUrl !== lastUrl) {
                console.log('[WAS] URL changed, checking if restart needed');
                lastUrl = currentUrl;
                
                // If we navigate away from a chat, we might need to restart
                if (this.isInitialized) {
                    this.handleNavigationChange();
                }
            }
        };

        // Check for URL changes every 2 seconds
        setInterval(checkUrlChange, 2000);
    }

    /**
     * Handle navigation changes
     */
    handleNavigationChange() {
        // Currently just log, but could restart modules if needed
        console.log('[WAS] Navigation detected, modules should adapt automatically');
    }

    /**
     * Handle initialization errors
     * @param {Error} error - The error that occurred
     */
    handleInitializationError(error) {
        this.retryCount++;
        
        if (this.retryCount < this.maxRetries) {
            console.log(`[WAS] Retrying initialization (${this.retryCount}/${this.maxRetries}) in 5 seconds...`);
            setTimeout(() => {
                this.init();
            }, 5000);
        } else {
            console.error('[WAS] Max retries reached, extension failed to initialize');
            this.showErrorNotification('WAutoSend failed to initialize. Please refresh the page.');
        }
    }

    /**
     * Handle runtime errors
     * @param {Error} error - The error that occurred
     */
    handleRuntimeError(error) {
        console.error('[WAS] Runtime error detected:', error);
        
        // For critical errors, we might want to restart
        if (this.isCriticalError(error)) {
            console.log('[WAS] Critical error detected, attempting restart...');
            this.restart();
        }
    }

    /**
     * Check if an error is critical
     * @param {Error} error - The error to check
     * @returns {boolean} True if critical
     */
    isCriticalError(error) {
        const criticalPatterns = [
            'Storage module not available',
            'Scheduler module not available',
            'Cannot read properties of null'
        ];
        
        return criticalPatterns.some(pattern => 
            error.message && error.message.includes(pattern)
        );
    }

    /**
     * Restart the extension
     */
    async restart() {
        console.log('[WAS] Restarting extension...');
        
        try {
            // Stop scheduler if running
            if (window.wasScheduler && window.wasScheduler.stop) {
                window.wasScheduler.stop();
            }
            
            // Reset initialization flag
            this.isInitialized = false;
            this.retryCount = 0;
            
            // Wait a moment then reinitialize
            await this.sleep(2000);
            await this.init();
            
        } catch (error) {
            console.error('[WAS] Restart failed:', error);
        }
    }

    /**
     * Show error notification to user
     * @param {string} message - Error message
     */
    showErrorNotification(message) {
        // Create a simple notification
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #f8d7da;
            color: #721c24;
            padding: 12px 16px;
            border-radius: 8px;
            border: 1px solid #f5c6cb;
            z-index: 10000;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
            max-width: 300px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        `;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // Remove after 10 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 10000);
    }

    /**
     * Sleep utility function
     * @param {number} ms - Milliseconds to sleep
     * @returns {Promise} Sleep promise
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get extension status
     * @returns {Object} Status object
     */
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            isWhatsAppWeb: this.isWhatsAppWeb(),
            retryCount: this.retryCount,
            modules: {
                storage: !!window.wasStorage,
                scheduler: !!window.wasScheduler,
                ui: !!window.wasUI
            }
        };
    }
}

// Start the extension when script loads
console.log('[WAS] Content script loaded');

// Wait for DOM to be ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.wasMain = new WASMain();
    });
} else {
    window.wasMain = new WASMain();
}

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getStatus') {
        (async () => {
            try {
                const schedules = await window.wasStorage?.getSchedules() || [];
                const status = window.wasMain?.getStatus();
                
                sendResponse({
                    success: true,
                    status: status,
                    scheduleCount: schedules.length,
                    isInitialized: window.wasMain?.isInitialized || false
                });
            } catch (error) {
                sendResponse({
                    success: false,
                    error: error.message
                });
            }
        })();
        return true; // Will respond asynchronously
    }
});

// Export for debugging
window.WAS = {
    main: () => window.wasMain,
    storage: () => window.wasStorage,
    scheduler: () => window.wasScheduler,
    ui: () => window.wasUI,
    status: () => window.wasMain?.getStatus() || 'Not initialized'
};
