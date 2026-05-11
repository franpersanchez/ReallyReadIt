'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function loadBackground(chrome) {
  const code = fs.readFileSync(path.join(ROOT, 'background.js'), 'utf8');
  const wrapped = `(function(chrome){\n${code}\n})`;
  const fn = vm.runInThisContext(wrapped, { filename: 'background.js' });
  fn(chrome);
}

async function loadPopup({ chrome, jsdom }) {
  const { JSDOM } = jsdom;
  const html = fs.readFileSync(path.join(ROOT, 'popup.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'chrome-extension://test-id/popup.html', runScripts: 'outside-only' });

  const code = fs.readFileSync(path.join(ROOT, 'popup.js'), 'utf8');
  const wrapped = `(function(chrome, window, document){\n${code}\n})`;
  const fn = vm.runInThisContext(wrapped, { filename: 'popup.js' });
  fn(chrome, dom.window, dom.window.document);

  // Flush microtasks so initial render() completes
  await flushAsync();
  return dom;
}

async function flushAsync(times = 6) {
  for (let i = 0; i < times; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

module.exports = { loadBackground, loadPopup, flushAsync };
