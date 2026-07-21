// content.js — runs inside every page.
// Uses Chrome's native Shape Detection API (BarcodeDetector) — no third-party
// library needed. Handles two flows:
//   A) Full visible-page scan (screenshot from background.js -> decode -> overlay)
//   B) Single-image scan from the right-click context menu

(() => {
  const SUPPORTS_DETECTOR = "BarcodeDetector" in window;
  let detector = null;
  if (SUPPORTS_DETECTOR) {
    detector = new BarcodeDetector({ formats: ["qr_code"] });
  }

  let overlayLayer = null;
  function getOverlayLayer() {
    if (overlayLayer && document.body.contains(overlayLayer)) return overlayLayer;
    overlayLayer = document.createElement("div");
    overlayLayer.id = "__qr_scanner_overlay_layer__";
    document.documentElement.appendChild(overlayLayer);
    return overlayLayer;
  }

  function clearOverlays() {
    if (overlayLayer) overlayLayer.remove();
    overlayLayer = null;
  }

  function classifyValue(value) {
    if (/^https?:\/\//i.test(value)) return "url";
    if (/^wifi:/i.test(value)) return "wifi";
    if (/^mailto:/i.test(value)) return "email";
    if (/^tel:/i.test(value)) return "tel";
    if (/^begin:vcard/i.test(value)) return "vcard";
    return "text";
  }

  function makeCard(value, x, y) {
    const layer = getOverlayLayer();
    const card = document.createElement("div");
    card.className = "__qr_scanner_card__";
    card.style.left = `${x}px`;
    card.style.top = `${y}px`;

    const type = classifyValue(value);
    const typeLabel = {
      url: "Link",
      wifi: "Wi-Fi",
      email: "Email",
      tel: "Phone",
      vcard: "Contact",
      text: "Text"
    }[type];

    card.innerHTML = `
      <div class="__qr_scanner_card_head__">
        <span class="__qr_scanner_tag__">${typeLabel}</span>
        <button class="__qr_scanner_close__" title="Close">&times;</button>
      </div>
      <div class="__qr_scanner_value__"></div>
      <div class="__qr_scanner_actions__">
        <button data-action="copy">Copy</button>
        ${type === "url" ? '<button data-action="open">Open link</button>' : ""}
      </div>
    `;
    card.querySelector(".__qr_scanner_value__").textContent = value;

    card.querySelector(".__qr_scanner_close__").addEventListener("click", () => card.remove());
    card.querySelector('[data-action="copy"]').addEventListener("click", () => {
      navigator.clipboard.writeText(value);
      const btn = card.querySelector('[data-action="copy"]');
      const old = btn.textContent;
      btn.textContent = "Copied!";
      setTimeout(() => (btn.textContent = old), 1200);
    });
    const openBtn = card.querySelector('[data-action="open"]');
    if (openBtn) openBtn.addEventListener("click", () => window.open(value, "_blank"));

    layer.appendChild(card);
    return card;
  }

  function saveToHistory(entries) {
    if (!entries.length) return;
    chrome.storage.local.get({ history: [] }, ({ history }) => {
      const stamped = entries.map((e) => ({
        value: e.rawValue,
        type: classifyValue(e.rawValue),
        page: location.href,
        title: document.title,
        time: Date.now()
      }));
      const updated = [...stamped, ...history].slice(0, 200);
      chrome.storage.local.set({ history: updated });
      chrome.runtime.sendMessage({ type: "SET_BADGE", count: entries.length });
    });
  }

  // --- Flow A: full visible-page scan -------------------------------------
  async function scanScreenshot(dataUrl) {
    clearOverlays();
    const img = new Image();
    img.src = dataUrl;
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = rej;
    });

    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);

    let barcodes = [];
    try {
      barcodes = await detector.detect(canvas);
    } catch (err) {
      return { ok: false, error: err.message };
    }

    // Screenshot pixels map 1:1 to CSS pixels of the viewport (captureVisibleTab
    // already accounts for devicePixelRatio scaling internally in Chrome).
    const scaleX = window.innerWidth / img.naturalWidth;
    const scaleY = window.innerHeight / img.naturalHeight;

    barcodes.forEach((b) => {
      const box = b.boundingBox;
      const layer = getOverlayLayer();
      const marker = document.createElement("div");
      marker.className = "__qr_scanner_box__";
      marker.style.left = `${box.x * scaleX}px`;
      marker.style.top = `${box.y * scaleY + window.scrollY}px`;
      marker.style.width = `${box.width * scaleX}px`;
      marker.style.height = `${box.height * scaleY}px`;
      marker.title = "Click to view decoded QR value";
      marker.addEventListener("click", () => {
        makeCard(b.rawValue, box.x * scaleX, box.y * scaleY + window.scrollY + box.height * scaleY + 8);
      });
      layer.appendChild(marker);
    });

    saveToHistory(barcodes);
    return { ok: true, results: barcodes.map((b) => b.rawValue) };
  }

  // --- Flow B: single image via right-click context menu -------------------
  async function scanImageUrl(url) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    try {
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = () => rej(new Error("Could not load image"));
      });
      const barcodes = await detector.detect(img);
      if (!barcodes.length) {
        showToast("No QR code found in that image.");
        return;
      }
      // Try to position the card near the actual <img> element on the page.
      const target = [...document.images].find((el) => el.src === url || el.currentSrc === url);
      const rect = target ? target.getBoundingClientRect() : { left: 40, top: 40, height: 0 };
      barcodes.forEach((b, i) => {
        makeCard(b.rawValue, rect.left + window.scrollX, rect.top + window.scrollY + rect.height + 8 + i * 10);
      });
      saveToHistory(barcodes);
    } catch (err) {
      showToast("Couldn't scan that image (it may be protected by the site).");
    }
  }

  function showToast(text) {
    const layer = getOverlayLayer();
    const toast = document.createElement("div");
    toast.className = "__qr_scanner_toast__";
    toast.textContent = text;
    layer.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "SCAN_IMAGE_URL") {
      if (!SUPPORTS_DETECTOR) {
        showToast("This Chrome build doesn't support QR detection.");
        return;
      }
      scanImageUrl(message.url);
    }

    if (message.type === "SCAN_VISIBLE_PAGE") {
      if (!SUPPORTS_DETECTOR) {
        sendResponse({ ok: false, error: "BarcodeDetector not supported in this Chrome build." });
        return true;
      }
      scanScreenshot(message.dataUrl).then(sendResponse);
      return true;
    }

    if (message.type === "CLEAR_OVERLAYS") {
      clearOverlays();
      sendResponse({ ok: true });
    }
  });
})();
