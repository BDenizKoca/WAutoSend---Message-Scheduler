/**
 * WAutoSend Scheduler Module
 * Handles timing checks, message injection, and auto-send functionality
 * Monitors scheduled messages and executes them at the right time
 */

class WASScheduler {    constructor() {
        this.isRunning = false;
        this.checkInterval = null;
        this.reloadTimer = null;
        this.activityTimer = null; // Anti-inactivity timer
        this.lastActivity = Date.now();
        this.lastSendTime = 0; // Track last send to prevent rapid succession
        this.sendCooldown = 2000; // 2 second cooldown between sends
        this.isSending = false; // Semaphore to prevent concurrent sends
        this.isCheckingSchedules = false; // Semaphore to prevent concurrent schedule checks// WhatsApp Web selectors (updated for current version)
        this.selectors = {
            // Multiple selectors to try for the message input box - UPDATED BASED ON YOUR HTML
            inputBoxSelectors: [
                // Your exact message input structure
                'div[aria-label="Type a message"][contenteditable="true"][data-lexical-editor="true"]',
                'div[contenteditable="true"][aria-label*="Type"]', // Performance boost
                'div[role="textbox"][contenteditable="true"][data-lexical-editor="true"]',
                'div[contenteditable="true"][data-tab="10"][data-lexical-editor="true"]',
                // Fallback selectors
                'div[contenteditable="true"][data-tab="10"]',
                'div[contenteditable="true"][data-tab="1"]',
                'div[role="textbox"][contenteditable="true"][spellcheck="true"]',
                'div[role="textbox"][contenteditable="true"]',
                '[data-testid="conversation-compose-box-input"]',
                'div[contenteditable="true"][data-lexical-editor="true"]',
                'div[contenteditable="true"][spellcheck="true"]',
                // Fallback selectors
                'div[contenteditable="true"]:not([data-testid*="search"])',
                'div[contenteditable="true"]'
            ],
            sendButtonSelectors: [
                '[data-testid="send"]',
                'button[data-testid="send"]',
                'span[data-testid="send"]',
                'div[data-testid="send"]',
                '[aria-label*="Send"]',
                'button[aria-label*="Send"]'
            ],
            chatArea: '[data-testid="conversation-panel-messages"]',
            disconnectedBanner: '[data-testid="alert-phone-disconnected"]',
            searchBox: '[data-testid="chat-list-search"]',
            // Possible search input candidates
            searchInputSelectors: [
                '[data-testid="chat-list-search"] [contenteditable="true"]',
                '[role="region"][aria-label*="Search"] [contenteditable="true"]',
                'div[contenteditable="true"][data-tab="3"]',
                'header [contenteditable="true"]'
            ],
            messageInputArea: '[data-testid="conversation-compose-box"]',
            composePanel: '[data-testid="compose-panel"]'
        };

        this.debugMode = false;
        this.settings = { sendDelay: 3000, autoRetry: true };
        this.init();
    }    /**
     * Initialize the scheduler
     */
    async init() {
        // Wait for storage to be available
        await this.waitForStorage();
        
    const settings = await window.wasStorage.getSettings();
    // Production-ready: respect debug setting, default to false for performance
    this.debugMode = Boolean(settings?.debugMode) || false;
        if (settings?.sendDelay != null) this.settings.sendDelay = Number(settings.sendDelay);
        if (settings?.autoRetry != null) this.settings.autoRetry = Boolean(settings.autoRetry);
        
        this.log('Scheduler initialized');
        this.start();
        this.setupReloadWatchdog();
        this.setupAntiInactivityMeasures();
        
        // Reset daily status on startup
        await window.wasStorage.resetDailyStatus();
    }

    /**
     * Wait for storage module to be available
     */
    async waitForStorage() {
        let attempts = 0;
        const maxAttempts = 50; // 5 seconds with 100ms intervals
        
        while ((!window.wasStorage || typeof window.wasStorage.getSchedules !== 'function') && attempts < maxAttempts) {
            await this.sleep(100);
            attempts++;
        }
        
        if (!window.wasStorage) {
            console.error('WAS: Storage module not available after waiting');
            throw new Error('Storage module not available');
        }
        
        this.log('Storage module is ready');
    }

    /**
     * Start the scheduler monitoring
     */
    start() {
        if (this.isRunning) return;
        
        this.isRunning = true;
        this.checkInterval = setInterval(() => {
            this.checkSchedules();
        }, 1000); // Check every second
        
        this.log('Scheduler started');
    }

    /**
     * Stop the scheduler monitoring
     */
    stop() {
        if (!this.isRunning) return;
        
        this.isRunning = false;
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        
        if (this.activityTimer) {
            clearInterval(this.activityTimer);
            this.activityTimer = null;
        }
        
        this.log('Scheduler stopped');
    }    /**
     * Check all schedules and send messages when time matches
     */
    async checkSchedules() {
        // Prevent concurrent schedule checking
        if (this.isCheckingSchedules) {
            this.log('Schedule check already in progress, skipping');
            return;
        }
        
        this.isCheckingSchedules = true;
        
        try {
            // Check if storage is available
            if (!window.wasStorage || typeof window.wasStorage.getSchedules !== 'function') {
                this.log('Storage not available, skipping schedule check');
                return;
            }

            // Check if extension context is still valid
            if (!window.wasStorage.isExtensionContextValid()) {
                this.log('Extension context invalidated, stopping scheduler');
                this.stop();
                window.wasStorage.handleContextInvalidation();
                return;
            }
            
            const schedules = await window.wasStorage.getSchedules();
            const currentTime = this.getCurrentTimeString();
            
            // Update status with next message info
            this.updateNextMessageStatus(schedules, currentTime);
            
            // Find schedules that need to be sent
            const pendingSchedules = schedules.filter(schedule => 
                this.shouldSendMessage(schedule, currentTime)
            );
            
            if (pendingSchedules.length === 0) {
                this.log(`Checking ${schedules.length} schedules at ${currentTime}`);
                return;
            }
            
            this.updateStatus(`Sending ${pendingSchedules.length} message${pendingSchedules.length !== 1 ? 's' : ''}...`, 'working');
            
            // Send messages sequentially to prevent interference
            for (const schedule of pendingSchedules) {
                try {
                    this.log(`Processing schedule: ${schedule.id}`);
                    this.updateStatus(`Sending: ${schedule.message.substring(0, 30)}...`, 'working');
                    await this.sendScheduledMessage(schedule);
                    
                    // Add delay between multiple messages to ensure they don't interfere
                    if (pendingSchedules.length > 1) {
                        this.log('Waiting between messages...');
                        await this.sleep(3000); // 3 second delay between messages
                    }
                } catch (error) {
                    this.log(`Error sending message ${schedule.id}:`, error);
                    this.updateStatus(`Failed to send message: ${error.message}`, 'error');
                    // Continue with next message even if one fails
                }
            }
        } catch (error) {
            if (error.message && error.message.includes('Extension context invalidated')) {
                this.log('Extension context invalidated during schedule check');
                this.stop();
                window.wasStorage.handleContextInvalidation();
                return;
            }
            this.log('Error checking schedules:', error);
            this.updateStatus(`Schedule check error: ${error.message}`, 'error');
        } finally {
            // Always release the semaphore
            this.isCheckingSchedules = false;
        }
    }

    /**
     * Update status with next message information
     * @param {Array} schedules - All schedules
     * @param {string} currentTime - Current time
     */
    updateNextMessageStatus(schedules, currentTime) {
        const activeSchedules = schedules.filter(s => !s.sent);
        if (activeSchedules.length === 0) {
            this.updateStatus('No scheduled messages', 'info');
            return;
        }
        
        // Find next message
        const nextSchedule = activeSchedules
            .sort((a, b) => a.time.localeCompare(b.time))[0];
            
        if (nextSchedule) {
            const timeUntil = this.getTimeUntilNext(nextSchedule.time);
            const contactInfo = nextSchedule.contactList?.length > 0 
                ? ` to ${nextSchedule.contactList.length} contact${nextSchedule.contactList.length !== 1 ? 's' : ''}`
                : ' to current chat';
            this.updateStatus(`Next message ${timeUntil}${contactInfo}`, 'info');
        }
    }

    /**
     * Check if a message should be sent
     * @param {Object} schedule - Schedule object
     * @param {string} currentTime - Current time in HH:MM format
     * @returns {boolean} Whether message should be sent
     */
    shouldSendMessage(schedule, currentTime) {
        // Don't send if already sent today
        if (schedule.sent) {
            return false;
        }
        
        // Check if time matches
        if (schedule.time !== currentTime) {
            return false;
        }
        
        // Check if WhatsApp is connected
        if (!this.isWhatsAppConnected()) {
            this.log('WhatsApp is disconnected, skipping message');
            return false;
        }
        
        return true;
    }    /**
     * Send a scheduled message
     * @param {Object} schedule - Schedule object
     */
    async sendScheduledMessage(schedule) {
        // Prevent concurrent sends using semaphore
        if (this.isSending) {
            this.log(`Already sending a message, skipping ${schedule.id}`);
            return;
        }
        
        this.isSending = true;
        
        try {
            this.log(`Sending scheduled message: ${schedule.id}`);
            
            let messageText = schedule.message;
            
            // Use clipboard if message is empty and clipboard option is enabled
            if (!messageText && schedule.useClipboard) {
                messageText = await this.getClipboardText();
                this.log('Using clipboard text:', messageText);
            }
            
            if (!messageText) {
                this.log('No message text available, skipping');
                return;
            }
            
            // If contacts specified, iterate through them with chat switching
            const contacts = Array.isArray(schedule.contactList) ? schedule.contactList.filter(Boolean) : (schedule.contactName ? [schedule.contactName] : []);
            let success = false;

            if (contacts.length > 0) {
                this.log(`Sending to ${contacts.length} contact(s)`);
                for (let i = 0; i < contacts.length; i++) {
                    const name = contacts[i];
                    this.log(`Opening chat for: ${name}`);
                    
                    // Use smart retry for opening chat
                    const opened = await this.smartRetry(async () => {
                        return await this.openChat(name, { retries: 1 });
                    }, this.settings.autoRetry ? 3 : 1);
                    
                    if (!opened) {
                        this.log(`Failed to open chat for ${name}, skipping`);
                        continue;
                    }
                    
                    await this.sleep(300);
                    
                    // Use smart retry for sending message
                    const sent = await this.smartRetry(async () => {
                        return await this.injectAndSendMessage(messageText);
                    }, 2);
                    
                    success = success || sent;
                    if (i < contacts.length - 1) {
                        await this.sleep(this.settings.sendDelay);
                    }
                }
            } else {
                // No contacts provided: send to current chat with retry
                success = await this.smartRetry(async () => {
                    return await this.injectAndSendMessage(messageText);
                }, 2);
            }
            
            if (success) {
                // Mark as sent
                await window.wasStorage.markScheduleSent(schedule.id);
                this.log(`Message sent successfully: ${schedule.id}`);
                this.updateStatus(`✓ Message sent successfully`, 'success');
                
                // Notify UI
                this.notifyUI('messageSent', {
                    id: schedule.id,
                    time: schedule.time,
                    message: messageText.substring(0, 50) + (messageText.length > 50 ? '...' : '')
                });
            } else {
                this.log(`Failed to send message: ${schedule.id}`);
                this.updateStatus(`✗ Failed to send message`, 'error');
            }
            
        } catch (error) {
            this.log('Error sending scheduled message:', error);
        } finally {
            // Always release the semaphore
            this.isSending = false;
        }
    }/**
     * Send a message immediately to targets (contacts or current chat)
     * @param {string} messageText
     * @param {string[]} contacts
     * @returns {Promise<boolean>} true if at least one send succeeded
     */
    async sendToTargets(messageText, contacts = []) {
        if (this.isSending) {
            this.log('Already sending, skipping sendNow');
            return false;
        }
        this.isSending = true;
        let success = false;
        try {
            const targets = Array.isArray(contacts) ? contacts.filter(Boolean) : [];
            if (targets.length > 0) {
                for (let i = 0; i < targets.length; i++) {
                    const name = targets[i];
                    const opened = await this.openChat(name, { retries: this.settings.autoRetry ? 3 : 1 });
                    if (!opened) {
                        this.log(`sendNow: failed to open ${name}`);
                        continue;
                    }
                    await this.sleep(250);
                    const sent = await this.injectAndSendMessage(messageText);
                    success = success || sent;
                    if (i < targets.length - 1) {
                        await this.sleep(this.settings.sendDelay);
                    }
                }
            } else {
                success = await this.injectAndSendMessage(messageText);
            }
        } catch (e) {
            this.log('sendNow error:', e);
        } finally {
            this.isSending = false;
        }
        return success;
    }

    /**
     * Open a chat by contact name - SIMPLE TAB APPROACH
     * @param {string} chatName
     * @param {{retries?: number, timeoutMs?: number}} opts
     * @returns {Promise<boolean>}
     */
    async openChat(chatName, opts = {}) {
        const retries = opts.retries ?? 3;
        
        for (let attempt = 0; attempt < retries; attempt++) {
            try {
                this.log(`Attempt ${attempt + 1}: Opening chat for "${chatName}"`);
                this.updateStatus(`Opening chat: ${chatName}...`, 'working');
                
                // Find and focus search input (we're already good at this)
                const searchInput = this.findSearchInput();
                if (!searchInput) {
                    this.log('Search input not found');
                    await this.sleep(300);
                    continue;
                }
                
                this.focusElement(searchInput);
                await this.sleep(100);
                
                // Clear and type (we're already good at this)
                await this.clearInputBox(searchInput);
                await this.sleep(120);
                await this.insertMessageText(searchInput, chatName);
                await this.sleep(800); // Wait for search results
                
                // Press Tab twice to select the chat
                this.log('Pressing Tab twice to select chat...');
                searchInput.dispatchEvent(new KeyboardEvent('keydown', {
                    key: 'Tab',
                    code: 'Tab',
                    bubbles: true
                }));
                searchInput.dispatchEvent(new KeyboardEvent('keyup', {
                    key: 'Tab',
                    code: 'Tab',
                    bubbles: true
                }));
                
                await this.sleep(100);
                
                searchInput.dispatchEvent(new KeyboardEvent('keydown', {
                    key: 'Tab',
                    code: 'Tab',
                    bubbles: true
                }));
                searchInput.dispatchEvent(new KeyboardEvent('keyup', {
                    key: 'Tab',
                    code: 'Tab',
                    bubbles: true
                }));
                
                await this.sleep(200);
                
                // Press Enter to open the chat
                this.log('Pressing Enter to open chat...');
                document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {
                    key: 'Enter',
                    code: 'Enter',
                    bubbles: true
                }));
                document.activeElement.dispatchEvent(new KeyboardEvent('keyup', {
                    key: 'Enter',
                    code: 'Enter',
                    bubbles: true
                }));
                
                await this.sleep(1000); // Wait for chat to load
                
                // Verify we have the message input available
                const messageInput = this.findMessageInputBox();
                if (messageInput && !this.isSearchBox(messageInput)) {
                    this.log('Successfully opened chat and found message input');
                    this.updateStatus(`✓ Chat opened: ${chatName}`, 'success');
                    return true;
                }
                
                this.log('Chat not opened properly, retrying...');
                
            } catch (e) {
                this.log('openChat error:', e);
            }
            
            await this.sleep(500);
        }
        
        this.updateStatus(`✗ Failed to open chat: ${chatName}`, 'error');
        return false;
    }    /** Find the chat-list search input */
    findSearchInput() {
        // Prefer explicit container then contenteditable inside it
        const container = document.querySelector(this.selectors.searchBox);
        if (container) {
            const inner = container.querySelector('[contenteditable="true"]');
            if (inner && this.isElementVisible(inner)) return inner;
        }
        for (const sel of this.selectors.searchInputSelectors) {
            const el = document.querySelector(sel);
            if (el && this.isElementVisible(el)) return el;
        }
        // Fallback: any top-left contenteditable likely in sidebar
        const candidates = Array.from(document.querySelectorAll('[contenteditable="true"]'));
        const leftHalf = candidates.filter(el => el.getBoundingClientRect().left < window.innerWidth * 0.3);
        return leftHalf.find(el => this.isElementVisible(el)) || null;
    }

    /** Check element visibility */
    isElementVisible(el) {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
    }

    /** Focus an element with events */
    focusElement(el) {
        try {
            el.focus();
            el.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
            el.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
        } catch {}
    }

    /** Blur an element with events */
    blurElement(el) {
        try {
            el.blur();
            el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
            el.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
        } catch {}
    }

    /** Find a chat list item matching the given name */
    findChatEntryByName(name) {
        const lower = name.toLowerCase();
        const listSelectors = [
            '[data-testid="cell-frame-container"]',
            'div[role="listitem"]',
            'div[aria-label*="chat"]'
        ];
        for (const sel of listSelectors) {
            const items = document.querySelectorAll(sel);
            for (const item of items) {
                const text = (item.textContent || '').toLowerCase();
                if (text.includes(lower)) return item;
            }
        }
        return null;
    }

    /** Find best matching chat entry with exact match priority */
    findBestChatEntry(name) {
        const lower = name.toLowerCase();
        const selectors = ['[data-testid="cell-frame-container"]', 'div[role="listitem"]'];
        const items = [];
        for (const sel of selectors) items.push(...document.querySelectorAll(sel));
        let exact = null;
        let partial = null;
        for (const item of items) {
            const text = (item.textContent || '').toLowerCase().trim();
            if (!text) continue;
            if (text === lower) { exact = item; break; }
            if (!partial && text.includes(lower)) partial = item;
        }
        return exact || partial;
    }

    /** Wait until the conversation header/input indicates the chat is loaded */
    async waitForChatToLoad(expectedName, timeoutMs = 8000) {
        const start = Date.now();
        const lower = expectedName.toLowerCase();
        while (Date.now() - start < timeoutMs) {
            // Input area present?
            const input = this.findMessageInputBox();
            const hasCompose = !!document.querySelector(this.selectors.messageInputArea) || !!document.querySelector(this.selectors.composePanel);
            let headerOk = false;
            const headerCandidates = [
                '[data-testid="conversation-info-header"]',
                '[data-testid="conversation-header"]',
                'header'
            ];
            for (const sel of headerCandidates) {
                const h = document.querySelector(sel);
                if (h) {
                    const text = (h.textContent || '').toLowerCase();
                    if (text.includes(lower)) { headerOk = true; break; }
                }
            }
            // Also consider selected chat in list as loaded indicator
            let selectedInList = false;
            const selectedItem = document.querySelector('[aria-selected="true"], [data-selected="true"]');
            if (selectedItem) {
                const t = (selectedItem.textContent || '').toLowerCase();
                selectedInList = !!t && t.includes(lower);
            }

            // If compose area/input is present and either header matches OR selected chat matches, consider loaded
            if ((input || hasCompose) && (headerOk || selectedInList)) return true;

            // As a last resort, if compose area is present and search box is not focused anymore, accept
            const activeEl = document.activeElement;
            const activeIsSearch = activeEl && this.isSearchBox(activeEl);
            if ((input || hasCompose) && !activeIsSearch && Date.now() - start > 1200) return true;
            await this.sleep(200);
        }
        return false;
    }

    /** Wait for search results to appear; returns array of items (possibly empty) */
    async waitForSearchResults(queryName, timeoutMs = 2000) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            const items = this.getChatListItems();
            if (items.length) return items;
            await this.sleep(100);
        }
        return [];
    }

    /** Get chat list items under typical containers */
    getChatListItems() {
        const containers = [
            '[data-testid="chat-list"]',
            'div[role="grid"]',
            'div[role="listbox"]',
            '[data-testid="pane-side"]',
            '[aria-label="Search results" i]',
            '[aria-label="Chats" i]'
        ];
        const itemSelectors = [
            '[data-testid="cell-frame-container"]',
            'div[role="listitem"]',
            'div[role="gridcell"]',
            'div[aria-label*="chat" i]'
        ];
        const results = [];
        for (const cSel of containers) {
            const container = document.querySelector(cSel) || document;
            for (const iSel of itemSelectors) {
                const list = container.querySelectorAll(iSel);
                for (const el of list) {
                    const rect = el.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) results.push(el);
                }
            }
            if (results.length) break;
        }
        return results;
    }

    /** Try multiple ways to click a chat entry and return whether a click was attempted */
    clickChatEntry(entry) {
        if (!entry) return false;
        try {
            // First try center click
            this.clickElementAtCenter(entry);
            return true;
        } catch {}
        try {
            // Try clickable descendants
            const targets = entry.querySelectorAll('[data-testid="conversation-title"] *, [data-testid="conversation-title"], a, [role="gridcell"], [role="button"], [tabindex]');
            for (const t of targets) {
                const rect = t.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    this.clickElementAtCenter(t);
                    return true;
                }
            }
        } catch {}
        try { entry.click(); return true; } catch {}
        return false;
    }

    /** Ensure message input is focused after chat opens */
    async focusMessageInput() {
        try {
            const input = this.findMessageInputBox();
            if (input) this.focusElement(input);
        } catch {}
    }

    /** Press Enter key on an element */
    pressEnter(el) {
        try {
            el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
        } catch {}
    }

    /** Click element center with synthetic mouse events */
    clickElementAtCenter(el) {
        if (!el) return;
        try {
            el.scrollIntoView({ block: 'center' });
            const r = el.getBoundingClientRect();
            const x = r.left + r.width / 2;
            const y = r.top + r.height / 2;
            const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window };
            // Some UIs require pointer events
            try {
                el.dispatchEvent(new PointerEvent('pointermove', { ...opts, pointerId: 1, isPrimary: true }));
                el.dispatchEvent(new PointerEvent('pointerdown', { ...opts, pointerId: 1, isPrimary: true, button: 0 }));
                el.dispatchEvent(new PointerEvent('pointerup', { ...opts, pointerId: 1, isPrimary: true, button: 0 }));
            } catch {}
            el.dispatchEvent(new MouseEvent('mousemove', opts));
            el.dispatchEvent(new MouseEvent('mousedown', opts));
            el.dispatchEvent(new MouseEvent('mouseup', opts));
            el.dispatchEvent(new MouseEvent('click', opts));
        } catch (e) {
            try { el.click(); } catch {}
        }
    }

    /** Press a key multiple times with keydown/keypress/keyup */
    pressKey(el, key, code, times = 1) {
        for (let i = 0; i < times; i++) {
            try {
                el.dispatchEvent(new KeyboardEvent('keydown', { key, code, bubbles: true }));
                el.dispatchEvent(new KeyboardEvent('keypress', { key, code, bubbles: true }));
                el.dispatchEvent(new KeyboardEvent('keyup', { key, code, bubbles: true }));
            } catch {}
        }
    }

    /**
     * Inject message into WhatsApp input and send - ENHANCED PASTING
     * @param {string} messageText - Message to send
     * @returns {Promise<boolean>} Success status
     */
    async injectAndSendMessage(messageText) {
        try {
            this.log('Starting enhanced message injection...');
            
            // Check cooldown
            const now = Date.now();
            if (now - this.lastSendTime < this.sendCooldown) {
                this.log(`Send cooldown active. Waiting...`);
                await this.sleep(this.sendCooldown - (now - this.lastSendTime));
            }
            
            // Find the message input first
            const inputBox = this.findMessageInputBox();
            if (!inputBox) {
                this.log('No message input found');
                return false;
            }
            
            this.log('Found message input:', inputBox);
            
            // Method 1: Direct focus and paste via clipboard
            this.log('Method 1: Clipboard approach...');
            try {
                // Copy to clipboard first
                await navigator.clipboard.writeText(messageText);
                this.log('Message copied to clipboard successfully');
                
                // Focus the input box directly
                inputBox.focus();
                inputBox.click();
                await this.sleep(200);
                
                // Clear any existing content
                inputBox.dispatchEvent(new KeyboardEvent('keydown', {
                    key: 'a',
                    code: 'KeyA',
                    ctrlKey: true,
                    bubbles: true
                }));
                await this.sleep(50);
                
                // Paste with Ctrl+V
                inputBox.dispatchEvent(new KeyboardEvent('keydown', {
                    key: 'v',
                    code: 'KeyV',
                    ctrlKey: true,
                    bubbles: true
                }));
                inputBox.dispatchEvent(new KeyboardEvent('keyup', {
                    key: 'v',
                    code: 'KeyV',
                    ctrlKey: true,
                    bubbles: true
                }));
                
                await this.sleep(500);
                
                // Check if text was pasted
                const content = inputBox.textContent || inputBox.innerText || '';
                if (content.includes(messageText.substring(0, 20))) {
                    this.log('Clipboard method successful, sending...');
                    
                    // Send with Enter
                    inputBox.dispatchEvent(new KeyboardEvent('keydown', {
                        key: 'Enter',
                        code: 'Enter',
                        bubbles: true
                    }));
                    inputBox.dispatchEvent(new KeyboardEvent('keyup', {
                        key: 'Enter',
                        code: 'Enter',
                        bubbles: true
                    }));
                    
                    // Wait and verify message was sent
                    const sent = await this.waitForMessageSent(messageText);
                    if (sent) {
                        this.lastSendTime = Date.now();
                        return true;
                    } else {
                        throw new Error('Send confirmation failed');
                    }
                }
                
            } catch (clipboardError) {
                this.log('Clipboard method failed:', clipboardError);
            }
            
            // Method 2: Direct text insertion
            this.log('Method 2: Direct text insertion...');
            try {
                inputBox.focus();
                await this.sleep(100);
                
                // Clear content
                document.execCommand('selectAll', false, null);
                document.execCommand('delete', false, null);
                
                // Insert text using execCommand
                const inserted = document.execCommand('insertText', false, messageText);
                if (inserted) {
                    this.log('execCommand insertText successful');
                } else {
                    // Fallback: direct content setting
                    inputBox.textContent = messageText;
                    inputBox.dispatchEvent(new Event('input', { bubbles: true }));
                }
                
                await this.sleep(300);
                
                // Verify text is there
                const finalContent = inputBox.textContent || inputBox.innerText || '';
                if (finalContent.includes(messageText.substring(0, 20))) {
                    this.log('Direct insertion successful, sending...');
                    
                    // Send with Enter
                    inputBox.dispatchEvent(new KeyboardEvent('keydown', {
                        key: 'Enter',
                        code: 'Enter',
                        bubbles: true
                    }));
                    inputBox.dispatchEvent(new KeyboardEvent('keyup', {
                        key: 'Enter',
                        code: 'Enter',
                        bubbles: true
                    }));
                    
                    // Wait and verify message was sent
                    const sent = await this.waitForMessageSent(messageText);
                    if (sent) {
                        this.lastSendTime = Date.now();
                        return true;
                    } else {
                        throw new Error('Send confirmation failed');
                    }
                }
                
            } catch (insertError) {
                this.log('Direct insertion failed:', insertError);
            }
            
            // Method 3: Character-by-character typing simulation
            this.log('Method 3: Character typing simulation...');
            try {
                inputBox.focus();
                await this.sleep(100);
                
                // Clear first
                document.execCommand('selectAll', false, null);
                document.execCommand('delete', false, null);
                
                // Type character by character
                for (const char of messageText) {
                    inputBox.dispatchEvent(new KeyboardEvent('keydown', {
                        key: char,
                        bubbles: true
                    }));
                    
                    // Use document.execCommand for each character
                    document.execCommand('insertText', false, char);
                    
                    inputBox.dispatchEvent(new KeyboardEvent('keyup', {
                        key: char,
                        bubbles: true
                    }));
                    
                    await this.sleep(5); // Small delay between characters
                }
                
                await this.sleep(200);
                
                // Send with Enter
                inputBox.dispatchEvent(new KeyboardEvent('keydown', {
                    key: 'Enter',
                    code: 'Enter',
                    bubbles: true
                }));
                inputBox.dispatchEvent(new KeyboardEvent('keyup', {
                    key: 'Enter',
                    code: 'Enter',
                    bubbles: true
                }));
                
                this.lastSendTime = Date.now();
                this.log('Character typing method completed');
                return true;
                
            } catch (typingError) {
                this.log('Character typing failed:', typingError);
            }
            
            this.log('All message injection methods failed');
            return false;
            
        } catch (error) {
            this.log('Error in enhanced message injection:', error);
            return false;
        }
    }

    /**
     * Wait for message to be sent and confirmed - SIMPLE BRUTE FORCE
     * @param {string} messageText - Original message text
     * @returns {Promise<boolean>} True if confirmed sent
     */
    async waitForMessageSent(messageText) {
        this.log('Waiting for send confirmation...');
        
        // Simple approach: wait for input to clear + look for checkmarks
        for (let i = 0; i < 15; i++) { // 3 second max wait
            await this.sleep(200);
            
            // Check 1: Input cleared (message sent)
            const input = this.findMessageInputBox();
            const content = input ? (input.textContent || input.innerText || '') : '';
            const inputCleared = !content.trim();
            
            // Check 2: Find our message in chat (simple text match)
            const messages = document.querySelectorAll('[data-testid="msg-container"], .message-out, .msg-out');
            let messageFound = false;
            for (const msg of messages) {
                if (msg.textContent && msg.textContent.includes(messageText.substring(0, 30))) {
                    messageFound = true;
                    break;
                }
            }
            
            if (inputCleared && messageFound) {
                this.log('Send confirmed: input cleared + message visible');
                return true;
            }
        }
        
        this.log('Send confirmation timeout');
        return false;
    }

    /**
     * Smart retry with exponential backoff - SIMPLE VERSION
     * @param {Function} operation - Function to retry
     * @param {number} maxRetries - Max attempts
     * @returns {Promise<any>} Operation result
     */
    async smartRetry(operation, maxRetries = 3) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                this.log(`Attempt ${attempt}/${maxRetries}`);
                const result = await operation();
                if (result) return result;
            } catch (error) {
                this.log(`Attempt ${attempt} failed:`, error.message);
            }
            
            if (attempt < maxRetries) {
                const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // 1s, 2s, 4s max
                this.log(`Retrying in ${delay}ms...`);
                await this.sleep(delay);
            }
        }
        
        this.log('All retry attempts failed');
        return false;
    }

    /**
     * Find the send button with multiple selectors
     * @returns {Element|null} Send button element
     */
    findSendButton() {
        for (const selector of this.selectors.sendButtonSelectors) {
            const button = document.querySelector(selector);
            if (button && this.isSendButton(button)) {
                return button;
            }
        }
        
        // Look for buttons near the input area
        const composeArea = document.querySelector(this.selectors.messageInputArea) || 
                           document.querySelector(this.selectors.composePanel);
        
        if (composeArea) {
            const buttons = composeArea.querySelectorAll('button, [role="button"], span[role="button"]');
            for (const button of buttons) {
                if (this.isSendButton(button)) {
                    return button;
                }
            }
        }
        
        return null;
    }

    /**
     * Check if element is a send button
     * @param {Element} element - Element to check
     * @returns {boolean} True if it's a send button
     */
    isSendButton(element) {
        if (!element) return false;
        
        const testId = element.getAttribute('data-testid') || '';
        const ariaLabel = element.getAttribute('aria-label') || '';
        const title = element.getAttribute('title') || '';
        const className = element.className || '';
        
        // Check for send indicators
        const sendIndicators = ['send', 'Send', 'Enviar', 'Senden'];
        
        return sendIndicators.some(indicator => 
            testId.includes(indicator) || 
            ariaLabel.includes(indicator) || 
            title.includes(indicator) ||
            className.includes(indicator)
        );
    }    /**
     * Click send button with a single reliable method
     * @param {Element} sendButton - Send button element
     */
    clickSendButton(sendButton) {
        try {
            this.log('Attempting to click send button...');
            
            // Use only ONE method to avoid multiple sends
            sendButton.click();
            
            this.log('Send button clicked');
            
        } catch (error) {
            this.log('Error clicking send button:', error);
            
            // Only if the first method fails, try alternative
            try {
                sendButton.dispatchEvent(new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window
                }));
            } catch (secondError) {
                this.log('Alternative click method also failed:', secondError);
            }
        }
    }

    /**
     * Alternative text insertion method
     * @param {Element} inputBox - Input element
     * @param {string} messageText - Text to insert
     */
    async alternativeTextInsertion(inputBox, messageText) {
        try {
            // Method 1: Simulate typing
            inputBox.focus();
            
            for (const char of messageText) {
                inputBox.dispatchEvent(new KeyboardEvent('keydown', {
                    key: char,
                    code: `Key${char.toUpperCase()}`,
                    bubbles: true
                }));
                
                inputBox.textContent += char;
                
                inputBox.dispatchEvent(new KeyboardEvent('keyup', {
                    key: char,
                    code: `Key${char.toUpperCase()}`,
                    bubbles: true
                }));
                
                inputBox.dispatchEvent(new Event('input', { bubbles: true }));
                
                await this.sleep(10); // Small delay between characters
            }
            
            // Method 2: Direct manipulation of innerHTML
            inputBox.innerHTML = messageText.replace(/\n/g, '<br>');
            
            // Method 3: Set via textContent and trigger events
            inputBox.textContent = messageText;
            
            // Trigger comprehensive events
            const events = ['input', 'change', 'textInput', 'compositionend'];
            for (const eventType of events) {
                inputBox.dispatchEvent(new Event(eventType, { bubbles: true }));
            }
            
        } catch (error) {
            this.log('Error in alternative text insertion:', error);
        }
    }    /**
     * Check if we're currently in an active chat
     * @returns {boolean} True if in active chat
     */
    isInActiveChat() {
        this.log('Checking if in active chat...');
        
        // Method 1: Check for multiple indicators of an active chat
        const indicators = [
            // Chat area selectors
            '[data-testid="conversation-panel-messages"]',
            '[data-testid="conversation-panel"]',
            '[data-testid="conversation-panel-body"]',
            
            // Message compose area selectors
            '[data-testid="conversation-compose-box"]',
            '[data-testid="compose-panel"]',
            '[data-testid="conversation-compose-box-input"]',
            
            // Alternative selectors
            'div[role="main"]',
            'div[data-tab="6"]', // Chat area
            'div[data-tab="10"]' // Message input area
        ];
        
        let foundIndicators = 0;
        const foundElements = [];
        
        for (const selector of indicators) {
            const element = document.querySelector(selector);
            if (element) {
                foundIndicators++;
                foundElements.push({ selector, element });
            // Strong container-based detection first
            const closestSearch = element.closest('[data-testid="chat-list-search"], [data-testid*="search"], [aria-label*="Search" i], [role="search"], [data-testid="pane-side"], [data-testid="chatlist-panel"]');
            if (closestSearch) return true;

            // Heuristic: far-left inputs likely belong to sidebar/search
            const rect = element.getBoundingClientRect();
            if (rect.width > 0 && rect.left < window.innerWidth * 0.35) return true;
            return false;
                isLandingPage = true;
                this.log('Detected landing page indicator');
                break;
            }
        }
        
        // Method 4: Check URL pattern
        const urlIndicatesChat = window.location.href.includes('web.whatsapp.com') && 
                                !window.location.href.includes('/logout');
        
        // Decision logic
        const inActiveChat = (foundIndicators >= 1 || hasMessageInput) && 
                            !isLandingPage && 
                            urlIndicatesChat;
        
        this.log(`Chat detection results:`, {
            foundIndicators: foundIndicators,
            hasMessageInput: hasMessageInput,
            isLandingPage: isLandingPage,
            urlIndicatesChat: urlIndicatesChat,
            inActiveChat: inActiveChat,
            foundElements: foundElements.map(f => f.selector)
        });
        
        return inActiveChat;
    }    /**
     * Find the correct message input box
     * @returns {Element|null} The message input element
     */
    findMessageInputBox() {
        this.log('Searching for message input box...');
        
        // Debug: show all contenteditable elements
        const allEditables = document.querySelectorAll('[contenteditable="true"]');
        this.log(`Found ${allEditables.length} contenteditable elements total`);
        allEditables.forEach((el, i) => {
            const rect = el.getBoundingClientRect();
            this.log(`Element ${i}:`, {
                testId: el.getAttribute('data-testid'),
                dataTab: el.getAttribute('data-tab'),
                isSearch: this.isSearchBox(el),
                rect: { left: rect.left, width: rect.width, height: rect.height },
                visible: rect.width > 0 && rect.height > 0,
                rightPane: rect.left > window.innerWidth * 0.35
            });
        });
        
        // Method 1: Try specific selectors first
        for (const selector of this.selectors.inputBoxSelectors) {
            const elements = document.querySelectorAll(selector);
            
            for (const element of elements) {
                // Skip if this looks like a search box
                if (this.isSearchBox(element)) {
                    this.log(`Skipping search box: ${selector}`);
                    continue;
                }
                
                // Check if this element is visible and interactable
                const rect = element.getBoundingClientRect();
                if (rect.width === 0 || rect.height === 0) {
                    this.log(`Skipping hidden element: ${selector}`);
                    continue;
                }
                
                // Check if this element is in the message compose area
                if (this.isInMessageComposeArea(element)) {
                    this.log(`Found input in compose area: ${selector}`, element);
                    return element;
                }
            }
        }
        
        // Method 2: Find any contenteditable that's not a search box and is visible (prefer right pane)
        this.log('Trying fallback method: any visible contenteditable...');
        const fallbackEditables = document.querySelectorAll('[contenteditable="true"]');
        
        for (const element of fallbackEditables) {
            // Skip search boxes
            if (this.isSearchBox(element)) {
                continue;
            }
            
            // Check visibility
            const rect = element.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) {
                continue;
            }
            
            // Check if it's likely a message input (larger size, lower on screen)
            if (rect.height > 20 && rect.width > 100 && rect.bottom > window.innerHeight * 0.5 && rect.left > window.innerWidth * 0.35) {
                this.log('Found likely message input by fallback method:', element);
                return element;
            }
        }
        
        // Method 3: Very permissive - any contenteditable that's not obviously a search
        this.log('Trying very permissive method...');
        for (const element of fallbackEditables) {
            if (!this.isSearchBox(element)) {
                const rect = element.getBoundingClientRect();
                if (rect.width > 50 && rect.height > 15 && rect.left > window.innerWidth * 0.35) {
                    this.log('Found input by permissive method:', element);
                    return element;
                }
            }
        }
        
        // Method 4: Emergency fallback - just pick the rightmost contenteditable
        this.log('Emergency fallback: rightmost contenteditable...');
        let rightmost = null;
        let rightmostLeft = 0;
        for (const element of fallbackEditables) {
            const rect = element.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0 && rect.left > rightmostLeft) {
                rightmost = element;
                rightmostLeft = rect.left;
            }
        }
        if (rightmost) {
            this.log('Using rightmost contenteditable as fallback:', rightmost);
            return rightmost;
        }        this.log('No message input box found');
        return null;
    }

    /**
     * Check if an element is a search box
     * @param {Element} element - Element to check
     * @returns {boolean} True if it's a search box
     */
    isSearchBox(element) {
        if (!element) return false;
        
        // Check for search-related attributes and parent containers
        const searchIndicators = [
            'chat-list-search',
            'search',
            'header',
            'side'
        ];
        
        // Check the element and its parents for search indicators
        let current = element;
        for (let i = 0; i < 5 && current; i++) {
            const testId = current.getAttribute('data-testid') || '';
            const className = current.className || '';
            const id = current.id || '';
            
            for (const indicator of searchIndicators) {
                if (testId.includes(indicator) || 
                    className.includes(indicator) || 
                    id.includes(indicator)) {
                    return true;
                }
            }
            
            current = current.parentElement;
        }
        
        return false;
    }    /**
     * Check if element is in the message compose area
     * @param {Element} element - Element to check
     * @returns {boolean} True if in compose area
     */
    isInMessageComposeArea(element) {
        if (!element) return false;
        
        // Look for the compose area in parents
        let current = element;
        for (let i = 0; i < 15 && current; i++) {
            const testId = current.getAttribute('data-testid') || '';
            const className = current.className || '';
            const id = current.id || '';
            
            // Check for compose-related attributes
            const composeIndicators = [
                'conversation-compose',
                'compose-box',
                'compose-panel',
                'message-input',
                'conversation-panel',
                'chat-compose'
            ];
            
            for (const indicator of composeIndicators) {
                if (testId.includes(indicator) || 
                    className.includes(indicator) || 
                    id.includes(indicator)) {
                    return true;
                }
            }
            
            current = current.parentElement;
        }
        
        // Alternative check: if element is in the bottom half of the screen and not in header/sidebar
        const rect = element.getBoundingClientRect();
        const isInBottomHalf = rect.top > window.innerHeight * 0.4;
        const isNotInTopArea = rect.top > 100; // Not in header area
        
        // Check if it's not in sidebar (usually left side)
        const isNotInSidebar = rect.left > window.innerWidth * 0.3;
        
        return isInBottomHalf && isNotInTopArea && isNotInSidebar;
    }    /**
     * Clear the input box content
     * @param {Element} inputBox - Input element to clear
     */
    async clearInputBox(inputBox) {
        try {
            this.log('Clearing input box...');
            
            // Focus first to ensure we're working with the right element
            inputBox.focus();
            await this.sleep(100);
            
            // Method 1: Use execCommand to select all and delete
            document.execCommand('selectAll', false, null);
            document.execCommand('delete', false, null);
            
            // Method 2: Clear all content properties
            inputBox.innerHTML = '';
            inputBox.textContent = '';
            inputBox.innerText = '';
            inputBox.value = ''; // In case it's an input element
            
            // Method 3: Simulate keyboard shortcuts
            inputBox.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'a',
                code: 'KeyA',
                ctrlKey: true,
                bubbles: true
            }));
            
            inputBox.dispatchEvent(new KeyboardEvent('keyup', {
                key: 'a',
                code: 'KeyA',
                ctrlKey: true,
                bubbles: true
            }));
            
            inputBox.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Delete',
                code: 'Delete',
                bubbles: true
            }));
            
            inputBox.dispatchEvent(new KeyboardEvent('keyup', {
                key: 'Delete',
                code: 'Delete',
                bubbles: true
            }));
            
            // Method 4: Trigger comprehensive events to notify WhatsApp
            const events = ['input', 'change', 'keyup', 'textInput', 'compositionend'];
            for (const eventType of events) {
                inputBox.dispatchEvent(new Event(eventType, { bubbles: true }));
            }
            
            await this.sleep(200);
            
            // Verification: ensure input is actually cleared
            const remainingText = inputBox.textContent || inputBox.innerText || inputBox.value || '';
            if (remainingText.trim()) {
                this.log('Input not fully cleared, trying again...');
                // One more aggressive attempt
                inputBox.innerHTML = '';
                inputBox.textContent = '';
                inputBox.dispatchEvent(new Event('input', { bubbles: true }));
                await this.sleep(100);
            }
            
            const finalText = inputBox.textContent || inputBox.innerText || inputBox.value || '';
            this.log('Input cleared, remaining text:', `"${finalText}"`);
            
        } catch (error) {
            this.log('Error clearing input box:', error);
        }
    }    /**
     * Insert message text into input box
     * @param {Element} inputBox - Input element
     * @param {string} messageText - Text to insert
     * @returns {Promise<boolean>} Success status
     */
    async insertMessageText(inputBox, messageText) {
        try {
            this.log('Inserting text using conservative approach...');
            
            // Ensure input is focused and empty first
            inputBox.focus();
            await this.sleep(50);
            
            // Check if input already has the target text (prevent double insertion)
            const currentContent = inputBox.textContent || inputBox.innerText || '';
            if (currentContent.trim() === messageText.trim()) {
                this.log('Text already present in input, skipping insertion');
                return true;
            }
            
            // Method 1: execCommand insertText (most reliable)
            if (document.execCommand('insertText', false, messageText)) {
                this.log('Text inserted using execCommand');
                await this.sleep(100);
                
                // Verify it worked
                const content = inputBox.textContent || inputBox.innerText || '';
                if (content.trim() === messageText.trim()) {
                    return true;
                }
            }
            
            // Method 2: Direct content setting ONLY if method 1 failed
            this.log('execCommand failed, trying direct content setting...');
            inputBox.textContent = messageText;
            inputBox.dispatchEvent(new Event('input', { bubbles: true }));
            
            await this.sleep(100);
            
            // Final verification
            const finalContent = inputBox.textContent || inputBox.innerText || '';
            const success = finalContent.trim() === messageText.trim();
            
            this.log('Text insertion result:', success, 'Content:', `"${finalContent.substring(0, 50)}"`);
            return success;
            
        } catch (error) {
            this.log('Error inserting message text:', error);
            return false;
        }
    }

    /**
     * Verify that message was inserted correctly
     * @param {Element} inputBox - Input element
     * @param {string} expectedText - Expected text
     * @returns {boolean} True if text matches
     */
    verifyMessageInserted(inputBox, expectedText) {
        const currentText = inputBox.textContent || inputBox.innerText || '';
        const matches = currentText.trim() === expectedText.trim();
        
        if (!matches) {
            this.log(`Text verification failed. Expected: "${expectedText}", Got: "${currentText}"`);
        }
        
        return matches;
    }

    /**
     * Get clipboard text
     * @returns {Promise<string>} Clipboard text
     */
    async getClipboardText() {
        try {
            return await navigator.clipboard.readText();
        } catch (error) {
            this.log('Error reading clipboard:', error);
            return '';
        }
    }

    /**
     * Check if WhatsApp is connected
     * @returns {boolean} Connection status
     */
    isWhatsAppConnected() {
        const disconnectedBanner = document.querySelector(this.selectors.disconnectedBanner);
        return !disconnectedBanner;
    }

    /**
     * Get current time in HH:MM format
     * @returns {string} Current time
     */
    getCurrentTimeString() {
        const now = new Date();
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        return `${hours}:${minutes}`;
    }

    /**
     * Setup auto-reload watchdog to prevent disconnection
     */
    async setupReloadWatchdog() {
        const settings = await window.wasStorage.getSettings();
        if (!settings?.autoReload) return;
        
        const reloadInterval = (settings.reloadInterval || 30) * 60 * 1000; // Convert to milliseconds
        
        this.reloadTimer = setInterval(() => {
            this.log('Auto-reloading page to maintain connection');
            window.location.reload();
        }, reloadInterval);
        
        this.log(`Auto-reload watchdog setup: ${settings.reloadInterval} minutes`);
    }

    /**
     * Setup anti-inactivity measures to prevent WhatsApp from detecting idle state
     */
    async setupAntiInactivityMeasures() {
        const settings = await window.wasStorage.getSettings();
        
        // Default: simulate activity every 5 minutes
        const activityInterval = (settings?.activityInterval || 5) * 60 * 1000;
        
        this.activityTimer = setInterval(() => {
            this.simulateUserActivity();
        }, activityInterval);
        
        this.log(`Anti-inactivity measures setup: every ${settings?.activityInterval || 5} minutes`);
        
        // Also listen for actual user activity to reset our timer
        this.setupActivityListeners();
    }

    /**
     * Setup listeners for real user activity
     */
    setupActivityListeners() {
        const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];
        const updateActivity = () => {
            this.lastActivity = Date.now();
        };
        
        events.forEach(event => {
            document.addEventListener(event, updateActivity, { passive: true });
        });
        
        this.log('Activity listeners setup');
    }

    /**
     * Simulate subtle user activity to prevent inactivity detection
     */
    simulateUserActivity() {
        try {
            // Only simulate if no real activity in the last 3 minutes
            const timeSinceActivity = Date.now() - this.lastActivity;
            const threeMinutes = 3 * 60 * 1000;
            
            if (timeSinceActivity < threeMinutes) {
                this.log('Recent user activity detected, skipping simulation');
                return;
            }
            
            this.log('Simulating user activity to prevent inactivity detection');
            
            // Method 1: Subtle mouse movement over the page
            const centerX = window.innerWidth / 2;
            const centerY = window.innerHeight / 2;
            
            document.dispatchEvent(new MouseEvent('mousemove', {
                clientX: centerX + Math.random() * 2 - 1, // Very small random movement
                clientY: centerY + Math.random() * 2 - 1,
                bubbles: true
            }));
            
            // Method 2: Send a keepalive heartbeat by focusing/blurring window
            window.dispatchEvent(new Event('focus'));
            
            // Method 3: Subtle scroll activity (1 pixel up then down)
            window.scrollBy(0, 1);
            setTimeout(() => window.scrollBy(0, -1), 100);
            
            // Method 4: Check if WhatsApp is still connected and handle disconnection
            this.checkConnectionStatus();
            
            this.lastActivity = Date.now(); // Update our activity timestamp
            
        } catch (error) {
            this.log('Error simulating activity:', error);
        }
    }

    /**
     * Check WhatsApp connection status and handle disconnections
     */
    checkConnectionStatus() {
        const disconnectedBanner = document.querySelector(this.selectors.disconnectedBanner);
        const phoneDisconnected = document.querySelector('[data-testid="alert-phone-disconnected"]');
        const reconnectButton = document.querySelector('[data-testid="alert-phone-disconnected"] button');
        
        if (disconnectedBanner || phoneDisconnected) {
            this.log('WhatsApp disconnection detected, attempting reconnect...');
            
            // Try clicking reconnect button if available
            if (reconnectButton) {
                reconnectButton.click();
                this.log('Clicked reconnect button');
            }
            
            // Refresh page as last resort
            setTimeout(() => {
                this.log('Auto-refreshing page due to disconnection');
                window.location.reload();
            }, 5000);
        }
        
        // Check for other connection issues
        const qrCode = document.querySelector('[data-testid="qr-code"]');
        if (qrCode) {
            this.log('QR code detected - WhatsApp needs re-authentication');
            this.notifyUI('connectionLost', { reason: 'qr_code_required' });
        }
    }

    /**
     * Notify UI of events
     * @param {string} event - Event type
     * @param {Object} data - Event data
     */
    notifyUI(event, data) {
        window.dispatchEvent(new CustomEvent('wasSchedulerEvent', {
            detail: { event, data }
        }));
    }

    /**
     * Update status for visual feedback
     * @param {string} status - Status message
     * @param {string} type - Status type: 'info', 'success', 'error', 'working'
     */
    updateStatus(status, type = 'info') {
        this.log(`Status: ${status} (${type})`);
        this.notifyUI('statusUpdate', { 
            message: status, 
            type: type, 
            timestamp: Date.now() 
        });
    }

    /**
     * Get human-readable time until next message
     * @param {string} targetTime - Target time in HH:MM format
     * @returns {string} Human readable countdown
     */
    getTimeUntilNext(targetTime) {
        const now = new Date();
        const [hours, minutes] = targetTime.split(':').map(Number);
        
        const target = new Date();
        target.setHours(hours, minutes, 0, 0);
        
        // If target is in the past, it's for tomorrow
        if (target <= now) {
            target.setDate(target.getDate() + 1);
        }
        
        const diffMs = target - now;
        const diffMinutes = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMinutes / 60);
        const remainingMinutes = diffMinutes % 60;
        
        if (diffMinutes < 1) return 'any moment now';
        if (diffMinutes < 60) return `in ${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''}`;
        if (diffHours < 24) return `in ${diffHours}h ${remainingMinutes}m`;
        
        const days = Math.floor(diffHours / 24);
        const remainingHours = diffHours % 24;
        return `in ${days} day${days !== 1 ? 's' : ''} ${remainingHours}h`;
    }

    /**
     * Sleep utility function
     * @param {number} ms - Milliseconds to sleep
     * @returns {Promise} Sleep promise
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }    /**
     * Debug logging
     * @param {...any} args - Arguments to log
     */
    log(...args) {
        if (this.debugMode) {
            console.log('[WAS Scheduler]', ...args);
        }
    }    /**
     * Debug helper to analyze page elements (for development)
     * Call window.wasScheduler.debugElements() in console
     */
    debugElements() {
        console.log('=== WAS Debug: Analyzing WhatsApp Web Elements ===');
        
        // Find all contenteditable elements
        const editableElements = document.querySelectorAll('[contenteditable="true"]');
        console.log(`Found ${editableElements.length} contenteditable elements:`);
        
        editableElements.forEach((el, index) => {
            const rect = el.getBoundingClientRect();
            console.log(`Element ${index}:`, {
                element: el,
                testId: el.getAttribute('data-testid'),
                dataTab: el.getAttribute('data-tab'),
                role: el.getAttribute('role'),
                ariaLabel: el.getAttribute('aria-label'),
                className: el.className,
                textContent: el.textContent.substring(0, 50),
                isVisible: rect.width > 0 && rect.height > 0,
                isSearchBox: this.isSearchBox(el),
                isInComposeArea: this.isInMessageComposeArea(el),
                boundingRect: rect,
                parentTestId: el.parentElement?.getAttribute('data-testid')
            });
        });
        
        // Check for compose area
        const composeArea = document.querySelector(this.selectors.messageInputArea);
        console.log('Compose area found:', !!composeArea, composeArea);
        
        // Check for send buttons
        console.log('Looking for send buttons...');
        this.selectors.sendButtonSelectors.forEach((selector, index) => {
            const buttons = document.querySelectorAll(selector);
            console.log(`Selector ${index} (${selector}):`, buttons.length, 'buttons found');
            buttons.forEach((btn, btnIndex) => {
                console.log(`  Button ${btnIndex}:`, {
                    element: btn,
                    testId: btn.getAttribute('data-testid'),
                    ariaLabel: btn.getAttribute('aria-label'),
                    title: btn.getAttribute('title'),
                    className: btn.className,
                    visible: btn.getBoundingClientRect().width > 0,
                    isSendButton: this.isSendButton(btn)
                });
            });
        });
        
        // Check what our function would select
        const selectedInput = this.findMessageInputBox();
        console.log('Selected input box:', selectedInput);
        
        const selectedSendButton = this.findSendButton();
        console.log('Selected send button:', selectedSendButton);
        
        // Check chat status
        console.log('Chat status:', {
            isInActiveChat: this.isInActiveChat(),
            isConnected: this.isWhatsAppConnected(),
            currentTime: this.getCurrentTimeString()
        });
        
        console.log('=== End Debug Analysis ===');
        
        // Return useful info for manual testing
        return {
            inputBox: selectedInput,
            sendButton: selectedSendButton,
            editableElements: editableElements,
            composeArea: composeArea
        };
    }

    /**
     * Test message injection with step-by-step logging
     * @param {string} testMessage - Message to test with
     */
    async debugMessageInjection(testMessage = 'Debug test from WAS') {
        console.log('=== WAS Debug: Testing Message Injection ===');
        
        try {
            // Step 1: Check chat status
            console.log('Step 1: Checking chat status...');
            const inChat = this.isInActiveChat();
            console.log('In active chat:', inChat);
            
            if (!inChat) {
                console.error('Not in active chat - please open a chat first');
                return false;
            }
            
            // Step 2: Find input box
            console.log('Step 2: Finding input box...');
            const inputBox = this.findMessageInputBox();
            console.log('Input box found:', !!inputBox, inputBox);
            
            if (!inputBox) {
                console.error('Input box not found');
                this.debugElements();
                return false;
            }
            
            // Step 3: Test focus and clear
            console.log('Step 3: Testing focus and clear...');
            inputBox.focus();
            await this.sleep(200);
            await this.clearInputBox(inputBox);
            console.log('Input cleared, current content:', inputBox.textContent);
            
            // Step 4: Test text insertion
            console.log('Step 4: Testing text insertion...');
            const insertSuccess = await this.insertMessageText(inputBox, testMessage);
            console.log('Insert success:', insertSuccess);
            console.log('Input content after insert:', inputBox.textContent);
            
            // Step 5: Verify text
            console.log('Step 5: Verifying text...');
            const verified = this.verifyMessageInserted(inputBox, testMessage);
            console.log('Text verified:', verified);
            
            if (!verified) {
                console.log('Trying alternative insertion...');
                await this.alternativeTextInsertion(inputBox, testMessage);
                const secondVerification = this.verifyMessageInserted(inputBox, testMessage);
                console.log('Second verification:', secondVerification);
            }
            
            // Step 6: Find send button
            console.log('Step 6: Finding send button...');
            const sendButton = this.findSendButton();
            console.log('Send button found:', !!sendButton, sendButton);
            
            if (!sendButton) {
                console.error('Send button not found');
                return false;
            }
            
            // Step 7: Test send (optional - comment out if you don't want to actually send)
            // console.log('Step 7: Testing send...');
            // this.clickSendButton(sendButton);
            // await this.sleep(1000);
            // console.log('Send attempted, final input content:', inputBox.textContent);
            
            console.log('=== Debug injection test completed ===');
            return true;
            
        } catch (error) {
            console.error('Debug injection test failed:', error);
            return false;
        }
    }

    /**
     * Get scheduler status
     * @returns {Object} Status object
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            isConnected: this.isWhatsAppConnected(),
            currentTime: this.getCurrentTimeString(),
            debugMode: this.debugMode
        };
    }
}

// Create global instance
window.wasScheduler = new WASScheduler();
