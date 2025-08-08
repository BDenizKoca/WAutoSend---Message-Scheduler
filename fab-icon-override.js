// FAB Icon Override - Force our icon to display over the extension button
(function() {
    'use strict';
    
    // Wait for DOM to be ready
    function overrideFabIcon() {
        // Find the extension button by looking for WAutoSend or WAS
        const extensionButtons = document.querySelectorAll('button[aria-label*="WAutoSend"], button[aria-label*="WAS"], button[title*="WAutoSend"], button[title*="WAS"]');
        
        extensionButtons.forEach(button => {
            // Create our custom icon overlay
            const iconOverlay = document.createElement('div');
            iconOverlay.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background-image: url('chrome-extension://${chrome.runtime.id}/icons/icon-32.png');
                background-size: 16px 16px;
                background-repeat: no-repeat;
                background-position: center;
                pointer-events: none;
                z-index: 9999;
            `;
            
            // Make the button container relative if it isn't already
            const computedStyle = window.getComputedStyle(button);
            if (computedStyle.position === 'static') {
                button.style.position = 'relative';
            }
            
            // Add our overlay
            button.appendChild(iconOverlay);
            
            console.log('[WAS] FAB icon overlay applied');
        });
    }
    
    // Try to override immediately
    overrideFabIcon();
    
    // Also try after a delay in case the button loads later
    setTimeout(overrideFabIcon, 1000);
    setTimeout(overrideFabIcon, 3000);
    
    // Watch for dynamic changes
    const observer = new MutationObserver(overrideFabIcon);
    observer.observe(document.body, { childList: true, subtree: true });
    
})();
