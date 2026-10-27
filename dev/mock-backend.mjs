#!/usr/bin/env node
/*
 * Local test backend for MCK. Runs the REAL backend/Code.gs inside Node with
 * in-memory stand-ins for SpreadsheetApp, LockService, CacheService and
 * ContentService, so you can test the full form flow without Google.
 *
 *   node dev/mock-backend.mjs            # listens on http://localhost:8787
 *   PORT=9000 node dev/mock-backend.mjs
 *
 * Then set endpoint: 'http://localhost:8787/exec' in config.js (local only!).
 *
 * Special emails to exercise failure paths:
 *   ...crash...@  -> server throws (SERVER_ERROR)
 *   ...slow...@   -> response delayed 30 s (client timeout)
 *   ...html...@   -> returns an HTML page instead of JSON (BAD_RESPONSE)
 * Registering the same email twice returns status "already_member".
 * Nothing is written to disk.
 */
import http from 'node:http';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, '..', 'backend', 'Code.gs'), 'utf8');
const PORT = Number(process.env.PORT) || 8787;

// ---- in-memory Google services ----
const rows = [];
let crashNext = false;

const sheet = {
  getName: () => 'Registrations',
  getLastRow: () => rows.length,
  appendRow: (row) => {
    if (crashNext && rows.length > 0) { crashNext = false; throw new Error('Simulated spreadsheet failure'); }
    rows.push(row);
    console.log('  appended:', JSON.stringify(row));
  },
  getRange: (row, col, numRows) => ({
    setFontWeight() { return this; },
    createTextFinder: (text) => {
      const finder = {
        matchCase: () => finder,
        matchEntireCell: () => finder,
        findNext: () => {
          const hit = rows.slice(row - 1, row - 1 + numRows)
            .some((r) => String(r[col - 1]).replace(/^'/, '').toLowerCase() === text.toLowerCase());
          return hit ? {} : null;
        }
      };
      return finder;
    }
  }),
  setFrozenRows() {}
};
const cache = new Map();
const context = vm.createContext({
  console,
  SpreadsheetApp: {
    getActiveSpreadsheet: () => ({ getSheetByName: () => sheet, insertSheet: () => sheet, getName: () => 'Mock' }),
    flush() {}
  },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
  CacheService: { getScriptCache: () => ({ get: (k) => cache.get(k) ?? null, put: (k, v) => cache.set(k, v) }) },
  ContentService: {
    MimeType: { JSON: 'application/json' },
    createTextOutput: (text) => ({ text, setMimeType() { return this; } })
  }
});
vm.runInContext(source, context, { filename: 'Code.gs' });

// ---- HTTP ----
const cors = { 'Access-Control-Allow-Origin': '*' };

http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    // Apps Script cannot answer preflights; the real frontend must never need one.
    res.writeHead(405, cors).end();
    console.warn('! Received a CORS preflight — the real Apps Script would fail this request.');
    return;
  }
  if (req.method === 'GET') {
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' }).end(context.doGet().text);
    return;
  }
  if (req.method !== 'POST') { res.writeHead(405, cors).end(); return; }

  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    console.log(`POST ${req.headers['content-type']} ${body}`);
    let email = '';
    try { email = String(JSON.parse(body).email || ''); } catch { /* let Code.gs reject it */ }

    if (email.includes('html')) {
      res.writeHead(200, { ...cors, 'Content-Type': 'text/html' }).end('<html><body>Sign in</body></html>');
      return;
    }
    if (email.includes('crash')) crashNext = true;

    const send = () => {
      const out = context.doPost({ postData: { contents: body } }).text;
      console.log('  ->', out);
      res.writeHead(200, { ...cors, 'Content-Type': 'application/json' }).end(out);
    };
    email.includes('slow') ? setTimeout(send, 30000) : send();
  });
}).listen(PORT, () => console.log(`MCK mock backend on http://localhost:${PORT}/exec (running backend/Code.gs)`));
