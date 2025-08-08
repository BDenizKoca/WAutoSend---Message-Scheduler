@echo off
echo ================================================
echo WAutoSend Development Setup
echo ================================================
echo.

echo Checking Chrome installation...
where chrome >nul 2>&1
if %errorlevel% neq 0 (
    echo Chrome not found in PATH. Please install Google Chrome.
    pause
    exit /b 1
)

echo Chrome found!
echo.

echo Current directory contents:
dir /b

echo.
echo To install the extension:
echo 1. Open Chrome and go to chrome://extensions/
echo 2. Enable "Developer mode" (top-right toggle)
echo 3. Click "Load unpacked"
echo 4. Select this folder: %cd%
echo 5. Visit https://web.whatsapp.com to test
echo.

echo Extension files:
echo - manifest.json (Main configuration)
echo - content.js (Main coordinator)
echo - storage.js (Data persistence)
echo - scheduler.js (Message timing)
echo - ui.js (User interface)
echo - styles.css (UI styling)
echo - popup.html/js (Extension popup)
echo.

echo For debugging:
echo - Open Chrome DevTools (F12) on WhatsApp Web
echo - Check console for [WAS] logs
echo - Use window.WAS.status() to check extension state
echo.

echo Press any key to open Chrome extensions page...
pause >nul

start chrome chrome://extensions/

echo.
echo Setup complete! Follow the installation steps above.
pause
