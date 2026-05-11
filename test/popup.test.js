'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

let jsdom;
try {
  jsdom = require('jsdom');
} catch {
  console.error('jsdom no instalado: ejecuta `npm install` antes de los tests.');
  process.exit(1);
}

const { createChromeMock } = require('./chrome-mock');
const { loadPopup, flushAsync } = require('./load');

const PROMPT_KEY = 'pendingPrompt';
const QUEUE_KEY = 'readingQueue';
const CONFIG_KEY = 'bookmarkMode';
const THEME_KEY = 'themeMode';
const ORDER_KEY = 'addOrder';
const CAPTURE_KEY = 'captureBookmarks';

async function setup(initialStorage = {}, options = {}) {
  const mock = createChromeMock();
  if (options.i18n) mock.setI18nMessages(options.i18n);
  if (options.tabs) mock.setTabs(options.tabs);
  if (options.bookmarks) {
    for (const b of options.bookmarks) mock.addBookmark(b);
  }
  mock.seedStorage(initialStorage);
  const dom = await loadPopup({ chrome: mock.chrome, jsdom });
  await flushAsync();
  return { mock, dom, document: dom.window.document, window: dom.window };
}

function fireEvent(element, type, init = {}) {
  const win = element.ownerDocument.defaultView;
  const Event = win.Event;
  const evt = new Event(type, { bubbles: true, cancelable: true, ...init });
  for (const [k, v] of Object.entries(init)) {
    if (k === 'bubbles' || k === 'cancelable') continue;
    try {
      Object.defineProperty(evt, k, { value: v, configurable: true });
    } catch {
      evt[k] = v;
    }
  }
  element.dispatchEvent(evt);
  return evt;
}

function makeDragEvent(element, type, opts = {}) {
  const win = element.ownerDocument.defaultView;
  const evt = new win.Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(evt, 'dataTransfer', {
    value: {
      effectAllowed: '',
      dropEffect: '',
      _data: new Map(),
      setData(k, v) { this._data.set(k, v); },
      getData(k) { return this._data.get(k) || ''; },
    },
    configurable: true,
  });
  if (opts.clientY !== undefined) {
    Object.defineProperty(evt, 'clientY', { value: opts.clientY, configurable: true });
  }
  element.dispatchEvent(evt);
  return evt;
}

// ---------------------------------------------------------------------------
// i18n
// ---------------------------------------------------------------------------

test('applyI18n: rellena textContent de [data-i18n]', async () => {
  const { document } = await setup({}, {
    i18n: {
      promptHeading: 'Heading-ES',
      queueHeading: 'Cola-ES',
      queueEmpty: 'Vacía',
      promptAccept: 'Sí',
      promptDecline: 'No',
    },
  });
  assert.equal(document.querySelector('[data-i18n="promptHeading"]').textContent, 'Heading-ES');
  assert.equal(document.querySelector('[data-i18n="queueHeading"]').textContent, 'Cola-ES');
  assert.equal(document.getElementById('queue-empty').textContent, 'Vacía');
  assert.equal(document.getElementById('accept').textContent, 'Sí');
  assert.equal(document.getElementById('decline').textContent, 'No');
});

test('applyI18n: rellena title con [data-i18n-title]', async () => {
  const { document } = await setup({}, {
    i18n: { addCurrentTitle: 'Añadir actual', settingsTitle: 'Ajustes' },
  });
  assert.equal(document.getElementById('add-current').title, 'Añadir actual');
  assert.equal(document.getElementById('settings-btn').title, 'Ajustes');
});

test('applyI18n: rellena aria-label con [data-i18n-aria]', async () => {
  const { document } = await setup({}, {
    i18n: { addCurrentTitle: 'Añadir actual' },
  });
  assert.equal(document.getElementById('add-current').getAttribute('aria-label'), 'Añadir actual');
});

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

test('theme: default auto no añade clases', async () => {
  const { document } = await setup();
  const root = document.documentElement;
  assert.equal(root.classList.contains('theme-light'), false);
  assert.equal(root.classList.contains('theme-dark'), false);
});

test('theme: light añade theme-light', async () => {
  const { document } = await setup({ [THEME_KEY]: 'light' });
  assert.equal(document.documentElement.classList.contains('theme-light'), true);
});

test('theme: dark añade theme-dark', async () => {
  const { document } = await setup({ [THEME_KEY]: 'dark' });
  assert.equal(document.documentElement.classList.contains('theme-dark'), true);
});

test('theme: cambiar select aplica clase y persiste', async () => {
  const { mock, document } = await setup();
  const sel = document.getElementById('theme-mode');
  sel.value = 'dark';
  fireEvent(sel, 'change');
  assert.equal(document.documentElement.classList.contains('theme-dark'), true);
  await flushAsync();
  assert.equal(mock.getStorage(THEME_KEY), 'dark');
});

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

test('prompt: oculto si no hay prompt en storage', async () => {
  const { document } = await setup();
  assert.equal(document.getElementById('prompt').classList.contains('hidden'), true);
});

test('prompt: visible con título y url', async () => {
  const { document } = await setup({
    [PROMPT_KEY]: { url: 'https://a.test', title: 'Hola', createdAt: 1 },
  });
  const prompt = document.getElementById('prompt');
  assert.equal(prompt.classList.contains('hidden'), false);
  assert.equal(document.getElementById('prompt-title').textContent, 'Hola');
  assert.equal(document.getElementById('prompt-url').textContent, 'https://a.test');
});

test('prompt: usa URL como título cuando falta', async () => {
  const { document } = await setup({
    [PROMPT_KEY]: { url: 'https://a.test', title: '', createdAt: 1 },
  });
  assert.equal(document.getElementById('prompt-title').textContent, 'https://a.test');
});

test('prompt accept: envía resolvePrompt accept=true', async () => {
  const { mock, document } = await setup({
    [PROMPT_KEY]: { url: 'https://a.test', title: 'A', createdAt: 1 },
  });
  fireEvent(document.getElementById('accept'), 'click');
  await flushAsync();
  assert.deepEqual(mock.calls.sendMessage[0], { type: 'resolvePrompt', accept: true });
});

test('prompt decline: envía resolvePrompt accept=false', async () => {
  const { mock, document } = await setup({
    [PROMPT_KEY]: { url: 'https://a.test', title: 'A', createdAt: 1 },
  });
  fireEvent(document.getElementById('decline'), 'click');
  await flushAsync();
  assert.deepEqual(mock.calls.sendMessage[0], { type: 'resolvePrompt', accept: false });
});

// ---------------------------------------------------------------------------
// Queue rendering
// ---------------------------------------------------------------------------

test('queue: muestra mensaje vacío sin items', async () => {
  const { document } = await setup();
  assert.equal(document.getElementById('queue-count').textContent, '0');
  assert.equal(document.getElementById('queue-empty').classList.contains('hidden'), false);
});

test('queue: pinta items con título y favicon', async () => {
  const { document } = await setup({
    [QUEUE_KEY]: [
      { url: 'https://a.test/x', title: 'A', addedAt: 0 },
      { url: 'https://b.test', title: 'B', addedAt: 0, read: true },
    ],
  });
  const items = document.querySelectorAll('.queue-item');
  assert.equal(items.length, 2);
  assert.equal(document.getElementById('queue-count').textContent, '2');
  assert.equal(document.getElementById('queue-empty').classList.contains('hidden'), true);

  const firstLink = items[0].querySelector('a');
  assert.equal(firstLink.textContent, 'A');
  assert.equal(firstLink.getAttribute('href'), 'https://a.test/x');
  assert.equal(firstLink.target, '_blank');
  assert.equal(firstLink.rel, 'noopener noreferrer');

  const favicon = items[0].querySelector('img.favicon');
  assert.ok(favicon.src.includes('_favicon'));
  assert.ok(favicon.src.includes('pageUrl=https'));
  assert.ok(favicon.src.includes('size=32'));

  assert.equal(items[1].classList.contains('is-read'), true);
});

test('queue: item sin título usa URL como label', async () => {
  const { document } = await setup({
    [QUEUE_KEY]: [{ url: 'https://a.test', title: '', addedAt: 0 }],
  });
  assert.equal(document.querySelector('.queue-item a').textContent, 'https://a.test');
});

test('queue: icono bookmark visible si la URL está marcada', async () => {
  const { document } = await setup(
    {
      [QUEUE_KEY]: [{ url: 'https://a.test', title: 'A', addedAt: 0 }],
    },
    {
      bookmarks: [
        { id: 'root', parentId: '0', title: '' },
        { id: 'folder', parentId: 'root', title: 'Lectura' },
        { id: 'sub', parentId: 'folder', title: 'Pendiente' },
        { id: 'bm', parentId: 'sub', url: 'https://a.test', title: 'A' },
      ],
      i18n: { itemBookmarkSavedIn: 'Guardado en: $1' },
    },
  );
  await flushAsync();
  const flag = document.querySelector('.queue-item .bookmark-flag');
  assert.equal(flag.classList.contains('hidden'), false);
  // Path se construye de la raíz hacia abajo
  assert.ok(flag.title.includes('Lectura'));
  assert.ok(flag.title.includes('Pendiente'));
});

test('queue: sin bookmark, el icono está oculto', async () => {
  const { document } = await setup({
    [QUEUE_KEY]: [{ url: 'https://a.test', title: 'A', addedAt: 0 }],
  });
  await flushAsync();
  const flag = document.querySelector('.queue-item .bookmark-flag');
  assert.equal(flag.classList.contains('hidden'), true);
});

test('queue: click en toggle envía toggleRead', async () => {
  const { mock, document } = await setup({
    [QUEUE_KEY]: [{ url: 'https://a.test', title: 'A', addedAt: 0 }],
  });
  fireEvent(document.querySelector('.queue-item .toggle-read'), 'click');
  await flushAsync();
  assert.deepEqual(mock.calls.sendMessage[0], { type: 'toggleRead', url: 'https://a.test' });
});

test('queue: click en remove envía removeFromQueue', async () => {
  const { mock, document } = await setup({
    [QUEUE_KEY]: [{ url: 'https://a.test', title: 'A', addedAt: 0 }],
  });
  fireEvent(document.querySelector('.queue-item .remove'), 'click');
  await flushAsync();
  assert.deepEqual(mock.calls.sendMessage[0], { type: 'removeFromQueue', url: 'https://a.test' });
});

// ---------------------------------------------------------------------------
// Add current
// ---------------------------------------------------------------------------

test('addCurrent: envía addCurrentPage con la pestaña activa', async () => {
  const { mock, document } = await setup({}, {
    tabs: [{ url: 'https://current.test', title: 'Current' }],
  });
  fireEvent(document.getElementById('add-current'), 'click');
  await flushAsync();
  const sent = mock.calls.sendMessage.find((m) => m.type === 'addCurrentPage');
  assert.deepEqual(sent, { type: 'addCurrentPage', url: 'https://current.test', title: 'Current' });
});

test('addCurrent: ignora URLs no http/https (chrome://)', async () => {
  const { mock, document } = await setup({}, {
    tabs: [{ url: 'chrome://settings', title: 'X' }],
    i18n: { cannotAddPage: 'No se puede añadir' },
  });
  const btn = document.getElementById('add-current');
  fireEvent(btn, 'click');
  await flushAsync();
  const sent = mock.calls.sendMessage.find((m) => m.type === 'addCurrentPage');
  assert.equal(sent, undefined);
  assert.equal(btn.title, 'No se puede añadir');
});

test('addCurrent: ignora si no hay pestaña', async () => {
  const { mock, document } = await setup({}, { tabs: [] });
  fireEvent(document.getElementById('add-current'), 'click');
  await flushAsync();
  const sent = mock.calls.sendMessage.find((m) => m.type === 'addCurrentPage');
  assert.equal(sent, undefined);
});

test('addCurrent: usa URL como fallback si no hay título', async () => {
  const { mock, document } = await setup({}, {
    tabs: [{ url: 'https://current.test', title: '' }],
  });
  fireEvent(document.getElementById('add-current'), 'click');
  await flushAsync();
  const sent = mock.calls.sendMessage.find((m) => m.type === 'addCurrentPage');
  assert.equal(sent.title, 'https://current.test');
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

test('settings: persisten bookmarkMode al cambiar', async () => {
  const { mock, document } = await setup();
  const sel = document.getElementById('bookmark-mode');
  sel.value = 'always';
  fireEvent(sel, 'change');
  await flushAsync();
  assert.equal(mock.getStorage(CONFIG_KEY), 'always');
});

test('settings: persisten addOrder al cambiar', async () => {
  const { mock, document } = await setup();
  const sel = document.getElementById('add-order');
  sel.value = 'bottom';
  fireEvent(sel, 'change');
  await flushAsync();
  assert.equal(mock.getStorage(ORDER_KEY), 'bottom');
});

test('settings: persisten captureBookmarks al cambiar', async () => {
  const { mock, document } = await setup({ [CAPTURE_KEY]: true });
  const cb = document.getElementById('capture-bookmarks');
  cb.checked = false;
  fireEvent(cb, 'change');
  await flushAsync();
  assert.equal(mock.getStorage(CAPTURE_KEY), false);
});

test('settings: capture-bookmarks por defecto checked', async () => {
  const { document } = await setup();
  assert.equal(document.getElementById('capture-bookmarks').checked, true);
});

test('settings: capture-bookmarks false en storage refleja unchecked', async () => {
  const { document } = await setup({ [CAPTURE_KEY]: false });
  assert.equal(document.getElementById('capture-bookmarks').checked, false);
});

test('settings: valores por defecto en selects', async () => {
  const { document } = await setup();
  assert.equal(document.getElementById('bookmark-mode').value, 'ask');
  assert.equal(document.getElementById('theme-mode').value, 'auto');
  assert.equal(document.getElementById('add-order').value, 'top');
});

test('settings: valores leídos del storage', async () => {
  const { document } = await setup({
    [CONFIG_KEY]: 'always',
    [THEME_KEY]: 'light',
    [ORDER_KEY]: 'bottom',
  });
  assert.equal(document.getElementById('bookmark-mode').value, 'always');
  assert.equal(document.getElementById('theme-mode').value, 'light');
  assert.equal(document.getElementById('add-order').value, 'bottom');
});

test('settings: panel se alterna al pulsar engranaje', async () => {
  const { document } = await setup();
  const btn = document.getElementById('settings-btn');
  const panel = document.getElementById('settings-panel');
  assert.equal(panel.classList.contains('hidden'), true);
  fireEvent(btn, 'click');
  assert.equal(panel.classList.contains('hidden'), false);
  assert.equal(btn.classList.contains('active'), true);
  fireEvent(btn, 'click');
  assert.equal(panel.classList.contains('hidden'), true);
  assert.equal(btn.classList.contains('active'), false);
});

// ---------------------------------------------------------------------------
// Storage onChanged re-render
// ---------------------------------------------------------------------------

test('storage.onChanged: cambio en QUEUE re-renderiza', async () => {
  const { mock, document } = await setup();
  await mock.chrome.storage.local.set({
    [QUEUE_KEY]: [{ url: 'https://a.test', title: 'A', addedAt: 0 }],
  });
  await flushAsync();
  assert.equal(document.querySelectorAll('.queue-item').length, 1);
});

test('storage.onChanged: cambio en PROMPT re-renderiza', async () => {
  const { mock, document } = await setup();
  await mock.chrome.storage.local.set({
    [PROMPT_KEY]: { url: 'https://a.test', title: 'A', createdAt: 1 },
  });
  await flushAsync();
  assert.equal(document.getElementById('prompt').classList.contains('hidden'), false);
});

test('storage.onChanged: cambios en otras áreas no re-renderizan', async () => {
  const { mock, document } = await setup();
  // Simulamos un cambio en area 'sync' (no soportado por nuestro mock por defecto)
  for (const l of mock.listeners.storage) {
    await l({ [QUEUE_KEY]: { newValue: [{ url: 'https://a.test', title: 'A' }] } }, 'sync');
  }
  await flushAsync();
  assert.equal(document.querySelectorAll('.queue-item').length, 0);
});

test('storage.onChanged: cambios sin PROMPT ni QUEUE no re-renderizan', async () => {
  const { mock, document } = await setup({
    [QUEUE_KEY]: [{ url: 'https://a.test', title: 'A', addedAt: 0 }],
  });
  // setting unrelated theme — popup escucha en storage pero solo re-renderiza si cambia PROMPT/QUEUE
  await mock.chrome.storage.local.set({ [THEME_KEY]: 'dark' });
  await flushAsync();
  // queue se mantiene
  assert.equal(document.querySelectorAll('.queue-item').length, 1);
});

// ---------------------------------------------------------------------------
// Drag & drop reorder
// ---------------------------------------------------------------------------

test('dragdrop: reordena DOM y envía reorderQueue', async () => {
  const { mock, document } = await setup({
    [QUEUE_KEY]: [
      { url: 'https://a.test', title: 'A', addedAt: 0 },
      { url: 'https://b.test', title: 'B', addedAt: 0 },
      { url: 'https://c.test', title: 'C', addedAt: 0 },
    ],
  });
  await flushAsync();
  const items = document.querySelectorAll('.queue-item');
  const [a, b, c] = items;

  // Arrastra A y suéltalo después de C
  makeDragEvent(a, 'dragstart');
  const cRect = { top: 0, height: 20 };
  c.getBoundingClientRect = () => cRect;
  makeDragEvent(c, 'dragover', { clientY: 15 }); // suelta después
  makeDragEvent(c, 'drop', { clientY: 15 });
  await flushAsync();

  const reorderMsg = mock.calls.sendMessage.find((m) => m.type === 'reorderQueue');
  assert.deepEqual(reorderMsg.order, [
    'https://b.test',
    'https://c.test',
    'https://a.test',
  ]);

  const urls = Array.from(document.querySelectorAll('.queue-item')).map((li) => li.dataset.url);
  assert.deepEqual(urls, ['https://b.test', 'https://c.test', 'https://a.test']);
});

test('dragdrop: drop antes de un item lo coloca encima', async () => {
  const { mock, document } = await setup({
    [QUEUE_KEY]: [
      { url: 'https://a.test', title: 'A', addedAt: 0 },
      { url: 'https://b.test', title: 'B', addedAt: 0 },
      { url: 'https://c.test', title: 'C', addedAt: 0 },
    ],
  });
  await flushAsync();
  const items = document.querySelectorAll('.queue-item');
  const [, b, c] = items;

  makeDragEvent(c, 'dragstart');
  b.getBoundingClientRect = () => ({ top: 0, height: 20 });
  makeDragEvent(b, 'dragover', { clientY: 5 }); // antes
  makeDragEvent(b, 'drop', { clientY: 5 });
  await flushAsync();

  const reorderMsg = mock.calls.sendMessage.find((m) => m.type === 'reorderQueue');
  assert.deepEqual(reorderMsg.order, [
    'https://a.test',
    'https://c.test',
    'https://b.test',
  ]);
});

test('dragdrop: soltar sobre sí mismo no genera reorder', async () => {
  const { mock, document } = await setup({
    [QUEUE_KEY]: [
      { url: 'https://a.test', title: 'A', addedAt: 0 },
      { url: 'https://b.test', title: 'B', addedAt: 0 },
    ],
  });
  const a = document.querySelector('.queue-item');
  makeDragEvent(a, 'dragstart');
  a.getBoundingClientRect = () => ({ top: 0, height: 20 });
  makeDragEvent(a, 'dragover', { clientY: 5 });
  makeDragEvent(a, 'drop', { clientY: 5 });
  await flushAsync();
  assert.equal(mock.calls.sendMessage.find((m) => m.type === 'reorderQueue'), undefined);
});
