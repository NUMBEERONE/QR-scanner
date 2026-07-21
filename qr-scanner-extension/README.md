# QR Scanner for the Web — Chrome Extension

Finds and decodes QR codes anywhere on a webpage: in screenshots of the
visible tab, or in any single image via right-click. Built entirely on
Chrome's native **Shape Detection API** (`BarcodeDetector`), so there's no
external library to load or trust.

## Features

- **Scan visible page** — one click in the popup captures the current tab
  and highlights every QR code found, with a green pulsing box you can click
  to reveal the decoded value.
- **Right-click any image** → "Scan QR code in this image" — works even for
  QR codes that aren't in the visible viewport.
- **Smart actions** — detected links get an "Open" button; anything can be
  copied to the clipboard in one click.
- **History tab** — every scan is saved locally (`chrome.storage.local`) with
  the source page and timestamp, so you can find it again later.
- **Badge counter** — the toolbar icon shows how many codes were found in the
  last scan.

## Install (unpacked, for development/testing)

1. Unzip this project somewhere on disk.
2. Open Chrome and go to `chrome://extensions`.
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the `qr-scanner-extension` folder.
5. Pin the extension (puzzle-piece icon in the toolbar → pin) for quick access.

## How to use it

- **Whole page:** click the extension icon → **Scan visible page**. Boxes
  appear over any QR codes currently on screen; click a box to see/copy/open
  the value.
- **Single image:** right-click a QR image on any site → **Scan QR code in
  this image**. A result card appears near the image.
- **History:** open the popup → **History** tab to browse and clear past scans.

## Project structure

```
qr-scanner-extension/
├── manifest.json      Manifest V3 config, permissions, content script hookup
├── background.js       Service worker: context menu + tab screenshot capture
├── content.js           Injected into every page: detection + overlay UI
├── content.css           Styles for the on-page highlight boxes/cards
├── popup.html/.css/.js   Extension popup: trigger scan, show results & history
└── icons/                16/48/128px toolbar icons
```

## Notes & limitations

- `BarcodeDetector` ships in Chrome 83+ on desktop by default. If it's ever
  missing, the popup will tell you so instead of failing silently.
- Some sites block cross-origin image reads; in that rare case the extension
  shows a toast saying the image is protected instead of crashing.
- This only reads QR codes already present on the page — it does not use
  your webcam. That'd be a natural v2 feature (see the Gantt chart).
