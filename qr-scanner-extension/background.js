// background.js — service worker (Manifest V3)
// Responsibilities:
//  1. Create the right-click "Scan QR Code" menu item on images.
//  2. Capture the visible tab as an image when the popup asks for a full-page scan.
//  3. Relay results between content script and popup, and keep a small badge counter.

const MENU_ID = "qr-scan-image";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Scan QR code in this image",
    contexts: ["image"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ID && tab?.id) {
    chrome.tabs.sendMessage(tab.id, {
      type: "SCAN_IMAGE_URL",
      url: info.srcUrl
    });
  }
});

// Messages coming from popup.js or content.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "CAPTURE_VISIBLE_TAB") {
    chrome.windows.getCurrent({ populate: false }, (win) => {
      chrome.tabs.captureVisibleTab(win.id, { format: "png" }, (dataUrl) => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        sendResponse({ ok: true, dataUrl });
      });
    });
    return true; // keep the message channel open for the async response
  }

  if (message.type === "SET_BADGE") {
    const count = message.count || 0;
    chrome.action.setBadgeBackgroundColor({ color: "#3DDC84" });
    chrome.action.setBadgeText({ text: count > 0 ? String(count) : "" });
    sendResponse({ ok: true });
    return true;
  }
});
