# Chrome Web Store listing: BlitzFill for TTD

Copy each field below into the Developer Dashboard. Everything inside the fenced blocks is meant to be pasted as-is.

## Title

The store title comes from `name` in `manifest.json` (via `_locales/en/messages.json` → `appName`). It is:

```
BlitzFill for TTD
```

17 characters (limit 45).

## Short description (summary)

The dashboard uses the manifest `description` (`appDesc`) as the summary. Recommended text, which the code agent should put into `_locales/en/messages.json` → `appDesc` if it isn't already:

```
Fill saved pilgrim details into TTD booking forms in one click. Unofficial, not affiliated with TTD. Data stays on your device.
```

**127 characters** (limit 132).

## Category

Workflow & Planning

## Language

English

## Full description

Plain text, no markdown. Paste between the lines.

```
Unofficial. Not affiliated with or endorsed by Tirumala Tirupati Devasthanams (TTD).

A small autofill for TTD booking forms. Save pilgrim and contact details once, then fill the form with one click or Alt+Shift+F.

• Fills pilgrim rows (name, age, gender, ID type, ID number) and general details (email, state, city, PIN code).
• Add pilgrims one by one, or paste a list: Name, Age, M/F/T, Aadhaar.
• Only fills empty fields. Undo is available.
• Data stays in your browser. No servers, no accounts, no tracking.
• Does not solve CAPTCHA or OTP, does not submit forms, does not touch payment.

Open source (MIT): https://github.com/sujay2306/blitzfill-ttd
```

## Single purpose

```
BlitzFill fills pilgrim and contact details that the user has saved locally into booking forms on the official TTD websites (ttdevasthanams.ap.gov.in and tirupatibalaji.ap.gov.in), so the user does not have to retype them on every booking attempt.
```

## Permission justifications

These are every permission in `manifest.json` (`permissions: ["storage", "scripting"]`, plus two host permissions).

**storage**
```
Stores the pilgrim details, contact details and settings that the user enters in the popup, using chrome.storage.local on the user's device. Nothing is synced or sent anywhere.
```

**scripting**
```
When the extension is installed or updated, TTD tabs that are already open do not yet have the content scripts. The service worker uses chrome.scripting.executeScript to add the same bundled fill scripts to those open TTD tabs only, so the user does not need to reload them. No remote code is injected.
```

**Host permission: https://ttdevasthanams.ap.gov.in/\***
```
The official TTD booking website. The extension's content scripts run here to detect booking forms and fill the user's saved details into them when the user asks.
```

**Host permission: https://tirupatibalaji.ap.gov.in/\***
```
The second official TTD booking domain. Same use: detect booking forms and fill the user's saved details into them when the user asks.
```

## Remote code

**No, I am not using remote code.** All JavaScript is packaged in the extension. The extension pages' CSP is `script-src 'self'; connect-src 'none'`.

## Data usage (Privacy practices tab)

**What user data do you plan to collect from users now or in the future?**

Tick **Personally identifiable information** only. Leave everything else unticked, including Authentication information, which covers logins, passwords and cookies; an Aadhaar number is an ID number, not a credential. The Chrome Web Store requires disclosure even when data is only stored locally ([User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)). The user's details (name, age, gender, ID number, contact details) are stored only on their device in `chrome.storage.local` and are never transmitted to the developer or anyone else.

(If a reviewer asks: the extension handles names, ages, ID numbers and contact details entered by the user, but only locally, and only to type them into the TTD form the user is on.)

**Certifications.** Tick all three:

- [x] I do not sell or transfer user data to third parties, outside of the approved use cases.
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL**
```
https://github.com/sujay2306/blitzfill-ttd/blob/main/PRIVACY.md
```

## Other fields

- **Homepage URL:** https://github.com/sujay2306/blitzfill-ttd
- **Support URL:** https://github.com/sujay2306/blitzfill-ttd/issues
- **Mature content:** No
- **Pricing:** Free (no in-app purchases)
