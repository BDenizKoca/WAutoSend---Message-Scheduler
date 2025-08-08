/**
 * WAutoSend Storage Module
 * Manages persistent storage of scheduled messages using chrome.storage.local
 * Provides CRUD operations for message schedules
 */

class WASStorage {
    constructor() {
        this.STORAGE_KEY = 'was_schedules';
        this.SETTINGS_KEY = 'was_settings';
        this.isReady = false;
        this.init();
    }

    /**
     * Initialize storage with retry logic
     */
    async init() {
        let attempts = 0;
        const maxAttempts = 30; // 3 seconds with 100ms intervals
        
        while (!this.isReady && attempts < maxAttempts) {
            try {
                if (chrome && chrome.storage && chrome.storage.local) {
                    await this.initializeDefaults();
                    this.isReady = true;
                    console.log('[WAS Storage] Initialized successfully');
                    break;
                }
            } catch (error) {
                console.warn('[WAS Storage] Waiting for chrome.storage...', error);
            }
            
            await this.sleep(100);
            attempts++;
        }
        if (!this.isReady) {
            console.error('[WAS Storage] Failed to initialize after maximum attempts');
        }
    }

    /**
     * Sleep utility function
     * @param {number} ms - Milliseconds to sleep
     * @returns {Promise} Sleep promise
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }    /**
     * Initialize default settings if they don't exist
     */
    async initializeDefaults() {
        if (!chrome || !chrome.storage || !chrome.storage.local) {
            return;
        }
        
        try {
            const settings = await this.getSettings();
            if (!settings) {
                await this.saveSettings({
                    reloadInterval: 30, // minutes
                    debugMode: false,
                    autoReload: true,
                    sendDelay: 3000,
                    autoRetry: true
                });
            }
        } catch (error) {
            console.error('[WAS Storage] Error initializing defaults:', error);
        }
    }    /**
     * Get all scheduled messages
     * @returns {Promise<Array>} Array of scheduled message objects
     */
    async getSchedules() {
        try {
            // Check if chrome.storage is available
            if (!chrome || !chrome.storage || !chrome.storage.local) {
                console.warn('WAS: Chrome storage not available');
                return [];
            }
            
            // Check for extension context invalidation
            if (chrome.runtime?.lastError || !chrome.runtime?.id) {
                console.warn('WAS: Extension context invalidated, using fallback');
                return this.getFallbackSchedules();
            }
            
            const result = await chrome.storage.local.get([this.STORAGE_KEY]);
            return result[this.STORAGE_KEY] || [];
        } catch (error) {
            if (error.message && error.message.includes('Extension context invalidated')) {
                console.warn('WAS: Extension context invalidated, reloading page...');
                // Try to reload the page to re-establish context
                setTimeout(() => {
                    window.location.reload();
                }, 1000);
                return [];
            }
            console.error('WAS: Error getting schedules:', error);
            return [];
        }
    }    /**
     * Save all schedules to storage
     * @param {Array} schedules - Array of schedule objects
     * @returns {Promise<boolean>} Success status
     */
    async saveSchedules(schedules) {
        try {
            // Check if chrome.storage is available
            if (!chrome || !chrome.storage || !chrome.storage.local) {
                console.warn('WAS: Chrome storage not available');
                this.saveFallbackSchedules(schedules);
                return false;
            }
            
            // Check for extension context invalidation
            if (chrome.runtime?.lastError || !chrome.runtime?.id) {
                console.warn('WAS: Extension context invalidated, using fallback');
                this.saveFallbackSchedules(schedules);
                return false;
            }
            
            await chrome.storage.local.set({
                [this.STORAGE_KEY]: schedules
            });
            
            // Also save to fallback
            this.saveFallbackSchedules(schedules);
            
            return true;
        } catch (error) {
            if (error.message && error.message.includes('Extension context invalidated')) {
                console.warn('WAS: Extension context invalidated during save, using fallback');
                this.saveFallbackSchedules(schedules);
                return false;
            }
            console.error('WAS: Error saving schedules:', error);
            return false;
        }
    }

    /**
     * Add a new message schedule
     * @param {Object} schedule - Schedule object {time, message, useClipboard, sent}
     * @returns {Promise<boolean>} Success status
     */
    async addSchedule(schedule) {
        try {
            const schedules = await this.getSchedules();
            const newSchedule = {
                id: Date.now().toString(),
                time: schedule.time,
                message: schedule.message || '',
                useClipboard: schedule.useClipboard || false,
                contactList: Array.isArray(schedule.contactList) ? schedule.contactList : (schedule.contactName ? [schedule.contactName] : []),
                sent: false,
                lastSentDate: null,
                created: new Date().toISOString()
            };
            schedules.push(newSchedule);
            return await this.saveSchedules(schedules);
        } catch (error) {
            console.error('WAS: Error adding schedule:', error);
            return false;
        }
    }

    /**
     * Remove a schedule by ID
     * @param {string} id - Schedule ID
     * @returns {Promise<boolean>} Success status
     */
    async removeSchedule(id) {
        try {
            const schedules = await this.getSchedules();
            const filteredSchedules = schedules.filter(schedule => schedule.id !== id);
            return await this.saveSchedules(filteredSchedules);
        } catch (error) {
            console.error('WAS: Error removing schedule:', error);
            return false;
        }
    }

    /**
     * Update a schedule by ID
     * @param {string} id - Schedule ID
     * @param {Object} updates - Updated fields
     * @returns {Promise<boolean>} Success status
     */
    async updateSchedule(id, updates) {
        try {
            const schedules = await this.getSchedules();
            const scheduleIndex = schedules.findIndex(schedule => schedule.id === id);
            
            if (scheduleIndex !== -1) {
                schedules[scheduleIndex] = { ...schedules[scheduleIndex], ...updates };
                return await this.saveSchedules(schedules);
            }
            return false;
        } catch (error) {
            console.error('WAS: Error updating schedule:', error);
            return false;
        }
    }

    /**
     * Mark a schedule as sent for today
     * @param {string} id - Schedule ID
     * @returns {Promise<boolean>} Success status
     */
    async markScheduleSent(id) {
        const today = new Date().toDateString();
        return await this.updateSchedule(id, {
            sent: true,
            lastSentDate: today
        });
    }

    /**
     * Reset sent status for schedules that weren't sent today
     * This allows messages to be sent again on different days
     */
    async resetDailyStatus() {
        try {
            const schedules = await this.getSchedules();
            const today = new Date().toDateString();
            let hasChanges = false;

            schedules.forEach(schedule => {
                if (schedule.sent && schedule.lastSentDate !== today) {
                    schedule.sent = false;
                    hasChanges = true;
                }
            });

            if (hasChanges) {
                await this.saveSchedules(schedules);
            }
        } catch (error) {
            console.error('WAS: Error resetting daily status:', error);
        }
    }    /**
     * Get application settings
     * @returns {Promise<Object>} Settings object
     */
    async getSettings() {
        try {
            // Check if chrome.storage is available
            if (!chrome || !chrome.storage || !chrome.storage.local) {
                console.warn('WAS: Chrome storage not available');
                return null;
            }
            
            const result = await chrome.storage.local.get([this.SETTINGS_KEY]);
            return result[this.SETTINGS_KEY];
        } catch (error) {
            console.error('WAS: Error getting settings:', error);
            return null;
        }
    }

    /**
     * Save application settings
     * @param {Object} settings - Settings object
     * @returns {Promise<boolean>} Success status
     */
    async saveSettings(settings) {
        try {
            // Check if chrome.storage is available
            if (!chrome || !chrome.storage || !chrome.storage.local) {
                console.warn('WAS: Chrome storage not available');
                return false;
            }
            
            await chrome.storage.local.set({
                [this.SETTINGS_KEY]: settings
            });
            return true;
        } catch (error) {
            console.error('WAS: Error saving settings:', error);
            return false;
        }
    }    /**
     * Clear all stored data (for debugging/reset)
     * @returns {Promise<boolean>} Success status
     */
    async clearAll() {
        try {
            await chrome.storage.local.remove([this.STORAGE_KEY, this.SETTINGS_KEY]);
            return true;
        } catch (error) {
            console.error('WAS: Error clearing storage:', error);
            return false;
        }
    }

    /**
     * Remove all schedules but keep settings (used by debug helpers)
     * @returns {Promise<boolean>} Success status
     */
    async clearSchedules() {
        try {
            if (chrome?.storage?.local) {
                await chrome.storage.local.remove([this.STORAGE_KEY]);
            }
            // Also clear fallback
            this.saveFallbackSchedules([]);
            return true;
        } catch (error) {
            console.error('WAS: Error clearing schedules:', error);
            return false;
        }
    }

    /**
     * Save or upsert a single schedule (used by debug helpers)
     * @param {Object} schedule - Schedule object with id
     * @returns {Promise<boolean>} Success status
     */
    async saveSchedule(schedule) {
        try {
            if (!schedule?.id) {
                schedule.id = Date.now().toString();
            }
            const schedules = await this.getSchedules();
            const idx = schedules.findIndex(s => s.id === schedule.id);
            if (idx >= 0) {
                schedules[idx] = { ...schedules[idx], ...schedule };
            } else {
                schedules.push({
                    sent: false,
                    lastSentDate: null,
                    created: new Date().toISOString(),
                    useClipboard: false,
                    message: '',
                    ...schedule
                });
            }
            return await this.saveSchedules(schedules);
        } catch (error) {
            console.error('WAS: Error saving schedule:', error);
            return false;
        }
    }

    /**
     * Fallback storage using localStorage when chrome.storage is unavailable
     * @param {Array} schedules - Schedules to save
     */
    saveFallbackSchedules(schedules) {
        try {
            localStorage.setItem(`was_fallback_${this.STORAGE_KEY}`, JSON.stringify(schedules));
        } catch (error) {
            console.error('WAS: Error saving fallback schedules:', error);
        }
    }

    /**
     * Get fallback schedules from localStorage
     * @returns {Array} Schedules array
     */
    getFallbackSchedules() {
        try {
            const data = localStorage.getItem(`was_fallback_${this.STORAGE_KEY}`);
            return data ? JSON.parse(data) : [];
        } catch (error) {
            console.error('WAS: Error getting fallback schedules:', error);
            return [];
        }
    }

    /**
     * Check if extension context is valid
     * @returns {boolean} True if context is valid
     */
    isExtensionContextValid() {
        try {
            return !!(chrome && chrome.runtime && chrome.runtime.id && !chrome.runtime.lastError);
        } catch (error) {
            return false;
        }
    }

    /**
     * Reload extension if context is invalidated
     */
    handleContextInvalidation() {
        console.warn('WAS: Extension context invalidated, attempting recovery...');
        
        // Show user notification
        this.showContextInvalidatedNotification();
        
        // Try to reload the page after a delay
        setTimeout(() => {
            try {
                window.location.reload();
            } catch (error) {
                console.error('WAS: Failed to reload page:', error);
            }
        }, 2000);
    }

    /**
     * Show notification about context invalidation
     */
    showContextInvalidatedNotification() {
        try {
            const notification = document.createElement('div');
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: #fff3cd;
                color: #856404;
                border: 1px solid #ffeaa7;
                border-radius: 8px;
                padding: 16px;
                z-index: 10000;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 14px;
                max-width: 300px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
            `;
            notification.innerHTML = `
                <strong>WAutoSend Notice</strong><br>
                Extension was reloaded. Page will refresh in 2 seconds to restore functionality.
            `;
            
            document.body.appendChild(notification);
            
            // Remove notification after 5 seconds
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 5000);
        } catch (error) {
            console.error('WAS: Error showing notification:', error);
        }
    }
}

// Create global instance
window.wasStorage = new WASStorage();
