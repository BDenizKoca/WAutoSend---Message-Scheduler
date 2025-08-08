# 📨 WAutoSend - WhatsApp Web Message Scheduler

**WAutoSend (WAS)** is a Chrome extension that enables automated scheduling and sending of WhatsApp Web messages. Schedule multiple messages, use clipboard content, and manage everything from a clean, non-intrusive interface.

## ✨ Features

- **⏰ Schedule Messages**: Set specific times (24h format) for automatic message delivery
- **📋 Clipboard Integration**: Automatically use clipboard content when message field is empty
- **📱 Multiple Schedules**: Manage multiple scheduled messages simultaneously
- **🔄 Auto-Reload**: Prevents WhatsApp disconnection with configurable page reload
- **💾 Persistent Storage**: Schedules survive browser restarts
- **🎨 Clean UI**: Non-intrusive overlay interface
- **🔒 Privacy-First**: No data collection, fully client-side operation

## 🚀 Installation

### Method 1: Developer Mode (Recommended for Testing)

1. **Download the Extension**
   - Clone or download this repository
   - Navigate to the `wautosend` folder

2. **Enable Developer Mode**
   - Open Chrome and go to `chrome://extensions/`
   - Toggle "Developer mode" in the top-right corner

3. **Load the Extension**
   - Click "Load unpacked"
   - Select the `wautosend` folder
   - The extension should now appear in your extensions list

4. **Verify Installation**
   - Visit [WhatsApp Web](https://web.whatsapp.com)
   - Look for the "WAS" button in the bottom-right corner

### Method 2: Chrome Web Store (Future)
*Coming soon - the extension will be available on the Chrome Web Store after testing.*

## 📖 How to Use

### Basic Setup

1. **Open WhatsApp Web**
   - Navigate to [web.whatsapp.com](https://web.whatsapp.com)
   - Log in with your phone as usual

2. **Find the WAS Interface**
   - Look for the green "WAS" button in the bottom-right corner
   - Click it to open the scheduling panel

3. **Schedule Your First Message**
   - Set a time using the time picker (24h format)
   - Enter your message text
   - Optionally enable "Use clipboard if message is empty"
   - Click "Add Schedule"

### Advanced Features

#### Clipboard Fallback
- Enable the checkbox "Use clipboard if message is empty"
- Leave the message field blank
- The extension will use whatever is in your clipboard at send time

#### Multiple Schedules
- Add multiple messages with different times
- Each schedule operates independently
- Messages are sorted by time in the interface

#### Status Monitoring
- Green indicator: Connected and running
- Yellow indicator: Running but disconnected
- Red indicator: Not running or error

### Keyboard Shortcuts

- **Ctrl + Shift + W**: Toggle WAS panel on WhatsApp Web
- **Escape**: Close WAS panel

## ⚙️ Configuration

### Settings (Future Enhancement)
The extension includes configurable settings:

- **Auto-reload interval**: Default 30 minutes
- **Debug mode**: Enable console logging
- **Auto-reload**: Enable/disable automatic page refresh

### Storage Management
- All schedules are stored locally using Chrome's storage API
- No data is transmitted externally
- Clear all data by removing the extension

## 🔧 Technical Details

### File Structure
```
wautosend/
├── manifest.json          # Chrome extension manifest
├── content.js            # Main coordinator script
├── storage.js            # Data persistence layer
├── scheduler.js          # Message timing and sending
├── ui.js                # Interface management
├── styles.css           # UI styling
├── popup.html           # Extension popup
├── popup.js             # Popup functionality
└── icons/               # Extension icons
    └── icon.svg
```

### Architecture

- **Manifest V3**: Modern Chrome extension architecture
- **Content Script**: Injected into WhatsApp Web pages
- **Local Storage**: Chrome storage API for persistence
- **DOM Manipulation**: Direct interaction with WhatsApp Web interface

### Permissions Required

- `activeTab`: Access to current WhatsApp Web tab
- `scripting`: Inject content scripts
- `storage`: Store schedules locally
- `host_permissions`: Access to web.whatsapp.com

### WhatsApp Web Selectors
The extension uses these selectors (subject to change):
```javascript
inputBox: '[contenteditable="true"][data-tab]'
sendButton: '[data-testid="send"]'
chatArea: '[data-testid="conversation-panel-messages"]'
```

## 🛠️ Development

### Building from Source

1. **Clone Repository**
   ```bash
   git clone <repository-url>
   cd WAutoSend/wautosend
   ```

2. **Load in Chrome**
   - Follow installation steps above for developer mode

3. **Testing**
   - Open browser console (F12) for debug logs
   - Test with different time schedules
   - Verify persistence after page reload

### Debugging

- Enable debug mode in settings (future feature)
- Check browser console for `[WAS]` prefixed logs
- Use `window.WAS.status()` in console for extension status

### Code Style

- **ES6+ JavaScript**: Modern syntax and features
- **Modular Design**: Separate concerns across files
- **Comprehensive Comments**: Every function documented
- **Error Handling**: Graceful failure and recovery

## 🐛 Troubleshooting

### Common Issues

**Extension not appearing on WhatsApp Web**
- Ensure you're on web.whatsapp.com (not wa.me or other variations)
- Check that the extension is enabled in Chrome
- Try refreshing the page

**Messages not sending**
- Verify WhatsApp is connected (no disconnection banner)
- Check that input box is accessible
- Ensure time format is correct (HH:MM)

**Schedules disappearing**
- Check browser storage permissions
- Verify extension hasn't been disabled
- Check for browser updates

**UI not responsive**
- Try refreshing WhatsApp Web
- Check browser console for errors
- Restart the extension

### Debug Information

Access debug info in browser console:
```javascript
// Get overall status
window.WAS.status()

// Check specific modules
window.WAS.storage()
window.WAS.scheduler()
window.WAS.ui()
```

## 🔒 Privacy & Security

### Data Handling
- **No External Servers**: All processing happens locally
- **No Data Collection**: No analytics or tracking
- **Local Storage Only**: Messages stored in browser's local storage
- **No API Calls**: Direct DOM interaction only

### Security Considerations
- Extension only runs on WhatsApp Web domain
- Minimal permissions requested
- Open source for transparency
- No background network activity

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

### Development Guidelines
- Follow existing code style
- Add comments for new functions
- Test with multiple scenarios
- Update documentation

## 📞 Support

For issues, questions, or feature requests:

1. Check the troubleshooting section above
2. Search existing issues on GitHub
3. Create a new issue with detailed description
4. Include browser version and extension version

## 🚨 Disclaimer

This extension:
- Is not affiliated with WhatsApp or Meta
- Uses WhatsApp Web's public interface
- May break if WhatsApp updates their interface
- Should be used responsibly and in compliance with WhatsApp's terms

## 🔄 Changelog

### Version 1.0.0
- Initial release
- Basic message scheduling
- Clipboard integration
- Auto-reload functionality
- Clean overlay UI
- Persistent storage

---

**Made with ❤️ for automation enthusiasts**

*Remember to use this tool responsibly and respect others' time and privacy.*
