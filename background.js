// Force-set the action icon on startup and install to defeat caches
chrome.runtime.onInstalled.addListener(() => {
  trySetIcons();
});

chrome.runtime.onStartup.addListener(() => {
  trySetIcons();
});

function trySetIcons() {
  const path = {
    16: "icons/icon-16.png",
    24: "icons/icon-24.png",
    32: "icons/icon-32.png",
    38: "icons/icon-38.png",
    48: "icons/icon-48.png"
  };
  if (chrome.action && chrome.action.setIcon) {
    chrome.action.setIcon({ path });
    console.log('[WAS] Action icon forced via background');
  }
}
