# MCK — Makkal Comitee Katchi

**மக்கள் கமிட்டி கட்சி** · *“நம்ம ஆளு… நம்ம கமிட்டி… நம்ம கச்சி!”*

A one-page, mobile-first membership site for MCK, a satirical, employee-created
party backing Raajeshwar in the Team Games Committee election. Visitors join in a
single submission. Registrations are stored in a **private Google Sheet** through
a Google Apps Script web app.

> ⚠️ **GitHub Pages alone does not save anything.** It only serves static files.
> Until you deploy the Apps Script backend and put its URL in `config.js`, the
> form stays disabled and says registration isn't open yet.

This is not an official company website, and the company does not sponsor or endorse it.

---

## Project structure

```
index.html            Single page: header, hero, manifesto, membership form, privacy, footer
styles.css            Mobile-first styles (no frameworks, no web fonts)
app.js                Form validation, submission, and UI states
config.js             The ONLY file to edit: backend URL, demo mode, contact, domains
assets/mck-logo.svg   MCK emblem (original artwork)
assets/favicon.svg
backend/Code.gs       Google Apps Script backend (paste into the Sheet's script editor)
backend/appsscript.json  Optional Apps Script manifest (for clasp users)
dev/mock-backend.mjs  Local test backend that runs the real Code.gs in Node
.nojekyll             Tells GitHub Pages to serve files as-is
```

How the pieces connect:

```
Browser (GitHub Pages)  ──POST JSON──▶  Apps Script web app  ──appendRow──▶  Private Google Sheet
                         ◀──{ok:true}──
```

## How registration works

- **Fields:** full name (required), work email (required), team (optional), and a consent checkbox (required).
- The client validates the fields first. The server then validates everything again on its own.
- The submit button is disabled while a request is in flight. Repeat clicks are ignored, and the form locks after a success.
- The success message appears **only** when the backend replies `{"ok": true}`. Timeouts, network errors, non-JSON replies and server errors all show a clear "not confirmed / not saved" message, and the user can retry.
- If someone registers an email that is already on the list, they get a friendly "already a member" reply and no duplicate row is added. Emails are matched without regard to case.
- **Abuse protection:** a hidden honeypot field, a minimum fill time, a global rate limit (20 per minute by default), a script lock against concurrent writes, a size limit on requests, and escaping of values that start with `= + - @` so a spreadsheet can't run them as formulas.
- **CORS:** the request is sent as `Content-Type: text/plain`. That makes it a "simple" request, so the browser skips the preflight check, which Apps Script can't answer. Apps Script then redirects to `script.googleusercontent.com`, and that response carries the CORS header. The code never uses `no-cors` mode, because it has to read the reply to confirm the registration was saved.
- Nothing the visitor types is stored in `localStorage` or `sessionStorage`. The site has no analytics, trackers or external fonts.

### Modes (set in `config.js`)

| `endpoint` | `demoMode` | Result |
|---|---|---|
| empty / invalid | `false` | **Unconfigured.** The form is disabled and a notice explains how to configure it. |
| any | `true` | **Demo.** A striped DEMO MODE banner appears and submissions are only simulated. Nothing is saved. An email containing `fail` simulates a backend error. |
| `https://…/exec` | `false` | **Live.** Registrations go to your sheet. |

---

## 1. Set up the backend (Google Sheet + Apps Script)

1. Go to <https://sheets.google.com> and create a new blank spreadsheet, e.g. **MCK Registrations**.
   Leave its sharing settings **Restricted** (the default). **Never** set it to "Anyone with the link".
2. In the spreadsheet, open **Extensions → Apps Script**.
3. Delete the sample code and paste in the full contents of `backend/Code.gs`. Save.
   - Optional: if you want to accept only company emails, set `ALLOWED_EMAIL_DOMAINS` (e.g. `['example.com']`).
4. Authorise the script: select `setup` in the function dropdown and click **Run**.
   - Google will ask for permission to *"View and manage spreadsheets that this application has been installed in"*. The `@OnlyCurrentDoc` tag restricts the script to **this one sheet**.
   - You may see "Google hasn't verified this app". Click **Advanced → Go to (project) (unsafe)**. This is normal for your own scripts.
   - `setup` creates a **Registrations** tab with headers: Registered At, Full Name, Work Email, Team / Department, Consent.
5. Click **Deploy → New deployment**, then click the gear icon and choose **Web app**:
   - **Description:** `MCK registration v1`
   - **Execute as:** **Me** (the sheet owner, so visitors never need access to the sheet)
   - **Who has access:** **Anyone**. Visitors must be able to submit without a Google login. If you choose "Anyone with Google account" or restrict access to your domain, the browser gets a login page instead of JSON, and the site shows "registration not confirmed".
6. Click **Deploy** and copy the **Web app URL**. It ends in `/exec`.
7. Test it: open the URL in a browser. You should see
   `{"ok":true,"service":"MCK registration desk",...}`. The GET endpoint never returns registration data.

**Changing the backend later:** after you edit `Code.gs`, go to **Deploy → Manage deployments → ✏️ Edit**, set **Version: New version**, and click **Deploy**.
This keeps the same URL. If you choose "New deployment" instead, you get a **new** URL, and you must update `config.js`.

**Who can see the data:** only people the sheet is shared with. The web app can only append rows and check whether an email is already registered, and it never sends any registration back to the browser.

## 2. Configure the frontend

Edit `config.js`:

```js
endpoint: 'https://script.google.com/macros/s/AKfy.../exec',
demoMode: false,
allowedEmailDomains: [],            // keep in sync with Code.gs, if used
contact: { label: 'Message the organiser on Teams', href: '' }   // or a mailto: link
```

`config.js` is public, so never put secrets in it. The web-app URL is not a secret.
`contact` is used for correction and deletion requests. Until you fill it in, the page says "contact details coming soon".

## 3. Deploy to GitHub Pages

1. Create a repository on GitHub, e.g. `mck`. It can be public or private, but private repositories need a paid plan to use Pages.
2. Push this folder to the repository:
   ```bash
   cd MCK
   git init
   git add .
   git commit -m "MCK membership site"
   git branch -M main
   git remote add origin https://github.com/<your-username>/mck.git
   git push -u origin main
   ```
3. On GitHub, go to **Settings → Pages**. Under **Build and deployment**, choose:
   **Source:** *Deploy from a branch*, **Branch:** `main`, **Folder:** `/ (root)`. Click **Save**.
4. After a minute, the site is live at `https://<your-username>.github.io/mck/`.

**Base path:** every asset path is relative (`styles.css`, `assets/...`), so the
site works without changes both at a project URL (`/mck/`) and at a user site or custom
domain (`/`). You don't need to set a base path.

## 4. Go-live checklist

- [ ] Sheet created; sharing is **Restricted**; you can see the **Registrations** tab.
- [ ] `setup` run once and permissions granted.
- [ ] Web app deployed with **Execute as: Me** and **Who has access: Anyone**.
- [ ] Opening the `/exec` URL shows `{"ok":true,...}`.
- [ ] `config.js`: `endpoint` set, `demoMode: false`, `contact` filled in.
- [ ] Pushed to GitHub, Pages enabled, site loads with no DEMO banner and no "not open yet" notice.
- [ ] Submit an empty form: each field shows an inline error.
- [ ] Register yourself: you see "You're in!" and a new row appears in the sheet.
- [ ] Register the same email again: you see "Already one of us!" and no new row is added.
- [ ] Open the sheet's link in a private window: it asks you to sign in or request access, which shows the sheet is **not public**.
- [ ] Test on a phone.
- [ ] Delete your test rows from the sheet.

## Local development and testing

Serve the site locally (any static server works):

```bash
python3 -m http.server 8080      # then open http://localhost:8080
```

To test without Google, run the bundled mock backend. It executes the **real**
`backend/Code.gs` against an in-memory sheet:

```bash
node dev/mock-backend.mjs        # http://localhost:8787/exec
```

Then, **locally only**, set `endpoint: 'http://localhost:8787/exec'` in `config.js`.
Plain `http` is accepted only for `localhost` and `127.0.0.1`.
Use these special emails to test failure paths:

| Email contains | Simulates |
|---|---|
| `crash` | server exception → "not saved" error |
| `slow` | 30-second response → client timeout message (default timeout 20 s) |
| `html` | an HTML page instead of JSON (like a wrong "Who has access" setting) → "not confirmed" |
| same email twice | "already a member" |

Remember to set the real endpoint again before you push.

## Privacy

- The site collects only name, work email and an optional team, and only after the visitor gives explicit consent.
- The data is used only to keep the MCK member list and to send campaign/team-games updates. The page explains this.
- Data lives in a private sheet. The site never shows member lists, counts or testimonials.
- Registrations are not used to record or infer how anyone votes, and they are not shared with other nominees or third parties.
- Correction and deletion requests go through the configured contact. To delete someone, remove their row from the sheet.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Registration isn't open yet" | `endpoint` is empty or not `https://` in `config.js`. |
| "unexpected reply… not confirmed" | The web app access isn't **Anyone**, or the deployment is outdated. Redeploy (see step 1.5). |
| "couldn't reach the registration desk" | Wrong URL (must end in `/exec`, not `/dev`), or the visitor is offline. |
| Code changes aren't taking effect | Deploy a **new version** of the existing deployment. |
| Errors in Apps Script | In the Apps Script editor, open **Executions** to see the logs. |
