/* BlitzFill UI strings (English). t()/summarize() keep a lang argument for API stability. */
(function (root) {
  'use strict';
  const D = {
    en: {
      tagline: 'Fast, private autofill for TTD booking forms',
      statusForm: 'Form ready',
      statusRows: '{n} rows',
      statusTTD: 'TTD page',
      statusReload: 'Not connected to this tab',
      statusOff: 'Not on TTD',
      fillPage: 'Fill this page',
      undo: 'Undo',
      selected: '{n} selected',
      tabPilgrims: 'Pilgrims',
      tabContact: 'Contact',
      tabSettings: 'Settings',
      addPilgrim: 'Add pilgrim',
      editPilgrim: 'Edit pilgrim',
      emptyPilgrims: 'No pilgrims yet. Add the people travelling with you and fill every booking in one tap.',
      name: 'Full name (as on ID)',
      age: 'Age',
      gender: 'Gender',
      Male: 'Male',
      Female: 'Female',
      Transgender: 'Transgender',
      idType: 'Photo ID',
      Aadhaar: 'Aadhaar',
      Passport: 'Passport',
      idNumber: 'ID number',
      aadhaarHint: '12 digits',
      passportHint: '6 to 12 letters or digits',
      passportCountry: 'Passport country',
      checksumOk: 'Valid Aadhaar number',
      save: 'Save',
      cancel: 'Cancel',
      edit: 'Edit',
      del: 'Delete',
      confirmDel: 'Delete?',
      moveUp: 'Move up',
      moveDown: 'Move down',
      include: 'Include in fill',
      email: 'Email',
      mobile: 'Mobile',
      country: 'Country',
      state: 'State',
      city: 'City',
      pincode: 'PIN code',
      gothram: 'Gothram',
      contactNote: 'Used once per booking. Changes save automatically.',
      saved: 'Saved',
      setFab: 'Floating fill button',
      setFabSub: 'Show a button on TTD booking forms',
      setAuto: 'Fill when a form appears',
      setAutoSub: 'Off by default. You still review and submit yourself.',
      setOverwrite: 'Overwrite filled fields',
      setOverwriteSub: 'By default only empty fields are filled',
      setLang: 'Language',
      setTheme: 'Theme',
      themeSystem: 'System',
      themeLight: 'Light',
      themeDark: 'Dark',
      backup: 'Backup',
      exportData: 'Export JSON',
      importData: 'Import JSON',
      clearAll: 'Clear all data',
      confirmClear: 'Tap again to erase everything',
      cleared: 'All data cleared',
      imported: 'Imported {n} pilgrims',
      importBad: 'That file is not a valid BlitzFill backup',
      privacyTitle: 'Privacy',
      privacy: 'Your details stay in this browser only. BlitzFill makes no network requests, has no analytics and never sends data anywhere. It only types into forms. You solve the CAPTCHA, check every field and press Continue yourself.',
      disclaimer: 'Independent project. Not affiliated with or endorsed by TTD.',
      resFilled: 'Filled {n} fields in {ms} ms',
      resNothing: 'Nothing to fill, all fields already have values ({ms} ms)',
      resFailed: '{n} need attention',
      resReview: 'Review passport and visa details',
      resLeftover: '{n} pilgrims did not fit. Add more rows on the page',
      resUndo: 'Restored {n} fields',
      errNoForm: 'No supported form on this page yet',
      errNoData: 'Add a pilgrim first',
      errNotTTD: 'Open a TTD booking page first',
      errNoTab: "Couldn't connect to this tab. If you're in a queue, wait until you're through, then reload.",
      errBusy: 'Already filling...',
      errTimeout: 'The page stopped responding. Check the form, then try again',
      errGeneric: 'Something went wrong. Reload the page and retry',
      errRequired: 'Required',
      errName: 'Letters, spaces and . \' - only',
      errAge: 'Enter an age from 1 to 120',
      errAadhaar: 'Not a valid Aadhaar number',
      errPassport: 'Use 6 to 12 letters or digits',
      errEmail: 'Enter a valid email',
      errMobile: '10 digits starting with 6 to 9',
      errPincode: '6 digits',
      fabFill: 'Fill {n}',
      fabTitle: 'BlitzFill: fill saved pilgrims (Alt+Shift+F)',
      version: 'Version'
    }
  };

  function t(lang, key, vars) {
    const table = D[lang] || D.en;
    let s = table[key] != null ? table[key] : (D.en[key] != null ? D.en[key] : key);
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
    return s;
  }

  /** Human summary of an engine result. Returns {text, tone, detail}. */
  function summarize(lang, r) {
    if (!r || !r.ok) {
      const map = { noForm: 'errNoForm', noData: 'errNoData', busy: 'errBusy', notTTD: 'errNotTTD', noTab: 'errNoTab', noEngine: 'errNoTab', timeout: 'errTimeout' };
      return { text: t(lang, map[r && r.error] || 'errGeneric'), tone: 'bad', detail: '' };
    }
    if (r.restored != null) return { text: t(lang, 'resUndo', { n: r.restored }), tone: 'ok', detail: '' };
    const parts = [];
    const issues = (r.failed ? r.failed.length : 0) + (r.blanks || 0);
    if (issues) parts.push(t(lang, 'resFailed', { n: issues }));
    if (r.review && r.review.length) parts.push(t(lang, 'resReview'));
    if (r.leftover) parts.push(t(lang, 'resLeftover', { n: r.leftover }));
    const text = r.filled ? t(lang, 'resFilled', { n: r.filled, ms: r.ms }) : t(lang, 'resNothing', { ms: r.ms });
    return { text, tone: issues || (r.review && r.review.length) ? 'warn' : 'ok', detail: parts.join(' \u00b7 ') };
  }

  const api = { DICT: D, t, summarize };
  root.BlitzFillI18n = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
