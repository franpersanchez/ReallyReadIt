'use strict';

function createChromeMock() {
  const storage = new Map();
  const storageListeners = [];
  const onCreatedListeners = [];
  const onStartupListeners = [];
  const onInstalledListeners = [];
  const onMessageListeners = [];

  const bookmarks = new Map();
  let nextBookmarkId = 100;

  const action = { badgeColor: null, badgeText: '', title: '' };
  const calls = {
    setBadgeBackgroundColor: [],
    setBadgeText: [],
    setTitle: [],
    sendMessage: [],
  };

  let tabsResult = [];
  let i18nMessages = null;

  function normalizeKeys(keys) {
    if (keys === undefined || keys === null) return null;
    if (typeof keys === 'string') return [keys];
    if (Array.isArray(keys)) return keys;
    return Object.keys(keys);
  }

  async function fireStorageListeners(changes) {
    for (const l of storageListeners) {
      await l(changes, 'local');
    }
  }

  const chrome = {
    storage: {
      local: {
        async get(keys) {
          if (keys === undefined || keys === null) {
            return Object.fromEntries(storage);
          }
          if (typeof keys === 'string') {
            return storage.has(keys) ? { [keys]: storage.get(keys) } : {};
          }
          if (Array.isArray(keys)) {
            const out = {};
            for (const k of keys) {
              if (storage.has(k)) out[k] = storage.get(k);
            }
            return out;
          }
          // object with defaults
          const out = {};
          for (const [k, def] of Object.entries(keys)) {
            out[k] = storage.has(k) ? storage.get(k) : def;
          }
          return out;
        },
        async set(obj) {
          const changes = {};
          for (const [k, v] of Object.entries(obj)) {
            const oldValue = storage.has(k) ? storage.get(k) : undefined;
            changes[k] = { oldValue, newValue: v };
            storage.set(k, v);
          }
          await fireStorageListeners(changes);
        },
        async remove(key) {
          const keys = Array.isArray(key) ? key : [key];
          const changes = {};
          for (const k of keys) {
            if (storage.has(k)) {
              changes[k] = { oldValue: storage.get(k), newValue: undefined };
              storage.delete(k);
            }
          }
          if (Object.keys(changes).length > 0) {
            await fireStorageListeners(changes);
          }
        },
      },
      onChanged: {
        addListener(cb) { storageListeners.push(cb); },
      },
    },

    bookmarks: {
      onCreated: { addListener(cb) { onCreatedListeners.push(cb); } },
      async search(query) {
        const results = [];
        for (const b of bookmarks.values()) {
          if (query.url && b.url === query.url) results.push(b);
        }
        return results;
      },
      async get(id) {
        const b = bookmarks.get(id);
        return b ? [b] : [];
      },
    },

    runtime: {
      onMessage: { addListener(cb) { onMessageListeners.push(cb); } },
      onStartup: { addListener(cb) { onStartupListeners.push(cb); } },
      onInstalled: { addListener(cb) { onInstalledListeners.push(cb); } },
      sendMessage(msg) {
        calls.sendMessage.push(msg);
        return new Promise((resolve) => {
          let resolved = false;
          const sendResponse = (r) => {
            if (resolved) return;
            resolved = true;
            resolve(r);
          };
          let kept = false;
          for (const l of onMessageListeners) {
            const ret = l(msg, {}, sendResponse);
            if (ret === true) kept = true;
          }
          if (!kept && !resolved) resolve(undefined);
        });
      },
      getURL(path) {
        return 'chrome-extension://test-id' + (path.startsWith('/') ? path : '/' + path);
      },
    },

    action: {
      async setBadgeBackgroundColor(arg) {
        calls.setBadgeBackgroundColor.push(arg);
        action.badgeColor = arg.color;
      },
      async setBadgeText(arg) {
        calls.setBadgeText.push(arg);
        action.badgeText = arg.text;
      },
      async setTitle(arg) {
        calls.setTitle.push(arg);
        action.title = arg.title;
      },
    },

    tabs: {
      async query() {
        return tabsResult.slice();
      },
    },

    i18n: {
      getMessage(key, subs) {
        const subList = Array.isArray(subs) ? subs : (subs ? [subs] : []);
        if (i18nMessages && Object.prototype.hasOwnProperty.call(i18nMessages, key)) {
          return i18nMessages[key].replace(/\$(\d+)/g, (_, n) => subList[Number(n) - 1] ?? '');
        }
        return subList.length ? `[[${key}:${subList.join(',')}]]` : `[[${key}]]`;
      },
    },
  };

  function addBookmark({ id, parentId, url, title }) {
    const bid = id || String(nextBookmarkId++);
    const bm = { id: bid, parentId: parentId || '0', url: url || '', title: title || '' };
    bookmarks.set(bid, bm);
    return bm;
  }

  async function fireBookmarkCreated(bookmark) {
    const bm = addBookmark(bookmark);
    for (const l of onCreatedListeners) {
      await l(bm.id, bm);
    }
    return bm;
  }

  function seedStorage(obj) {
    for (const [k, v] of Object.entries(obj)) storage.set(k, v);
  }

  function getStorage(key) {
    return key === undefined
      ? Object.fromEntries(storage)
      : storage.get(key);
  }

  function clearCalls() {
    calls.setBadgeBackgroundColor.length = 0;
    calls.setBadgeText.length = 0;
    calls.setTitle.length = 0;
    calls.sendMessage.length = 0;
  }

  function setTabs(tabs) { tabsResult = tabs; }
  function setI18nMessages(m) { i18nMessages = m; }

  return {
    chrome,
    storage,
    bookmarks,
    action,
    calls,
    listeners: {
      storage: storageListeners,
      onCreated: onCreatedListeners,
      onStartup: onStartupListeners,
      onInstalled: onInstalledListeners,
      onMessage: onMessageListeners,
    },
    addBookmark,
    fireBookmarkCreated,
    seedStorage,
    getStorage,
    setTabs,
    setI18nMessages,
    clearCalls,
  };
}

module.exports = { createChromeMock };
