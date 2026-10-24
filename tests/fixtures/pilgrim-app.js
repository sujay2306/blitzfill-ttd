/*
 * Offline imitation of a React-rendered TTD pilgrim form. It reproduces the
 * behaviours that break naive autofill:
 *  - handlers ignore events whose nativeEvent.isTrusted is false
 *  - every handler closes over the state of the last render (stale closure),
 *    so writes issued before the async commit overwrite each other
 *  - each commit replaces every element's __reactProps$ object
 *  - read-only custom dropdowns whose options render asynchronously
 *  - idNumber stays disabled until an ID type is committed
 *  - choosing Passport opens a passport/visa popup
 *  - age onBlur raises a spurious error when the ID type is Passport
 *  - a contact block whose state options are a persistent list hidden by CSS
 *  - ?prefill=1: row 1 is already filled and its ID input is not rendered
 */
(function () {
  'use strict';
  const KEY = '__reactProps$fx9q2';
  const ROWS = 3;
  const stats = { rejected: 0, commits: 0, submitClicks: 0, handlerCalls: 0 };
  const blank = () => ({ name: '', age: '', gender: '', idType: '', idNumber: '', passportNumber: '', passportCountry: '' });
  let committed = {
    pilgrims: Array.from({ length: ROWS }, blank),
    contact: { email: '', country: '', state: '', city: '', pincode: '', gothram: '' },
    errors: {},
    open: null,
    passportRow: null
  };
  let pending = null;
  let scheduled = false;
  const PREFILL = /[?&]prefill=1/.test(location.search);
  if (PREFILL) {
    committed.pilgrims[0] = { ...blank(), name: 'Prefilled Person', age: '50', gender: 'Male', idType: 'Aadhaar' };
  }

  function setState(next) {
    pending = next;
    if (scheduled) return;
    scheduled = true;
    const delay = Math.floor(Math.random() * 6);
    setTimeout(() => {
      scheduled = false;
      committed = pending;
      pending = null;
      stats.commits++;
      render();
    }, delay);
  }

  const trusted = (e) => {
    stats.handlerCalls++;
    if (!e || !e.nativeEvent || e.nativeEvent.isTrusted !== true) { stats.rejected++; return false; }
    return true;
  };

  /* ---------------- static DOM ---------------- */
  const app = document.getElementById('app');
  const el = (tag, attrs, parent) => {
    const n = document.createElement(tag);
    for (const k in attrs || {}) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  };

  // decoy email higher up the page: contact fills must use the LAST match
  const news = el('section', { id: 'newsletter' }, app);
  el('input', { name: 'email', placeholder: 'newsletter email' }, news);

  const rows = [];
  for (let i = 0; i < ROWS; i++) {
    const r = el('div', { class: 'row', 'data-row': i }, app);
    const name = el('input', { name: 'name', placeholder: 'Name' }, r);
    const age = el('input', { name: 'age', placeholder: 'Age' }, r);
    const gWrap = el('div', { class: 'dropdown_wrapper__k1' }, r);
    const gender = el('input', { name: 'gender', readonly: '', placeholder: 'Gender' }, gWrap);
    const gList = el('div', { class: 'dropdown_scroll__z7' }, gWrap);
    const tWrap = el('div', { class: 'id_wrapper__k2' }, r);
    const idType = el('input', { name: 'idType', readonly: '', placeholder: 'ID Type' }, tWrap);
    const tList = el('div', { class: 'floatingDropdown_list__a1' }, tWrap);
    const idNumber = el('input', { name: 'idNumber', placeholder: 'ID Number' }, r);
    rows.push({ name, age, gender, gWrap, gList, idType, tList, idNumber });
  }
  if (PREFILL) rows[0].idNumber.remove(); // conditionally rendered in the real app

  const pop = el('div', { class: 'passportVisaPopup_box__p1', hidden: '' }, app);
  const passportNumber = el('input', { name: 'passportNumber' }, pop);
  const ppCountry = el('input', { name: 'country' }, pop);
  el('input', { name: 'visaNumber' }, pop);
  const ppSubmit = el('button', { type: 'button', id: 'passportSubmit' }, pop);
  ppSubmit.textContent = 'Submit';
  ppSubmit.addEventListener('click', () => stats.submitClicks++);

  const cblock = el('section', { id: 'contact' }, app);
  const email = el('input', { name: 'email' }, cblock);
  const cWrap = el('div', { class: 'cwrap' }, cblock);
  const country = el('input', { name: 'country', readonly: '' }, cWrap);
  const cList = el('ul', { style: 'list-style-type: none' }, cWrap);
  const sWrap = el('div', { class: 'swrap' }, cblock);
  const state = el('input', { name: 'state', readonly: '' }, sWrap);
  const sList = el('div', { class: 'state-options' }, sWrap);
  const city = el('input', { name: 'city' }, cblock);
  const pincode = el('input', { name: 'pincode' }, cblock);
  const gothram = el('input', { name: 'gothram' }, cblock);
  const cont = el('button', { type: 'button', id: 'continue' }, app);
  cont.textContent = 'Continue';
  cont.addEventListener('click', () => stats.submitClicks++);

  // Real React routes native input events to onChange; untrusted ones must be rejected.
  document.addEventListener('input', (e) => {
    const p = e.target && e.target[KEY];
    if (p && p.onChange) p.onChange({ target: e.target, nativeEvent: e });
  }, true);

  /* ---------------- render ---------------- */
  const GENDERS = ['Male', 'Female', 'Transgender'];
  const IDS = ['Aadhaar Card', 'Passport'];
  const COUNTRIES = ['India', 'Nepal', 'United States'];
  const STATES = ['Andhra Pradesh', 'Karnataka', 'Odisha', 'Tamil Nadu', 'Telangana'];

  function setValue(input, v) {
    if (input.value !== v) input.value = v;
  }

  function options(container, items, makeProps, tag, cls) {
    container.textContent = '';
    if (tag === 'li') {
      const ul = container.tagName === 'UL' ? container : el('ul', {}, container);
      items.forEach((t, k) => { const li = el('li', {}, ul); li.textContent = t; li[KEY] = makeProps(t, k); });
    } else {
      items.forEach((t, k) => {
        const d = el('div', cls ? { class: cls } : { role: 'option' }, container);
        const s = el('span', {}, d);
        s.textContent = t;
        d[KEY] = makeProps(t, k);
      });
    }
  }

  const upd = (snap, i, patch) => ({
    ...snap, pilgrims: snap.pilgrims.map((p, j) => (j === i ? { ...p, ...patch } : p))
  });

  function textProps(input, snap, onValue, onBlur) {
    input[KEY] = {
      value: input.value,
      onChange: (e) => { if (trusted(e) && e.target === input) setState(onValue(snap, e.target.value)); },
      onBlur: (e) => { if (trusted(e)) setState(onBlur ? onBlur(snap) : snap); }
    };
  }

  function render() {
    const snap = committed;
    rows.forEach((r, i) => {
      const p = snap.pilgrims[i];
      setValue(r.name, p.name);
      setValue(r.age, p.age);
      setValue(r.gender, p.gender);
      setValue(r.idType, p.idType);
      setValue(r.idNumber, p.idNumber);
      r.idNumber.disabled = !p.idType;
      textProps(r.name, snap, (s, v) => upd(s, i, { name: v }),
        (s) => ({ ...s, errors: { ...s.errors, ['name' + i]: s.pilgrims[i].name ? undefined : 'required' } }));
      textProps(r.age, snap, (s, v) => upd(s, i, { age: v.replace(/\D/g, '') }), (s) => {
        const err = s.pilgrims[i].idType === 'Passport' ? 'age does not match passport'
          : (s.pilgrims[i].age ? undefined : 'required');
        return { ...s, errors: { ...s.errors, ['age' + i]: err } };
      });
      textProps(r.idNumber, snap, (s, v) => upd(s, i, { idNumber: v }));
      r.gender[KEY] = { readOnly: true, onChange() {} };
      r.gWrap[KEY] = { onClick: (e) => { if (trusted(e)) setState({ ...snap, open: snap.open === 'g' + i ? null : 'g' + i }); } };
      r.idType[KEY] = { readOnly: true, onClick: (e) => { if (trusted(e)) setState({ ...snap, open: snap.open === 't' + i ? null : 't' + i }); } };
      // options appear one tick after the open state commits
      r.gList.textContent = '';
      r.tList.textContent = '';
      if (snap.open === 'g' + i) setTimeout(() => committed === snap && options(r.gList, GENDERS, (t) => ({
        onClick: (e) => { if (trusted(e)) setState({ ...upd(snap, i, { gender: t }), open: null }); }
      }), 'li'), 3);
      if (snap.open === 't' + i) setTimeout(() => committed === snap && options(r.tList, IDS, (t) => ({
        onClick: (e) => {
          if (!trusted(e)) return;
          const isPP = t === 'Passport';
          setState({ ...upd(snap, i, { idType: isPP ? 'Passport' : 'Aadhaar' }), open: null, passportRow: isPP ? i : snap.passportRow });
        }
      }), 'div', 'floatingDropdown_listItem__q8'), 3);
    });

    // passport popup
    const pr = snap.passportRow;
    pop.hidden = pr == null;
    if (pr != null) {
      setValue(passportNumber, snap.pilgrims[pr].passportNumber);
      setValue(ppCountry, snap.pilgrims[pr].passportCountry);
      textProps(passportNumber, snap, (s, v) => upd(s, pr, { passportNumber: v }));
      textProps(ppCountry, snap, (s, v) => upd(s, pr, { passportCountry: v }));
    }

    // contact
    const c = snap.contact;
    const cupd = (s, patch) => ({ ...s, contact: { ...s.contact, ...patch } });
    setValue(email, c.email);
    setValue(country, c.country);
    setValue(state, c.state);
    setValue(city, c.city);
    setValue(pincode, c.pincode);
    setValue(gothram, c.gothram);
    textProps(email, snap, (s, v) => cupd(s, { email: v }));
    textProps(city, snap, (s, v) => cupd(s, { city: v }));
    textProps(pincode, snap, (s, v) => cupd(s, { pincode: v.replace(/\D/g, '').slice(0, 6) }));
    textProps(gothram, snap, (s, v) => cupd(s, { gothram: v }));
    country[KEY] = { readOnly: true, onClick: (e) => { if (trusted(e)) setState({ ...snap, open: snap.open === 'c' ? null : 'c' }); } };
    state[KEY] = {
      readOnly: true,
      onMouseDown: (e) => { if (trusted(e)) setState({ ...snap, open: snap.open === 's' ? null : 's' }); }
    };
    cList.textContent = '';
    // persistent option nodes, only shown/hidden: must stay pickable
    if (!sList.childElementCount) STATES.forEach((t) => { const d = el('div', { role: 'option' }, sList); d.textContent = t; });
    sList.style.display = snap.open === 's' ? '' : 'none';
    Array.prototype.forEach.call(sList.children, (d) => {
      d[KEY] = { onClick: (e) => { if (trusted(e)) setState({ ...cupd(snap, { state: d.textContent }), open: null }); } };
    });
    if (snap.open === 'c') options(cList, COUNTRIES, (t) => ({
      onClick: (e) => { if (trusted(e)) setState({ ...cupd(snap, { country: t, state: '' }), open: null }); }
    }), 'li');
  }

  render();
  window.fixture = {
    KEY,
    stats,
    state: () => committed,
    reset() {
      committed = { pilgrims: Array.from({ length: ROWS }, blank), contact: { email: '', country: '', state: '', city: '', pincode: '', gothram: '' }, errors: {}, open: null, passportRow: null };
      render();
    }
  };
})();
