/*
 * BlitzFill popup controller.
 *
 * Startup: one Promise.all([storage.get, tabs.query]) -> one synchronous
 * render -> async status probe. All state lives in `S`; the whole data
 * object is saved under the single storage key 'sf' (the content script
 * reacts to storage.onChanged).
 */
(function () {
  'use strict';

  const C = globalThis.BlitzFillCore;
  const I = globalThis.BlitzFillI18n;
  const KEY = 'sf';
  const LANG = 'en';
  const LS_TAB = 'blitzfill.tab';
  const TABS = ['pilgrims', 'contact', 'settings'];
  const MAX_PILGRIMS = 50;

  /*
   * Popup-specific labels (title-case buttons, paste-list strings). Anything
   * not listed here comes from BlitzFillI18n. Candidates to move into i18n.js.
   */
  const UI = {
    fillPage: 'Fill This Page',
    addPilgrim: 'Add Pilgrim',
    editPilgrim: 'Edit Pilgrim',
    pasteList: 'Paste List',
    saveAddAnother: 'Save & Add Another',
    exportData: 'Export JSON',
    importData: 'Import JSON',
    clearAll: 'Clear All Data',
    confirmClear: 'Erase all pilgrims and contact details?',
    eraseAll: 'Erase',
    confirmDelName: 'Delete {name}?',
    statusProbe: 'Checking…',
    name: 'Name',
    idType: 'ID Type',
    idNumber: 'ID Number',
    passportCountry: 'Passport Country',
    pincode: 'PIN Code',
    namePlaceholder: 'As printed on the ID',
    emptyPilgrims: 'No pilgrims saved yet. Add them one at a time, or paste a whole list.',
    addedName: 'Added {name}',
    pasteHelp: 'One pilgrim per line: Name, Age, M/F/T, Aadhaar or passport number. Comma or tab separated, so rows copied from a spreadsheet work.',
    pastePlaceholder: 'Ravi Kumar, 34, M, 1234 5678 9012\nAsha Rao, 31, F, 1234 5678 9012',
    pasteReady: '{n} ready',
    pasteBad: '{n} with errors',
    pasteAdd: 'Add {n} Pilgrims',
    pasteAddOne: 'Add 1 Pilgrim',
    pasteAdded: 'Added {n}. Lines with errors are left below.',
    pasteAddedAll: 'Added {n} pilgrims',
    pasteLine: 'Line {n}',
    pasteCols: 'Expected Name, Age, Gender, ID number',
    pasteGender: 'Gender must be M, F or T',
    pasteDup: 'Already saved',
    pasteFull: 'No room: up to 50 pilgrims can be saved'
  };

  const COUNTRIES = [
    'India', 'United States', 'United Kingdom', 'Canada', 'Australia', 'New Zealand',
    'United Arab Emirates', 'Saudi Arabia', 'Qatar', 'Kuwait', 'Oman', 'Bahrain',
    'Singapore', 'Malaysia', 'Sri Lanka', 'Nepal', 'Bangladesh', 'Mauritius',
    'South Africa', 'Germany', 'France', 'Netherlands', 'Ireland', 'Switzerland',
    'Italy', 'Japan', 'Hong Kong', 'Fiji', 'Trinidad and Tobago', 'Guyana'
  ];
  const STATES = [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa',
    'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala',
    'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland',
    'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
    'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
    'Andaman and Nicobar Islands', 'Chandigarh',
    'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir',
    'Ladakh', 'Lakshadweep', 'Puducherry'
  ];

  const svg = (d, w) => '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="' + d +
    '" fill="none" stroke="currentColor" stroke-width="' + (w || 1.6) + '" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ICON = {
    check: svg('M3.5 8.5 6.5 11.5 12.5 4.5', 2.2),
    up: svg('M4 10l4-4 4 4'),
    down: svg('M4 6l4 4 4-4'),
    edit: svg('M10.5 2.5l3 3L6 13H3v-3z'),
    del: svg('M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5')
  };

  /* ------------------------------------------------------------ state */

  const S = {
    data: C.defaults(),
    tab: null,              // active chrome tab
    status: 'probe',        // probe | form | ttd | reload | off
    form: null,             // {type, rows, empty} from the content script
    busy: false,
    result: null,           // {text, tone, detail}
    view: 'pilgrims',
    editor: null,           // {kind:'form', id, draft, touched, note} | {kind:'paste', text, note}
    confirmDel: null,       // pilgrim id awaiting delete confirmation
    confirmClear: false,
    contactTouched: new Set()
  };
  const timers = { save: 0, flash: 0, msg: 0 };

  /* ---------------------------------------------------------- helpers */

  const $ = (id) => document.getElementById(id);
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC[c]);
  const sel = (id) => '[data-id="' + CSS.escape(id) + '"]';

  function t(key, vars) {
    if (!(key in UI)) return I.t(LANG, key, vars);
    const s = UI[key];
    return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m)) : s;
  }

  function lsGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* storage blocked */ } }

  function blankDraft() {
    return { name: '', age: '', gender: 'Male', idType: 'Aadhaar', idNumber: '', passportCountry: '', selected: true };
  }
  const groupAadhaar = (digits) => digits.replace(/(\d{4})(?=\d)/g, '$1 ');

  /* -------------------------------------------------------- persistence */

  function writeNow() {
    clearTimeout(timers.save);
    timers.save = 0;
    return chrome.storage.local.set({ [KEY]: S.data });
  }
  function saveSoon(after) {
    clearTimeout(timers.save);
    timers.save = setTimeout(() => { writeNow().then(after, () => {}); }, 200);
  }
  function flush() { if (timers.save) writeNow(); }

  /* ------------------------------------------------------------ render */

  function renderStatic() {
    for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
    renderTabs();
  }

  function renderStatus() {
    const map = {
      probe: ['off', t('statusProbe')],
      form: ['ok', t('statusForm') + ' · ' + t('statusRows', { n: S.form ? S.form.rows : 0 })],
      ttd: ['ttd', t('statusTTD')],
      reload: ['warn', t('statusReload')],
      off: ['off', t('statusOff')]
    };
    const [cls, text] = map[S.status];
    const pill = $('status');
    pill.className = 'pill ' + cls;
    pill.title = text;
    $('status-text').textContent = text;
    renderHero();
  }

  function renderHero() {
    const n = S.data.pilgrims.filter((p) => p.selected).length;
    const fill = $('fill');
    $('fill-count').textContent = t('selected', { n });
    fill.disabled = S.busy || S.status === 'off';
    fill.setAttribute('aria-busy', String(S.busy));
    $('undo').disabled = S.busy || S.status === 'off' || S.status === 'reload';
    const r = $('result');
    if (!S.result) { r.textContent = ''; r.className = 'result'; return; }
    r.className = 'result tone-' + S.result.tone;
    r.innerHTML = esc(S.result.text) + (S.result.detail ? '<small>' + esc(S.result.detail) + '</small>' : '');
  }

  function renderTabs() {
    for (const name of TABS) {
      const on = name === S.view;
      const tab = $('tab-' + name);
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      $('panel-' + name).hidden = !on;
    }
  }

  function metaLine(p) {
    const last4 = String(p.idNumber || '').slice(-4);
    return [p.age, p.gender.charAt(0), t(p.idType) + (last4 ? ' ••' + last4 : '')].filter(Boolean).join(' · ');
  }

  function initial(name) {
    return (Array.from(String(name || '').trim())[0] || '?').toLocaleUpperCase();
  }

  function rowHTML(p, i, last) {
    if (S.confirmDel === p.id) {
      return '<li class="row confirm-row" data-id="' + esc(p.id) + '">' +
        '<span class="confirm-text">' + esc(t('confirmDelName', { name: p.name })) + '</span>' +
        '<span class="confirm-btns"><button type="button" class="btn-plain" data-act="del-cancel">' + esc(t('cancel')) +
        '</button><button type="button" class="btn-destructive" data-act="del-yes">' + esc(t('del')) + '</button></span></li>';
    }
    const btn = (act, label, icon, disabled, extra) => '<button type="button" class="icon-btn' + (extra || '') +
      '" data-act="' + act + '" aria-label="' + esc(label) + '" title="' + esc(label) + '"' +
      (disabled ? ' disabled' : '') + '>' + icon + '</button>';
    return '<li class="row prow' + (p.selected ? '' : ' off') + '" data-id="' + esc(p.id) + '">' +
      '<span class="check"><input type="checkbox" data-act="toggle"' + (p.selected ? ' checked' : '') +
        ' aria-label="' + esc(t('include') + ': ' + p.name) + '"><span class="box">' + ICON.check + '</span></span>' +
      '<span class="avatar" aria-hidden="true">' + esc(initial(p.name)) + '</span>' +
      '<span class="pinfo"><span class="pname">' + esc(p.name) + '</span>' +
        '<span class="pmeta">' + esc(metaLine(p)) + '</span></span>' +
      '<span class="pactions">' +
        btn('up', t('moveUp'), ICON.up, i === 0) +
        btn('down', t('moveDown'), ICON.down, last) +
        btn('edit', t('edit'), ICON.edit) +
        btn('del', t('del'), ICON.del, false, ' del') +
      '</span></li>';
  }

  function segHTML(name, values, current) {
    return '<div class="seg" role="radiogroup" aria-labelledby="pf-' + name + '-l">' +
      values.map((v) => '<label><input type="radio" name="pf-' + name + '" value="' + esc(v) + '"' +
        (v === current ? ' checked' : '') + '>' + esc(t(v)) + '</label>').join('') + '</div>';
  }

  function formHTML(ed) {
    const d = ed.draft;
    const adding = !ed.id;
    const idValue = d.idType === 'Aadhaar' ? groupAadhaar(C.cleanId('Aadhaar', d.idNumber)) : d.idNumber;
    return '<div class="editor-head"><h2 class="group-title">' + esc(t(adding ? 'addPilgrim' : 'editPilgrim')) +
        '</h2><span class="saved" id="pf-note" aria-live="polite">' + esc(ed.note || '') + '</span></div>' +
      '<form class="group" id="pform" novalidate autocomplete="off">' +
      '<div class="row field-row"><label for="pf-name">' + esc(t('name')) + '</label><div class="ctl">' +
        '<input id="pf-name" name="name" maxlength="60" autocapitalize="words" spellcheck="false" placeholder="' +
        esc(t('namePlaceholder')) + '" value="' + esc(d.name) + '" aria-describedby="pf-name-err">' +
        '<span class="err" id="pf-name-err"></span></div></div>' +
      '<div class="row field-row"><label for="pf-age">' + esc(t('age')) + '</label><div class="ctl">' +
        '<input id="pf-age" name="age" inputmode="numeric" maxlength="3" value="' + esc(d.age) +
        '" aria-describedby="pf-age-err" style="max-width:72px"><span class="err" id="pf-age-err"></span></div></div>' +
      '<div class="row field-row"><span class="label" id="pf-gender-l">' + esc(t('gender')) + '</span><div class="ctl">' +
        segHTML('gender', C.GENDERS, d.gender) + '<span class="err" id="pf-gender-err"></span></div></div>' +
      '<div class="row field-row"><span class="label" id="pf-idType-l">' + esc(t('idType')) + '</span><div class="ctl">' +
        segHTML('idType', C.ID_TYPES, d.idType) + '</div></div>' +
      '<div class="row field-row"><label for="pf-idNumber">' + esc(t('idNumber')) + '</label><div class="ctl">' +
        '<input id="pf-idNumber" name="idNumber" class="mono" spellcheck="false" value="' + esc(idValue) +
        '" aria-describedby="pf-idNumber-hint pf-idNumber-err">' +
        '<span class="hint" id="pf-idNumber-hint"></span><span class="err" id="pf-idNumber-err"></span></div></div>' +
      '<div class="row field-row" id="pf-pc-row"' + (d.idType === 'Passport' ? '' : ' hidden') + '>' +
        '<label for="pf-passportCountry">' + esc(t('passportCountry')) + '</label><div class="ctl">' +
        '<input id="pf-passportCountry" name="passportCountry" maxlength="60" list="dl-countries" value="' +
        esc(d.passportCountry || '') + '"></div></div>' +
      '<div class="row form-actions">' +
        '<button type="button" class="btn-plain grow" data-act="close">' + esc(t('cancel')) + '</button>' +
        (adding
          ? '<button type="button" class="btn-plain" data-act="save-close" id="pf-save2">' + esc(t('save')) + '</button>' +
            '<button type="submit" class="btn-tinted" id="pf-save">' + esc(t('saveAddAnother')) + '</button>'
          : '<button type="submit" class="btn-tinted" id="pf-save">' + esc(t('save')) + '</button>') +
      '</div></form>';
  }

  function pasteHTML(ed) {
    return '<div class="editor-head"><h2 class="group-title">' + esc(t('pasteList')) +
        '</h2><span class="saved" id="pl-note" aria-live="polite">' + esc(ed.note || '') + '</span></div>' +
      '<form class="group" id="plform" novalidate>' +
      '<p class="paste-help" id="pl-help">' + esc(t('pasteHelp')) + '</p>' +
      '<div class="paste-body"><textarea id="pl-text" spellcheck="false" aria-label="' + esc(t('pasteList')) +
        '" aria-describedby="pl-help pl-sum" placeholder="' + esc(t('pastePlaceholder')) + '">' + esc(ed.text) + '</textarea>' +
        '<p class="paste-sum" id="pl-sum" aria-live="polite"></p><ul class="paste-errs" id="pl-errs"></ul></div>' +
      '<div class="row form-actions">' +
        '<button type="button" class="btn-plain grow" data-act="close">' + esc(t('cancel')) + '</button>' +
        '<button type="submit" class="btn-tinted" id="pl-add" disabled>' + esc(t('pasteAddOne')) + '</button>' +
      '</div></form>';
  }

  function renderPilgrims() {
    const list = S.data.pilgrims;
    const ed = S.editor;
    $('pilgrim-list').innerHTML = list.map((p, i) => rowHTML(p, i, i === list.length - 1)).join('');
    $('pilgrim-empty').hidden = list.length > 0;
    $('pilgrim-editor').innerHTML = !ed ? '' : ed.kind === 'form' ? formHTML(ed) : pasteHTML(ed);
    $('pilgrim-editor').className = ed ? 'editor' : '';
    $('pilgrim-actions').hidden = !!ed;
    $('add-pilgrim').disabled = $('paste-list').disabled = list.length >= MAX_PILGRIMS;
    if (ed && ed.kind === 'form') syncForm();
    if (ed && ed.kind === 'paste') syncPaste();
    renderHero();
  }

  /** Update hints, errors and Save state in place, keeping focus while typing. */
  function syncForm() {
    const f = $('pform');
    if (!f) return;
    const ed = S.editor;
    const d = ed.draft;
    const errs = C.validatePilgrim(d);
    const pass = d.idType === 'Passport';
    const idIn = f.elements.idNumber;
    idIn.inputMode = pass ? 'text' : 'numeric';
    idIn.maxLength = pass ? 12 : 14;
    idIn.placeholder = pass ? 'A1234567' : '1234 5678 9012';
    idIn.setAttribute('autocapitalize', pass ? 'characters' : 'off');
    $('pf-pc-row').hidden = !pass;

    const digits = C.cleanId(d.idType, d.idNumber);
    const valid = !pass && !errs.idNumber;
    const hint = $('pf-idNumber-hint');
    hint.textContent = valid ? '✓ ' + t('checksumOk') : t(pass ? 'passportHint' : 'aadhaarHint');
    hint.className = 'hint' + (valid ? ' ok' : '');

    // Errors appear after a field is left; a full 12-digit Aadhaar is checked at once.
    const show = (k) => ed.touched.has(k) || (k === 'idNumber' && !pass && digits.length >= 12);
    for (const k of ['name', 'age', 'gender', 'idNumber']) {
      const msg = errs[k] && show(k) ? t(errs[k]) : '';
      $('pf-' + k + '-err').textContent = msg;
      const input = $('pf-' + k);
      if (input) input.setAttribute('aria-invalid', String(!!msg));
    }
    const invalid = Object.keys(errs).length > 0;
    $('pf-save').disabled = invalid;
    if ($('pf-save2')) $('pf-save2').disabled = invalid;
  }

  function renderContact() {
    const f = $('contact-form');
    for (const k of Object.keys(S.data.contact)) {
      const el = f.elements[k];
      if (el && el.value !== S.data.contact[k]) el.value = S.data.contact[k];
    }
    syncContactErrors();
  }

  function syncContactErrors() {
    const errs = C.validateContact(S.data.contact);
    for (const k of ['email', 'mobile', 'pincode']) {
      const msg = errs[k] && S.contactTouched.has(k) ? t(errs[k]) : '';
      $('c-' + k + '-err').textContent = msg;
      $('c-' + k).setAttribute('aria-invalid', String(!!msg));
    }
  }

  function renderSettings() {
    for (const el of document.querySelectorAll('[data-setting]')) el.checked = !!S.data.settings[el.dataset.setting];
    $('clear-row').hidden = S.confirmClear;
    $('clear-confirm').hidden = !S.confirmClear;
  }

  function renderAll() {
    renderStatic();
    renderStatus();
    renderPilgrims();
    renderContact();
    renderSettings();
  }

  /* -------------------------------------------------------- messaging */

  // Same steps as the service worker, done here so a stale worker can't block it.
  async function inject(tabId) {
    const token = chrome.runtime.getManifest().version + ':' + Date.now();
    await chrome.scripting.executeScript({
      target: { tabId }, world: 'MAIN', args: [token],
      func: (v) => { window.__blitzfillToken = v; }
    });
    await chrome.scripting.executeScript({ target: { tabId }, files: ['src/lib/core.js', 'src/content/engine.js'], world: 'MAIN' });
    await chrome.scripting.executeScript({ target: { tabId }, files: ['src/lib/core.js', 'src/lib/i18n.js', 'src/content/bridge.js'] });
  }

  function send(msg) {
    const tab = S.tab;
    if (!tab || tab.id == null) return Promise.resolve({ ok: false, error: 'notTTD', dead: true });
    const dead = () => ({ ok: false, error: C.isTTDUrl(tab.url) ? 'noTab' : 'notTTD', dead: true });
    const once = () => chrome.tabs.sendMessage(tab.id, msg).then((r) => r || { ok: false, error: 'noEngine' });
    // A TTD tab opened before install has no content scripts. Inject them
    // instead of asking for a reload, which would cost the user their queue spot.
    return once().catch(() => {
      if (!C.isTTDUrl(tab.url)) return dead();
      return inject(tab.id).then(once).catch((e) => {
        S.injectError = String((e && e.message) || e || '');
        return dead();
      });
    });
  }

  function probe() {
    return send({ type: 'status' }).then((r) => {
      if (r.dead) S.status = r.error === 'noTab' ? 'reload' : 'off';
      else if (r.ok && r.form) { S.status = 'form'; S.form = r.form; }
      else S.status = 'ttd';
      renderStatus();
    });
  }

  function run(type) {
    if (S.busy) return;
    flush();
    S.busy = true;
    S.result = null;
    renderHero();
    send({ type }).then((r) => {
      S.busy = false;
      S.result = I.summarize(LANG, r);
      if (r.dead && S.injectError) S.result.detail = S.injectError;
      if (r.dead) S.status = r.error === 'noTab' ? 'reload' : 'off';
      renderStatus();
      if (!r.dead) probe();
    });
  }

  /* -------------------------------------------------- pilgrim editor */

  function openForm(id) {
    const p = id ? S.data.pilgrims.find((x) => x.id === id) : null;
    S.confirmDel = null;
    S.editor = { kind: 'form', id: p ? p.id : null, draft: p ? Object.assign(blankDraft(), p) : blankDraft(), touched: new Set(), note: '' };
    renderPilgrims();
    focusEditor('pf-name');
  }

  function openPaste() {
    S.confirmDel = null;
    S.editor = { kind: 'paste', text: '', note: '' };
    renderPilgrims();
    focusEditor('pl-text');
  }

  function focusEditor(id) {
    const el = $(id);
    if (!el) return;
    el.focus();
    $('pilgrim-editor').scrollIntoView({ block: 'nearest' });
  }

  function closeEditor() {
    const id = S.editor && S.editor.kind === 'form' && S.editor.id;
    const kind = S.editor && S.editor.kind;
    S.editor = null;
    renderPilgrims();
    const target = id && document.querySelector('.prow' + sel(id) + ' [data-act="edit"]');
    (target || $(kind === 'paste' ? 'paste-list' : 'add-pilgrim')).focus();
  }

  function toPilgrim(d, id) {
    const p = {
      id: id || C.uid(),
      name: String(d.name).trim().replace(/\s+/g, ' '),
      age: String(d.age).trim(),
      gender: d.gender,
      idType: d.idType,
      idNumber: C.cleanId(d.idType, d.idNumber),
      selected: d.selected !== false
    };
    if (p.idType === 'Passport' && String(d.passportCountry || '').trim()) p.passportCountry = String(d.passportCountry).trim();
    return p;
  }

  /** again=true keeps the add form open with a fresh draft (the default add flow). */
  function commitForm(again) {
    const ed = S.editor;
    if (Object.keys(C.validatePilgrim(ed.draft)).length) {
      ['name', 'age', 'gender', 'idNumber'].forEach((k) => ed.touched.add(k));
      syncForm();
      return;
    }
    const p = toPilgrim(ed.draft, ed.id);
    const list = S.data.pilgrims;
    const i = list.findIndex((x) => x.id === p.id);
    if (i >= 0) list[i] = p; else list.push(p);
    writeNow();
    if (again && !ed.id && list.length < MAX_PILGRIMS) {
      S.editor = { kind: 'form', id: null, draft: blankDraft(), touched: new Set(), note: t('addedName', { name: p.name }) };
      renderPilgrims();
      focusEditor('pf-name');
      return;
    }
    S.editor = { kind: 'form', id: p.id };
    closeEditor();
  }

  function onEditorInput(e) {
    const el = e.target;
    const ed = S.editor;
    if (!ed) return;
    if (ed.kind === 'paste') { ed.text = el.value; ed.note = ''; syncPaste(); return; }
    const d = ed.draft;
    switch (el.name) {
      case 'pf-gender': d.gender = el.value; break;
      case 'pf-idType': {
        d.idType = el.value;
        if (el.value === 'Aadhaar') d.idNumber = C.cleanId('Aadhaar', d.idNumber).slice(0, 12);
        const box = $('pf-idNumber');
        box.value = el.value === 'Aadhaar' ? groupAadhaar(d.idNumber) : d.idNumber;
        break;
      }
      case 'age':
        el.value = el.value.replace(/\D/g, '').slice(0, 3);
        d.age = el.value;
        break;
      case 'idNumber':
        if (d.idType === 'Aadhaar') {
          // Live 4-4-4 grouping; preserve the caret by counting digits before it.
          const before = el.value.slice(0, el.selectionStart).replace(/\D/g, '').length;
          const digits = el.value.replace(/\D/g, '').slice(0, 12);
          const pretty = groupAadhaar(digits);
          if (pretty !== el.value) {
            el.value = pretty;
            let pos = 0;
            for (let seen = 0; pos < pretty.length && seen < before; pos++) if (/\d/.test(pretty[pos])) seen++;
            el.setSelectionRange(pos, pos);
          }
          d.idNumber = digits;
        } else {
          d.idNumber = el.value;
        }
        break;
      case 'name':
      case 'passportCountry':
        d[el.name] = el.value;
        break;
      default: return;
    }
    if (ed.note) { ed.note = ''; $('pf-note').textContent = ''; }
    syncForm();
  }

  function onEditorBlur(e) {
    const ed = S.editor;
    if (!ed || ed.kind !== 'form' || !e.target.name) return;
    const k = e.target.name.replace(/^pf-/, '');
    // Leaving an untouched empty field for another field in the form is not an error yet.
    if (ed.draft[k] === '' && !e.relatedTarget) return;
    ed.touched.add(k);
    syncForm();
  }

  /* ------------------------------------------------------- paste list */

  /** Parse pasted rows. Returns [{line, p?, errors[]}] for non-empty lines. */
  function parseList(text) {
    const out = [];
    const seen = new Set(S.data.pilgrims.map((p) => p.idType + ':' + p.idNumber));
    const lines = String(text).split(/\r?\n/);
    lines.forEach((raw, idx) => {
      const line = raw.trim();
      if (!line) return;
      const cols = (line.includes('\t') ? line.split('\t') : line.split(/[,;]/)).map((c) => c.trim());
      if (!out.length && /name/i.test(cols[0]) && /age/i.test(cols[1] || '')) return; // header row
      const item = { line: idx + 1, raw, errors: [] };
      out.push(item);
      if (cols.length < 4 || !cols[3]) { item.errors.push(t('pasteCols')); return; }
      const gender = C.canonical(cols[2], 'gender');
      const compact = cols[3].replace(/[\s-]/g, '');
      const d = {
        name: cols[0],
        age: cols[1].replace(/\s*(yrs?|years?)\.?$/i, ''),
        gender: C.GENDERS.includes(gender) ? gender : '',
        idType: /^\d+$/.test(compact) ? 'Aadhaar' : 'Passport',
        idNumber: compact,
        passportCountry: cols[4] || ''
      };
      if (!d.gender) item.errors.push(t('pasteGender'));
      const errs = C.validatePilgrim(d);
      for (const k of ['name', 'age', 'idNumber']) {
        if (errs[k]) item.errors.push((k === 'idNumber' ? t(d.idType) : t(k)) + ': ' + t(errs[k]));
      }
      const key = d.idType + ':' + C.cleanId(d.idType, d.idNumber);
      if (!item.errors.length && seen.has(key)) item.errors.push(t('pasteDup'));
      seen.add(key);
      if (!item.errors.length) item.p = d;
    });
    return out;
  }

  function syncPaste() {
    if (!$('plform')) return;
    const rows = parseList(S.editor.text);
    const ok = rows.filter((r) => r.p).length;
    const bad = rows.length - ok;
    const room = MAX_PILGRIMS - S.data.pilgrims.length;
    const parts = [];
    if (ok) parts.push(t('pasteReady', { n: ok }));
    if (bad) parts.push(t('pasteBad', { n: bad }));
    if (ok > room) parts.push(t('pasteFull'));
    const sum = $('pl-sum');
    sum.textContent = parts.join(' · ');
    sum.className = 'paste-sum' + (bad || ok > room ? ' tone-warn' : ok ? ' tone-ok' : '');
    $('pl-errs').innerHTML = rows.filter((r) => !r.p).map((r) =>
      '<li><b>' + esc(t('pasteLine', { n: r.line })) + ':</b> ' + esc(r.errors.join(' · ')) + '</li>').join('');
    const add = $('pl-add');
    const n = Math.min(ok, room);
    add.textContent = n === 1 ? t('pasteAddOne') : t('pasteAdd', { n });
    add.disabled = n < 1;
  }

  function commitPaste() {
    const ed = S.editor;
    const rows = parseList(ed.text);
    const room = MAX_PILGRIMS - S.data.pilgrims.length;
    const good = rows.filter((r) => r.p).slice(0, room);
    if (!good.length) return;
    for (const r of good) S.data.pilgrims.push(toPilgrim(r.p));
    writeNow();
    const added = new Set(good.map((r) => r.line));
    const left = String(ed.text).split(/\r?\n/).filter((l, i) => l.trim() && !added.has(i + 1));
    if (!left.length) {
      S.editor = null;
      S.result = { text: t('pasteAddedAll', { n: good.length }), tone: 'ok', detail: '' };
      renderPilgrims();
      $('paste-list').focus();
      return;
    }
    S.editor = { kind: 'paste', text: left.join('\n'), note: t('pasteAdded', { n: good.length }) };
    renderPilgrims();
    focusEditor('pl-text');
  }

  /* ----------------------------------------------------- list actions */

  function onPanelClick(e) {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'close') { closeEditor(); return; }
    if (act === 'save-close') { commitForm(false); return; }
    if (act === 'toggle') return; // handled on change
    const row = btn.closest('[data-id]');
    if (!row) return;
    const id = row.dataset.id;
    const list = S.data.pilgrims;
    const i = list.findIndex((p) => p.id === id);
    if (i < 0) return;
    const focusIn = (a) => { const el = document.querySelector(sel(id) + ' [data-act="' + a + '"]'); if (el && !el.disabled) { el.focus(); return true; } return false; };

    switch (act) {
      case 'edit': openForm(id); break;
      case 'up':
      case 'down': {
        const j = act === 'up' ? i - 1 : i + 1;
        if (j < 0 || j >= list.length) return;
        [list[i], list[j]] = [list[j], list[i]];
        writeNow();
        renderPilgrims();
        focusIn(act) || focusIn(act === 'up' ? 'down' : 'up');
        break;
      }
      case 'del':
        S.confirmDel = id;
        renderPilgrims();
        focusIn('del-cancel');
        break;
      case 'del-cancel':
        S.confirmDel = null;
        renderPilgrims();
        focusIn('del');
        break;
      case 'del-yes': {
        S.confirmDel = null;
        list.splice(i, 1);
        if (S.editor && S.editor.id === id) S.editor = null;
        writeNow();
        renderPilgrims();
        const next = list[Math.min(i, list.length - 1)];
        const target = next && document.querySelector(sel(next.id) + ' [data-act="edit"]');
        (target || $('add-pilgrim')).focus();
        break;
      }
    }
  }

  function onPanelChange(e) {
    const el = e.target;
    if (el.dataset.act === 'toggle') {
      const row = el.closest('[data-id]');
      const p = S.data.pilgrims.find((x) => x.id === row.dataset.id);
      if (!p) return;
      p.selected = el.checked;
      row.classList.toggle('off', !el.checked);
      writeNow();
      renderHero();
    } else if (el.type === 'radio') {
      onEditorInput(e);
    }
  }

  /* ---------------------------------------------------------- contact */

  function flashSaved() {
    const el = $('saved-flash');
    el.textContent = t('saved');
    clearTimeout(timers.flash);
    timers.flash = setTimeout(() => { el.textContent = ''; }, 1500);
  }

  function onContactInput(e) {
    const el = e.target;
    if (!(el.name in S.data.contact)) return;
    if (el.name === 'pincode') el.value = el.value.replace(/\D/g, '').slice(0, 6);
    if (el.name === 'mobile') el.value = el.value.replace(/[^\d+\s-]/g, '');
    S.data.contact[el.name] = el.value.trim();
    syncContactErrors();
    saveSoon(flashSaved);
  }

  /* --------------------------------------------------------- settings */

  function settingsMsg(text, tone) {
    const el = $('settings-msg');
    el.textContent = text;
    el.className = 'result tone-' + tone;
    clearTimeout(timers.msg);
    timers.msg = setTimeout(() => { el.textContent = ''; el.className = 'result'; }, 5000);
  }

  function exportData() {
    flush();
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const name = 'blitzfill-backup-' + d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + '.json';
    const url = URL.createObjectURL(new Blob([JSON.stringify(S.data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function importData(file) {
    if (!file) return;
    file.text().then((txt) => {
      const raw = JSON.parse(txt);
      if (!raw || typeof raw !== 'object' || Array.isArray(raw) ||
          !(Array.isArray(raw.pilgrims) || (raw.contact && typeof raw.contact === 'object'))) throw new Error('shape');
      const next = C.migrate(raw);
      if (Array.isArray(raw.pilgrims) && raw.pilgrims.length && !next.pilgrims.length) throw new Error('empty');
      S.data = next;
      S.editor = null;
      S.confirmDel = null;
      writeNow();
      renderAll();
      settingsMsg(t('imported', { n: next.pilgrims.length }), 'ok');
    }).catch(() => settingsMsg(t('importBad'), 'bad'));
  }

  function clearAll() {
    S.confirmClear = false;
    S.data = C.defaults();
    S.editor = null;
    S.confirmDel = null;
    S.result = null;
    S.contactTouched.clear();
    writeNow();
    renderAll();
    $('clear').focus();
    settingsMsg(t('cleared'), 'ok');
  }

  /* ------------------------------------------------------------- tabs */

  function selectTab(name, focus) {
    if (!TABS.includes(name)) return;
    S.view = name;
    lsSet(LS_TAB, name);
    renderTabs();
    if (focus) $('tab-' + name).focus();
  }

  /* ----------------------------------------------------------- wiring */

  function wire() {
    $('fill').addEventListener('click', () => run('fill'));
    $('undo').addEventListener('click', () => run('undo'));

    const tablist = document.querySelector('[role="tablist"]');
    tablist.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tab]');
      if (b) selectTab(b.dataset.tab);
    });
    tablist.addEventListener('keydown', (e) => {
      const i = TABS.indexOf(S.view);
      const map = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 };
      if (!(e.key in map)) return;
      e.preventDefault();
      selectTab(TABS[(map[e.key] + TABS.length) % TABS.length], true);
    });

    const panel = $('panel-pilgrims');
    panel.addEventListener('click', onPanelClick);
    panel.addEventListener('change', onPanelChange);
    panel.addEventListener('input', (e) => { if (e.target.type !== 'checkbox' && e.target.type !== 'radio') onEditorInput(e); });
    panel.addEventListener('focusout', onEditorBlur);
    panel.addEventListener('submit', (e) => {
      e.preventDefault();
      if (e.target.id === 'pform') commitForm(true);
      else if (e.target.id === 'plform') commitPaste();
    });
    panel.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && S.editor) { e.preventDefault(); closeEditor(); }
      // Cmd/Ctrl+Enter adds the pasted list from inside the textarea.
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && e.target.id === 'pl-text') { e.preventDefault(); commitPaste(); }
    });
    $('add-pilgrim').addEventListener('click', () => openForm(null));
    $('paste-list').addEventListener('click', openPaste);

    const cf = $('contact-form');
    cf.addEventListener('input', onContactInput);
    cf.addEventListener('focusout', (e) => {
      if (e.target.name && e.target.value) { S.contactTouched.add(e.target.name); syncContactErrors(); }
    });
    cf.addEventListener('submit', (e) => e.preventDefault());

    for (const el of document.querySelectorAll('[data-setting]')) {
      el.addEventListener('change', () => {
        S.data.settings[el.dataset.setting] = el.checked;
        writeNow();
      });
    }
    $('export').addEventListener('click', exportData);
    $('import').addEventListener('click', () => $('import-file').click());
    $('import-file').addEventListener('change', (e) => {
      importData(e.target.files && e.target.files[0]);
      e.target.value = '';
    });
    $('clear').addEventListener('click', () => { S.confirmClear = true; renderSettings(); $('clear-cancel').focus(); });
    $('clear-cancel').addEventListener('click', () => { S.confirmClear = false; renderSettings(); $('clear').focus(); });
    $('clear-yes').addEventListener('click', clearAll);

    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
  }

  /* ------------------------------------------------------------- boot */

  function boot() {
    const last = lsGet(LS_TAB);
    if (TABS.includes(last)) S.view = last;
    const opts = (arr) => arr.map((v) => '<option value="' + esc(v) + '"></option>').join('');
    $('dl-countries').innerHTML = opts(COUNTRIES);
    $('dl-states').innerHTML = opts(STATES);
    $('version').textContent = chrome.runtime.getManifest().version;
    $('repo').href = C.BRAND.repo;
    wire();
    renderStatic();

    Promise.all([
      chrome.storage.local.get(KEY).catch(() => ({})),
      chrome.tabs.query({ active: true, currentWindow: true }).catch(() => [])
    ]).then(([store, tabs]) => {
      S.data = C.migrate(store && store[KEY]);
      S.tab = (tabs && tabs[0]) || null;
      renderAll();
      probe();
    });

    if (chrome.commands && chrome.commands.getAll) {
      chrome.commands.getAll().then((cmds) => {
        const c = (cmds || []).find((x) => x.name === 'fill');
        $('shortcut').textContent = (c && c.shortcut) || '';
      }, () => {});
    }
  }

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) boot();
})();
