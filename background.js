const PROMPT_KEY = "pendingPrompt";
const QUEUE_KEY = "readingQueue";
const CONFIG_KEY = "bookmarkMode";
const ORDER_KEY = "addOrder";
const CAPTURE_KEY = "captureBookmarks";
const BADGE_COLOR = "#d97706";
const QUEUE_BADGE_COLOR = "#dc2626";

function addToQueue(queue, item, order) {
  if (order === "bottom") queue.push(item);
  else queue.unshift(item);
}

chrome.bookmarks.onCreated.addListener(async (_id, bookmark) => {
  if (!bookmark.url) return;

  const {
    [QUEUE_KEY]: queue = [],
    [CONFIG_KEY]: mode = "ask",
    [ORDER_KEY]: order = "top",
    [CAPTURE_KEY]: capture = true,
  } = await chrome.storage.local.get([QUEUE_KEY, CONFIG_KEY, ORDER_KEY, CAPTURE_KEY]);

  if (!capture) return;
  if (queue.some((item) => item.url === bookmark.url)) return;

  if (mode === "always") {
    addToQueue(queue, { url: bookmark.url, title: bookmark.title || bookmark.url, addedAt: Date.now() }, order);
    await chrome.storage.local.set({ [QUEUE_KEY]: queue });
  } else {
    const { [PROMPT_KEY]: existing } = await chrome.storage.local.get(PROMPT_KEY);
    if (existing) return;
    await chrome.storage.local.set({
      [PROMPT_KEY]: { url: bookmark.url, title: bookmark.title || bookmark.url, createdAt: Date.now() },
    });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message.type === "resolvePrompt") {
      const { accept } = message;
      const { [PROMPT_KEY]: prompt } = await chrome.storage.local.get(PROMPT_KEY);
      if (prompt && accept) {
        const { [QUEUE_KEY]: queue = [], [ORDER_KEY]: order = "top" } =
          await chrome.storage.local.get([QUEUE_KEY, ORDER_KEY]);
        if (!queue.some((item) => item.url === prompt.url)) {
          addToQueue(queue, { url: prompt.url, title: prompt.title, addedAt: Date.now() }, order);
          await chrome.storage.local.set({ [QUEUE_KEY]: queue });
        }
      }
      await chrome.storage.local.remove(PROMPT_KEY);
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "addCurrentPage") {
      const { url, title } = message;
      if (url) {
        const { [QUEUE_KEY]: queue = [], [ORDER_KEY]: order = "top" } =
          await chrome.storage.local.get([QUEUE_KEY, ORDER_KEY]);
        if (!queue.some((item) => item.url === url)) {
          addToQueue(queue, { url, title: title || url, addedAt: Date.now() }, order);
          await chrome.storage.local.set({ [QUEUE_KEY]: queue });
        }
      }
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "toggleRead") {
      const { url } = message;
      const { [QUEUE_KEY]: queue = [] } = await chrome.storage.local.get(QUEUE_KEY);
      const next = queue.map((item) =>
        item.url === url ? { ...item, read: !item.read } : item
      );
      await chrome.storage.local.set({ [QUEUE_KEY]: next });
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "removeFromQueue") {
      const { url } = message;
      const { [QUEUE_KEY]: queue = [] } = await chrome.storage.local.get(QUEUE_KEY);
      const next = queue.filter((item) => item.url !== url);
      await chrome.storage.local.set({ [QUEUE_KEY]: next });
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "reorderQueue") {
      const { order } = message;
      const { [QUEUE_KEY]: queue = [] } = await chrome.storage.local.get(QUEUE_KEY);
      const byUrl = new Map(queue.map((item) => [item.url, item]));
      const reordered = order.map((url) => byUrl.get(url)).filter(Boolean);
      // append anything not in the order payload (defensive — shouldn't happen)
      for (const item of queue) if (!order.includes(item.url)) reordered.push(item);
      await chrome.storage.local.set({ [QUEUE_KEY]: reordered });
      sendResponse({ ok: true });
      return;
    }

    sendResponse({ ok: false });
  })();
  return true;
});

async function refreshBadge() {
  const { [PROMPT_KEY]: prompt, [QUEUE_KEY]: queue = [] } = await chrome.storage.local.get([
    PROMPT_KEY,
    QUEUE_KEY,
  ]);
  if (prompt) {
    await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
    await chrome.action.setBadgeText({ text: "?" });
    await chrome.action.setTitle({ title: chrome.i18n.getMessage("badgePrompt") });
    return;
  }
  const unread = queue.filter((item) => !item.read).length;
  if (unread > 0) {
    await chrome.action.setBadgeBackgroundColor({ color: QUEUE_BADGE_COLOR });
    await chrome.action.setBadgeText({ text: unread > 99 ? "99+" : String(unread) });
    await chrome.action.setTitle({
      title: chrome.i18n.getMessage("badgeUnread", String(unread)),
    });
    return;
  }
  await chrome.action.setBadgeText({ text: "" });
  await chrome.action.setTitle({ title: chrome.i18n.getMessage("badgeTitle") });
}

chrome.runtime.onStartup.addListener(refreshBadge);
chrome.runtime.onInstalled.addListener(refreshBadge);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (PROMPT_KEY in changes || QUEUE_KEY in changes) refreshBadge();
});
