/**
 * MCK — Makkal Comitee Katchi registration desk.
 * Google Apps Script web app, bound to a private Google Sheet.
 *
 * Deploy: see backend/README section in the project README.
 * Access model: the web app runs as the spreadsheet owner ("Execute as: Me")
 * and accepts anonymous POSTs ("Who has access: Anyone"). The spreadsheet
 * itself stays private — visitors can only append rows through doPost().
 *
 * @OnlyCurrentDoc
 */

const MCK = {
  SHEET_NAME: 'Registrations',
  HEADERS: ['Registered At', 'Full Name', 'Work Email', 'Team / Department', 'Consent'],

  // Optional: only accept these email domains, e.g. ['example.com'].
  // Keep in sync with allowedEmailDomains in config.js.
  ALLOWED_EMAIL_DOMAINS: [],

  MAX_LEN: { name: 80, email: 254, team: 80 },
  MAX_BODY_CHARS: 4000,

  // Abuse protection
  MIN_FILL_MS: 1500,                // reject submissions faster than a human (keep in sync with app.js)
  MAX_REGISTRATIONS_PER_MINUTE: 20, // global cap across all visitors
  LOCK_WAIT_MS: 10000
};

const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Health check only. Never returns registration data. */
function doGet() {
  return reply_({ ok: true, service: 'MCK registration desk', message: 'Open for business. Registrations are accepted via POST.' });
}

function doPost(e) {
  let lock = null;
  try {
    const raw = e && e.postData && e.postData.contents;
    if (!raw || raw.length > MCK.MAX_BODY_CHARS) {
      return fail_('BAD_REQUEST', 'The registration request was empty or too large.');
    }

    let input;
    try {
      input = JSON.parse(raw);
    } catch (err) {
      return fail_('BAD_REQUEST', 'The registration request could not be read.');
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return fail_('BAD_REQUEST', 'The registration request could not be read.');
    }

    // Honeypot: the hidden "website" field must stay empty.
    if (str_(input.website)) {
      return fail_('REJECTED', 'This registration could not be accepted. Please reload the page and try again.');
    }

    // Time trap: bots tend to submit instantly.
    const elapsed = Number(input.elapsedMs);
    if (!isFinite(elapsed) || elapsed < MCK.MIN_FILL_MS) {
      return fail_('REJECTED', 'That was suspiciously fast, even for MCK. Please try again.');
    }

    const result = validate_(input);
    if (result.error) return fail_('VALIDATION', result.error, result.field);
    const member = result.member;

    lock = LockService.getScriptLock();
    if (!lock.tryLock(MCK.LOCK_WAIT_MS)) {
      return fail_('BUSY', 'The registration desk is very busy right now. Please try again in a moment.');
    }

    if (!takeRateLimitSlot_()) {
      return fail_('RATE_LIMITED', 'Too many people are joining at once (a good problem!). Please try again in a minute.');
    }

    const sheet = getSheet_();
    if (isAlreadyRegistered_(sheet, member.email)) {
      return reply_({ ok: true, status: 'already_member' });
    }

    sheet.appendRow([
      new Date(),
      safeCell_(member.name),
      safeCell_(member.email),
      safeCell_(member.team),
      'Yes'
    ]);
    SpreadsheetApp.flush();

    return reply_({ ok: true, status: 'registered' });
  } catch (err) {
    console.error('MCK registration error', err && err.stack ? err.stack : err);
    return fail_('SERVER_ERROR', 'Something went wrong at the party office and your registration was not saved. Please try again later.');
  } finally {
    if (lock) {
      try { lock.releaseLock(); } catch (ignored) { /* lock may not be held */ }
    }
  }
}

/** Run once from the Apps Script editor to create the sheet and grant permissions. */
function setup() {
  const sheet = getSheet_();
  console.log('Registrations sheet ready: "' + sheet.getName() + '" in ' + SpreadsheetApp.getActiveSpreadsheet().getName());
}

/* ---------------- helpers ---------------- */

function validate_(input) {
  const name = str_(input.name).replace(/\s+/g, ' ');
  const email = str_(input.email).toLowerCase();
  const team = str_(input.team).replace(/\s+/g, ' ');

  if (!name) return { field: 'name', error: 'Please tell us your full name.' };
  if (name.length < 2) return { field: 'name', error: 'That name looks a little short.' };
  if (name.length > MCK.MAX_LEN.name) return { field: 'name', error: 'Please keep your name under ' + MCK.MAX_LEN.name + ' characters.' };
  if (!NAME_RE.test(name)) return { field: 'name', error: 'Please use letters, spaces, hyphens or apostrophes only.' };

  if (!email) return { field: 'email', error: 'Please enter your work email.' };
  if (email.length > MCK.MAX_LEN.email || !EMAIL_RE.test(email)) {
    return { field: 'email', error: 'That doesn’t look like a valid email address.' };
  }
  const domains = MCK.ALLOWED_EMAIL_DOMAINS.map(function (d) { return String(d).trim().toLowerCase(); }).filter(String);
  if (domains.length && domains.indexOf(email.split('@').pop()) === -1) {
    return { field: 'email', error: 'Please use your work email address.' };
  }

  if (team.length > MCK.MAX_LEN.team) return { field: 'team', error: 'Please keep your team name under ' + MCK.MAX_LEN.team + ' characters.' };

  if (input.consent !== true) return { field: 'consent', error: 'Please tick the box to confirm you want to join.' };

  return { member: { name: name, email: email, team: team } };
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Script is not bound to a spreadsheet. Create it via Extensions > Apps Script in the Sheet.');
  let sheet = ss.getSheetByName(MCK.SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(MCK.SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(MCK.HEADERS);
    sheet.getRange(1, 1, 1, MCK.HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function isAlreadyRegistered_(sheet, email) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  const emailCol = MCK.HEADERS.indexOf('Work Email') + 1;
  const match = sheet.getRange(2, emailCol, lastRow - 1, 1)
    .createTextFinder(email)
    .matchCase(false)
    .matchEntireCell(true)
    .findNext();
  return match !== null;
}

/** Simple global rate limit. Must be called while holding the script lock. */
function takeRateLimitSlot_() {
  const cache = CacheService.getScriptCache();
  const key = 'rl:' + Math.floor(Date.now() / 60000);
  const used = Number(cache.get(key)) || 0;
  if (used >= MCK.MAX_REGISTRATIONS_PER_MINUTE) return false;
  cache.put(key, String(used + 1), 120);
  return true;
}

/** Stop user text from being interpreted as a spreadsheet formula. */
function safeCell_(value) {
  return /^[=+\-@\t\r]/.test(value) ? "'" + value : value;
}

function str_(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function fail_(code, message, field) {
  const body = { ok: false, code: code, message: message };
  if (field) body.field = field;
  return reply_(body);
}

function reply_(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}
