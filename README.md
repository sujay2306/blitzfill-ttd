# BlitzFill for TTD

**Fast, private autofill for TTD booking forms.** A small, free Chrome extension that types your saved pilgrim details into booking forms on the official TTD websites.

The TTD booking site asks for every pilgrim's name, age, gender and ID number on every booking attempt, and there's no way to save them between attempts. Booking for my family meant typing the same four or five people's details again each time, while slots were filling up. So I built a fix. BlitzFill stores those details once, in your own browser, and fills them in with one click or one shortcut. You still solve the CAPTCHA, check the form and press Continue yourself.

No account, no paywall, no servers. Your data never leaves your computer.

<!-- CWS_URL -->

## What it does

- **Pilgrim forms.** Fills name, age, gender, photo-ID type and ID number for each pilgrim row on the standard pilgrim-details forms used for Darshan, Seva and Accommodation bookings.
- **Srivani.** Handles the Srivani Trust donor form layout (its numbered name/age/gender/proof rows).
- **Contact details.** Email, mobile, country, state, city, PIN code and gothram, filled once per booking. Typical spellings and abbreviations are matched to the site's options (for example "KA" to Karnataka, "Orissa" to Odisha).
- **Passport pilgrims.** When the passport/visa popup opens for a passport holder, BlitzFill fills the passport number and country in it but does not submit the popup. It then reminds you to review the passport and visa details.
- **Fallback for other forms.** If a page doesn't match a known layout, BlitzFill reads field names, placeholders and labels to work out which field is "name", "age", "mobile" and so on, and fills what it can recognise.
- **On-page ⚡ button.** A floating "Fill" button appears on TTD booking forms (you can turn it off in Settings).
- **Keyboard shortcut.** `Alt+Shift+F` fills the current page. You can change it at `chrome://extensions/shortcuts`.
- **Undo.** One click on **Undo** in the popup restores every field the last fill changed.
- **Field highlights.** Filled fields flash green. Fields that couldn't be filled, and required fields still empty, are outlined in red so you know where to look.
- **Only empty fields by default.** Anything you've already typed is left alone unless you turn on "Overwrite filled fields".
- **Optional auto-fill.** Off by default. When on, the form is filled as soon as it appears.
- **Input checks.** Aadhaar numbers are checked with the Verhoeff checksum, and ages, mobiles, PIN codes and emails are validated as you save them.
- **Add Pilgrim or Paste List.** Add pilgrims one at a time, or several at once with **Paste List**: one per line as `Name, Age, M/F/T, Aadhaar`, for example straight from a spreadsheet.
- **Light and dark appearance**, following your system setting automatically.
- **Import / export.** Back up your pilgrim list as a JSON file and restore it on another machine.

## Why it's fast

Most autofill tools set a field's value, fire a few events, then sleep for a fixed time and hope the page caught up. TTD's booking site is a React app, and that approach is both slow and flaky there. BlitzFill does it differently (see [`src/content/engine.js`](src/content/engine.js)):

- **It talks to React directly.** The fill engine runs in the page's main world, so it can find the React props attached to each input and call the field's own `onChange`/`onBlur` handlers. React's state ends up matching what's on screen, which is what makes values "stick".
- **It waits for the commit, not the clock.** After each write it waits only until React has actually re-rendered that field (the props object changes), with a short safety cap. There are no fixed `sleep(500)` calls between fields.
- **It skips work that's already done.** If a field already holds the right value, it isn't touched. A dropdown that already shows the right option isn't reopened.
- **Dropdowns wait on the DOM, not a timer.** Custom dropdowns are opened through their own click handlers, and a `MutationObserver` resolves the moment the option list renders. The same goes for the passport popup and for "select" lists whose options load late.
- **It doesn't slow down in a background tab.** Its short waits are scheduled through a `MessageChannel`, which browsers don't throttle the way they throttle timers in background tabs.
- **It cleans up after the page.** A final pass re-checks every field it wrote and rewrites any that the page's own re-renders wiped out, then fires blur validation once.

When it's done, the toast tells you how many fields were filled and how many milliseconds it took on your machine.

## Privacy

- Everything is stored in `chrome.storage.local`, on your device only.
- **Zero network requests.** The extension pages' Content Security Policy sets `connect-src 'none'`, and the code makes no `fetch`/XHR calls.
- No analytics, no tracking, no accounts, no remote code.
- It only runs on `ttdevasthanams.ap.gov.in` and `tirupatibalaji.ap.gov.in`.

Permissions, exactly as in [`manifest.json`](manifest.json):

| Permission | Why |
|---|---|
| `storage` | Saves your pilgrims, contact details and settings locally. |
| `scripting` | Adds the fill script to TTD tabs that were already open when you installed or updated the extension, so you don't have to reload them. |
| Host: `https://ttdevasthanams.ap.gov.in/*` | The TTD booking site the extension fills. |
| Host: `https://tirupatibalaji.ap.gov.in/*` | The other official TTD booking domain. |

Full policy: [PRIVACY.md](PRIVACY.md).

## What it will NOT do

- It does **not** solve, bypass or read CAPTCHAs or OTPs.
- It does **not** submit forms or click Continue, Book or Pay.
- It does **not** automate payment or touch payment details.
- It does **not** book slots, refresh pages or hold queue positions for you.

It types for you. Everything else is still up to you.

## Install

**Chrome Web Store:** coming soon <!-- CWS_URL -->

### Try it free, no Web Store needed

Loading it yourself costs nothing and takes a minute.

1. Download the latest zip from [Releases](https://github.com/sujay2306/blitzfill-ttd/releases/latest) and unzip it, or clone this repo.
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick the folder that contains `manifest.json`.
4. Pin BlitzFill from the puzzle-piece menu 🧩.

Requires Chrome 111 or newer (Edge, Brave and other Chromium browsers work too).

### Test it on TTD without booking anything

1. Open BlitzFill and add your pilgrims with **Add Pilgrim**, or paste them all at once with **Paste List** (one per line: `Name, Age, M/F/T, Aadhaar`).
2. Fill in the **Contact** tab (email, state, city, PIN code).
3. Log in at [ttdevasthanams.ap.gov.in](https://ttdevasthanams.ap.gov.in), pick any darshan, seva or accommodation, and choose a date and slot to reach the pilgrim details form.
4. Click the ⚡ Fill button on the page, **Fill This Page** in the popup, or press `Alt+Shift+F`.
5. Check the form. Green rings mean filled; red means the field needs a look.
6. **Stop there.** Don't press Continue or Pay. Close the tab and nothing is booked or charged.

If a field doesn't fill, please [open an issue](https://github.com/sujay2306/blitzfill-ttd/issues) with the form name and the field. TTD changes its pages from time to time.

After updating the code, click ↻ on the BlitzFill card in `chrome://extensions` and refresh the TTD tab.

## Development

```sh
npm install        # only dev dependency is puppeteer-core, for end-to-end tests
npm test           # runs all tests with Node's built-in test runner
npm run test:unit  # unit tests only, no browser needed
npm run package    # builds dist/blitzfill-ttd-v<version>.zip for the Web Store
```

End-to-end tests drive a real Chrome through `puppeteer-core`. Point them at a Chrome binary with the `CHROME_PATH` environment variable if it isn't in the default location.

There is no build step. The files in the repo are the files that ship.

## Project structure

```
manifest.json          MV3 manifest
_locales/              extension name and description strings
icons/                 toolbar and store icons
src/
  background.js        service worker: keyboard shortcut, injection into already-open tabs
  lib/core.js          shared pure logic: validation, option matching, field detection, storage schema
  lib/i18n.js          UI strings
  content/engine.js    fill engine (runs in the page's main world)
  content/bridge.js    storage, floating button, auto-fill, talks to the engine
  popup/               the toolbar popup (pilgrims, contact, settings)
tests/                 unit and end-to-end tests, HTML fixtures
scripts/package.sh     packages the extension into dist/
store/                 Chrome Web Store listing text, promo images, publishing notes
```

## Contributing

Issues and pull requests are welcome at <https://github.com/sujay2306/blitzfill-ttd/issues>. If a TTD form changes and a field stops filling, an issue with the page URL and which field failed helps a lot. Please don't paste real ID numbers.

## License

[MIT](LICENSE) © 2026 Sujay KS

## Disclaimer

Independent project, not affiliated with or endorsed by Tirumala Tirupati Devasthanams (TTD). Use it in line with the TTD website's terms. You are responsible for checking every detail before you submit a booking.
