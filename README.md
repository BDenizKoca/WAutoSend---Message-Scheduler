# WAutoSend — WhatsApp Web Message Scheduler



Local-only Chrome extension that schedules and sends messages in WhatsApp Web. No APIs. No servers. Just a clean in-page UI and a reliable "send at time" engine.

![Logo](icons/icon-128.png)

---

## Why?

Because I needed it.  
And because everything else either required WhatsApp Business, signing up for some shady API key, or just didn’t work.  
So I built a dumb, brute-force solution that just... works. Locally. Quietly. Reliably.

---

## Highlights

- Schedule multiple messages at specific times (24h)
- Multi-contact support (comma-separated names); auto chat-switch via search + Tab navigation
- Message source: typed text or clipboard fallback
- Smart delivery: send confirmation detection + exponential backoff retries
- Anti-inactivity nudges (helps avoid Web disconnects over long waits)
- Clean overlay UI with a floating FAB and keyboard shortcut
- Visual status, version label, and human-friendly time display
- Everything local in your browser (chrome.storage); no tracking

---

## Install (Unpacked)

This is not in the Chrome Web Store. Load it locally:

1) Clone the repo

```bash
git clone https://github.com/BDenizKoca/WAutoSend---Message-Scheduler.git
cd WAutoSend---Message-Scheduler
```

2) In Chrome go to chrome://extensions
- Enable Developer mode
- Click "Load unpacked" and select the cloned folder

3) Open https://web.whatsapp.com and log in

4) Use the floating FAB or press Ctrl+Shift+W to open the scheduler panel

---

## Usage

1) Open WhatsApp Web and bring up the panel (FAB or Ctrl+Shift+W)
2) Add a schedule:
   - Time (24h)
   - Message text or "Use clipboard if empty"
   - Contacts (optional, comma-separated; if empty, sends to the current chat)
3) Click "Test Send" to validate selectors on your current page
4) Keep the tab open; the extension will send at the scheduled time(s)

Tips:
- For groups/contacts with similar names, add extra qualifiers in the contact name
- Leave WhatsApp Web pinned; anti-inactivity helps but the tab must remain available

---

## What It Actually Does

At send time the extension:
- Searches for a contact name, tabs to the result, and opens the chat
- Injects your message (clipboard-first with fallbacks)
- Sends, then verifies by checking the cleared input and visible outgoing bubble
- Retries with backoff if something fails

No external services. It automates the same UI steps a person would.

---

## Keyboard & UI

- FAB: floating circular button in bottom-right of WhatsApp Web
- Shortcut: Ctrl+Shift+W to toggle the panel
- Panel: taller layout to show more scheduled items (scrollable content area)

---

## Troubleshooting

- I don't see the FAB
  - Reload the extension (chrome://extensions → Reload) and refresh WhatsApp Web

- Toolbar shows a text icon
  - Reload the extension. A background worker force-sets toolbar icons on startup

- Chat doesn't switch to a contact
  - Ensure the exact visible name matches your WhatsApp contact/group
  - Try adding a unique qualifier (e.g., "John S." vs "John")

- Clipboard prompts
  - Grant permission when Chrome asks; or type the message directly

---

## Project Structure

```
WAutoSend---Message-Scheduler/
├─ manifest.json
├─ background.js                 # Sets toolbar icons on startup
├─ content.js                    # Bootstraps UI + scheduler in the page
├─ scheduler.js                  # Timing, send flow, retries, confirmations
├─ storage.js                    # chrome.storage wrapper and helpers
├─ ui.js                         # Overlay UI + FAB
├─ styles.css                    # Overlay styling (FAB, panel)
├─ popup.html / popup.js         # Toolbar popup
├─ debug.js                      # Optional debug logs/helpers
├─ icons/
│  ├─ icon-16.png  icon-24.png  icon-32.png  icon-38.png  icon-48.png  icon-128.png
├─ LICENSE
└─ README.md
```

---

## What WAutoSend is Not

WAutoSend is not a spam tool.

It does not:

- Harvest phone numbers or chat lists
- Use private or undocumented WhatsApp APIs
- Run or manage marketing campaigns
- Bypass WhatsApp rate limits or policies

Scope and limits:

- It automates the visible WhatsApp Web UI on your computer only
- WhatsApp Web must remain open and logged in
- You can target a small list of contacts you provide manually; this is not a bulk sender

If you are looking for a mass sender or anything resembling spam automation, this is not that. This is a small helper for personal, legitimate use.

---

## Privacy & Legal

- No data leaves your machine; everything is stored locally by Chrome
- Not affiliated with WhatsApp or Meta
- Use responsibly and at your own risk

---

## License

MIT

---

## Contributing

PRs and issues welcome. Keep it simple and bloat-free.
