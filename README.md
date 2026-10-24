# BlitzFill for TTD

Fill TTD booking forms in one click.

The TTD site makes you retype every pilgrim's name, age and Aadhaar on every booking attempt. So I built this. Save your details once, press `Alt+Shift+F`, done.

- Fills darshan, seva, accommodation and Srivani forms, plus general details (email, state, city, PIN)
- **Paste List**: add everyone at once from a spreadsheet (`Name, Age, M/F/T, Aadhaar`)
- Free, no account, no tracking. Your data never leaves your browser
- Never touches CAPTCHA, OTP or payment, and never submits for you

## Install (free)

1. Download the zip from [Releases](https://github.com/sujay2306/blitzfill-ttd/releases/latest) and unzip it
2. Open `chrome://extensions` and turn on **Developer mode** (top right)
3. Click **Load unpacked** and pick the unzipped folder

## Use

1. Click the BlitzFill icon, add your pilgrims and fill in the **Contact** tab
2. Open a TTD booking form
3. Press `Alt+Shift+F`, click ⚡ on the page, or click **Fill This Page**
4. Check the form, solve the CAPTCHA, continue

Something didn't fill? [Open an issue](https://github.com/sujay2306/blitzfill-ttd/issues) with the form and field name.

## Dev

```
npm install && npm test
bash scripts/package.sh
```

MIT · Not affiliated with TTD · [Privacy](PRIVACY.md)
