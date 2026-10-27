/* MCK membership form.
 *
 * Modes (decided from config.js):
 *   live         — endpoint set: POST to the Google Apps Script web app.
 *   demo         — demoMode true: simulated backend, clearly labelled, nothing saved.
 *   unconfigured — no valid endpoint: submission disabled with an explanation.
 *
 * Nothing the visitor types is ever written to localStorage/sessionStorage.
 */
(() => {
  'use strict';

  const cfg = window.MCK_CONFIG || {};

  const MIN_FILL_MS = 1500; // keep in sync with MIN_FILL_MS in backend/Code.gs
  const MAX_LEN = { name: 80, email: 254, team: 80 };
  const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u;
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  const SUCCESS_MESSAGE =
    'Welcome to MCK! Your membership registration has been received. ' +
    'The party is now officially more ridiculous.';
  const ALREADY_MEMBER_MESSAGE =
    'You’re already a registered MCK member — no need to join twice. ' +
    'The party appreciates the enthusiasm!';

  const ERROR_MESSAGES = {
    TIMEOUT: 'The party office is taking too long to respond. Your registration was not confirmed — please try again in a moment.',
    NETWORK: 'We couldn’t reach the MCK registration desk. Check your connection and try again.',
    BAD_RESPONSE: 'The registration desk sent an unexpected reply, so your registration was not confirmed. Please try again later.',
    DEFAULT: 'Something went wrong and your registration was not saved. Please try again.'
  };

  const $ = (sel) => document.querySelector(sel);
  const els = {
    form: $('#join-form'),
    fieldset: $('#join-fieldset'),
    submit: $('#submit-btn'),
    status: $('#form-status'),
    success: $('#success'),
    successTitle: $('#success-title'),
    successMessage: $('#success-message'),
    configNotice: $('#config-notice'),
    name: $('#name'),
    email: $('#email'),
    team: $('#team'),
    consent: $('#consent'),
    honeypot: $('#website')
  };

  const formLoadedAt = Date.now();
  const mode = cfg.demoMode ? 'demo' : (isValidEndpoint(cfg.endpoint) ? 'live' : 'unconfigured');
  const allowedDomains = (cfg.allowedEmailDomains || []).map((d) => String(d).trim().toLowerCase()).filter(Boolean);

  let submitting = false;
  let registered = false;

  function isValidEndpoint(url) {
    if (typeof url !== 'string' || !url.trim()) return false;
    try {
      const u = new URL(url.trim());
      // Plain http is allowed only for the local mock backend (dev/mock-backend.mjs).
      return u.protocol === 'https:' ||
        (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1'));
    } catch (_) {
      return false;
    }
  }

  /* ---------- Setup ---------- */

  function init() {
    renderContact();

    if (mode === 'demo') {
      document.querySelectorAll('[data-demo-only]').forEach((el) => { el.hidden = false; });
      console.warn('[MCK] Demo mode: registrations are simulated and NOT saved.');
    } else if (mode === 'unconfigured') {
      els.configNotice.hidden = false;
      els.fieldset.disabled = true;
      console.warn('[MCK] No backend endpoint configured in config.js — registration disabled.');
    }

    els.form.addEventListener('submit', onSubmit);

    // Validate a field once the visitor leaves it; clear errors as they fix them.
    [els.name, els.email].forEach((input) => {
      input.addEventListener('blur', () => {
        if (input.value.trim()) showFieldError(input, validateField(input.name, readForm()));
      });
      input.addEventListener('input', () => {
        if (input.getAttribute('aria-invalid') === 'true') {
          showFieldError(input, validateField(input.name, readForm()));
        }
      });
    });
    els.consent.addEventListener('change', () => {
      if (els.consent.checked) showFieldError(els.consent, '');
    });
  }

  function renderContact() {
    const contact = cfg.contact || {};
    const label = typeof contact.label === 'string' ? contact.label.trim() : '';
    if (!label) return; // keep the "coming soon" placeholder

    const href = typeof contact.href === 'string' ? contact.href.trim() : '';
    const safeHref = /^(mailto:|https:\/\/|msteams:)/i.test(href) ? href : '';

    document.querySelectorAll('[data-contact]').forEach((slot) => {
      let node;
      if (safeHref) {
        node = document.createElement('a');
        node.href = safeHref;
        if (/^https:/i.test(safeHref)) node.rel = 'noopener';
      } else {
        node = document.createElement('span');
      }
      node.textContent = label;
      slot.replaceChildren(node);
    });
  }

  /* ---------- Validation ---------- */

  function readForm() {
    return {
      name: els.name.value.trim().replace(/\s+/g, ' '),
      email: els.email.value.trim().toLowerCase(),
      team: els.team.value.trim().replace(/\s+/g, ' '),
      consent: els.consent.checked,
      website: els.honeypot.value
    };
  }

  function validateField(field, data) {
    switch (field) {
      case 'name':
        if (!data.name) return 'Please tell us your full name.';
        if (data.name.length < 2) return 'That name looks a little short.';
        if (data.name.length > MAX_LEN.name) return `Please keep your name under ${MAX_LEN.name} characters.`;
        if (!NAME_RE.test(data.name)) return 'Please use letters, spaces, hyphens or apostrophes only.';
        return '';
      case 'email': {
        if (!data.email) return 'Please enter your work email.';
        if (data.email.length > MAX_LEN.email || !EMAIL_RE.test(data.email)) {
          return 'That doesn’t look like a valid email address.';
        }
        const domain = data.email.split('@').pop();
        if (allowedDomains.length && !allowedDomains.includes(domain)) {
          return `Please use your work email (${allowedDomains.map((d) => '@' + d).join(' or ')}).`;
        }
        return '';
      }
      case 'consent':
        return data.consent ? '' : 'Please tick the box to confirm you want to join.';
      default:
        return '';
    }
  }

  function showFieldError(input, message) {
    const errorEl = document.getElementById(input.id + '-error');
    if (errorEl) errorEl.textContent = message;
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }

  function validateAll(data) {
    let firstInvalid = null;
    [['name', els.name], ['email', els.email], ['consent', els.consent]].forEach(([field, input]) => {
      const message = validateField(field, data);
      showFieldError(input, message);
      if (message && !firstInvalid) firstInvalid = input;
    });
    return firstInvalid;
  }

  /* ---------- Submission ---------- */

  async function onSubmit(event) {
    event.preventDefault();
    if (submitting || registered || mode === 'unconfigured') return;

    hideStatus();
    const data = readForm();
    if (data.team.length > MAX_LEN.team) data.team = data.team.slice(0, MAX_LEN.team);

    const firstInvalid = validateAll(data);
    if (firstInvalid) {
      firstInvalid.focus();
      return;
    }

    setBusy(true);
    try {
      // Basic anti-bot timing: the server rejects instant submissions, so a
      // very fast (e.g. autofilled) human just waits a moment here instead.
      const wait = MIN_FILL_MS + 200 - (Date.now() - formLoadedAt);
      if (wait > 0) await delay(wait);

      const payload = {
        name: data.name,
        email: data.email,
        team: data.team,
        consent: data.consent,
        website: data.website,
        elapsedMs: Date.now() - formLoadedAt
      };

      const result = mode === 'demo' ? await submitDemo(payload) : await submitToAppsScript(payload);

      if (result.ok === true) {
        showSuccess(result.status);
      } else {
        handleServerError(result);
      }
    } catch (err) {
      showStatus(ERROR_MESSAGES[err && err.code] || ERROR_MESSAGES.DEFAULT);
      if (!(err && err.code)) console.error('[MCK] Registration failed:', err);
    } finally {
      if (!registered) setBusy(false);
    }
  }

  function handleServerError(result) {
    const message = typeof result.message === 'string' && result.message.trim()
      ? result.message.trim()
      : ERROR_MESSAGES.DEFAULT;

    const fieldInput = { name: els.name, email: els.email, consent: els.consent }[result.field];
    if (result.code === 'VALIDATION' && fieldInput) {
      showFieldError(fieldInput, message);
      fieldInput.focus();
      return;
    }
    showStatus(message);
  }

  /** Real backend: Google Apps Script web app.
   *  Sent as text/plain so the browser makes a "simple" CORS request (no
   *  preflight, which Apps Script cannot answer). Apps Script replies with a
   *  redirect to googleusercontent.com, which serves the JSON with CORS headers. */
  async function submitToAppsScript(payload) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Number(cfg.requestTimeoutMs) || 20000);

    let response;
    try {
      response = await fetch(cfg.endpoint.trim(), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        redirect: 'follow',
        credentials: 'omit',
        cache: 'no-store',
        signal: controller.signal
      });
    } catch (err) {
      throw codedError(err && err.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK', err);
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) throw codedError('BAD_RESPONSE', new Error('HTTP ' + response.status));

    let body;
    try {
      body = await response.json();
    } catch (err) {
      throw codedError('BAD_RESPONSE', err);
    }
    if (!body || typeof body.ok !== 'boolean') throw codedError('BAD_RESPONSE', new Error('Missing "ok" flag'));
    return body;
  }

  /** Demo backend: simulates latency and outcomes. Saves nothing. */
  async function submitDemo(payload) {
    await delay(900);
    if (payload.email.includes('fail')) {
      return { ok: false, code: 'SERVER_ERROR', message: 'Demo: simulated backend failure. Nothing was saved.' };
    }
    return { ok: true, status: 'registered', demo: true };
  }

  function codedError(code, cause) {
    const err = new Error(code);
    err.code = code;
    err.cause = cause;
    console.warn('[MCK] Registration request failed:', code, cause);
    return err;
  }

  /* ---------- UI state ---------- */

  function setBusy(busy) {
    submitting = busy;
    els.submit.disabled = busy;
    els.submit.setAttribute('aria-busy', String(busy));
    els.form.setAttribute('aria-busy', String(busy));
  }

  function showStatus(message) {
    els.status.textContent = message;
    els.status.hidden = false;
  }

  function hideStatus() {
    els.status.hidden = true;
    els.status.textContent = '';
  }

  function showSuccess(status) {
    registered = true;
    const already = status === 'already_member';
    els.successTitle.textContent = already ? 'Already one of us!' : 'You’re in!';
    els.successMessage.textContent = already ? ALREADY_MEMBER_MESSAGE : SUCCESS_MESSAGE;
    els.form.hidden = true;
    els.success.hidden = false;
    els.successTitle.focus();
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  init();
})();
