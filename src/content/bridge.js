/*
 * BlitzFill bridge (isolated world): storage, messaging, floating button,
 * optional auto-fill. Idle cost: one MutationObserver whose callback only
 * arms a timer; detection runs at most every DETECT_MS.
 */
(function () {
  'use strict';
  const prior = globalThis.__blitzfillBridge;
  if (prior && typeof prior.stop === 'function') prior.stop();

  const C = globalThis.BlitzFillCore;
  const I = globalThis.BlitzFillI18n;
  const REQ = 'blitzfill:req';
  const RES = 'blitzfill:res';
  const DETECT_MS = 300;
  const KEY = 'sf';

  let data = C.defaults();
  let detectTimer = 0;
  let last = null;
  let autoKey = '';
  let triedKey = '';
  let busy = false;
  let host = null;
  let ui = null;
  let stopped = false;

  const lang = () => data.settings.lang;
  const selected = () => data.pilgrims.filter((p) => p.selected);

  function alive() {
    try { return !!(chrome.runtime && chrome.runtime.id); } catch (_) { return false; }
  }

  async function load() {
    try {
      const r = await chrome.storage.local.get(KEY);
      data = C.migrate(r[KEY]);
    } catch (_) { /* orphaned after an update */ }
    return data;
  }

  /* ------------------------------------------------ engine RPC */

  /**
   * Request/response over DOM events. `idle` is the longest silence allowed:
   * the engine sends a heartbeat per row, which re-arms the timer, so long
   * fills never time out while they are making progress.
   */
  function call(cmd, payload, idle, timeoutError) {
    return new Promise((resolve) => {
      const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      let timer = 0;
      const arm = () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          document.removeEventListener(RES, onRes);
          resolve({ ok: false, error: timeoutError || 'timeout' });
        }, idle);
      };
      const onRes = (e) => {
        let m;
        try { m = JSON.parse(e.detail); } catch (_) { return; }
        if (!m || m.id !== id) return;
        if (m.beat) { arm(); return; }
        document.removeEventListener(RES, onRes);
        clearTimeout(timer);
        resolve(m.result);
      };
      document.addEventListener(RES, onRes);
      arm();
      document.dispatchEvent(new CustomEvent(REQ, { detail: JSON.stringify({ id, cmd, payload }) }));
    });
  }

  async function exclusive(task) {
    if (busy) return { ok: false, error: 'busy' };
    busy = true;
    setBusy(true);
    try {
      return await task();
    } finally {
      busy = false;
      setBusy(false);
      schedule();
    }
  }

  function fill() {
    return exclusive(async () => {
      await load();
      const chosen = selected();
      const contact = data.contact;
      const hasContact = Object.keys(contact).some((k) => k !== 'country' && contact[k]);
      if (!chosen.length && !hasContact) return report({ ok: false, error: 'noData' });
      // only the pilgrims that will actually be placed leave this world
      const pilgrims = C.placeable(chosen, C.detectForm(document), data.settings.overwrite, document).map((p) => ({
        name: p.name, age: p.age, gender: p.gender, idType: p.idType,
        idNumber: p.idNumber, passportCountry: p.passportCountry || ''
      }));
      const ping = await call('ping', null, 1000, 'noTab');
      if (!ping || !ping.ok) return report({ ok: false, error: 'noTab' });
      return report(await call('fill', { pilgrims, contact, overwrite: data.settings.overwrite }, 10000));
    });
  }

  function undo() {
    return exclusive(async () => report(await call('undo', null, 10000)));
  }

  function report(r) {
    toast(I.summarize(lang(), r));
    return r;
  }

  /* ------------------------------------------------ floating UI */

  const CSS = `
:host{all:initial}
.wrap{position:fixed;right:20px;bottom:20px;z-index:2147483647;display:flex;flex-direction:column;align-items:flex-end;gap:8px;
font:600 14px/1.2 system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans",sans-serif}
button{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:8px;padding:11px 16px;border-radius:999px;color:#fff;
background:linear-gradient(135deg,#ff9a1f,#f2630a);box-shadow:0 8px 24px rgba(242,99,10,.35),0 1px 0 rgba(255,255,255,.3) inset;
transition:transform .15s ease,box-shadow .15s ease}
button:hover{transform:translateY(-1px);box-shadow:0 12px 28px rgba(242,99,10,.42)}
button:focus-visible{outline:3px solid #1d4ed8;outline-offset:2px}
button[aria-busy=true]{opacity:.75;cursor:progress}
.bolt{width:16px;height:16px}
.toast{max-width:300px;padding:10px 14px;border-radius:12px;background:#111827;color:#f9fafb;font-weight:500;font-size:13px;
box-shadow:0 10px 30px rgba(0,0,0,.25);border-left:4px solid #16a34a;opacity:0;transform:translateY(6px);transition:opacity .2s,transform .2s}
.toast.show{opacity:1;transform:none}
.toast.warn{border-left-color:#f59e0b}.toast.bad{border-left-color:#dc2626}
.toast small{display:block;margin-top:3px;color:#d1d5db;font-weight:400}
@media (prefers-reduced-motion:reduce){button,.toast{transition:none}}`;

  function ensureUI() {
    if (host) return;
    host = document.createElement('blitzfill-fab');
    const shadow = host.attachShadow({ mode: 'closed' });
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(CSS); // constructable sheet: unaffected by page CSP
    shadow.adoptedStyleSheets = [sheet];
    const wrap = document.createElement('div');
    wrap.className = 'wrap';
    const toastEl = document.createElement('div');
    toastEl.className = 'toast';
    toastEl.setAttribute('role', 'status');
    toastEl.setAttribute('aria-live', 'polite');
    const btn = document.createElement('button');
    btn.type = 'button';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'bolt');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M13.5 2 4 13.5h6.5L9.5 22 20 10h-6.6z');
    path.setAttribute('fill', 'currentColor');
    svg.appendChild(path);
    const label = document.createElement('span');
    btn.append(svg, label);
    btn.addEventListener('click', () => { fill(); });
    wrap.append(toastEl, btn);
    shadow.append(wrap);
    ui = { btn, label, toast: toastEl, timer: 0 };
    document.documentElement.appendChild(host);
  }

  function setBusy(b) {
    if (ui) ui.btn.setAttribute('aria-busy', String(b));
  }

  function toast(s) {
    ensureUI();
    const el = ui.toast;
    el.textContent = s.text;
    if (s.detail) {
      const small = document.createElement('small');
      small.textContent = s.detail;
      el.appendChild(small);
    }
    el.className = 'toast show ' + (s.tone || 'ok');
    clearTimeout(ui.timer);
    ui.timer = setTimeout(() => { el.className = 'toast'; }, s.tone === 'ok' ? 3500 : 6500);
    host.style.display = '';
  }

  function updateFab() {
    const show = !!last && data.settings.fab;
    if (!show) {
      if (host && !(ui && ui.toast.classList.contains('show'))) host.style.display = 'none';
      if (ui) ui.btn.hidden = true;
      return;
    }
    ensureUI();
    const n = last.empty ? Math.min(selected().length, last.empty) : selected().length;
    ui.label.textContent = I.t(lang(), 'fabFill', { n });
    ui.btn.title = I.t(lang(), 'fabTitle');
    ui.btn.hidden = false;
    host.style.display = '';
  }

  /* ------------------------------------------------ detection */

  function detect() {
    detectTimer = 0;
    if (stopped) return;
    if (!alive()) { stop(); return; }
    if (document.hidden) return; // re-run on visibilitychange
    last = document.querySelector('input,select') ? C.detectForm(document) : null;
    updateFab();
    if (!last) { autoKey = ''; triedKey = ''; return; } // form gone: next one may autofill
    if (data.settings.autofill && !busy && last.empty > 0 && selected().length) {
      const key = last.type + ':' + last.rows;
      if (key !== autoKey && key !== triedKey) {
        triedKey = key; // one attempt per form appearance, even if it fails
        fill().then((r) => { if (r && r.ok) autoKey = key; else if (r && r.error === 'busy') triedKey = ''; });
      }
    }
  }

  function onVisibility() {
    if (!document.hidden) schedule();
  }

  function schedule() {
    if (!detectTimer && !stopped) detectTimer = setTimeout(detect, DETECT_MS);
  }

  const observer = new MutationObserver(schedule);

  function onMessage(msg, _sender, sendResponse) {
    if (!msg || typeof msg.type !== 'string') return false;
    if (msg.type === 'status') {
      sendResponse({ ok: true, form: C.detectForm(document) });
      return false;
    }
    if (msg.type === 'fill') { fill().then(sendResponse); return true; }
    if (msg.type === 'undo') { undo().then(sendResponse); return true; }
    return false;
  }

  function onStorage(changes, area) {
    if (area !== 'local' || !changes[KEY]) return;
    data = C.migrate(changes[KEY].newValue);
    updateFab();
  }

  function stop() {
    stopped = true;
    observer.disconnect();
    clearTimeout(detectTimer);
    document.removeEventListener('visibilitychange', onVisibility);
    if (host) host.remove();
    try {
      chrome.runtime.onMessage.removeListener(onMessage);
      chrome.storage.onChanged.removeListener(onStorage);
    } catch (_) { /* context gone */ }
  }

  chrome.runtime.onMessage.addListener(onMessage);
  chrome.storage.onChanged.addListener(onStorage);
  document.addEventListener('visibilitychange', onVisibility);
  globalThis.__blitzfillBridge = { stop };
  load().then(() => {
    if (stopped) return;
    observer.observe(document.documentElement, { childList: true, subtree: true });
    detect();
  });
})();
