/**
 * WAutoSend Debug Helper
 * Use this in browser console to diagnose issues
 */

window.WASDebug = {
    /**
     * Check extension status and health
     */
    checkStatus() {
        console.log('=== WAutoSend Debug Status ===');
        
        // Check if chrome API is available
        console.log('Chrome API:', {
            available: !!(window.chrome),
            runtime: !!(window.chrome?.runtime),
            runtimeId: window.chrome?.runtime?.id,
            storage: !!(window.chrome?.storage),
            lastError: window.chrome?.runtime?.lastError
        });
        
        // Check modules
        console.log('Modules:', {
            storage: !!window.wasStorage,
            scheduler: !!window.wasScheduler,
            ui: !!window.wasUI,
            main: !!window.wasMain
        });
        
        // Check storage context
        if (window.wasStorage) {
            console.log('Storage Status:', {
                isReady: window.wasStorage.isReady,
                contextValid: window.wasStorage.isExtensionContextValid()
            });
        }
        
        // Check scheduler status
        if (window.wasScheduler) {
            console.log('Scheduler Status:', window.wasScheduler.getStatus());
        }
        
        console.log('=== End Debug Status ===');
    },    /**
     * Test message injection with detailed logging
     */
    async testMessageInjection() {
        console.log('=== Testing Message Injection ===');
        
        if (!window.wasScheduler) {
            console.error('Scheduler not available');
            return;
        }
        
        // Use the new debug injection method
        const result = await window.wasScheduler.debugMessageInjection('Test message from WAS Debug');
        console.log('Debug injection result:', result);
        
        console.log('=== End Message Injection Test ===');
    },

    /**
     * Quick message send test (actually sends message)
     */
    async quickSendTest(message = 'WAS Quick Test') {
        console.log('=== Quick Send Test ===');
        console.warn('This will actually send a message!');
        
        if (!window.wasScheduler) {
            console.error('Scheduler not available');
            return;
        }
        
        try {
            const success = await window.wasScheduler.injectAndSendMessage(message);
            console.log('Quick send result:', success);
        } catch (error) {
            console.error('Quick send error:', error);
        }
        
        console.log('=== End Quick Send Test ===');
    },    /**
     * Test chat detection
     */
    testChatDetection() {
        console.log('=== Testing Chat Detection ===');
        
        if (!window.wasScheduler) {
            console.error('Scheduler not available');
            return;
        }
        
        const isInChat = window.wasScheduler.isInActiveChat();
        console.log('Is in active chat:', isInChat);
        
        // Additional manual checks
        const manualChecks = {
            hasConversationPanel: !!document.querySelector('[data-testid="conversation-panel-messages"]'),
            hasComposeBox: !!document.querySelector('[data-testid="conversation-compose-box"]'),
            hasContentEditables: document.querySelectorAll('[contenteditable="true"]').length,
            hasVisibleEditables: Array.from(document.querySelectorAll('[contenteditable="true"]'))
                .filter(el => el.getBoundingClientRect().width > 0).length,
            currentURL: window.location.href
        };
        
        console.log('Manual checks:', manualChecks);
        
        // Try to find input with current method
        const inputBox = window.wasScheduler.findMessageInputBox();
        console.log('Found input box:', !!inputBox, inputBox);
        
        console.log('=== End Chat Detection Test ===');
        
        return { isInChat, manualChecks, inputBox };
    },
    analyzeElements() {
        console.log('=== Element Analysis ===');
        
        if (!window.wasScheduler) {
            console.error('Scheduler not available');
            return;
        }
        
        return window.wasScheduler.debugElements();
    },

    /**
     * Test storage operations
     */
    async testStorage() {
        console.log('=== Testing Storage ===');
        
        if (!window.wasStorage) {
            console.error('Storage not available');
            return;
        }
        
        try {
            // Test getting schedules
            const schedules = await window.wasStorage.getSchedules();
            console.log('Current schedules:', schedules);
            
            // Test adding a schedule
            const testSchedule = {
                time: '23:59',
                message: 'Debug test schedule',
                useClipboard: false
            };
            
            const added = await window.wasStorage.addSchedule(testSchedule);
            console.log('Add schedule result:', added);
            
            if (added) {
                const updatedSchedules = await window.wasStorage.getSchedules();
                console.log('Updated schedules:', updatedSchedules);
            }
            
        } catch (error) {
            console.error('Storage test error:', error);
        }
        
        console.log('=== End Storage Test ===');
    },

    /**
     * Force extension reload
     */
    forceReload() {
        console.log('Forcing page reload to reset extension context...');
        window.location.reload();
    },

    /**
     * Clear all data and restart
     */
    async resetExtension() {
        console.log('Resetting extension...');
        
        if (window.wasStorage) {
            await window.wasStorage.clearAll();
        }
        
        localStorage.clear();
        
        setTimeout(() => {
            window.location.reload();
        }, 1000);
    },

    /**
     * Test for duplicate send prevention
     */
    async testDuplicatePrevention() {
        console.log('=== Testing Duplicate Send Prevention ===');
        console.warn('This will attempt multiple rapid sends - use with caution!');
        
        if (!window.wasScheduler) {
            console.error('Scheduler not available');
            return;
        }
        
        const testMessage = 'WAS Duplicate Test - ' + Date.now();
        console.log('Test message:', testMessage);
        
        // Try to send the same message multiple times rapidly
        const promises = [];
        for (let i = 0; i < 3; i++) {
            console.log(`Initiating send attempt ${i + 1}...`);
            promises.push(window.wasScheduler.injectAndSendMessage(testMessage));
        }
        
        try {
            const results = await Promise.all(promises);
            console.log('Send results:', results);
            
            const successCount = results.filter(r => r === true).length;
            console.log(`${successCount} sends reported success out of ${results.length} attempts`);
            
            if (successCount <= 1) {
                console.log('✅ Duplicate prevention working correctly');
            } else {
                console.warn('⚠️ Multiple sends may have occurred');
            }
            
        } catch (error) {
            console.error('Error during duplicate test:', error);
        }
        
        console.log('=== End Duplicate Prevention Test ===');
    },

    /**
     * Test multiple messages scheduled at the same time
     */
    async testMultipleMessages() {
        console.log('=== Testing Multiple Messages at Same Time ===');
        console.warn('This will schedule multiple messages for immediate sending!');
        
        if (!window.wasStorage || !window.wasScheduler) {
            console.error('Required modules not available');
            return;
        }
        
        try {
            // Get current time + 1 minute for testing
            const now = new Date();
            now.setMinutes(now.getMinutes() + 1);
            const testTime = now.toTimeString().substring(0, 5); // HH:MM format
            
            console.log('Scheduling messages for:', testTime);
            
            // Create multiple test messages
            const messages = [
                { message: 'Test Message 1 - ' + Date.now(), time: testTime },
                { message: 'Test Message 2 - ' + Date.now(), time: testTime },
                { message: 'Test Message 3 - ' + Date.now(), time: testTime }
            ];
            
            // Add them to storage
            for (const msg of messages) {
                await window.wasStorage.addSchedule(msg);
                console.log('Added schedule:', msg);
            }
            
            console.log(`${messages.length} messages scheduled for ${testTime}`);
            console.log('Watch the console and WhatsApp for sequential sending...');
            console.log('Messages should be sent one by one with delays between them.');
            
        } catch (error) {
            console.error('Error setting up multiple message test:', error);
        }
        
        console.log('=== End Multiple Message Test Setup ===');
    },

    /**
     * Test multiple scheduled messages at the same time
     */
    async testConcurrentSchedules() {
        console.log('=== Testing Concurrent Schedule Processing ===');
        console.warn('This will create multiple test schedules for the next minute - use with caution!');
        
        if (!window.wasStorage || !window.wasScheduler) {
            console.error('WAS modules not available');
            return;
        }
        
        try {
            // Clear existing schedules first
            await window.wasStorage.clearSchedules();
            
            // Get current time and add 1 minute
            const now = new Date();
            const testTime = new Date(now.getTime() + 60000); // 1 minute from now
            const timeString = testTime.getHours().toString().padStart(2, '0') + ':' + 
                             testTime.getMinutes().toString().padStart(2, '0');
            
            console.log('Creating test schedules for time:', timeString);
            
            // Create 2 test schedules for the same time
            const schedule1 = {
                id: Date.now() + '_test1',
                message: 'Test Message 1 - ' + Date.now(),
                time: timeString,
                enabled: true,
                sent: false
            };
            
            const schedule2 = {
                id: Date.now() + '_test2', 
                message: 'Test Message 2 - ' + Date.now(),
                time: timeString,
                enabled: true,
                sent: false
            };
            
            // Save both schedules
            await window.wasStorage.saveSchedule(schedule1);
            await window.wasStorage.saveSchedule(schedule2);
            
            console.log('Created test schedules:', schedule1, schedule2);
            console.log('Schedules will be sent at:', timeString);
            console.log('Monitor the logs to ensure they are processed sequentially without duplication');
            
            // Start scheduler if not running
            if (!window.wasScheduler.isRunning) {
                window.wasScheduler.start();
                console.log('Started scheduler');
            }
            
        } catch (error) {
            console.error('Error creating test schedules:', error);
        }
        
        console.log('=== End Concurrent Schedule Test Setup ===');
    },
};

console.log('WAS Debug helper loaded. Use WASDebug.checkStatus() to start diagnosing.');
