const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");
const scanBtn = document.getElementById("scanBtn");

function classifyValue(value) {
  if (/^https?:\/\//i.test(value)) return "url";
  if (/^wifi:/i.test(value)) return "wifi";
  if (/^mailto:/i.test(value)) return "email";
  if (/^tel:/i.test(value)) return "tel";
  if (/^begin:vcard/i.test(value)) return "vcard";
  return "text";
}

const TYPE_LABEL = { url: "Link", wifi: "Wi-Fi", email: "Email", tel: "Phone", vcard: "Contact", text: "Text" };

function renderResultItem(value, meta) {
  const type = classifyValue(value);
  const li = document.createElement("li");
  li.className = "result-item";
  li.innerHTML = `
    <span class="result-tag">${TYPE_LABEL[type]}</span>
    <div class="result-value"></div>
    ${meta ? `<div class="result-meta">${meta}</div>` : ""}
    <div class="result-actions">
      <button data-action="copy">Copy</button>
      ${type === "url" ? '<button data-action="open">Open</button>' : ""}
    </div>
  `;
  li.querySelector(".result-value").textContent = value;
  li.querySelector('[data-action="copy"]').addEventListener("click", (e) => {
    navigator.clipboard.writeText(value);
    e.target.textContent = "Copied!";
    setTimeout(() => (e.target.textContent = "Copy"), 1000);
  });
  const openBtn = li.querySelector('[data-action="open"]');
  if (openBtn) openBtn.addEventListener("click", () => chrome.tabs.create({ url: value }));
  return li;
}

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.className = "status" + (kind ? ` ${kind}` : "");
}

scanBtn.addEventListener("click", async () => {
  resultsEl.innerHTML = "";
  setStatus("Capturing the page…");
  scanBtn.disabled = true;

  try {
    const capture = await chrome.runtime.sendMessage({ type: "CAPTURE_VISIBLE_TAB" });
    if (!capture?.ok) {
      setStatus(capture?.error || "Couldn't capture this tab.", "error");
      return;
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    setStatus("Scanning for QR codes…");
    const result = await chrome.tabs.sendMessage(tab.id, {
      type: "SCAN_VISIBLE_PAGE",
      dataUrl: capture.dataUrl
    });

    if (!result?.ok) {
      setStatus(result?.error || "Scan failed on this page.", "error");
      return;
    }

    if (!result.results.length) {
      setStatus("No QR codes found in the visible area.");
      return;
    }

    setStatus(`Found ${result.results.length} QR code${result.results.length > 1 ? "s" : ""}.`, "success");
    result.results.forEach((value) => resultsEl.appendChild(renderResultItem(value)));
  } catch (err) {
    setStatus("This page doesn't allow scanning (try a normal http/https tab).", "error");
  } finally {
    scanBtn.disabled = false;
  }
});

// --- Tabs -------------------------------------------------------------
document.querySelectorAll(".tab").forEach((tabBtn) => {
  tabBtn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    tabBtn.classList.add("active");
    document.getElementById(`tab-${tabBtn.dataset.tab}`).classList.add("active");
    if (tabBtn.dataset.tab === "history") loadHistory();
  });
});

// --- History ------------------------------------------------------------
function loadHistory() {
  chrome.storage.local.get({ history: [] }, ({ history }) => {
    const list = document.getElementById("historyList");
    const count = document.getElementById("historyCount");
    list.innerHTML = "";
    count.textContent = `${history.length} scan${history.length === 1 ? "" : "s"}`;
    history.forEach((entry) => {
      const meta = `${new Date(entry.time).toLocaleString()} · ${entry.title || entry.page}`;
      list.appendChild(renderResultItem(entry.value, meta));
    });
  });
}

document.getElementById("clearHistory").addEventListener("click", () => {
  chrome.storage.local.set({ history: [] }, loadHistory);
  chrome.runtime.sendMessage({ type: "SET_BADGE", count: 0 });
});
