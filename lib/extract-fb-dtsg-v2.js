#!/usr/bin/env node

// fb_dtsg Extraction v2
//
// Uses Playwright's launchPersistentContext with the REAL Chrome user data
// directory. This is different from normal Playwright: we're using the real
// Chrome profile with all its cookies, localStorage, etc.
//
// The bet: Instagram's detection targets Playwright's *browser binary*
// (Chromium for Testing), not the launch mechanism. By using the real
// Chrome binary via executablePath + the real profile, we may bypass
// detection while still being able to extract page content.

import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const profileDir = path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome');
const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

console.log('');
console.log('  fb_dtsg Extraction v2');
console.log('  ─────────────────────');
console.log('');
console.log(`  Chrome: ${chromePath}`);
console.log(`  Profile: ${profileDir}`);
console.log('');

if (!fs.existsSync(chromePath)) {
  console.log('  Chrome not found. Is it installed?');
  process.exit(1);
}

const { chromium } = await import('playwright');

console.log('  Launching Chrome with persistent context...');
console.log('  (This uses YOUR real Chrome profile with existing cookies)');
console.log('');

let context;
try {
  context = await chromium.launchPersistentContext(profileDir, {
    executablePath: chromePath,
    headless: false,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--no-default-browser-check'
    ],
    viewport: { width: 1280, height: 900 },
    ignoreDefaultArgs: ['--enable-automation']
  });
} catch (err) {
  console.log(`  Failed to launch: ${err.message}`);
  console.log('');
  console.log('  If Chrome is already running, close it first.');
  console.log('  Playwright needs exclusive access to the profile directory.');
  process.exit(1);
}

console.log('  Chrome launched. Navigating to Instagram...');

const page = context.pages()[0] || await context.newPage();
await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });

// Wait for full page render
console.log('  Waiting for page to fully render...');
await new Promise(r => setTimeout(r, 5000));

const pageUrl = page.url();
const pageTitle = await page.title();
console.log(`  Page: ${pageTitle}`);
console.log(`  URL: ${pageUrl}`);
console.log('');

if (pageUrl.includes('/accounts/login') || pageTitle.toLowerCase().includes('log in')) {
  console.log('  NOT LOGGED IN.');
  console.log('  Log into Instagram in the Chrome window that just opened,');
  console.log('  then re-run this script.');
  // Don't close - let user log in
  console.log('');
  console.log('  Press Ctrl+C when done. Chrome will stay open.');
  await new Promise(() => {}); // Wait forever
}

// Check if Instagram detected automation
const isBlocked = await page.evaluate(() => {
  const body = document.body?.innerText || '';
  return body.includes('suspicious') || body.includes('automated') || body.includes('try again later');
});

if (isBlocked) {
  console.log('  Instagram detected automation and blocked the request.');
  console.log('  The real-Chrome-binary approach did not bypass detection.');
  await context.close();
  process.exit(1);
}

console.log('  Instagram loaded successfully. Searching for fb_dtsg...');
console.log('');

// === EXTRACTION METHODS ===

// Method 1: DTSGInitialData in page HTML
console.log('  [1] DTSGInitialData in page HTML...');
const m1 = await page.evaluate(() => {
  const html = document.documentElement.outerHTML;
  const patterns = [
    /"DTSGInitialData"[^}]*?"token"\s*:\s*"([^"]+)"/,
    /DTSGInitData[^}]*?"token"\s*:\s*"([^"]+)"/,
    /"dtsg"[^}]*?"token"\s*:\s*"([^"]+)"/,
    /fb_dtsg["']\s*[:,=]\s*["']([^"']+)/,
    /"token"\s*:\s*"([\w:.-]{20,})"/
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) return { found: true, token: m[1], via: p.source.substring(0, 30) };
  }
  return { found: false, len: html.length };
});
if (m1.found) console.log(`    FOUND: ${m1.token.substring(0, 30)}... (via ${m1.via})`);
else console.log(`    Not found (${m1.len} chars scanned)`);

// Method 2: Hidden input
console.log('  [2] Hidden input element...');
const m2 = await page.evaluate(() => {
  const el = document.querySelector('input[name="fb_dtsg"]');
  return el ? { found: true, token: el.value } : { found: false };
});
if (m2.found) console.log(`    FOUND: ${m2.token.substring(0, 30)}...`);
else console.log('    Not found');

// Method 3: JS require system / globals
console.log('  [3] JS globals and require...');
const m3 = await page.evaluate(() => {
  if (typeof require !== 'undefined') {
    try { const d = require('DTSGInitialData'); if (d?.token) return { found: true, token: d.token, via: 'require(DTSGInitialData)' }; } catch {}
    try { const d = require('DTSG'); if (d?.getToken) return { found: true, token: d.getToken(), via: 'require(DTSG).getToken()' }; } catch {}
  }
  if (window._sharedData) {
    const s = JSON.stringify(window._sharedData);
    const m = s.match(/"token":"([^"]{20,})"/);
    if (m) return { found: true, token: m[1], via: '_sharedData' };
  }
  for (const el of document.querySelectorAll('script[type="application/json"]')) {
    try {
      const s = JSON.stringify(JSON.parse(el.textContent));
      if (s.includes('DTSG') || s.includes('dtsg')) {
        const m = s.match(/"token"\s*:\s*"([^"]{20,})"/);
        if (m) return { found: true, token: m[1], via: 'script[json]' };
      }
    } catch {}
  }
  return { found: false };
});
if (m3.found) console.log(`    FOUND: ${m3.token.substring(0, 30)}... (via ${m3.via})`);
else console.log('    Not found');

// Method 4: Broad dtsg search
console.log('  [4] Broad "dtsg" search...');
const m4 = await page.evaluate(() => {
  const html = document.documentElement.innerHTML;
  const hits = [];
  const re = /.{0,20}dtsg.{0,40}/gi;
  let m;
  while ((m = re.exec(html)) !== null && hits.length < 5) hits.push(m[0].replace(/\n/g, ' ').trim());
  return { count: hits.length, hits };
});
if (m4.count > 0) {
  console.log(`    ${m4.count} reference(s):`);
  m4.hits.forEach((h, i) => console.log(`      [${i}] ...${h.substring(0, 60)}...`));
} else {
  console.log('    Zero references to "dtsg" in page.');
}

// Method 5: Network interception
console.log('  [5] Network interception (scrolling to trigger requests)...');
const netTokens = [];
page.on('request', req => {
  const pd = req.postData() || '';
  const url = req.url();
  if (pd.includes('fb_dtsg') || url.includes('fb_dtsg')) {
    const m = pd.match(/fb_dtsg=([^&]+)/) || url.match(/fb_dtsg=([^&]+)/);
    if (m) netTokens.push({ token: decodeURIComponent(m[1]) });
  }
  // Also check request headers/body for the token in JSON form
  if (pd.includes('"fb_dtsg"')) {
    try {
      const j = JSON.parse(pd);
      if (j.fb_dtsg) netTokens.push({ token: j.fb_dtsg });
    } catch {}
  }
});

// Scroll and interact to trigger API calls
await page.evaluate(() => window.scrollBy(0, 800));
await new Promise(r => setTimeout(r, 2000));
await page.evaluate(() => window.scrollBy(0, 800));
await new Promise(r => setTimeout(r, 3000));

if (netTokens.length > 0) {
  console.log(`    FOUND ${netTokens.length} token(s) in network traffic!`);
  netTokens.forEach(t => console.log(`      Token: ${t.token.substring(0, 30)}...`));
} else {
  console.log('    No fb_dtsg in network traffic.');
}

// === RESULTS ===
console.log('');
console.log('  ── Results ──');
console.log('');

const found = m1.found || m2.found || m3.found || netTokens.length > 0;
const token = m1.found ? m1.token : m2.found ? m2.token : m3.found ? m3.token : netTokens[0]?.token;

if (found) {
  console.log('  STATUS: SUCCESS');
  console.log(`  fb_dtsg token: ${token}`);
  console.log('');
  console.log('  Write operations may be possible with this token.');

  const outFile = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'fb-dtsg-token.json');
  fs.writeFileSync(outFile, JSON.stringify({
    token,
    extracted: new Date().toISOString(),
    note: 'Expires periodically. Re-extract if writes fail.'
  }, null, 2));
  console.log(`  Saved to: ${outFile}`);
} else {
  console.log('  STATUS: NOT FOUND');
  console.log('');
  console.log('  fb_dtsg was not found. This could mean:');
  console.log('    - Instagram detected Playwright and served a limited page');
  console.log('    - The token is loaded lazily (try interacting with the page)');
  console.log('    - Instagram changed how they embed fb_dtsg');
  console.log('');
  console.log('  The Chrome window is still open. Try:');
  console.log('    1. Interact with Instagram (like a post, open DMs)');
  console.log('    2. Check Chrome DevTools console for DTSGInitialData');
}

console.log('');
await context.close();
