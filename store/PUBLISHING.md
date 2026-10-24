# Publishing BlitzFill for TTD to the Chrome Web Store

A step-by-step checklist. All listing text is in [`listing.md`](listing.md); copy from there.

## What you need

| Item | File | Status |
|---|---|---|
| Extension zip | `dist/blitzfill-ttd-v1.0.0.zip` (built by `bash scripts/package.sh`) | build before uploading |
| Store icon, 128×128 | `icons/icon-128.png` | |
| Screenshots, 1280×800 (1 required, up to 5) | `store/screenshots/screenshot-*.png` | to add |
| Small promo tile, 440×280 | `store/promo-440x280.png` | ready |
| Marquee promo tile, 1400×560 (optional) | `store/marquee-1400x560.png` | ready |
| Privacy policy URL | `https://github.com/sujay2306/blitzfill-ttd/blob/main/PRIVACY.md` | live once the repo is pushed and public |

Push the repo to GitHub and make it public **before** submitting, so the privacy-policy and homepage links work when the reviewer opens them.

## 1. Register as a developer (one time)

1. Go to <https://chrome.google.com/webstore/devconsole> and sign in with the Google account you want to publish under.
2. Accept the developer agreement and pay the **one-time US$5 registration fee**.
3. Open **Account** in the left sidebar:
   - Set the **publisher name** (for example "Sujay KS").
   - Add a **contact email** and click the verification link Google sends you. You can't publish until it is verified.
4. **Trader / non-trader declaration.** On the Account page, declare whether you are a trader under EU law. If you publish this free extension as an individual hobby project with no commercial activity, choose **non-trader**. If you are publishing as a business or plan to make money from it, choose **trader**, which means your address and contact details are shown publicly on the listing to EU users.

## 2. Build the zip

```sh
npm test
bash scripts/package.sh      # writes dist/blitzfill-ttd-v1.0.0.zip
```

The zip must have `manifest.json` at its root, not inside a folder.

## 3. Create the item

1. In the dashboard click **New item**.
2. Upload `dist/blitzfill-ttd-v1.0.0.zip`.
3. The item opens in draft. Fill each tab below, saving with **Save draft** as you go.

## 4. Store listing tab

- **Title and summary:** come from the manifest (`BlitzFill for TTD` and `appDesc`). Check they match `listing.md`.
- **Description:** paste the "Full description" block from `listing.md`.
- **Category:** Workflow & Planning.
- **Language:** English.
- **Store icon:** upload `icons/icon-128.png`.
- **Screenshots:** upload `store/screenshots/screenshot-*.png` (1280×800, PNG or JPEG). At least one is required. Use test data only. Never show a real Aadhaar or passport number.
- **Small promo tile:** `store/promo-440x280.png`.
- **Marquee promo tile:** `store/marquee-1400x560.png` (optional; used if the store features the item).
- **Official URL:** leave as none (you don't own a verified domain for this).
- **Homepage URL:** `https://github.com/sujay2306/blitzfill-ttd`
- **Support URL:** `https://github.com/sujay2306/blitzfill-ttd/issues`
- **Mature content:** No.

## 5. Privacy practices tab

Copy from the matching sections of `listing.md`:

1. **Single purpose description:** the "Single purpose" block.
2. **Permission justification:** one box each for `storage`, `scripting` and host permissions. Paste the matching block. (The host permission box may be a single field; paste both host justifications into it.)
3. **Remote code:** select **No, I am not using remote code**.
4. **Data usage:** tick **Personally identifiable information** only. The data is stored locally and never transmitted, but the store requires disclosure even for locally stored data. Leave all other categories unticked.
5. Tick all **three certification checkboxes**.
6. **Privacy policy URL:** `https://github.com/sujay2306/blitzfill-ttd/blob/main/PRIVACY.md`

## 6. Distribution tab

- **Payments:** Free.
- **Visibility:** Public.
- **Regions:** All regions.

## 7. Submit

1. Click **Submit for review**. The dashboard lists anything still missing.
2. Optionally untick "Publish automatically after review" if you want to choose the moment it goes live.
3. **Review time:** usually a few days. Google's guidance is that most items are reviewed within about a week, and items with host permissions may take longer. You get an email when it is approved or rejected.
4. If rejected, the email names the policy. Fix it, upload again and resubmit.

After approval, copy the store URL into `README.md` in place of `<!-- CWS_URL -->`.

## 8. Publishing updates

1. Bump `version` in `manifest.json` (and `package.json`), for example `1.0.0` → `1.0.1`. The store rejects a zip whose version is not higher than the live one.
2. Run `npm test`, then `bash scripts/package.sh`. This writes `dist/blitzfill-ttd-v1.0.1.zip`.
3. In the dashboard open the item → **Package** → **Upload new package**, choose the new zip.
4. Update the listing text or screenshots if anything visible changed.
5. Click **Submit for review**.

Optional: push a `v1.0.1` git tag. The CI workflow then builds the zip and attaches it to a GitHub release, which you can download and upload to the store.
