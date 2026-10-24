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
Unofficial tool. Not affiliated with or endorsed by Tirumala Tirupati Devasthanams (TTD).

BlitzFill fills your saved pilgrim details into booking forms on the official TTD websites in one click.

Why I built it
The booking site asks for every pilgrim's name, age, gender and ID number on every booking attempt. Booking for my family meant typing the same details for four or five people again each time, while slots were filling up. BlitzFill stores those details once, in your browser, and types them into the form for you. You still solve the CAPTCHA, check the form and press Continue yourself.

What it fills
• Pilgrim rows on Darshan, Seva and Accommodation booking forms: name, age, gender, photo-ID type and ID number.
• The Srivani Trust donor form.
• Contact details: email, mobile, country, state, city, PIN code and gothram.
• Passport holders: when the passport/visa popup opens, BlitzFill fills the passport number and country, does not submit the popup, and reminds you to review it.
• Other forms on these sites: a fallback reads field names and labels and fills the fields it recognises.

How you use it
• Click the Fill button that appears on booking forms, click Fill This Page in the toolbar popup, or press Alt+Shift+F.
• Filled fields flash green. Anything it couldn't fill, and required fields still empty, are outlined in red.
• Changed your mind? Undo restores every field the last fill changed.
• By default only empty fields are filled, so nothing you typed is overwritten.
• Optional auto-fill (off by default) fills the form as soon as it appears.
• Use Add Pilgrim for one person, or Paste List to add several at once (one per line: Name, Age, M/F/T, Aadhaar).
• Aadhaar numbers are checked with the official checksum, and ages, mobiles, PIN codes and emails are validated when you save.
• Follows your system's light or dark appearance. Export and import your list as a JSON backup.

Why it's fast
The booking site is a React app. Instead of setting values and sleeping for a fixed time, BlitzFill calls each field's own change and blur handlers and waits only until the page has actually updated that field. Fields that already hold the right value are skipped, dropdowns are filled the moment their options appear, and a final check re-fills anything the page reset. The result toast shows how long the fill took.

Private by design
• Your details are stored only in your browser (chrome.storage.local).
• No network requests, no servers, no accounts, no analytics, no tracking.
• Runs only on ttdevasthanams.ap.gov.in and tirupatibalaji.ap.gov.in.
• Delete everything any time from Settings → Clear All Data, or by uninstalling.

What it does not do
• It does not solve or bypass CAPTCHAs or OTPs.
• It does not submit forms or click Continue, Book or Pay.
• It does not automate payment.
It types for you. You stay in control of the booking.

Free and open source (MIT): https://github.com/sujay2306/blitzfill-ttd

Independent project, not affiliated with or endorsed by Tirumala Tirupati Devasthanams (TTD).
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
