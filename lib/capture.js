import fs from 'node:fs';
import path from 'node:path';

// Static asset extensions to skip
const SKIP_EXTENSIONS = /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|map|webp|avif|mp4|webm|mp3)(\?|$)/i;

// Common tracking/analytics domains to skip
const SKIP_DOMAINS = /google-analytics|googletagmanager|doubleclick|facebook\.com\/tr|bat\.bing|analytics\.google|hotjar|segment\.io|mixpanel|amplitude|sentry\.io|datadoghq/i;

function isApiRequest(url, resourceType) {
  if (SKIP_EXTENSIONS.test(url)) return false;
  if (SKIP_DOMAINS.test(url)) return false;
  if (resourceType === 'xhr' || resourceType === 'fetch') return true;
  if (url.includes('/api/') || url.includes('/graphql') || url.includes('/rest/')) return true;
  return false;
}

export function dedupEndpoints(endpoints) {
  const seen = new Map();
  const result = [];

  for (const endpoint of endpoints) {
    const url = new URL(endpoint.url);
    const basePath = url.pathname;
    const key = `${endpoint.method}:${basePath}`;
    
    if (!seen.has(key)) {
      seen.set(key, true);
      result.push(endpoint);
    }
  }

  return result;
}

function extractAuth(headers) {
  const auth = { headers: {}, cookies: {} };

  for (const [key, value] of Object.entries(headers)) {
    const lk = key.toLowerCase();

    // Standard auth headers
    if (lk === 'authorization') auth.headers['Authorization'] = value;
    if (lk === 'x-api-key' || lk === 'apikey') auth.headers[key] = value;
    if (lk.includes('csrf') || lk.includes('xsrf')) auth.headers[key] = value;
    if (lk.includes('token') && !lk.includes('content')) auth.headers[key] = value;

    // Common platform-specific headers
    if (lk.startsWith('x-li-')) auth.headers[key] = value;     // LinkedIn
    if (lk.startsWith('x-restli')) auth.headers[key] = value;  // LinkedIn REST.li
    if (lk.startsWith('x-ig-')) auth.headers[key] = value;     // Instagram
    if (lk.startsWith('x-fb-')) auth.headers[key] = value;     // Facebook
    if (lk.startsWith('x-tw-')) auth.headers[key] = value;     // Twitter

    // Cookies
    if (lk === 'cookie') {
      value.split(';').forEach(c => {
        const [name, ...rest] = c.trim().split('=');
        if (name) auth.cookies[name.trim()] = rest.join('=').trim();
      });
    }
  }

  return auth;
}

async function launchBrowser(options) {
  const { stealth, headless, cdpEndpoint, sessionFile, userAgent } = options;

  // CDP mode - connect to existing browser
  if (cdpEndpoint) {
    const { chromium } = await import('playwright');
    console.log(`Connecting to Chrome via CDP: ${cdpEndpoint}`);
    const browser = await chromium.connectOverCDP(cdpEndpoint);
    const context = browser.contexts()[0];
    const page = await context.newPage();
    return { browser, context, page, ownsBrowser: false };
  }

  // Launch new browser
  let chromiumModule;
  if (stealth) {
    const pe = await import('playwright-extra');
    const stealthPlugin = await import('puppeteer-extra-plugin-stealth');
    pe.chromium.use(stealthPlugin.default());
    chromiumModule = pe.chromium;
  } else {
    const pw = await import('playwright');
    chromiumModule = pw.chromium;
  }

  const launchOptions = {
    headless,
    args: ['--disable-blink-features=AutomationControlled']
  };

  const browser = await chromiumModule.launch(launchOptions);

  const contextOptions = {};
  if (sessionFile) {
    contextOptions.storageState = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
  }
  if (userAgent) {
    contextOptions.userAgent = userAgent;
  } else if (stealth) {
    contextOptions.userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  }
  contextOptions.viewport = { width: 1280, height: 900 };

  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();

  return { browser, context, page, ownsBrowser: true };
}

export async function capture(options) {
  const {
    url,
    duration = 30,
    sessionFile,
    stealth = false,
    headless = true,
    cdpEndpoint,
    additionalPages = [],
    scrollInterval = 3000,
    userAgent,
    outputDir: customOutputDir,
    verbose = false
  } = options;

  const parsedUrl = new URL(url);
  const domain = parsedUrl.hostname.replace('www.', '');
  const outputDir = customOutputDir || `peek-api-${domain}`;

  const capturedRequests = [];
  const seenKeys = new Set();
  const allAuthHeaders = {};
  const allCookies = {};

  console.log(`\n  peek-api capture`);
  console.log(`  Target: ${url}`);
  console.log(`  Duration: ${duration}s per page`);
  console.log(`  Domain: ${domain}`);
  if (sessionFile) console.log(`  Session: ${sessionFile}`);
  if (stealth) console.log(`  Stealth: enabled`);
  if (additionalPages.length > 0) console.log(`  Additional pages: ${additionalPages.join(', ')}`);
  console.log('');

  // Launch browser
  const { browser, context, page, ownsBrowser } = await launchBrowser({
    stealth, headless, cdpEndpoint, sessionFile, userAgent
  });

  // Listen for network requests
  page.on('request', (request) => {
    const reqUrl = request.url();
    const resourceType = request.resourceType();

    if (!isApiRequest(reqUrl, resourceType)) return;

    const method = request.method();
    const parsed = new URL(reqUrl);
    const pathname = parsed.pathname;
    const key = `${method} ${pathname}`;

    if (seenKeys.has(key)) return;
    seenKeys.add(key);

    const headers = request.headers();
    const auth = extractAuth(headers);

    Object.assign(allAuthHeaders, auth.headers);
    if (Object.keys(auth.cookies).length > 0) {
      Object.assign(allCookies, auth.cookies);
    }

    const entry = {
      method,
      url: reqUrl,
      path: pathname,
      host: parsed.hostname,
      resourceType,
      params: Object.fromEntries(parsed.searchParams),
      headers: Object.keys(auth.headers).length > 0 ? auth.headers : undefined,
      postData: request.postData() || undefined,
      timestamp: new Date().toISOString()
    };

    // Clean up empty params
    if (Object.keys(entry.params).length === 0) delete entry.params;

    capturedRequests.push(entry);

    if (verbose) {
      console.log(`  [${method}] ${pathname}`);
    }
  });

  // Navigate to main URL
  console.log(`  Navigating to ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const title = await page.title();
  console.log(`  Page: ${title}`);

  // Check if logged in (basic detection)
  if (sessionFile) {
    const lowerTitle = title.toLowerCase();
    if (lowerTitle.includes('login') || lowerTitle.includes('sign in') || lowerTitle.includes('sign up')) {
      console.log(`\n  Warning: Page title suggests you're not logged in.`);
      console.log(`  Session may be expired. Continuing capture anyway.`);
    }
  }

  // Capture: scroll and wait
  console.log(`  Capturing for ${duration}s (scrolling every ${scrollInterval / 1000}s)`);

  const captureForDuration = async (durationMs) => {
    const startTime = Date.now();
    let scrollY = 0;
    while (Date.now() - startTime < durationMs) {
      await new Promise(r => setTimeout(r, scrollInterval));
      scrollY += 600;
      try {
        await page.evaluate((y) => window.scrollTo(0, y), scrollY);
      } catch {
        // Page may have navigated
      }
    }
  };

  await captureForDuration(duration * 1000);

  // Visit additional pages
  for (const pagePath of additionalPages) {
    const pageUrl = pagePath.startsWith('http') ? pagePath : `${parsedUrl.origin}${pagePath}`;
    console.log(`\n  Navigating to ${pageUrl}`);
    try {
      await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      console.log(`  Page: ${await page.title()}`);
      await captureForDuration(Math.min(duration, 15) * 1000);
    } catch (err) {
      console.log(`  Failed to load: ${err.message}`);
    }
  }

  // Summary
  console.log(`\n  Capture complete: ${capturedRequests.length} unique API endpoints`);

  if (capturedRequests.length === 0) {
    console.log('  No API requests captured. Try --no-headless to browse manually.');
    if (ownsBrowser) await browser.close();
    else { await page.close(); await browser.close(); }
    return;
  }

  // Group by base path
  const grouped = {};
  for (const req of capturedRequests) {
    const parts = req.path.split('/').filter(Boolean);
    const basePath = '/' + parts.slice(0, Math.min(parts.length, 3)).join('/');
    if (!grouped[basePath]) grouped[basePath] = [];
    grouped[basePath].push(req);
  }

  // Generate CAPTURE.md
  const lines = [];
  lines.push(`# API Capture: ${domain}`);
  lines.push(`**Date:** ${new Date().toISOString()}`);
  lines.push(`**URL:** ${url}`);
  lines.push(`**Duration:** ${duration}s`);
  lines.push(`**Endpoints Found:** ${capturedRequests.length}`);
  if (sessionFile) lines.push(`**Authenticated:** Yes`);
  if (stealth) lines.push(`**Stealth:** Enabled`);
  lines.push('');

  if (Object.keys(allAuthHeaders).length > 0) {
    lines.push('## Authentication Headers');
    lines.push('```json');
    lines.push(JSON.stringify(allAuthHeaders, null, 2));
    lines.push('```');
    lines.push('');
  }

  if (Object.keys(allCookies).length > 0) {
    lines.push('## Session Cookies');
    lines.push(`Found ${Object.keys(allCookies).length} cookies (full values in auth.json)`);
    lines.push('Key cookies: ' + Object.keys(allCookies).slice(0, 10).join(', '));
    lines.push('');
  }

  lines.push('## Discovered Endpoints');
  lines.push('');

  for (const [basePath, reqs] of Object.entries(grouped).sort()) {
    lines.push(`### ${basePath}`);
    for (const req of reqs) {
      const paramKeys = req.params ? Object.keys(req.params) : [];
      const paramStr = paramKeys.length > 0 ? ` ?${paramKeys.join('&')}` : '';
      lines.push(`- \`${req.method} ${req.path}${paramStr}\``);
      if (req.postData) {
        try {
          const parsed = JSON.parse(req.postData);
          lines.push(`  - Body keys: ${Object.keys(parsed).join(', ')}`);
        } catch {
          lines.push(`  - Body: (form data)`);
        }
      }
    }
    lines.push('');
  }

  // Write output
  fs.mkdirSync(outputDir, { recursive: true });

  fs.writeFileSync(path.join(outputDir, 'CAPTURE.md'), lines.join('\n'));

  fs.writeFileSync(path.join(outputDir, 'auth.json'), JSON.stringify({
    domain,
    captured: new Date().toISOString(),
    headers: allAuthHeaders,
    cookies: allCookies
  }, null, 2));

  fs.writeFileSync(path.join(outputDir, 'endpoints.json'), JSON.stringify(capturedRequests, null, 2));

  console.log(`\n  Output: ${outputDir}/`);
  console.log(`    CAPTURE.md      Endpoint report`);
  console.log(`    auth.json       Auth headers & cookies`);
  console.log(`    endpoints.json  Full endpoint data`);
  console.log('');

  // Cleanup
  if (ownsBrowser) {
    await browser.close();
  } else {
    await page.close();
    await browser.close();
  }
}
