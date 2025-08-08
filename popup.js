/**
 * WAutoSend Popup Script
 * Handles the extension popup interface and status checking
 */

class WASPopup {
    constructor() {
        this.init();
    }

    async init() {
        this.bindEvents();
        this.setVersion();
        await this.updateStatus();
    }

    setVersion() {
        try {
            const version = chrome.runtime?.getManifest?.().version || '-';
            const el = document.getElementById('version-label');
            if (el) el.textContent = version;
        } catch {}
    }

    bindEvents() {
        // Open WhatsApp Web button
        document.getElementById('open-whatsapp').addEventListener('click', () => {
            chrome.tabs.create({ url: 'https://web.whatsapp.com' });
            window.close();
        });

        // Refresh status button
        document.getElementById('refresh-status').addEventListener('click', () => {
            this.updateStatus();
        });
    }

    async updateStatus() {
        try {
            // Get active tab
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            const tab = tabs && tabs.length ? tabs[0] : null;

            const statusIndicator = document.getElementById('status-indicator');
            const statusText = document.getElementById('status-text');
            const scheduleCount = document.getElementById('schedule-count');

            // Check if we're on WhatsApp Web
            if (!tab || !tab.url || !tab.url.includes('web.whatsapp.com')) {
                statusIndicator.classList.remove('active');
                statusText.textContent = 'Not on WhatsApp Web';
                scheduleCount.textContent = '-';
                return;
            }

            // Try to get status from content script
            try {
                const response = await chrome.tabs.sendMessage(tab.id, { action: 'getStatus' });
                
                if (response && response.success) {
                    statusIndicator.classList.add('active');
                    statusText.textContent = 'Active';
                    scheduleCount.textContent = response.scheduleCount || '0';
                } else {
                    statusIndicator.classList.remove('active');
                    statusText.textContent = 'Extension Loading...';
                    scheduleCount.textContent = '-';
                }
            } catch (error) {
                // Content script might not be ready yet
                statusIndicator.classList.remove('active');
                statusText.textContent = 'Starting...';
                scheduleCount.textContent = '-';
            }

        } catch (error) {
            console.error('Error updating status:', error);
            
            const statusIndicator = document.getElementById('status-indicator');
            const statusText = document.getElementById('status-text');
            
            statusIndicator.classList.remove('active');
            statusText.textContent = 'Error';
        }
    }
}

// Initialize popup when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new WASPopup();
});
