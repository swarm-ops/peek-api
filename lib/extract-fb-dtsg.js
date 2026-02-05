#!/usr/bin/env node

// fb_dtsg Extraction Test
//
// Strategy: Launch real Chrome with --remote-debugging-port and the user's
// real profile, then connect via Playwright's CDP to extract fb_dtsg.
//
// Key insight: We're NOT launching Chrome through Playwright (which gets
// detected). We're launching Chrome normally and just connecting to read
// the page after it loads.
//
// Usage:
//   node extract-fb-dtsg.js
//   node extract-fb-dtsg.js --connect-only    # Don't launch Chrome, just connect
//   node extract-fb-dtsg.js --port 9333
//
// Requirements: Chrome installed, playwright installed (for CDP connect only)

import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const args = process.argv.slice(2);
let connectOnly = args.includes('--connect-only');
let debugPort = 9333;
const portIdx = args.indexOf('--port');
if (portIdx !== -1) debugPort = parseInt(args[portIdx + 1], 10);

const profileDir = path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome');
const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

console.log('');
console.log('  fb_dtsg Extraction Test');
console.log('  ──────────────────────');
console.log('');

if (!connectOnly) {
  // Check Chrome isn't already running
  try {
    const procs = execSync('pgrep -fl "Google Chrome" 2>/dev/null || true', { encoding: 'utf8' });
    if (procs.includes('Google Chrome')) {
      console.log('  Chrome is already running. Need to close it first');
      console.log('  (Chrome locks its profile dir to one instance).');
      console.log('');
      console.log('  Options:');
      console.log('    1. Close Chrome, then re-run this script');
      console.log('    2. If Chrome was started with --remote-debugging-port,');
      console.log('       re-run with: node extract-fb-dtsg.js --connect-only');
      console.log('');
      process.exit(1);
    }
  } catch {}

  console.log(`  Launching Chrome with debug port ${debugPort}...`);
  console.log(`  Profile: ${profileDir}`);
  console.log('');

  const chrome = spawn(chromePath, [
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    'https://www.instagram.com/'
  ], {
    detached: true,
    stdio: 'ignore'
  });
  chrome.unref();

  console.log('  Chrome launched. Waiting 8 seconds for page to load...');
  await new Promise(r => setTimeout(r, 8000));
} else {
  console.log(`  Connecting to existing Chrome on port ${debugPort}...`);
}

// Connect via Playwright CDP
const { chromium } = await import('playwright');

let browser;
try {
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`);
} catch (err) {
  console.log(`  Could not connect to Chrome on port ${debugPort}.`);
  console.log(`  Error: ${err.message}`);
  console.log('');
  console.log('  Make sure Chrome is running with:');
  console.log(`    "${chromePath}" --remote-debugging-port=${debugPort} --user-data-dir="${profileDir}" https://www.instagram.com/`);
  process.exit(1);
}

console.log('  Connected to Chrome via CDP.');

const contexts = browser.contexts();
console.log(`  Found ${contexts.length} context(s).`);

// Find Instagram page
let igPage = null;
for (const ctx of contexts) {
  for (const page of ctx.pages()) {
    const url = page.url();
    if (url.includes('instagram.com')) {
      igPage = page;
      break;
    }
  }
  if (igPage) break;
}

if (!igPage) {
  console.log('  No Instagram tab found. Opening one...');
  const ctx = contexts[0];
  igPage = await ctx.newPage();
  await igPage.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 5000));
}

const pageUrl = igPage.url();
const pageTitle = await igPage.title();
console.log(`  Page: ${pageTitle}`);
console.log(`  URL: ${pageUrl}`);
console.log('');

// Check login status
if (pageUrl.includes('/accounts/login') || pageTitle.toLowerCase().includes('log in')) {
  console.log('  NOT LOGGED IN - you need to log into Instagram in this Chrome window.');
  console.log('  After logging in, re-run with: node extract-fb-dtsg.js --connect-only');
  await browser.close();
  process.exit(1);
}

// Extract fb_dtsg using multiple methods
console.log('  Searching for fb_dtsg token...');
console.log('');

// Method 1: DTSGInitialData in page source
console.log('  [1] Checking DTSGInitialData in page HTML...');
const method1 = await igPage.evaluate(() => {
  const html = document.documentElement.outerHTML;

  // Instagram embeds this in script tags
  const patterns = [
    /"DTSGInitialData"[^}]*"token":"([^"]+)"/,
    /DTSGInitData[^}]*"token":"([^"]+)"/,
    /"dtsg"[^}]*"token":"([^"]+)"/,
    /fb_dtsg["']\s*[:,=]\s*["']([^"']+)/
  ];

  for (const pat of patterns) {
    const m = html.match(pat);
    if (m) return { found: true, token: m[1], pattern: pat.source.substring(0, 40) };
  }

  return { found: false, htmlLength: html.length };
});

if (method1.found) {
  console.log(`    FOUND via: ${method1.pattern}`);
  console.log(`    Token: ${method1.token.substring(0, 30)}...`);
} else {
  console.log(`    Not found. Page HTML: ${method1.htmlLength} chars`);
}

// Method 2: Hidden input element
console.log('  [2] Checking for hidden input...');
const method2 = await igPage.evaluate(() => {
  const input = document.querySelector('input[name="fb_dtsg"]');
  if (input) return { found: true, token: input.value };
  return { found: false };
});

if (method2.found) {
  console.log(`    FOUND via hidden input!`);
  console.log(`    Token: ${method2.token.substring(0, 30)}...`);
} else {
  console.log('    No hidden input found.');
}

// Method 3: JavaScript globals and require system
console.log('  [3] Checking JS globals...');
const method3 = await igPage.evaluate(() => {
  const results = {};

  // Check Instagram's internal require system
  if (typeof require !== 'undefined') {
    try {
      const dtsg = require('DTSGInitialData');
      if (dtsg?.token) return { found: true, token: dtsg.token, source: 'require(DTSGInitialData)' };
    } catch {}
    try {
      const dtsg = require('DTSG');
      if (dtsg?.getToken) return { found: true, token: dtsg.getToken(), source: 'require(DTSG).getToken()' };
    } catch {}
  }

  // Check window._sharedData (legacy Instagram)
  if (window._sharedData) {
    const str = JSON.stringify(window._sharedData);
    const m = str.match(/"token":"([^"]{20,})"/);
    if (m) return { found: true, token: m[1], source: 'window._sharedData' };
  }

  // Check all script tags for require'd modules
  const scripts = document.querySelectorAll('script[type="application/json"]');
  for (const s of scripts) {
    try {
      const data = JSON.parse(s.textContent);
      const str = JSON.stringify(data);
      if (str.includes('DTSGInitialData') || str.includes('fb_dtsg')) {
        const m = str.match(/"token":"([^"]{20,})"/);
        if (m) return { found: true, token: m[1], source: 'script[type=application/json]' };
      }
    } catch {}
  }

  return { found: false };
});

if (method3.found) {
  console.log(`    FOUND via: ${method3.source}`);
  console.log(`    Token: ${method3.token.substring(0, 30)}...`);
} else {
  console.log('    Not found in JS globals.');
}

// Method 4: Broad search for any token-like strings near "dtsg"
console.log('  [4] Broad token search...');
const method4 = await igPage.evaluate(() => {
  const html = document.documentElement.innerHTML;
  const found = [];

  // Find all contexts where "dtsg" appears
  const regex = /.{0,30}dtsg.{0,50}/gi;
  let m;
  while ((m = regex.exec(html)) !== null && found.length < 5) {
    found.push(m[0].replace(/\n/g, ' ').trim());
  }

  return { count: found.length, samples: found };
});

if (method4.count > 0) {
  console.log(`    Found ${method4.count} "dtsg" references:`);
  method4.samples.forEach((s, i) => {
    console.log(`      [${i}] ...${s.substring(0, 70)}...`);
  });
} else {
  console.log('    No "dtsg" references found anywhere in page.');
}

// Method 5: Network interception - trigger a light action
console.log('  [5] Checking network requests for fb_dtsg...');
const networkTokens = [];

// Listen for requests that contain fb_dtsg
igPage.on('request', req => {
  const postData = req.postData() || '';
  if (postData.includes('fb_dtsg')) {
    const m = postData.match(/fb_dtsg=([^&]+)/);
    if (m) networkTokens.push({ url: req.url(), token: decodeURIComponent(m[1]) });
  }
});

// Trigger a minor action to generate a request (scroll feed)
await igPage.evaluate(() => window.scrollBy(0, 500));
await new Promise(r => setTimeout(r, 3000));

if (networkTokens.length > 0) {
  console.log(`    FOUND ${networkTokens.length} token(s) in network traffic!`);
  networkTokens.forEach(t => {
    console.log(`      URL: ${t.url.substring(0, 60)}`);
    console.log(`      Token: ${t.token.substring(0, 30)}...`);
  });
} else {
  console.log('    No fb_dtsg in captured network requests (scroll may not have triggered one).');
}

// Final summary
console.log('');
console.log('  ── Results ──');
console.log('');

const found = method1.found || method2.found || method3.found || networkTokens.length > 0;
const token = method1.found ? method1.token
  : method2.found ? method2.token
  : method3.found ? method3.token
  : networkTokens.length > 0 ? networkTokens[0].token
  : null;

if (found) {
  console.log('  STATUS: SUCCESS - fb_dtsg extracted!');
  console.log(`  Token: ${token}`);
  console.log('');
  console.log('  This means Instagram write operations may be possible.');
  console.log('  Next: test a write operation (like/unlike a post) using this token.');
  console.log('');

  // Save token for use
  const tokenFile = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'fb-dtsg-token.json');
  fs.writeFileSync(tokenFile, JSON.stringify({
    token,
    extracted: new Date().toISOString(),
    method: method1.found ? 'DTSGInitialData' : method2.found ? 'hidden_input' : method3.found ? method3.source : 'network',
    note: 'This token expires. Re-extract if write operations fail.'
  }, null, 2));
  console.log(`  Token saved to: ${tokenFile}`);
} else {
  console.log('  STATUS: NOT FOUND');
  console.log('');
  console.log('  fb_dtsg was not found in the page. Possible causes:');
  console.log('    - Instagram may load it lazily (only on certain interactions)');
  console.log('    - The --remote-debugging-port flag may trigger detection');
  console.log('    - The token may be in an iframe or web worker');
  console.log('    - Instagram may have changed where they embed it');
  console.log('');
  console.log('  Try:');
  console.log('    1. Interact with Instagram in the Chrome window');
  console.log('       (like a post, open DMs, etc.)');
  console.log('    2. Re-run with --connect-only to check again');
}

console.log('');

// Don't close browser - leave Chrome running for user
await browser.close(); // This just disconnects CDP, doesn't close Chrome
