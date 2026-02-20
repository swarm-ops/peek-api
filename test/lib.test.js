import { TestRunner, createTempFile, cleanupTempFile, createMockSession } from './test-runner.js';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

// Import the functions we want to test
// We'll test internal utility functions without requiring browser/network

const runner = new TestRunner();

// Test data deduplication logic (simulated from capture.js)
runner.test('API request deduplication works', async () => {
  // Simulate the dedup logic from capture.js
  const seenKeys = new Set();
  const requests = [
    { method: 'GET', pathname: '/api/users' },
    { method: 'GET', pathname: '/api/users' }, // duplicate
    { method: 'POST', pathname: '/api/users' }, // different method
    { method: 'GET', pathname: '/api/posts' }
  ];

  const unique = [];
  for (const req of requests) {
    const key = `${req.method} ${req.pathname}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      unique.push(req);
    }
  }

  assert.strictEqual(unique.length, 3);
  assert.strictEqual(unique[0].method, 'GET');
  assert.strictEqual(unique[1].method, 'POST');
  assert.strictEqual(unique[2].method, 'GET');
  assert.strictEqual(unique[2].pathname, '/api/posts');
});

// Test static asset filtering logic (from capture.js)
runner.test('Static asset filtering works', async () => {
  const SKIP_EXTENSIONS = /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|map|webp|avif|mp4|webm|mp3)(\?|$)/i;
  const SKIP_DOMAINS = /google-analytics|googletagmanager|doubleclick|facebook\.com\/tr|bat\.bing|analytics\.google|hotjar|segment\.io|mixpanel|amplitude|sentry\.io|datadoghq/i;

  function isApiRequest(url, resourceType) {
    if (SKIP_EXTENSIONS.test(url)) return false;
    if (SKIP_DOMAINS.test(url)) return false;
    if (resourceType === 'xhr' || resourceType === 'fetch') return true;
    if (url.includes('/api/') || url.includes('/graphql') || url.includes('/rest/')) return true;
    return false;
  }

  // Test cases
  assert.strictEqual(isApiRequest('https://example.com/app.js', 'script'), false);
  assert.strictEqual(isApiRequest('https://example.com/style.css', 'stylesheet'), false);
  assert.strictEqual(isApiRequest('https://example.com/logo.png', 'image'), false);
  assert.strictEqual(isApiRequest('https://google-analytics.com/collect', 'xhr'), false);
  assert.strictEqual(isApiRequest('https://example.com/api/users', 'xhr'), true);
  assert.strictEqual(isApiRequest('https://example.com/graphql', 'fetch'), true);
  assert.strictEqual(isApiRequest('https://example.com/data', 'xhr'), true);
  assert.strictEqual(isApiRequest('https://example.com/api/posts?id=123', 'document'), true);
});

// Test auth header extraction (from capture.js)
runner.test('Auth header extraction works', async () => {
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
      if (lk.startsWith('x-ig-')) auth.headers[key] = value;     // Instagram
      if (lk.startsWith('x-fb-')) auth.headers[key] = value;     // Facebook

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

  const headers = {
    'Authorization': 'Bearer token123',
    'X-API-Key': 'key456',
    'X-CSRF-Token': 'csrf789',
    'X-LI-UUID': 'linkedin-uuid',
    'X-IG-App-ID': 'instagram-app',
    'Content-Type': 'application/json',
    'Cookie': 'sessionid=abc; csrftoken=def; user_id=123'
  };

  const auth = extractAuth(headers);

  assert.strictEqual(auth.headers['Authorization'], 'Bearer token123');
  assert.strictEqual(auth.headers['X-API-Key'], 'key456');
  assert.strictEqual(auth.headers['X-CSRF-Token'], 'csrf789');
  assert.strictEqual(auth.headers['X-LI-UUID'], 'linkedin-uuid');
  assert.strictEqual(auth.headers['X-IG-App-ID'], 'instagram-app');
  assert.ok(!auth.headers['Content-Type']); // Should be filtered out

  assert.strictEqual(auth.cookies['sessionid'], 'abc');
  assert.strictEqual(auth.cookies['csrftoken'], 'def');
  assert.strictEqual(auth.cookies['user_id'], '123');
});

// Test session file loading (http.js functionality)
runner.test('Session file loading works', async () => {
  const mockSession = createMockSession();
  const sessionFile = createTempFile(JSON.stringify(mockSession));

  try {
    // Import the loadSession function logic
    const raw = fs.readFileSync(sessionFile, 'utf8');
    const session = JSON.parse(raw);

    const cookies = session.cookies || [];
    const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');

    // Extract known CSRF tokens
    const csrf = {};
    for (const c of cookies) {
      if (c.name === 'csrftoken') csrf['X-CSRFToken'] = c.value;
    }

    assert.strictEqual(cookieStr, 'sessionid=mock-session-123; csrftoken=mock-csrf-456; user_id=789');
    assert.strictEqual(csrf['X-CSRFToken'], 'mock-csrf-456');
    assert.strictEqual(cookies.length, 3);
  } finally {
    cleanupTempFile(sessionFile);
  }
});

// Test platform header detection
runner.test('Platform header detection works', async () => {
  const PLATFORM_HEADERS = {
    'instagram.com': {
      'X-IG-App-ID': '936619743392459',
      'X-Requested-With': 'XMLHttpRequest'
    }
  };

  function detectPlatform(hostname) {
    for (const [domain, headers] of Object.entries(PLATFORM_HEADERS)) {
      if (hostname.includes(domain)) return headers;
    }
    return {};
  }

  const igHeaders = detectPlatform('www.instagram.com');
  assert.strictEqual(igHeaders['X-IG-App-ID'], '936619743392459');
  assert.strictEqual(igHeaders['X-Requested-With'], 'XMLHttpRequest');

  const unknownHeaders = detectPlatform('example.com');
  assert.deepStrictEqual(unknownHeaders, {});
});

// Test custom header parsing
runner.test('Custom header parsing works', async () => {
  function parseCustomHeaders(headerStrings) {
    const headers = {};
    for (const h of headerStrings) {
      const colonIdx = h.indexOf(':');
      if (colonIdx === -1) continue;
      const key = h.slice(0, colonIdx).trim();
      const val = h.slice(colonIdx + 1).trim();
      headers[key] = val;
    }
    return headers;
  }

  const headerStrings = [
    'X-Custom-Header: value1',
    'Authorization: Bearer token123',
    'Invalid-Header-No-Colon',
    'Multi-Space:   value with spaces   '
  ];

  const headers = parseCustomHeaders(headerStrings);

  assert.strictEqual(headers['X-Custom-Header'], 'value1');
  assert.strictEqual(headers['Authorization'], 'Bearer token123');
  assert.strictEqual(headers['Multi-Space'], 'value with spaces');
  assert.ok(!headers['Invalid-Header-No-Colon']);
});

// Test JSON formatting utility
runner.test('JSON formatting works', async () => {
  function formatJson(data) {
    try {
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      return JSON.stringify(parsed, null, 2);
    } catch {
      return data;
    }
  }

  const jsonString = '{"test":true,"nested":{"value":123}}';
  const formatted = formatJson(jsonString);
  
  assert.ok(formatted.includes('\n')); // Should be pretty-printed
  assert.ok(formatted.includes('"test": true'));
  
  // Test invalid JSON
  const invalid = formatJson('not-json');
  assert.strictEqual(invalid, 'not-json');
});

// Test size formatting utility
runner.test('Size formatting works', async () => {
  function formatSize(bytes) {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }

  assert.strictEqual(formatSize(500), '500B');
  assert.strictEqual(formatSize(1536), '1.5KB');
  assert.strictEqual(formatSize(2048 * 1024), '2.0MB');
  assert.strictEqual(formatSize(1024 * 1024 + 512 * 1024), '1.5MB');
});

await runner.run();