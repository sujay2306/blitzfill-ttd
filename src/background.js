/* BlitzFill service worker: keyboard shortcut + injection into tabs that
 * were already open when the extension was installed or updated. */
'use strict';

const TTD_TABS = ['https://ttdevasthanams.ap.gov.in/*', 'https://tirupatibalaji.ap.gov.in/*'];
const MAIN_FILES = ['src/lib/core.js', 'src/content/engine.js'];
const ISOLATED_FILES = ['src/lib/core.js', 'src/lib/i18n.js', 'src/content/bridge.js'];

function send(tabId, msg) {
  return chrome.tabs.sendMessage(tabId, msg).catch(() => null);
}

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'fill') return;
  let id = tab && tab.id;
  if (id == null) {
    const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    id = active && active.id;
  }
  if (id != null) send(id, { type: 'fill', source: 'shortcut' });
});

chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({ url: TTD_TABS });
  await Promise.all(tabs.map(async (t) => {
    if (t.discarded || t.id == null) return;
    try {
      // fresh token: tells an older engine already in the page to step aside
      const token = chrome.runtime.getManifest().version + ':' + Date.now();
      await chrome.scripting.executeScript({
        target: { tabId: t.id }, world: 'MAIN', args: [token],
        func: (v) => { window.__blitzfillToken = v; }
      });
      await chrome.scripting.executeScript({ target: { tabId: t.id }, files: MAIN_FILES, world: 'MAIN' });
      await chrome.scripting.executeScript({ target: { tabId: t.id }, files: ISOLATED_FILES });
    } catch (_) {
      /* tab is loading, crashed or on an error page; the manifest injects on next load */
    }
  }));
});
