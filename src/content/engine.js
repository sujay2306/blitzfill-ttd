/*
 * BlitzFill fill engine. Runs in the page's MAIN world so it can reach the
 * React props attached to DOM nodes. It only writes values: it never
 * submits forms, never clicks Continue/Pay and never touches CAPTCHA/OTP.
 *
 * Protocol: document CustomEvent "blitzfill:req" with a JSON string detail
 * {id, cmd, payload}; replies with "blitzfill:res" {id, result}.
 */
(function () {
  'use strict';
  // The service worker sets a fresh token before re-injecting after an
  // install/update, so a newer engine always replaces an older one. The
  // manifest injection on a normal page load has no token and no prior.
  const token = window.__blitzfillToken;
  try { delete window.__blitzfillToken; } catch (_) { /* non-configurable */ }
  const ENGINE_VERSION = typeof token === 'string' ? token : 'boot';
  const prior = window.__blitzfillEngine;
  if (prior && !token) return;
  if (prior && typeof prior.stop === 'function') prior.stop();

  const C = globalThis.BlitzFillCore;
  if (!C) return;
  const REQ = 'blitzfill:req';
  const RES = 'blitzfill:res';
  const COMMIT_CAP = 60;   // ms to wait for React to re-render after a write
  const BLUR_CAP = 25;
  const OPTIONS_CAP = 1500;
  const ENABLE_CAP = 1500;
  const OPTION_SEL = '[class*="floatingDropdown_listItem"],[class*="dropdown_scroll"] li,' +
    'ul[style*="list-style-type: none"] li,[role="option"]';
  const POPUP_SEL = '[class*="passportVisaPopup"],[role="dialog"],[class*="modal"]';

  // Capture natives up-front so page patches cannot interfere later.
  const now = performance.now.bind(performance);
  const inputValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  const textareaValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
  const selectValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
  const vis = C.isVisible;

  /* ------------------------------------------------ macrotask clock
   * MessageChannel tasks are not throttled in background tabs the way
   * rAF and setTimeout are, and they interleave with React's scheduler. */
  const channel = new MessageChannel();
  let queue = [];
  channel.port1.onmessage = () => {
    const run = queue;
    queue = [];
    for (let i = 0; i < run.length; i++) run[i]();
  };
  const tick = () => new Promise((r) => {
    queue.push(r);
    if (queue.length === 1) channel.port2.postMessage(0);
  });

  async function until(pred, cap) {
    const t0 = now();
    for (;;) {
      const v = pred();
      if (v) return v;
      if (now() - t0 >= cap) return null;
      await tick();
    }
  }

  /** Resolve when pred() is truthy, re-checking on DOM mutations. */
  function observe(pred, cap, target) {
    const first = pred();
    if (first) return Promise.resolve(first);
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => {
        if (done) return;
        done = true;
        mo.disconnect();
        clearTimeout(timer);
        resolve(v);
      };
      const mo = new MutationObserver(() => { const v = pred(); if (v) finish(v); });
      mo.observe(target || document.body || document.documentElement, {
        childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'disabled', 'hidden']
      });
      const timer = setTimeout(() => finish(pred() || null), cap);
    });
  }

  /* -------------------------------------------------------- React */

  let propsKey = null;
  function propsOf(el) {
    if (!el) return null;
    if (propsKey && el[propsKey]) return el[propsKey];
    // cache miss: another React root (different hash) or a non-React node
    const keys = Object.keys(el);
    for (let i = 0; i < keys.length; i++) {
      if (keys[i].startsWith('__reactProps$')) { propsKey = keys[i]; return el[propsKey]; }
    }
    return null;
  }

  function fakeEvent(target, type, current) {
    let native;
    try {
      const Ctor = (type === 'blur' || type === 'focus') ? FocusEvent
        : (type === 'click' || type.startsWith('mouse')) ? MouseEvent : Event;
      native = new Ctor(type, { bubbles: true, cancelable: true });
    } catch (_) {
      native = new Event(type);
    }
    const nativeEvent = new Proxy(native, {
      get(t, p) {
        if (p === 'isTrusted') return true;
        if (p === 'target' || p === 'srcElement') return target;
        const v = Reflect.get(t, p, t);
        return typeof v === 'function' ? v.bind(t) : v;
      }
    });
    let prevented = false;
    let stopped = false;
    return {
      type, target, currentTarget: current || target, nativeEvent,
      isTrusted: true, bubbles: true, cancelable: true, eventPhase: 3,
      timeStamp: now(), defaultPrevented: false,
      preventDefault() { prevented = true; this.defaultPrevented = true; },
      isDefaultPrevented: () => prevented,
      stopPropagation() { stopped = true; },
      isPropagationStopped: () => stopped,
      persist() {}
    };
  }

  function setNative(el, v) {
    if (el instanceof HTMLSelectElement) selectValue.call(el, v);
    else if (el instanceof HTMLTextAreaElement) textareaValue.call(el, v);
    else inputValue.call(el, v);
  }

  /** Wait until React re-rendered `el` (props identity changed). */
  function committed(get, before, cap) {
    return until(() => {
      const el = get();
      return !el || !el.isConnected || propsOf(el) !== before;
    }, cap);
  }

  /** Write a value; resolves after React has committed it. */
  async function write(get, value) {
    const el = get();
    if (!el) return false;
    const p = propsOf(el);
    const prev = el.value;
    if (p && typeof p.onChange === 'function') {
      setNative(el, value);
      try { p.onChange(fakeEvent(el, 'change')); } catch (_) { return false; }
      await committed(get, p, COMMIT_CAP);
      return true;
    }
    setNative(el, value);
    const tracker = el._valueTracker;
    if (tracker && typeof tracker.setValue === 'function') tracker.setValue(prev);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  async function blur(get) {
    const el = get();
    if (!el) return;
    const p = propsOf(el);
    if (p && typeof p.onBlur === 'function') {
      try { p.onBlur(fakeEvent(el, 'blur')); } catch (_) { /* validator threw */ }
      await committed(get, p, BLUR_CAP);
      return;
    }
    if (!p) {
      el.dispatchEvent(new FocusEvent('blur'));
      el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    }
  }

  /** Call a React handler on el or one of its first `depth` ancestors. */
  function activate(el, handlers, depth, target) {
    let n = el;
    for (let d = 0; n && d <= depth; d++, n = n.parentElement) {
      const p = propsOf(n);
      if (!p) continue;
      for (const h of handlers) {
        if (typeof p[h] === 'function') {
          const type = h === 'onClick' ? 'click' : h === 'onMouseDown' ? 'mousedown' : 'focus';
          try { p[h](fakeEvent(target || el, type, n)); return true; } catch (_) { return false; }
        }
      }
    }
    return false;
  }

  /* -------------------------------------------------- dropdowns */

  /** Options visible right now; hidden persistent lists stay pickable. */
  function visibleOptions() {
    return new Set(Array.prototype.filter.call(document.querySelectorAll(OPTION_SEL), vis));
  }

  function optionsNear(el, exclude) {
    const all = Array.prototype.filter.call(document.querySelectorAll(OPTION_SEL), (o) => !exclude.has(o) && vis(o));
    if (!all.length) return null;
    let n = el.parentElement;
    for (let d = 0; n && d < 6; d++, n = n.parentElement) {
      const near = all.filter((o) => n.contains(o));
      if (near.length) return near;
    }
    return all;
  }

  function matches(value, want, kind) {
    return !!value && C.matchOption(want, [value], kind) === 0;
  }

  /** What the user sees: option text for native selects, value otherwise. */
  function shown(el) {
    if (!el) return '';
    if (el.tagName === 'SELECT') {
      const o = el.selectedIndex >= 0 ? el.options[el.selectedIndex] : null;
      return o && el.selectedIndex > 0 ? o.text : (o && o.value ? o.text : '');
    }
    return el.value;
  }

  async function chooseNative(get, want, kind, cap) {
    const ready = await observe(() => { const e = get(); return e && e.options.length > 1 ? e : null; }, cap || 2000, get() && get().parentElement);
    if (!ready) return 'fail';
    const el = ready;
    const idx = C.matchOption(want, Array.prototype.map.call(el.options, (o) => o.text), kind);
    if (idx < 0) return 'fail';
    if (el.selectedIndex === idx) return 'same';
    const p = propsOf(el);
    const prev = el.value;
    el.selectedIndex = idx;
    if (p && typeof p.onChange === 'function') {
      try { p.onChange(fakeEvent(el, 'change')); } catch (_) { return 'fail'; }
      await committed(get, p, COMMIT_CAP);
    } else {
      const tracker = el._valueTracker;
      if (tracker && typeof tracker.setValue === 'function') tracker.setValue(prev);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return 'ok';
  }

  async function chooseCustom(get, want, kind) {
    const el = get();
    if (!el) return 'fail';
    if (matches(el.value, want, kind)) return 'same';
    const before = el.value;
    const stale = visibleOptions();
    if (!activate(el, ['onClick', 'onMouseDown'], 4) && !activate(el, ['onFocus'], 0)) {
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      el.click();
    }
    const opts = await observe(() => optionsNear(get() || el, stale), OPTIONS_CAP);
    if (!opts) return 'fail';
    const idx = C.matchOption(want, opts.map((o) => o.textContent), kind);
    if (idx < 0) {
      activate(get() || el, ['onClick', 'onMouseDown'], 4); // close it again
      return 'fail';
    }
    const opt = opts[idx];
    if (!activate(opt, ['onClick', 'onMouseDown'], 3)) {
      opt.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      opt.click();
    }
    const ok = await until(() => {
      const e = get();
      return e && e.value !== before && matches(e.value, want, kind);
    }, 600);
    return ok ? 'ok' : 'fail';
  }

  /** Wait (on DOM mutations, not polling) until get() is enabled. */
  function enabled(get, cap) {
    return observe(() => { const e = get(); return e && !e.disabled ? e : null; }, cap);
  }

  function isDropdown(el) {
    return el && (el.tagName === 'SELECT' || el.readOnly);
  }

  function choose(get, want, kind) {
    const el = get();
    if (!el) return Promise.resolve('fail');
    return el.tagName === 'SELECT' ? chooseNative(get, want, kind) : chooseCustom(get, want, kind);
  }

  /* -------------------------------------------- fill session */

  function Session(opts) {
    this.overwrite = !!opts.overwrite;
    this.filled = 0;
    this.failed = [];
    this.skipped = 0;
    this.review = [];
    this.intents = [];
    this.undo = [];
    this.okEls = new Set();
    this.badEls = new Set();
    this.dupes = 0;
    this.beat = opts.beat || (() => {});
  }

  Session.prototype.canWrite = function (el, value) {
    if (!el) return false;
    if (el.value === value) { this.okEls.add(el); return false; }
    if (el.value && !this.overwrite && !(el.tagName === 'SELECT' && el.selectedIndex <= 0)) { this.skipped++; return false; }
    return true;
  };

  Session.prototype.fail = function (label, el) {
    this.failed.push(label);
    if (el) this.badEls.add(el);
  };

  /** text field */
  Session.prototype.text = async function (get, value, label, opts) {
    if (value == null || value === '') return;
    const el = get();
    if (!el) { this.fail(label); return; }
    if (!this.canWrite(el, value)) return;
    this.undo.push({ get, prev: el.value, kind: 'text' });
    await write(get, value);
    this.intents.push({ get, value, label, kind: 'text', noBlur: opts && opts.noBlur });
    this.filled++;
  };

  /** dropdown (native select or custom read-only) */
  Session.prototype.pick = async function (get, value, kind, label) {
    if (!value) return;
    const el = get();
    if (!el) { this.fail(label); return; }
    if (el.value && !this.overwrite && !matches(shown(el), value, kind) &&
        !(el.tagName === 'SELECT' && el.selectedIndex <= 0)) { this.skipped++; return; }
    const prev = el.tagName === 'SELECT' ? el.selectedIndex : el.value;
    const r = await choose(get, value, kind);
    if (r === 'ok') {
      this.undo.push(el.tagName === 'SELECT' ? { get, prev, kind: 'select' } : { get, prev, kind: 'choice', choice: kind });
      this.intents.push({ get, value, label, kind });
      this.filled++;
    } else if (r === 'same') {
      this.okEls.add(get());
    } else {
      this.fail(label, get());
    }
  };

  /** Re-write anything a stale closure wiped out; blur once afterwards. */
  Session.prototype.reconcile = async function () {
    for (const it of this.intents) {
      const el = it.get();
      if (!el) { this.fail(it.label); continue; }
      const good = it.kind === 'text' ? el.value === it.value : matches(shown(el), it.value, it.kind);
      if (!good) {
        if (it.kind === 'text') await write(it.get, it.value);
        else await choose(it.get, it.value, it.kind);
        const e2 = it.get();
        const ok = e2 && (it.kind === 'text' ? e2.value === it.value : matches(shown(e2), it.value, it.kind));
        if (!ok) { this.fail(it.label, e2); continue; }
        if (it.kind === 'text' && !it.noBlur) await blur(it.get);
      }
      this.okEls.add(it.get());
    }
  };

  /* ---------------------------------------------- pilgrim rows */

  const ROW = {
    name: C.PILGRIM_NAME,
    age: ['input[name="age"]'],
    gender: ['[name="gender"]'],
    idType: ['[name="idType"]', '[name="photoIdType"]'],
    idNumber: ['input[name="idNumber"]', 'input[name="idProofNumber"]']
  };

  function isPassportPopup(box) {
    return !!box && (/passportVisaPopup/.test(box.className || '') || !!box.querySelector('[name="passportNumber"]'));
  }
  function notInPopup(el) {
    if (el.closest('[class*="passportVisaPopup"]')) return false;
    const box = el.closest('[role="dialog"],[class*="modal"]');
    return !isPassportPopup(box);
  }

  function globalNth(key, i) {
    for (const sel of ROW[key]) {
      const list = Array.prototype.filter.call(document.querySelectorAll(sel), (e) => vis(e) && notInPopup(e));
      if (list.length) return list[i] || null;
    }
    return null;
  }

  /**
   * Field `key` of row i. Fields are looked up inside the row container of
   * the i-th name input, so a prefilled row with fewer rendered inputs cannot
   * shift the others; global index is only the fallback without a container.
   */
  function rowGetter(key, i) {
    return () => {
      const nameEl = globalNth('name', i);
      if (key === 'name' || !nameEl) return nameEl;
      const scope = C.rowScope(nameEl);
      if (!scope) return globalNth(key, i);
      for (const sel of ROW[key]) {
        const el = scope.querySelector(sel);
        if (el && vis(el)) return el;
      }
      return null;
    };
  }

  async function passportPopup(s, p, n) {
    const pop = await observe(() => {
      const list = document.querySelectorAll(POPUP_SEL);
      for (const el of list) if (vis(el) && isPassportPopup(el)) return el;
      return null;
    }, 1200);
    if (!pop) return;
    const inPop = (name) => () => pop.isConnected ? pop.querySelector('[name="' + name + '"]') : null;
    const num = inPop('passportNumber');
    if (num()) await s.text(num, p.idNumber, 'passportNumber ' + n);
    if (p.passportCountry) {
      const c = inPop('country');
      if (c()) {
        if (isDropdown(c())) await s.pick(c, p.passportCountry, 'country', 'passport country ' + n);
        else await s.text(c, p.passportCountry, 'passport country ' + n);
      }
    }
    s.review.push({ row: n, what: 'passport' });
  }

  async function fillPilgrimRows(s, pilgrims) {
    const names = rowGetter('name', 0);
    const count = names() ? Array.prototype.filter.call(document.querySelectorAll(C.PILGRIM_NAME.join(',')), (e) => vis(e) && notInPopup(e)).length : 0;
    const rows = [];
    for (let i = 0; i < count; i++) {
      const el = rowGetter('name', i)();
      if (el && (s.overwrite || !el.value)) rows.push(i);
    }
    const todo = s.overwrite ? pilgrims : notOnPage(pilgrims, s);
    const n = Math.min(rows.length, todo.length);
    for (let k = 0; k < n; k++) {
      const i = rows[k];
      const p = todo[k];
      s.beat();
      const g = (key) => rowGetter(key, i);
      const label = (f) => f + ' ' + (i + 1);
      await s.text(g('name'), p.name, label('name'));
      await s.text(g('age'), String(p.age), label('age'), { noBlur: true });
      await blur(g('name'));
      await blur(g('age'));
      await s.pick(g('gender'), p.gender, 'gender', label('gender'));
      await s.pick(g('idType'), p.idType, 'idType', label('idType'));
      if (p.idType === 'Passport') await passportPopup(s, p, i + 1);
      const idGet = g('idNumber');
      const ready = await enabled(idGet, ENABLE_CAP);
      if (ready) {
        await s.text(idGet, p.idNumber, label('idNumber'));
        await blur(idGet);
      } else if (p.idNumber) {
        s.fail(label('idNumber'), idGet());
      }
    }
    return { rows: rows.length, used: n, dupes: pilgrims.length - todo.length };
  }

  /** Re-fills must not place someone who is already in a row on the page. */
  function notOnPage(pilgrims, s) {
    const present = C.presentPilgrims(document);
    const out = pilgrims.filter((p) => !C.isPresent(p, present));
    s.dupes = pilgrims.length - out.length;
    return out;
  }

  /* -------------------------------------------------- srivani */

  async function fillSrivani(s, pilgrims) {
    const q = (name) => () => document.querySelector('[name="' + name + '"]');
    const todo = s.overwrite ? pilgrims : notOnPage(pilgrims, s);
    let used = 0;
    let rows = 0;
    for (let i = 0; i < 9; i++) {
      const nameGet = q('fName' + i);
      const el = nameGet();
      if (!el || !vis(el)) continue;
      if (el.value && !s.overwrite) continue;
      rows++;
      if (used >= todo.length) continue;
      const p = todo[used++];
      s.beat();
      const label = (f) => f + ' ' + (i + 1);
      await s.text(nameGet, p.name, label('name'), { noBlur: true });
      await s.text(q('age' + i), String(p.age), label('age'), { noBlur: true });
      // validate name/age before the proof type exists (age vs passport checks)
      await blur(nameGet);
      await blur(q('age' + i));
      await s.pick(q('gender' + i), p.gender, 'gender', label('gender'));
      await s.pick(q('proofS' + i), p.idType, 'idType', label('idType'));
      const idGet = q('proofId' + i);
      if (await enabled(idGet, ENABLE_CAP)) await s.text(idGet, p.idNumber, label('idNumber'));
      else s.fail(label('idNumber'), idGet());
      await blur(idGet);
    }
    return { rows, used };
  }

  /* -------------------------------------------------- contact */

  const CONTACT = [
    ['email', ['pilgrimEmail', 'emailId', 'email']],
    ['mobile', ['pilgrimMobile', 'mobileNo', 'mobileNumber', 'mobile']],
    ['country', ['pilgrimCountry', 'country']],
    ['state', ['pilgrimState', 'state']],
    ['city', ['pilgrimCity', 'city']],
    ['pincode', ['pilgrimPincode', 'pincode']],
    ['gothram', ['gothram', 'gotram', 'gotra', 'gothra', 'gothramName', 'pilgrimGothram']]
  ];

  function lastByName(names) {
    return () => {
      for (const n of names) {
        const list = Array.prototype.filter.call(document.querySelectorAll('[name="' + n + '"]'), (e) => vis(e) && notInPopup(e));
        if (list.length) return list[list.length - 1];
      }
      return null;
    };
  }

  function isAutocomplete(el) {
    return el.getAttribute('aria-autocomplete') || el.getAttribute('role') === 'combobox' || el.getAttribute('list');
  }

  async function fillContact(s, c, getters) {
    if (!c) return;
    for (const [key, names] of CONTACT) {
      let value = c[key];
      if (!value) continue;
      if (key === 'mobile') value = C.cleanMobile(value);
      const get = (getters && getters[key]) || lastByName(names);
      const el = get();
      if (!el) continue; // contact fields are optional on most pages
      const label = 'contact ' + key;
      if (isDropdown(el)) {
        await s.pick(get, value, key === 'state' || key === 'country' ? key : undefined, label);
      } else {
        if (key === 'state' || key === 'country') value = C.canonical(value, key);
        await s.text(get, value, label);
        if (key === 'gothram' && isAutocomplete(el)) {
          const stale = visibleOptions();
          const opts = await observe(() => optionsNear(get() || el, stale), 300);
          if (opts) {
            const exact = opts.find((o) => C.norm(o.textContent) === C.norm(value));
            if (exact && !activate(exact, ['onClick', 'onMouseDown'], 3)) exact.click();
          }
        }
        await blur(get);
      }
    }
  }

  /* -------------------------------------------------- generic */

  async function fillGeneric(s, pilgrims, contact) {
    const fields = C.scanGeneric(document);
    const counters = {};
    const contactGetters = {};
    const getterFor = (el) => () => (el.isConnected ? el : null);
    let maxRow = -1;
    for (const f of fields) {
      const n = counters[f.key] = (counters[f.key] || 0) + 1;
      if (['name', 'age', 'gender', 'idType', 'idNumber'].includes(f.key)) {
        const p = pilgrims[n - 1];
        if (!p) continue;
        maxRow = Math.max(maxRow, n - 1);
        const get = getterFor(f.el);
        const label = f.key + ' ' + n;
        if (f.key === 'gender' || f.key === 'idType') {
          if (isDropdown(f.el)) await s.pick(get, p[f.key], f.key, label);
        } else if (f.key === 'idNumber') {
          if (await enabled(get, ENABLE_CAP)) await s.text(get, p.idNumber, label);
        } else {
          await s.text(get, String(p[f.key]), label);
        }
      } else if (n === 1) {
        contactGetters[f.key] = getterFor(f.el);
      }
    }
    await fillContact(s, contact, contactGetters);
    return { rows: counters.name || 0, used: maxRow + 1 };
  }

  /* ------------------------------------------------ highlights */

  const marked = new Map();
  function mark(el, ok) {
    if (!el || !el.style) return;
    if (!marked.has(el)) marked.set(el, [el.style.outline, el.style.boxShadow, el.style.transition]);
    el.style.transition = 'outline-color .5s ease, box-shadow .5s ease';
    el.style.outline = ok ? '2px solid #16a34a' : '2px solid #dc2626';
    el.style.boxShadow = ok ? '0 0 0 4px rgba(22,163,74,.22)' : '0 0 0 4px rgba(220,38,38,.22)';
    if (ok) setTimeout(() => unmark(el), 1600);
    else el.addEventListener('input', () => unmark(el), { once: true });
  }
  function unmark(el) {
    const prev = marked.get(el);
    if (!prev) return;
    marked.delete(el);
    el.style.outline = prev[0];
    el.style.boxShadow = prev[1];
    el.style.transition = prev[2];
  }
  function requiredBlanks() {
    const out = [];
    const list = document.querySelectorAll('input[required],select[required],textarea[required],[aria-required="true"]');
    for (const el of list) if (!el.value && !el.disabled && vis(el)) out.push(el);
    return out;
  }

  /* ---------------------------------------------------- commands */

  let lastUndo = [];
  let running = false;

  async function fill(payload) {
    if (running) return { ok: false, error: 'busy' };
    running = true;
    const t0 = now();
    try {
      const pilgrims = Array.isArray(payload.pilgrims) ? payload.pilgrims : [];
      const s = new Session({ overwrite: payload.overwrite, beat: payload.beat });
      const d = C.detectForm(document);
      if (!d) return { ok: false, error: 'noForm', ms: Math.round(now() - t0) };
      let rows;
      if (d.type === 'srivani') rows = await fillSrivani(s, pilgrims);
      else if (d.type === 'pilgrim') {
        rows = await fillPilgrimRows(s, pilgrims);
        await fillContact(s, payload.contact);
      } else rows = await fillGeneric(s, pilgrims, payload.contact);
      await s.reconcile();
      const ms = Math.round(now() - t0);
      lastUndo = s.undo;
      for (const el of s.okEls) if (!s.badEls.has(el)) mark(el, true);
      for (const el of s.badEls) mark(el, false);
      const blanks = requiredBlanks();
      for (const el of blanks) mark(el, false);
      return {
        ok: true, form: d.type, ms, filled: s.filled, skipped: s.skipped,
        failed: s.failed, review: s.review, blanks: blanks.length,
        rows: rows.rows, used: rows.used, dupes: s.dupes,
        leftover: Math.max(0, pilgrims.length - s.dupes - rows.used)
      };
    } finally {
      running = false;
    }
  }

  async function undo() {
    if (running) return { ok: false, error: 'busy' };
    running = true;
    try {
      const log = lastUndo;
      lastUndo = [];
      let restored = 0;
      let skipped = 0;
      for (let i = log.length - 1; i >= 0; i--) {
        const u = log[i];
        const el = u.get();
        if (!el) continue;
        try {
          if (u.kind === 'select') {
            const p = propsOf(el);
            el.selectedIndex = u.prev;
            if (p && typeof p.onChange === 'function') { p.onChange(fakeEvent(el, 'change')); await committed(u.get, p, COMMIT_CAP); }
            else el.dispatchEvent(new Event('change', { bubbles: true }));
          } else if (u.kind === 'choice') {
            // a read-only dropdown can only be moved to another option, never emptied
            if (!u.prev || (await choose(u.get, u.prev, u.choice)) === 'fail') { skipped++; continue; }
          } else {
            await write(u.get, u.prev);
          }
        } catch (_) {
          skipped++;
          continue;
        }
        unmark(el);
        restored++;
      }
      return { ok: true, restored, skipped };
    } finally {
      running = false;
    }
  }

  async function onRequest(e) {
    let msg;
    try { msg = JSON.parse(e.detail); } catch (_) { return; }
    if (!msg || typeof msg.id !== 'string') return;
    let result;
    try {
      if (msg.cmd === 'ping') result = { ok: true, v: ENGINE_VERSION };
      else if (msg.cmd === 'fill') {
        const payload = msg.payload || {};
        // heartbeat per row so the bridge can tell "slow" from "gone"
        payload.beat = () => document.dispatchEvent(new CustomEvent(RES, { detail: JSON.stringify({ id: msg.id, beat: true }) }));
        result = await fill(payload);
      }
      else if (msg.cmd === 'undo') result = await undo();
      else result = { ok: false, error: 'unknownCommand' };
    } catch (err) {
      result = { ok: false, error: 'exception', detail: String(err && err.message || err) };
    }
    document.dispatchEvent(new CustomEvent(RES, { detail: JSON.stringify({ id: msg.id, result }) }));
  }

  document.addEventListener(REQ, onRequest);
  Object.defineProperty(window, '__blitzfillEngine', {
    configurable: true,
    value: { v: ENGINE_VERSION, stop: () => document.removeEventListener(REQ, onRequest) }
  });
})();
