const PROMPT_KEY = "pendingPrompt";
const QUEUE_KEY = "readingQueue";
const CONFIG_KEY = "bookmarkMode";
const THEME_KEY = "themeMode";
const ORDER_KEY = "addOrder";
const CAPTURE_KEY = "captureBookmarks";

const promptEl = document.getElementById("prompt");
const promptTitleEl = document.getElementById("prompt-title");
const promptUrlEl = document.getElementById("prompt-url");
const acceptBtn = document.getElementById("accept");
const declineBtn = document.getElementById("decline");
const queueListEl = document.getElementById("queue-list");
const queueCountEl = document.getElementById("queue-count");
const queueEmptyEl = document.getElementById("queue-empty");
const addCurrentBtn = document.getElementById("add-current");
const bookmarkModeEl = document.getElementById("bookmark-mode");
const themeModeEl = document.getElementById("theme-mode");
const addOrderEl = document.getElementById("add-order");
const captureBookmarksEl = document.getElementById("capture-bookmarks");
const settingsBtnEl = document.getElementById("settings-btn");
const settingsPanelEl = document.getElementById("settings-panel");

let currentQueue = [];
let suppressNextStorageRender = false;
let renderGen = 0;

function i18n(key, ...subs) {
  return chrome.i18n.getMessage(key, subs);
}

function applyTheme(mode) {
  document.documentElement.classList.remove("theme-light", "theme-dark");
  if (mode === "light") document.documentElement.classList.add("theme-light");
  if (mode === "dark") document.documentElement.classList.add("theme-dark");
}

function applyI18n() {
  for (const el of document.querySelectorAll("[data-i18n]")) {
    el.textContent = i18n(el.dataset.i18n);
  }
  for (const el of document.querySelectorAll("[data-i18n-title]")) {
    el.title = i18n(el.dataset.i18nTitle);
  }
  for (const el of document.querySelectorAll("[data-i18n-aria]")) {
    el.setAttribute("aria-label", i18n(el.dataset.i18nAria));
  }
}

function faviconUrl(pageUrl, size = 32) {
  const url = new URL(chrome.runtime.getURL("/_favicon/"));
  url.searchParams.set("pageUrl", pageUrl);
  url.searchParams.set("size", String(size));
  return url.toString();
}

async function render() {
  const data = await chrome.storage.local.get([PROMPT_KEY, QUEUE_KEY, CONFIG_KEY, THEME_KEY, ORDER_KEY, CAPTURE_KEY]);
  renderPrompt(data[PROMPT_KEY]);
  currentQueue = data[QUEUE_KEY] || [];
  renderQueue(currentQueue);
  bookmarkModeEl.value = data[CONFIG_KEY] || "ask";
  const theme = data[THEME_KEY] || "auto";
  themeModeEl.value = theme;
  applyTheme(theme);
  addOrderEl.value = data[ORDER_KEY] || "top";
  captureBookmarksEl.checked = data[CAPTURE_KEY] !== false;
}

function renderPrompt(prompt) {
  if (!prompt) {
    promptEl.classList.add("hidden");
    return;
  }
  promptEl.classList.remove("hidden");
  promptTitleEl.textContent = prompt.title || prompt.url;
  promptUrlEl.textContent = prompt.url;
}

async function renderQueue(queue) {
  const gen = ++renderGen;
  queueListEl.innerHTML = "";
  queueCountEl.textContent = queue.length.toString();
  queueEmptyEl.classList.toggle("hidden", queue.length > 0);

  const bookmarks = await Promise.all(queue.map((item) => getBookmarkInfo(item.url)));
  if (gen !== renderGen) return;
  for (let i = 0; i < queue.length; i++) {
    queueListEl.appendChild(buildQueueItem(queue[i], bookmarks[i]));
  }
}

const EYE_OPEN_SVG =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_CLOSED_SVG =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
const BOOKMARK_SVG =
  '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" stroke="none"><path d="M6 2a2 2 0 0 0-2 2v18l8-5 8 5V4a2 2 0 0 0-2-2H6z"/></svg>';

async function getBookmarkInfo(url) {
  try {
    const results = await chrome.bookmarks.search({ url });
    if (!results || results.length === 0) return null;
    const bm = results[0];
    const path = [];
    let parentId = bm.parentId;
    while (parentId) {
      const [parent] = await chrome.bookmarks.get(parentId);
      if (!parent) break;
      if (parent.title && parent.parentId && parent.parentId !== "0") {
        path.unshift(parent.title);
      }
      parentId = parent.parentId;
    }
    return { path: path.join(" › ") };
  } catch {
    return null;
  }
}

function buildQueueItem(item, bookmark) {
  const li = document.createElement("li");
  li.className = "queue-item" + (item.read ? " is-read" : "");
  li.draggable = true;
  li.dataset.url = item.url;

  const handle = document.createElement("span");
  handle.className = "handle";
  handle.title = i18n("itemDragHandle");
  handle.textContent = "⋮⋮";

  const favicon = document.createElement("img");
  favicon.className = "favicon";
  favicon.src = faviconUrl(item.url);
  favicon.width = 16;
  favicon.height = 16;
  favicon.alt = "";
  favicon.referrerPolicy = "no-referrer";

  const link = document.createElement("a");
  link.href = item.url;
  link.textContent = item.title || item.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.draggable = false;

  const bookmarkIcon = document.createElement("span");
  bookmarkIcon.className = "bookmark-flag";
  if (bookmark) {
    bookmarkIcon.title = bookmark.path
      ? i18n("itemBookmarkSavedIn", bookmark.path)
      : i18n("itemBookmarkSaved");
    bookmarkIcon.setAttribute("aria-label", bookmarkIcon.title);
    bookmarkIcon.innerHTML = BOOKMARK_SVG;
  } else {
    bookmarkIcon.classList.add("hidden");
  }

  const toggle = document.createElement("button");
  toggle.className = "toggle-read";
  toggle.title = item.read ? i18n("itemMarkUnread") : i18n("itemMarkRead");
  toggle.setAttribute("aria-label", toggle.title);
  toggle.innerHTML = item.read ? EYE_CLOSED_SVG : EYE_OPEN_SVG;
  toggle.addEventListener("click", async (e) => {
    e.stopPropagation();
    await chrome.runtime.sendMessage({ type: "toggleRead", url: item.url });
  });

  const remove = document.createElement("button");
  remove.className = "remove";
  remove.title = i18n("itemRemove");
  remove.textContent = "×";
  remove.addEventListener("click", async (e) => {
    e.stopPropagation();
    await chrome.runtime.sendMessage({ type: "removeFromQueue", url: item.url });
  });

  li.append(handle, favicon, link, bookmarkIcon, toggle, remove);
  attachDragHandlers(li);
  return li;
}

let draggedUrl = null;

function attachDragHandlers(li) {
  li.addEventListener("dragstart", (e) => {
    draggedUrl = li.dataset.url;
    li.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", draggedUrl);
  });

  li.addEventListener("dragend", () => {
    li.classList.remove("dragging");
    clearDropIndicators();
    draggedUrl = null;
  });

  li.addEventListener("dragover", (e) => {
    if (!draggedUrl || draggedUrl === li.dataset.url) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = li.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    clearDropIndicators();
    li.classList.add(before ? "drop-before" : "drop-after");
  });

  li.addEventListener("dragleave", (e) => {
    if (e.currentTarget === li) li.classList.remove("drop-before", "drop-after");
  });

  li.addEventListener("drop", async (e) => {
    if (!draggedUrl || draggedUrl === li.dataset.url) return;
    e.preventDefault();
    const rect = li.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    clearDropIndicators();

    const order = currentQueue.map((it) => it.url);
    const from = order.indexOf(draggedUrl);
    if (from === -1) return;
    order.splice(from, 1);
    let to = order.indexOf(li.dataset.url);
    if (!before) to += 1;
    order.splice(to, 0, draggedUrl);

    const byUrl = new Map(currentQueue.map((it) => [it.url, it]));
    currentQueue = order.map((u) => byUrl.get(u)).filter(Boolean);
    suppressNextStorageRender = true;
    renderQueue(currentQueue);

    await chrome.runtime.sendMessage({ type: "reorderQueue", order });
  });
}

function clearDropIndicators() {
  for (const el of queueListEl.querySelectorAll(".drop-before, .drop-after")) {
    el.classList.remove("drop-before", "drop-after");
  }
}

acceptBtn.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "resolvePrompt", accept: true });
});

declineBtn.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "resolvePrompt", accept: false });
});

addCurrentBtn.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !/^https?:/i.test(tab.url)) {
    addCurrentBtn.title = i18n("cannotAddPage");
    return;
  }
  addCurrentBtn.disabled = true;
  await chrome.runtime.sendMessage({
    type: "addCurrentPage",
    url: tab.url,
    title: tab.title || tab.url,
  });
  addCurrentBtn.disabled = false;
});

bookmarkModeEl.addEventListener("change", () => {
  chrome.storage.local.set({ [CONFIG_KEY]: bookmarkModeEl.value });
});

themeModeEl.addEventListener("change", () => {
  const mode = themeModeEl.value;
  applyTheme(mode);
  chrome.storage.local.set({ [THEME_KEY]: mode });
});

addOrderEl.addEventListener("change", () => {
  chrome.storage.local.set({ [ORDER_KEY]: addOrderEl.value });
});

captureBookmarksEl.addEventListener("change", () => {
  chrome.storage.local.set({ [CAPTURE_KEY]: captureBookmarksEl.checked });
});

settingsBtnEl.addEventListener("click", () => {
  settingsPanelEl.classList.toggle("hidden");
  settingsBtnEl.classList.toggle("active");
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (suppressNextStorageRender && QUEUE_KEY in changes && !(PROMPT_KEY in changes)) {
    suppressNextStorageRender = false;
    return;
  }
  if (PROMPT_KEY in changes || QUEUE_KEY in changes) render();
});

applyI18n();
render();
