/* BlitzFill service worker: keyboard shortcut + injection into tabs that
 * were already open when the extension was installed or updated. */
'use strict';

const TTD_TABS = ['https://ttdevasthanams.ap.gov.in/*', 'https://tirupatibalaji.ap.gov.in/*'];
const MAIN_FILES = ['src/lib/core.js', 'src/content/engine.js'];
const ISOLATED_FILES = ['src/lib/core.js', 'src/lib/i18n.js', 'src/content/bridge.js'];

function send(tabId, msg) {
  return chrome.tabs.sendMessage(tabId, msg).catch(() => null);
}

/** Adds the bundled scripts to a TTD tab that has none (opened before install
 * or orphaned by an update), so the user never has to reload and lose a queue spot. */
async function inject(tabId) {
  // fresh token: tells an older engine already in the page to step aside
  const token = chrome.runtime.getManifest().version + ':' + Date.now();
  await chrome.scripting.executeScript({
    target: { tabId }, world: 'MAIN', args: [token],
    func: (v) => { window.__blitzfillToken = v; }
  });
  await chrome.scripting.executeScript({ target: { tabId }, files: MAIN_FILES, world: 'MAIN' });
  await chrome.scripting.executeScript({ target: { tabId }, files: ISOLATED_FILES });
}

/** Sends a message, injecting once and retrying if nothing is listening. */
async function sendOrInject(tabId, msg) {
  const r = await send(tabId, msg);
  if (r) return r;
  try { await inject(tabId); } catch (_) { return null; }
  return send(tabId, msg);
}

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'fill') return;
  let id = tab && tab.id;
  if (id == null) {
    const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    id = active && active.id;
  }
  if (id != null) sendOrInject(id, { type: 'fill', source: 'shortcut' });
});

chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({ url: TTD_TABS });
  await Promise.all(tabs.map(async (t) => {
    if (t.discarded || t.id == null) return;
    try {
      await inject(t.id);
    } catch (_) {
      /* tab is loading, crashed or on an error page; the manifest injects on next load */
    }
  }));
});

// The popup asks for injection when a TTD tab has no content scripts yet.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'inject' || sender.id !== chrome.runtime.id || typeof msg.tabId !== 'number') return false;
  inject(msg.tabId).then(() => sendResponse({ ok: true }), () => sendResponse({ ok: false }));
  return true;
});
