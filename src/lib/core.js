/*
 * BlitzFill core: pure logic shared by the popup, the isolated content
 * script, the MAIN-world fill engine and the Node test-suite.
 * Classic script: attaches to globalThis and exports for CommonJS.
 */
(function (root) {
  'use strict';

  const BRAND = Object.freeze({
    name: 'BlitzFill for TTD',
    short: 'BlitzFill',
    slug: 'blitzfill-ttd',
    prefix: 'blitzfill',
    repo: 'https://github.com/sujay2306/blitzfill-ttd'
  });

  const SCHEMA_VERSION = 1;
  const GENDERS = ['Male', 'Female', 'Transgender'];
  const ID_TYPES = ['Aadhaar', 'Passport'];
  const LANGS = ['en'];
  const THEMES = ['system', 'light', 'dark'];
  const HOSTS = ['ttdevasthanams.ap.gov.in', 'tirupatibalaji.ap.gov.in'];

  /* ------------------------------------------------------------ text */

  function norm(s) {
    return String(s == null ? '' : s)
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  /** "pilgrimEmailId" -> "pilgrim email id" */
  function words(s) {
    return norm(String(s == null ? '' : s)
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      .replace(/([a-zA-Z])(\d)/g, '$1 $2'));
  }

  /* -------------------------------------------------------- verhoeff */

  const VD = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
    [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
    [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
  ];
  const VP = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
    [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]
  ];
  const VINV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

  function verhoeffValid(num) {
    const d = String(num);
    if (!/^\d+$/.test(d)) return false;
    let c = 0;
    for (let i = 0; i < d.length; i++) c = VD[c][VP[i % 8][d.charCodeAt(d.length - 1 - i) - 48]];
    return c === 0;
  }

  /** Check digit to append to `num`. */
  function verhoeffDigit(num) {
    const d = String(num);
    if (!/^\d+$/.test(d)) throw new TypeError('digits only');
    let c = 0;
    for (let i = 0; i < d.length; i++) c = VD[c][VP[(i + 1) % 8][d.charCodeAt(d.length - 1 - i) - 48]];
    return VINV[c];
  }

  /* ------------------------------------------------------ validators */

  const digitsOnly = (v) => String(v == null ? '' : v).replace(/[\s-]/g, '');

  function isAadhaar(v) {
    const d = digitsOnly(v);
    return /^[2-9]\d{11}$/.test(d) && verhoeffValid(d);
  }
  const isPassport = (v) => /^[A-Za-z0-9]{6,12}$/.test(String(v == null ? '' : v).trim());
  function isAge(v) {
    const s = String(v == null ? '' : v).trim();
    if (!/^\d{1,3}$/.test(s)) return false;
    const n = +s;
    return n >= 1 && n <= 120;
  }
  function cleanMobile(v) {
    let d = digitsOnly(v).replace(/^\+/, '');
    if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
    if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
    return d;
  }
  const isMobile = (v) => /^[6-9]\d{9}$/.test(cleanMobile(v));
  const isPincode = (v) => /^[1-9]\d{5}$/.test(digitsOnly(v));
  const isEmail = (v) => /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(String(v == null ? '' : v).trim());
  const isName = (v) => /^[\p{L}\p{M}][\p{L}\p{M} .'-]{0,59}$/u.test(String(v == null ? '' : v).trim());

  function cleanId(type, v) {
    const s = String(v == null ? '' : v);
    return type === 'Passport' ? s.replace(/[^A-Za-z0-9]/g, '').toUpperCase() : s.replace(/\D/g, '');
  }

  /** Returns {field: errorKey}; empty object means valid. */
  function validatePilgrim(p) {
    const e = {};
    if (!p || !String(p.name || '').trim()) e.name = 'errRequired';
    else if (!isName(p.name)) e.name = 'errName';
    if (p && (p.age === '' || p.age == null)) e.age = 'errRequired';
    else if (!isAge(p && p.age)) e.age = 'errAge';
    if (!p || !GENDERS.includes(p.gender)) e.gender = 'errRequired';
    if (!p || !ID_TYPES.includes(p.idType)) e.idType = 'errRequired';
    const id = p ? cleanId(p.idType, p.idNumber) : '';
    if (!id) e.idNumber = 'errRequired';
    else if (p.idType === 'Aadhaar' && !isAadhaar(id)) e.idNumber = 'errAadhaar';
    else if (p.idType === 'Passport' && !isPassport(id)) e.idNumber = 'errPassport';
    return e;
  }

  /** Contact fields are all optional; only validates what is present. */
  function validateContact(c) {
    const e = {};
    if (!c) return e;
    if (c.email && !isEmail(c.email)) e.email = 'errEmail';
    if (c.mobile && !isMobile(c.mobile)) e.mobile = 'errMobile';
    if (c.pincode && !isPincode(c.pincode)) e.pincode = 'errPincode';
    return e;
  }

  function mask(id) {
    const s = String(id == null ? '' : id).replace(/[^A-Za-z0-9]/g, '');
    if (!s) return '';
    return '\u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 ' + s.slice(-4);
  }

  /* ------------------------------------------------ option matching */

  const GENDER_ALIASES = [
    ['Male', 'm', 'man', 'boy', 'gents'],
    ['Female', 'f', 'woman', 'girl', 'ladies'],
    ['Transgender', 'tg', 't', 'third gender', 'other', 'others', 'trans']
  ];
  const IDTYPE_ALIASES = [
    ['Aadhaar', 'aadhar', 'adhaar', 'adhar', 'aadhaar card', 'aadhar card', 'uid', 'uidai'],
    ['Passport', 'pass port', 'passport number']
  ];
  const STATE_ALIASES = [
    ['Andhra Pradesh', 'ap'], ['Arunachal Pradesh', 'ar'], ['Assam', 'as'], ['Bihar', 'br'],
    ['Chhattisgarh', 'cg', 'ct', 'chattisgarh', 'chhatisgarh'], ['Goa', 'ga'], ['Gujarat', 'gj'],
    ['Haryana', 'hr'], ['Himachal Pradesh', 'hp'], ['Jharkhand', 'jh'], ['Karnataka', 'ka'],
    ['Kerala', 'kl'], ['Madhya Pradesh', 'mp'], ['Maharashtra', 'mh'], ['Manipur', 'mn'],
    ['Meghalaya', 'ml'], ['Mizoram', 'mz'], ['Nagaland', 'nl'], ['Odisha', 'od', 'or', 'orissa'],
    ['Punjab', 'pb'], ['Rajasthan', 'rj'], ['Sikkim', 'sk'], ['Tamil Nadu', 'tn', 'tamilnadu'],
    ['Telangana', 'ts', 'tg', 'telengana'], ['Tripura', 'tr'], ['Uttar Pradesh', 'up'],
    ['Uttarakhand', 'uk', 'uttaranchal'], ['West Bengal', 'wb'],
    ['Andaman and Nicobar Islands', 'an', 'andaman and nicobar', 'andaman nicobar'],
    ['Chandigarh', 'ch'],
    ['Dadra and Nagar Haveli and Daman and Diu', 'dn', 'dd', 'dnhdd', 'dadra and nagar haveli', 'daman and diu'],
    ['Delhi', 'dl', 'nct of delhi', 'new delhi', 'nct delhi'],
    ['Jammu and Kashmir', 'jk', 'j and k'], ['Ladakh', 'la'], ['Lakshadweep', 'ld'],
    ['Puducherry', 'py', 'pondicherry', 'pondy']
  ];
  const COUNTRY_ALIASES = [
    ['India', 'in', 'ind', 'bharat', 'republic of india'],
    ['United States', 'us', 'usa', 'united states of america', 'america'],
    ['United Kingdom', 'uk', 'gb', 'great britain', 'england'],
    ['United Arab Emirates', 'uae'],
    ['Sri Lanka', 'srilanka'], ['Nepal'], ['Singapore'], ['Malaysia'], ['Australia'], ['Canada']
  ];

  function buildIndex(groups) {
    return groups.map((g) => g.map(norm));
  }
  const GROUPS = {
    gender: buildIndex(GENDER_ALIASES),
    idType: buildIndex(IDTYPE_ALIASES),
    state: buildIndex(STATE_ALIASES),
    country: buildIndex(COUNTRY_ALIASES)
  };
  const ALL_GROUPS = [].concat(GROUPS.gender, GROUPS.idType, GROUPS.state, GROUPS.country);

  const PLACEHOLDER = /^(select|choose|pick|please select|none)\b/;

  function hasWord(hay, needle) {
    return (' ' + hay + ' ').indexOf(' ' + needle + ' ') !== -1;
  }

  /**
   * Index of the option that best matches `want`, or -1.
   * kind: 'gender' | 'idType' | 'state' | 'country' | undefined (any)
   */
  function matchOption(want, options, kind) {
    const w = norm(want);
    if (!w || !options || !options.length) return -1;
    const groups = (kind && GROUPS[kind]) || ALL_GROUPS;
    const group = groups.find((g) => g.includes(w));
    const cands = group ? [w].concat(group.filter((a) => a !== w)) : [w];
    let best = -1;
    let bestScore = 0;
    for (let i = 0; i < options.length; i++) {
      const o = norm(options[i]);
      if (!o || PLACEHOLDER.test(o)) continue;
      let s = 0;
      for (let k = 0; k < cands.length && s < 100; k++) {
        const c = cands[k];
        const bonus = k === 0 ? 1 : 0;
        if (o === c) s = Math.max(s, 99 + bonus);
        else if (c.length > 2 && hasWord(o, c)) s = Math.max(s, 80 + bonus - Math.min(10, o.length - c.length) / 10);
        else if (c.length >= 5 && o.indexOf(c) !== -1) s = Math.max(s, 60 + bonus);
        else if (o.length >= 5 && c.indexOf(o) !== -1) s = Math.max(s, 55 + bonus);
      }
      if (!s && !group) {
        const ow = o.split(' ');
        const ww = w.split(' ');
        const hit = ww.filter((x) => ow.includes(x)).length;
        const ratio = hit / Math.max(ow.length, ww.length);
        if (ratio >= 0.6) s = 40 * ratio;
      }
      if (s > bestScore) { bestScore = s; best = i; }
    }
    return best;
  }

  /** Canonical display form of an alias, e.g. "Orissa" -> "Odisha". */
  function canonical(value, kind) {
    const w = norm(value);
    const src = { gender: GENDER_ALIASES, idType: IDTYPE_ALIASES, state: STATE_ALIASES, country: COUNTRY_ALIASES }[kind];
    if (!src) return value;
    const i = GROUPS[kind].findIndex((g) => g.includes(w));
    return i === -1 ? value : src[i][0];
  }

  /* ------------------------------------------------- field classifier */

  const RULES = [
    ['email', /\b(e ?mail|mail id)\b/],
    ['mobile', /\b(mobile|phone|cell|whatsapp|contact (no|number))\b/],
    ['pincode', /\b(pin ?code|pin|postal|zip|post code)\b/],
    ['gothram', /\b(goth?ra(m|mu)?|gotra(m)?)\b/],
    ['idNumber', /\b(id|proof|aadhaa?r|adhaa?r|passport|document|photo id)\b.*\b(no|num|number)\b|\bproof id\b|\bid number\b/],
    ['idType', /\b(id|proof|document)\b.*\b(type|kind)\b|\bphoto id\b|\bid proof\b|\bproof\b/],
    ['age', /\bage\b/],
    ['gender', /\b(gender|sex)\b/],
    ['country', /\bcountry\b|\bnationality\b/],
    ['state', /\bstate\b/],
    ['city', /\b(city|town|district|village)\b/],
    ['name', /\bname\b|\bf name\b|\bfull name\b/]
  ];
  const NAME_EXCLUDE = /\b(user|login|father|husband|guardian|nominee|mother|spouse|village|city|state|country|gothra?m?)\b/;

  /** desc: {name,id,placeholder,aria,label,type} -> field key or null */
  function classifyField(desc) {
    if (!desc) return null;
    const t = String(desc.type || '').toLowerCase();
    if (t === 'email') return 'email';
    if (['hidden', 'submit', 'button', 'checkbox', 'radio', 'file', 'password', 'image', 'reset'].includes(t)) return null;
    const text = words([desc.name, desc.id, desc.placeholder, desc.aria, desc.label].filter(Boolean).join(' '));
    if (!text) return null;
    for (const [key, re] of RULES) {
      if (!re.test(text)) continue;
      if (key === 'name' && NAME_EXCLUDE.test(text)) continue;
      return key;
    }
    if (t === 'tel') return 'mobile';
    return null;
  }

  /* ---------------------------------------------------------- DOM */

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    if (el.closest && el.closest('.ng-hide,[hidden]')) return false;
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  }

  function labelText(el) {
    let s = '';
    if (el.labels && el.labels.length) s = el.labels[0].textContent;
    else {
      const l = el.closest && el.closest('label');
      if (l) s = l.textContent;
      else if (el.parentElement) {
        const prev = el.previousElementSibling || (el.parentElement.previousElementSibling);
        if (prev && /^(LABEL|SPAN|P|DIV|H\d)$/.test(prev.tagName)) s = prev.textContent;
      }
    }
    return String(s || '').trim().slice(0, 60);
  }

  function describe(el) {
    return {
      name: el.getAttribute('name'),
      id: el.id,
      placeholder: el.getAttribute('placeholder'),
      aria: el.getAttribute('aria-label'),
      label: labelText(el),
      type: el.tagName === 'SELECT' ? 'select' : el.getAttribute('type')
    };
  }

  /** Visible, classified controls in document order. */
  function scanGeneric(doc) {
    const out = [];
    const els = doc.querySelectorAll('input,select,textarea');
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      if (el.disabled && el.tagName !== 'INPUT') continue;
      const key = classifyField(describe(el));
      if (key && isVisible(el)) out.push({ el, key });
    }
    return out;
  }

  function visibleAll(doc, selectors) {
    for (const s of selectors) {
      const list = Array.prototype.filter.call(doc.querySelectorAll(s), isVisible);
      if (list.length) return list;
    }
    return [];
  }

  const PILGRIM_NAME = ['input[name="name"]', 'input[name="fname"]'];

  /** Cheap detector. Returns {type, rows, empty} or null. */
  function detectForm(doc) {
    if (doc.querySelector('input[name="fName0"],input[name="fName1"]')) {
      let rows = 0;
      let empty = 0;
      for (let i = 0; i < 9; i++) {
        const el = doc.querySelector('input[name="fName' + i + '"]');
        if (!el || !isVisible(el)) continue;
        rows++;
        if (!el.value) empty++;
      }
      if (rows) return { type: 'srivani', rows, empty };
    }
    const names = visibleAll(doc, PILGRIM_NAME);
    if (names.length) {
      return { type: 'pilgrim', rows: names.length, empty: names.filter((e) => !e.value).length };
    }
    const g = scanGeneric(doc);
    if (g.length >= 2) {
      const rows = g.filter((f) => f.key === 'name').length;
      const empty = g.filter((f) => f.key === 'name' && !f.el.value).length;
      return { type: 'generic', rows, empty, fields: g.length };
    }
    return null;
  }

  /**
   * The row container of a pilgrim name input: the closest ancestor that
   * holds exactly one age input and one name input. null if none.
   */
  function rowScope(nameEl) {
    const body = nameEl.ownerDocument && nameEl.ownerDocument.body;
    let n = nameEl.parentElement;
    for (let d = 0; n && n !== body && d < 8; d++, n = n.parentElement) {
      const ages = n.querySelectorAll('input[name="age"]').length;
      if (ages > 1) return null;
      if (ages === 1) return n.querySelectorAll(PILGRIM_NAME.join(',')).length === 1 ? n : null;
    }
    return null;
  }

  const idKey = (v) => String(v == null ? '' : v).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const PRESENT_NAMES = PILGRIM_NAME.concat(['input[name^="fName"]']).join(',');
  const PRESENT_IDS = 'input[name="idNumber"],input[name="idProofNumber"],input[name^="proofId"],input[name="passportNumber"]';

  /** Names and ID numbers already typed into visible rows on the page. */
  function presentPilgrims(doc) {
    const names = new Set();
    const ids = new Set();
    for (const el of doc.querySelectorAll(PRESENT_NAMES)) if (el.value && isVisible(el)) names.add(norm(el.value));
    for (const el of doc.querySelectorAll(PRESENT_IDS)) if (el.value && isVisible(el)) ids.add(idKey(el.value));
    return { names, ids };
  }

  function isPresent(p, present) {
    return present.names.has(norm(p.name)) || (!!p.idNumber && present.ids.has(idKey(p.idNumber)));
  }

  /**
   * Pilgrims that will actually be placed: drops anyone already on the page
   * and caps at the number of empty rows. Overwrite mode keeps the list.
   */
  function placeable(pilgrims, form, overwrite, doc) {
    if (overwrite || !form || (form.type !== 'pilgrim' && form.type !== 'srivani')) return pilgrims.slice();
    const present = presentPilgrims(doc);
    return pilgrims.filter((p) => !isPresent(p, present)).slice(0, form.empty);
  }

  function isTTDUrl(url) {
    try {
      const u = new URL(url);
      return u.protocol === 'https:' && HOSTS.includes(u.hostname);
    } catch (_) {
      return false;
    }
  }

  /* -------------------------------------------------------- storage */

  function defaults() {
    return {
      v: SCHEMA_VERSION,
      pilgrims: [],
      contact: { email: '', mobile: '', country: 'India', state: '', city: '', pincode: '', gothram: '' },
      settings: { fab: true, autofill: false, overwrite: false, lang: 'en', theme: 'system' }
    };
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  const str = (v, max) => String(v == null ? '' : v).slice(0, max || 120);

  function migratePilgrim(p) {
    if (!p || typeof p !== 'object') return null;
    const gender = GENDERS.includes(p.gender) ? p.gender : canonical(p.gender, 'gender');
    const idType = ID_TYPES.includes(p.idType) ? p.idType : canonical(p.idType || p.proofType, 'idType');
    const out = {
      id: str(p.id || uid(), 40),
      name: str(p.name || p.fullName, 60).trim(),
      age: str(p.age, 3).trim(),
      gender: GENDERS.includes(gender) ? gender : 'Male',
      idType: ID_TYPES.includes(idType) ? idType : 'Aadhaar',
      idNumber: '',
      selected: p.selected !== false
    };
    out.idNumber = cleanId(out.idType, p.idNumber || p.proofNumber);
    if (out.idType === 'Passport' && p.passportCountry) out.passportCountry = str(p.passportCountry, 60);
    return out.name ? out : null;
  }

  /** Accepts any older/partial shape and returns a valid current one. */
  function migrate(raw) {
    const d = defaults();
    if (!raw || typeof raw !== 'object') return d;
    if (Array.isArray(raw.pilgrims)) d.pilgrims = raw.pilgrims.map(migratePilgrim).filter(Boolean).slice(0, 50);
    if (raw.contact && typeof raw.contact === 'object') {
      for (const k of Object.keys(d.contact)) if (raw.contact[k] != null) d.contact[k] = str(raw.contact[k], 120).trim();
    }
    const s = raw.settings || {};
    for (const k of ['fab', 'autofill', 'overwrite']) if (typeof s[k] === 'boolean') d.settings[k] = s[k];
    if (LANGS.includes(s.lang)) d.settings.lang = s.lang;
    if (THEMES.includes(s.theme)) d.settings.theme = s.theme;
    return d;
  }

  const api = {
    BRAND, SCHEMA_VERSION, GENDERS, ID_TYPES, LANGS, THEMES, HOSTS, PILGRIM_NAME,
    norm, words, verhoeffValid, verhoeffDigit,
    isAadhaar, isPassport, isAge, isMobile, isPincode, isEmail, isName, cleanId, cleanMobile,
    validatePilgrim, validateContact, mask,
    matchOption, canonical, classifyField,
    isVisible, describe, scanGeneric, visibleAll, detectForm, isTTDUrl,
    rowScope, idKey, presentPilgrims, isPresent, placeable,
    defaults, migrate, uid
  };

  Object.freeze(api);
  root.BlitzFillCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
