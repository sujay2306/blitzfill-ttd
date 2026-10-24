# Privacy Policy for BlitzFill for TTD

**Effective date:** 2026-10-24

BlitzFill for TTD ("BlitzFill", "the extension") is a free Chrome extension made by Sujay KS. It fills pilgrim details you have saved into booking forms on the official TTD websites. This policy explains what happens to the information you enter into it.

## The short version

Your data stays on your device. BlitzFill handles the personal information you save only locally and never transmits, sells or shares it. There are no servers, no accounts and no analytics.

## What you can store

You can choose to save the following in the extension:

- Pilgrim details: name, age, gender, photo-ID type (Aadhaar or passport), ID number and, for passport holders, passport country.
- Contact details: email, mobile number, country, state, city, PIN code and gothram.
- Settings, such as whether the floating button or auto-fill are turned on.

All of this is optional and is entered by you.

## Where it is stored

Everything is stored with Chrome's `chrome.storage.local` API, which keeps the data in your Chrome profile on your own device. It is not synced through your Google account by the extension and is not sent anywhere else.

## What is shared or transmitted

BlitzFill handles the personal information listed above only on your device. It never transmits it to the developer or anyone else. The extension:

- makes no network requests of its own (its pages run under a Content Security Policy with `connect-src 'none'`);
- has no remote servers, so there is nowhere for data to be sent;
- includes no analytics, telemetry, crash reporting, advertising or tracking code;
- does not load or run any remote code;
- does not sell, share or transfer data to anyone, for any purpose.

## When your data is used

BlitzFill only runs on `ttdevasthanams.ap.gov.in` and `tirupatibalaji.ap.gov.in`. Your saved details are written into a form on those pages only when you start a fill, by clicking the extension's button, the on-page Fill button or the keyboard shortcut, or automatically when a form appears if you have turned on the optional auto-fill setting (off by default).

Once details are typed into a TTD form, they are part of that page like anything you type yourself. What happens when you submit the form is governed by TTD's own website and policies, not by this extension. BlitzFill never submits forms for you.

## Export and import

If you use **Export JSON**, the extension creates a backup file of your saved data and gives it to you as a download. Where you keep that file is up to you. **Import JSON** reads a file you choose and saves its contents locally.

## Deleting your data

You can delete your data at any time:

- open the extension, go to **Settings** and choose **Clear All Data**; or
- uninstall the extension, which makes Chrome remove its stored data.

You can also edit or delete individual pilgrims in the extension.

## Permissions

- `storage`: to save your details on your device.
- `scripting`: to add the fill script to TTD tabs that were already open when the extension was installed or updated.
- Host access to `https://ttdevasthanams.ap.gov.in/*` and `https://tirupatibalaji.ap.gov.in/*`: to fill forms on those sites only.

## Retention

Data is kept on your device until you delete it or uninstall the extension.

## Limited Use

BlitzFill's use of the information you save complies with the [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/), including the Limited Use requirements. It is used only to fill forms on the TTD websites at your request. It is never sold, transferred, used for advertising, used to determine creditworthiness, or read by humans.

## Children

The extension is not directed at children. It never transmits any information, so the developer receives no information from anyone, including children.

## Changes to this policy

If this policy changes, the updated version will be published at this address with a new effective date. Because the extension never transmits data, any change would be to wording or to reflect new features.

## Contact

Questions or concerns: open an issue at <https://github.com/sujay2306/blitzfill-ttd/issues>.

BlitzFill is an independent project, not affiliated with or endorsed by Tirumala Tirupati Devasthanams (TTD).
