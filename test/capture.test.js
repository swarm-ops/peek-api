import { TestRunner } from './test-runner.js';
import assert from 'node:assert';

const runner = new TestRunner();

// Test URL parsing and domain extraction
runner.test('URL parsing and domain extraction works', async () => {
  function extractDomain(url) {
    const parsedUrl = new URL(url);
    return parsedUrl.hostname.replace('www.', '');
  }

  assert.strictEqual(extractDomain('https://www.example.com/path'), 'example.com');
  assert.strictEqual(extractDomain('https://api.linkedin.com/v2/people'), 'api.linkedin.com');
  assert.strictEqual(extractDomain('http://localhost:3000/test'), 'localhost');
  assert.strictEqual(extractDomain('https://subdomain.example.com'), 'subdomain.example.com');
});

// Test output directory naming
runner.test('Output directory naming works', async () => {
  function getOutputDir(url, customDir) {
    if (customDir) return customDir;
    const parsedUrl = new URL(url);
    const domain = parsedUrl.hostname.replace('www.', '');
    return `peek-api-${domain}`;
  }

  assert.strictEqual(getOutputDir('https://example.com'), 'peek-api-example.com');
  assert.strictEqual(getOutputDir('https://www.linkedin.com/feed'), 'peek-api-linkedin.com');
  assert.strictEqual(getOutputDir('https://api.example.com', '/custom/path'), '/custom/path');
});

// Test additional pages parsing
runner.test('Additional pages parsing works', async () => {
  function parseAdditionalPages(pagesString) {
    return pagesString ? pagesString.split(',').map(p => p.trim()) : [];
  }

  assert.deepStrictEqual(parseAdditionalPages(''), []);
  assert.deepStrictEqual(parseAdditionalPages('/feed,/messages'), ['/feed', '/messages']);
  assert.deepStrictEqual(parseAdditionalPages('/api/users, /api/posts , /settings'), ['/api/users', '/api/posts', '/settings']);
  assert.deepStrictEqual(parseAdditionalPages('https://example.com/full,/relative'), ['https://example.com/full', '/relative']);
});

// Test request grouping logic
runner.test('Request grouping logic works', async () => {
  const capturedRequests = [
    { path: '/api/users', method: 'GET' },
    { path: '/api/users', method: 'POST' },
    { path: '/api/posts', method: 'GET' },
    { path: '/auth/login', method: 'POST' },
    { path: '/deep/nested/endpoint', method: 'GET' }
  ];

  // Group by base path (simulate logic from capture.js - taking first 3 segments)
  const grouped = {};
  for (const req of capturedRequests) {
    const parts = req.path.split('/').filter(Boolean);
    const basePath = '/' + parts.slice(0, Math.min(parts.length, 3)).join('/');
    if (!grouped[basePath]) grouped[basePath] = [];
    grouped[basePath].push(req);
  }

  // Verify grouping
  const groupKeys = Object.keys(grouped).sort();
  
  assert.ok(grouped['/api/users']);
  assert.ok(grouped['/api/posts']);
  assert.ok(grouped['/auth/login']);
  assert.ok(grouped['/deep/nested/endpoint']);

  assert.strictEqual(grouped['/api/users'].length, 2); // GET and POST
  assert.strictEqual(grouped['/api/posts'].length, 1);
  assert.strictEqual(grouped['/auth/login'].length, 1);
  assert.strictEqual(grouped['/deep/nested/endpoint'].length, 1);
});

// Test login status detection
runner.test('Login status detection works', async () => {
  function detectLoginRequired(title, url) {
    const lowerTitle = title.toLowerCase();
    const lowerUrl = url.toLowerCase();
    
    return (
      lowerTitle.includes('login') || 
      lowerTitle.includes('sign in') || 
      lowerTitle.includes('sign up') ||
      lowerUrl.includes('/login') ||
      lowerUrl.includes('/accounts/login')
    );
  }

  assert.strictEqual(detectLoginRequired('Login - Example Site', 'https://example.com/login'), true);
  assert.strictEqual(detectLoginRequired('Sign In to Your Account', 'https://example.com/auth'), true);
  assert.strictEqual(detectLoginRequired('Dashboard', 'https://example.com/dashboard'), false);
  assert.strictEqual(detectLoginRequired('Home', 'https://www.instagram.com/accounts/login/'), true);
  assert.strictEqual(detectLoginRequired('Instagram', 'https://www.instagram.com/'), false);
});

// Test scroll calculation
runner.test('Scroll calculation works', async () => {
  function calculateScrollSteps(durationMs, scrollInterval) {
    const steps = Math.floor(durationMs / scrollInterval);
    return Math.max(1, steps);
  }

  assert.strictEqual(calculateScrollSteps(30000, 3000), 10); // 30s / 3s = 10 steps
  assert.strictEqual(calculateScrollSteps(5000, 3000), 1);   // 5s / 3s = 1 step (minimum)
  assert.strictEqual(calculateScrollSteps(15000, 5000), 3);  // 15s / 5s = 3 steps
});

// Test duration parsing and validation
runner.test('Duration parsing works', async () => {
  function parseDuration(durationStr) {
    const duration = parseInt(durationStr, 10);
    if (isNaN(duration) || duration < 1) {
      throw new Error('Duration must be a positive number');
    }
    if (duration > 300) { // 5 minutes max
      throw new Error('Duration must be 300 seconds or less');
    }
    return duration;
  }

  assert.strictEqual(parseDuration('30'), 30);
  assert.strictEqual(parseDuration('5'), 5);
  assert.strictEqual(parseDuration('300'), 300);

  assert.throws(() => parseDuration('0'), /positive number/);
  assert.throws(() => parseDuration('-5'), /positive number/);
  assert.throws(() => parseDuration('abc'), /positive number/);
  assert.throws(() => parseDuration('301'), /300 seconds or less/);
});

// Test page URL resolution
runner.test('Page URL resolution works', async () => {
  function resolvePageUrl(pageSpec, baseOrigin) {
    if (pageSpec.startsWith('http')) {
      return pageSpec;
    }
    return `${baseOrigin}${pageSpec}`;
  }

  const origin = 'https://example.com';
  
  assert.strictEqual(resolvePageUrl('/api/users', origin), 'https://example.com/api/users');
  assert.strictEqual(resolvePageUrl('https://other.com/page', origin), 'https://other.com/page');
  assert.strictEqual(resolvePageUrl('/path/to/page?param=value', origin), 'https://example.com/path/to/page?param=value');
});

// Test resource type filtering
runner.test('Resource type filtering works', async () => {
  function shouldCaptureResource(url, resourceType) {
    const SKIP_EXTENSIONS = /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|map|webp|avif|mp4|webm|mp3)(\?|$)/i;
    const SKIP_DOMAINS = /google-analytics|googletagmanager|doubleclick|facebook\.com\/tr|bat\.bing|analytics\.google|hotjar|segment\.io|mixpanel|amplitude|sentry\.io|datadoghq/i;

    if (SKIP_EXTENSIONS.test(url)) return false;
    if (SKIP_DOMAINS.test(url)) return false;
    if (resourceType === 'xhr' || resourceType === 'fetch') return true;
    if (url.includes('/api/') || url.includes('/graphql') || url.includes('/rest/')) return true;
    return false;
  }

  // Should capture
  assert.strictEqual(shouldCaptureResource('https://example.com/api/users', 'xhr'), true);
  assert.strictEqual(shouldCaptureResource('https://example.com/graphql', 'fetch'), true);
  assert.strictEqual(shouldCaptureResource('https://example.com/rest/v1/data', 'document'), true);
  assert.strictEqual(shouldCaptureResource('https://example.com/some-endpoint', 'xhr'), true);

  // Should skip
  assert.strictEqual(shouldCaptureResource('https://example.com/app.js', 'script'), false);
  assert.strictEqual(shouldCaptureResource('https://example.com/style.css', 'stylesheet'), false);
  assert.strictEqual(shouldCaptureResource('https://google-analytics.com/collect', 'xhr'), false);
  assert.strictEqual(shouldCaptureResource('https://example.com/image.png?v=123', 'image'), false);
});

await runner.run();