'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createChromeMock } = require('./chrome-mock');
const { loadBackground, flushAsync } = require('./load');

const PROMPT_KEY = 'pendingPrompt';
const QUEUE_KEY = 'readingQueue';
const CONFIG_KEY = 'bookmarkMode';
const ORDER_KEY = 'addOrder';
const CAPTURE_KEY = 'captureBookmarks';

function setup(initialStorage = {}) {
  const mock = createChromeMock();
  mock.seedStorage(initialStorage);
  loadBackground(mock.chrome);
  return mock;
}

async function dispatchMessage(mock, msg) {
  return await new Promise((resolve) => {
    let resolved = false;
    const sendResponse = (r) => {
      if (resolved) return;
      resolved = true;
      resolve(r);
    };
    let kept = false;
    for (const l of mock.listeners.onMessage) {
      if (l(msg, {}, sendResponse) === true) kept = true;
    }
    if (!kept && !resolved) resolve(undefined);
  });
}

// ---------------------------------------------------------------------------
// bookmarks.onCreated
// ---------------------------------------------------------------------------

test('bookmarks.onCreated: ignora bookmarks de tipo carpeta (sin url)', async () => {
  const mock = setup();
  await mock.fireBookmarkCreated({ title: 'Folder' });
  assert.equal(mock.getStorage(PROMPT_KEY), undefined);
  assert.equal(mock.getStorage(QUEUE_KEY), undefined);
});

test('bookmarks.onCreated: con capture=false no hace nada', async () => {
  const mock = setup({ [CAPTURE_KEY]: false });
  await mock.fireBookmarkCreated({ url: 'https://a.test', title: 'A' });
  assert.equal(mock.getStorage(PROMPT_KEY), undefined);
  assert.equal(mock.getStorage(QUEUE_KEY), undefined);
});

test('bookmarks.onCreated: capture por defecto es true', async () => {
  const mock = setup();
  await mock.fireBookmarkCreated({ url: 'https://a.test', title: 'A' });
  await flushAsync();
  assert.ok(mock.getStorage(PROMPT_KEY), 'debería haber prompt en modo ask default');
});

test('bookmarks.onCreated: URL ya presente en cola no genera prompt', async () => {
  const mock = setup({
    [QUEUE_KEY]: [{ url: 'https://a.test', title: 'A', addedAt: 1 }],
  });
  await mock.fireBookmarkCreated({ url: 'https://a.test', title: 'A' });
  assert.equal(mock.getStorage(PROMPT_KEY), undefined);
});

test('bookmarks.onCreated: modo always con order=top hace unshift', async () => {
  const mock = setup({
    [CONFIG_KEY]: 'always',
    [ORDER_KEY]: 'top',
    [QUEUE_KEY]: [{ url: 'https://old.test', title: 'old', addedAt: 1 }],
  });
  await mock.fireBookmarkCreated({ url: 'https://new.test', title: 'new' });
  const q = mock.getStorage(QUEUE_KEY);
  assert.equal(q[0].url, 'https://new.test');
  assert.equal(q[1].url, 'https://old.test');
});

test('bookmarks.onCreated: modo always con order=bottom hace push', async () => {
  const mock = setup({
    [CONFIG_KEY]: 'always',
    [ORDER_KEY]: 'bottom',
    [QUEUE_KEY]: [{ url: 'https://old.test', title: 'old', addedAt: 1 }],
  });
  await mock.fireBookmarkCreated({ url: 'https://new.test', title: 'new' });
  const q = mock.getStorage(QUEUE_KEY);
  assert.equal(q[0].url, 'https://old.test');
  assert.equal(q[1].url, 'https://new.test');
});

test('bookmarks.onCreated: modo always sin título usa la URL', async () => {
  const mock = setup({ [CONFIG_KEY]: 'always' });
  await mock.fireBookmarkCreated({ url: 'https://a.test', title: '' });
  const q = mock.getStorage(QUEUE_KEY);
  assert.equal(q[0].title, 'https://a.test');
});

test('bookmarks.onCreated: modo ask sin prompt previo crea prompt', async () => {
  const mock = setup();
  await mock.fireBookmarkCreated({ url: 'https://a.test', title: 'A' });
  const p = mock.getStorage(PROMPT_KEY);
  assert.equal(p.url, 'https://a.test');
  assert.equal(p.title, 'A');
  assert.equal(typeof p.createdAt, 'number');
});

test('bookmarks.onCreated: modo ask con prompt existente NO lo sobrescribe', async () => {
  const mock = setup({
    [PROMPT_KEY]: { url: 'https://first.test', title: 'first', createdAt: 1 },
  });
  await mock.fireBookmarkCreated({ url: 'https://second.test', title: 'second' });
  const p = mock.getStorage(PROMPT_KEY);
  assert.equal(p.url, 'https://first.test');
});

test('bookmarks.onCreated: modo ask sin título usa la URL', async () => {
  const mock = setup();
  await mock.fireBookmarkCreated({ url: 'https://a.test', title: '' });
  const p = mock.getStorage(PROMPT_KEY);
  assert.equal(p.title, 'https://a.test');
});

// ---------------------------------------------------------------------------
// onMessage: resolvePrompt
// ---------------------------------------------------------------------------

test('resolvePrompt accept=true añade a cola y borra prompt', async () => {
  const mock = setup({
    [PROMPT_KEY]: { url: 'https://a.test', title: 'A', createdAt: 1 },
  });
  const resp = await dispatchMessage(mock, { type: 'resolvePrompt', accept: true });
  assert.deepEqual(resp, { ok: true });
  const q = mock.getStorage(QUEUE_KEY);
  assert.equal(q.length, 1);
  assert.equal(q[0].url, 'https://a.test');
  assert.equal(mock.getStorage(PROMPT_KEY), undefined);
});

test('resolvePrompt accept=true respeta order=bottom', async () => {
  const mock = setup({
    [PROMPT_KEY]: { url: 'https://new.test', title: 'new', createdAt: 1 },
    [ORDER_KEY]: 'bottom',
    [QUEUE_KEY]: [{ url: 'https://old.test', title: 'old', addedAt: 0 }],
  });
  await dispatchMessage(mock, { type: 'resolvePrompt', accept: true });
  const q = mock.getStorage(QUEUE_KEY);
  assert.equal(q[0].url, 'https://old.test');
  assert.equal(q[1].url, 'https://new.test');
});

test('resolvePrompt accept=false solo borra el prompt', async () => {
  const mock = setup({
    [PROMPT_KEY]: { url: 'https://a.test', title: 'A', createdAt: 1 },
    [QUEUE_KEY]: [{ url: 'https://old.test', title: 'old', addedAt: 0 }],
  });
  await dispatchMessage(mock, { type: 'resolvePrompt', accept: false });
  assert.equal(mock.getStorage(PROMPT_KEY), undefined);
  assert.equal(mock.getStorage(QUEUE_KEY).length, 1);
});

test('resolvePrompt accept=true con URL ya en cola no duplica', async () => {
  const mock = setup({
    [PROMPT_KEY]: { url: 'https://a.test', title: 'A', createdAt: 1 },
    [QUEUE_KEY]: [{ url: 'https://a.test', title: 'A', addedAt: 0 }],
  });
  await dispatchMessage(mock, { type: 'resolvePrompt', accept: true });
  assert.equal(mock.getStorage(QUEUE_KEY).length, 1);
  assert.equal(mock.getStorage(PROMPT_KEY), undefined);
});

test('resolvePrompt sin prompt en storage no falla', async () => {
  const mock = setup();
  const resp = await dispatchMessage(mock, { type: 'resolvePrompt', accept: true });
  assert.deepEqual(resp, { ok: true });
  assert.equal(mock.getStorage(QUEUE_KEY), undefined);
});

// ---------------------------------------------------------------------------
// onMessage: addCurrentPage
// ---------------------------------------------------------------------------

test('addCurrentPage añade nuevo item', async () => {
  const mock = setup();
  await dispatchMessage(mock, { type: 'addCurrentPage', url: 'https://a.test', title: 'A' });
  const q = mock.getStorage(QUEUE_KEY);
  assert.equal(q.length, 1);
  assert.equal(q[0].url, 'https://a.test');
  assert.equal(q[0].title, 'A');
  assert.equal(typeof q[0].addedAt, 'number');
});

test('addCurrentPage usa URL como título si falta', async () => {
  const mock = setup();
  await dispatchMessage(mock, { type: 'addCurrentPage', url: 'https://a.test', title: '' });
  assert.equal(mock.getStorage(QUEUE_KEY)[0].title, 'https://a.test');
});

test('addCurrentPage no añade si URL vacía/undefined', async () => {
  const mock = setup();
  await dispatchMessage(mock, { type: 'addCurrentPage', url: '', title: 'X' });
  assert.equal(mock.getStorage(QUEUE_KEY), undefined);
  await dispatchMessage(mock, { type: 'addCurrentPage', title: 'X' });
  assert.equal(mock.getStorage(QUEUE_KEY), undefined);
});

test('addCurrentPage no duplica URL existente', async () => {
  const mock = setup({
    [QUEUE_KEY]: [{ url: 'https://a.test', title: 'A', addedAt: 0 }],
  });
  await dispatchMessage(mock, { type: 'addCurrentPage', url: 'https://a.test', title: 'duplicate' });
  const q = mock.getStorage(QUEUE_KEY);
  assert.equal(q.length, 1);
  assert.equal(q[0].title, 'A');
});

test('addCurrentPage con order=bottom hace push', async () => {
  const mock = setup({
    [ORDER_KEY]: 'bottom',
    [QUEUE_KEY]: [{ url: 'https://old.test', title: 'old', addedAt: 0 }],
  });
  await dispatchMessage(mock, { type: 'addCurrentPage', url: 'https://new.test', title: 'new' });
  const q = mock.getStorage(QUEUE_KEY);
  assert.equal(q[1].url, 'https://new.test');
});

// ---------------------------------------------------------------------------
// onMessage: toggleRead
// ---------------------------------------------------------------------------

test('toggleRead pone read=true en item sin read previo', async () => {
  const mock = setup({
    [QUEUE_KEY]: [{ url: 'https://a.test', title: 'A', addedAt: 0 }],
  });
  await dispatchMessage(mock, { type: 'toggleRead', url: 'https://a.test' });
  assert.equal(mock.getStorage(QUEUE_KEY)[0].read, true);
});

test('toggleRead alterna a false', async () => {
  const mock = setup({
    [QUEUE_KEY]: [{ url: 'https://a.test', title: 'A', addedAt: 0, read: true }],
  });
  await dispatchMessage(mock, { type: 'toggleRead', url: 'https://a.test' });
  assert.equal(mock.getStorage(QUEUE_KEY)[0].read, false);
});

test('toggleRead solo afecta al item con esa URL', async () => {
  const mock = setup({
    [QUEUE_KEY]: [
      { url: 'https://a.test', title: 'A', addedAt: 0 },
      { url: 'https://b.test', title: 'B', addedAt: 0, read: true },
    ],
  });
  await dispatchMessage(mock, { type: 'toggleRead', url: 'https://a.test' });
  const q = mock.getStorage(QUEUE_KEY);
  assert.equal(q[0].read, true);
  assert.equal(q[1].read, true);
});

test('toggleRead con URL inexistente no rompe', async () => {
  const mock = setup({
    [QUEUE_KEY]: [{ url: 'https://a.test', title: 'A', addedAt: 0 }],
  });
  const resp = await dispatchMessage(mock, { type: 'toggleRead', url: 'https://nope.test' });
  assert.deepEqual(resp, { ok: true });
  assert.equal(mock.getStorage(QUEUE_KEY)[0].read, undefined);
});

// ---------------------------------------------------------------------------
// onMessage: removeFromQueue
// ---------------------------------------------------------------------------

test('removeFromQueue quita el item', async () => {
  const mock = setup({
    [QUEUE_KEY]: [
      { url: 'https://a.test', title: 'A', addedAt: 0 },
      { url: 'https://b.test', title: 'B', addedAt: 0 },
    ],
  });
  await dispatchMessage(mock, { type: 'removeFromQueue', url: 'https://a.test' });
  const q = mock.getStorage(QUEUE_KEY);
  assert.equal(q.length, 1);
  assert.equal(q[0].url, 'https://b.test');
});

test('removeFromQueue con URL inexistente deja la cola intacta', async () => {
  const mock = setup({
    [QUEUE_KEY]: [{ url: 'https://a.test', title: 'A', addedAt: 0 }],
  });
  await dispatchMessage(mock, { type: 'removeFromQueue', url: 'https://nope.test' });
  assert.equal(mock.getStorage(QUEUE_KEY).length, 1);
});

test('removeFromQueue con cola vacía no falla', async () => {
  const mock = setup();
  const resp = await dispatchMessage(mock, { type: 'removeFromQueue', url: 'https://a.test' });
  assert.deepEqual(resp, { ok: true });
});

// ---------------------------------------------------------------------------
// onMessage: reorderQueue
// ---------------------------------------------------------------------------

test('reorderQueue ordena según el array recibido', async () => {
  const mock = setup({
    [QUEUE_KEY]: [
      { url: 'https://a.test', title: 'A', addedAt: 0 },
      { url: 'https://b.test', title: 'B', addedAt: 0 },
      { url: 'https://c.test', title: 'C', addedAt: 0 },
    ],
  });
  await dispatchMessage(mock, {
    type: 'reorderQueue',
    order: ['https://c.test', 'https://a.test', 'https://b.test'],
  });
  const q = mock.getStorage(QUEUE_KEY);
  assert.deepEqual(q.map((i) => i.url), ['https://c.test', 'https://a.test', 'https://b.test']);
});

test('reorderQueue: URLs en order no presentes en cola se descartan', async () => {
  const mock = setup({
    [QUEUE_KEY]: [
      { url: 'https://a.test', title: 'A', addedAt: 0 },
      { url: 'https://b.test', title: 'B', addedAt: 0 },
    ],
  });
  await dispatchMessage(mock, {
    type: 'reorderQueue',
    order: ['https://ghost.test', 'https://b.test', 'https://a.test'],
  });
  assert.deepEqual(mock.getStorage(QUEUE_KEY).map((i) => i.url), [
    'https://b.test',
    'https://a.test',
  ]);
});

test('reorderQueue: items en cola faltantes en order se anexan al final', async () => {
  const mock = setup({
    [QUEUE_KEY]: [
      { url: 'https://a.test', title: 'A', addedAt: 0 },
      { url: 'https://b.test', title: 'B', addedAt: 0 },
      { url: 'https://c.test', title: 'C', addedAt: 0 },
    ],
  });
  await dispatchMessage(mock, {
    type: 'reorderQueue',
    order: ['https://b.test', 'https://a.test'],
  });
  assert.deepEqual(mock.getStorage(QUEUE_KEY).map((i) => i.url), [
    'https://b.test',
    'https://a.test',
    'https://c.test',
  ]);
});

test('reorderQueue conserva metadatos read/title', async () => {
  const mock = setup({
    [QUEUE_KEY]: [
      { url: 'https://a.test', title: 'A', addedAt: 1, read: true },
      { url: 'https://b.test', title: 'B', addedAt: 2 },
    ],
  });
  await dispatchMessage(mock, {
    type: 'reorderQueue',
    order: ['https://b.test', 'https://a.test'],
  });
  const q = mock.getStorage(QUEUE_KEY);
  assert.equal(q[1].read, true);
  assert.equal(q[1].title, 'A');
  assert.equal(q[0].title, 'B');
});

// ---------------------------------------------------------------------------
// Mensaje desconocido
// ---------------------------------------------------------------------------

test('mensaje con type desconocido responde ok:false', async () => {
  const mock = setup();
  const resp = await dispatchMessage(mock, { type: 'unknown' });
  assert.deepEqual(resp, { ok: false });
});

// ---------------------------------------------------------------------------
// refreshBadge: vía onStartup / onChanged
// ---------------------------------------------------------------------------

async function flushBadge(mock) {
  // refreshBadge se dispara desde storage.onChanged y se await dentro del listener
  await flushAsync();
}

test('refreshBadge: con prompt muestra "?" naranja', async () => {
  const mock = setup({
    [PROMPT_KEY]: { url: 'https://a.test', title: 'A', createdAt: 1 },
  });
  for (const l of mock.listeners.onStartup) await l();
  await flushBadge(mock);
  assert.equal(mock.action.badgeText, '?');
  assert.equal(mock.action.badgeColor, '#d97706');
});

test('refreshBadge: sin prompt y con N no leídos muestra N en rojo', async () => {
  const mock = setup({
    [QUEUE_KEY]: [
      { url: 'https://a.test', title: 'A', addedAt: 0 },
      { url: 'https://b.test', title: 'B', addedAt: 0, read: true },
      { url: 'https://c.test', title: 'C', addedAt: 0 },
    ],
  });
  for (const l of mock.listeners.onInstalled) await l();
  await flushBadge(mock);
  assert.equal(mock.action.badgeText, '2');
  assert.equal(mock.action.badgeColor, '#dc2626');
});

test('refreshBadge: 99+ cuando hay más de 99 no leídos', async () => {
  const queue = Array.from({ length: 105 }, (_, i) => ({
    url: `https://${i}.test`,
    title: String(i),
    addedAt: 0,
  }));
  const mock = setup({ [QUEUE_KEY]: queue });
  for (const l of mock.listeners.onStartup) await l();
  await flushBadge(mock);
  assert.equal(mock.action.badgeText, '99+');
});

test('refreshBadge: 100 leídos no muestran badge', async () => {
  const queue = Array.from({ length: 100 }, (_, i) => ({
    url: `https://${i}.test`,
    title: String(i),
    addedAt: 0,
    read: true,
  }));
  const mock = setup({ [QUEUE_KEY]: queue });
  for (const l of mock.listeners.onStartup) await l();
  await flushBadge(mock);
  assert.equal(mock.action.badgeText, '');
});

test('refreshBadge: cola vacía limpia el badge', async () => {
  const mock = setup({ [QUEUE_KEY]: [] });
  for (const l of mock.listeners.onStartup) await l();
  await flushBadge(mock);
  assert.equal(mock.action.badgeText, '');
});

test('refreshBadge: el cambio de QUEUE en storage dispara refresh', async () => {
  const mock = setup();
  // tras escribir queue se debería actualizar el badge
  await mock.chrome.storage.local.set({
    [QUEUE_KEY]: [{ url: 'https://a.test', title: 'A', addedAt: 0 }],
  });
  await flushBadge(mock);
  assert.equal(mock.action.badgeText, '1');
});

test('refreshBadge: el cambio de PROMPT en storage dispara refresh', async () => {
  const mock = setup();
  await mock.chrome.storage.local.set({
    [PROMPT_KEY]: { url: 'https://a.test', title: 'A', createdAt: 1 },
  });
  await flushBadge(mock);
  assert.equal(mock.action.badgeText, '?');
});

test('refreshBadge: el prompt tiene prioridad sobre la cola', async () => {
  const mock = setup({
    [QUEUE_KEY]: [{ url: 'https://x.test', title: 'X', addedAt: 0 }],
    [PROMPT_KEY]: { url: 'https://p.test', title: 'P', createdAt: 1 },
  });
  for (const l of mock.listeners.onStartup) await l();
  await flushBadge(mock);
  assert.equal(mock.action.badgeText, '?');
});

test('refreshBadge: cambios en otras áreas (sync) son ignorados', async () => {
  const mock = setup();
  mock.clearCalls();
  // Invocar el listener manualmente con area = 'sync'
  for (const l of mock.listeners.storage) await l({ [QUEUE_KEY]: { newValue: [] } }, 'sync');
  await flushBadge(mock);
  assert.equal(mock.calls.setBadgeText.length, 0);
});

test('refreshBadge: cambios sin PROMPT_KEY ni QUEUE_KEY no llaman a la API', async () => {
  const mock = setup();
  mock.clearCalls();
  await mock.chrome.storage.local.set({ [CONFIG_KEY]: 'always' });
  await flushBadge(mock);
  assert.equal(mock.calls.setBadgeText.length, 0);
});
