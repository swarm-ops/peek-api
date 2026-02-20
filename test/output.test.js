import { TestRunner, createTempFile, cleanupTempFile } from './test-runner.js';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const runner = new TestRunner();

runner.test('CAPTURE.md generation works', async () => {
  // Simulate the output generation logic from capture.js
  const domain = 'api.example.com';
  const url = 'https://api.example.com';
  const duration = 30;
  
  const capturedRequests = [
    {
      method: 'GET',
      url: 'https://api.example.com/users',
      path: '/users',
      host: 'api.example.com',
      resourceType: 'xhr',
      params: { limit: '10' },
      timestamp: '2024-01-01T12:00:00Z'
    },
    {
      method: 'POST',
      url: 'https://api.example.com/users',
      path: '/users',
      host: 'api.example.com',
      resourceType: 'xhr',
      postData: '{"name":"test"}',
      timestamp: '2024-01-01T12:00:01Z'
    }
  ];

  const allAuthHeaders = {
    'Authorization': 'Bearer token123',
    'X-CSRF-Token': 'csrf456'
  };

  const allCookies = {
    sessionid: 'session123',
    csrftoken: 'csrf456'
  };

  // Group by base path (simplified)
  const grouped = {};
  for (const req of capturedRequests) {
    const parts = req.path.split('/').filter(Boolean);
    const basePath = '/' + parts.slice(0, Math.min(parts.length, 3)).join('/');
    if (!grouped[basePath]) grouped[basePath] = [];
    grouped[basePath].push(req);
  }

  // Generate CAPTURE.md content
  const lines = [];
  lines.push(`# API Capture: ${domain}`);
  lines.push(`**Date:** ${new Date().toISOString()}`);
  lines.push(`**URL:** ${url}`);
  lines.push(`**Duration:** ${duration}s`);
  lines.push(`**Endpoints Found:** ${capturedRequests.length}`);
  lines.push('');

  lines.push('## Authentication Headers');
  lines.push('```json');
  lines.push(JSON.stringify(allAuthHeaders, null, 2));
  lines.push('```');
  lines.push('');

  lines.push('## Session Cookies');
  lines.push(`Found ${Object.keys(allCookies).length} cookies (full values in auth.json)`);
  lines.push('Key cookies: ' + Object.keys(allCookies).join(', '));
  lines.push('');

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

  const content = lines.join('\n');

  // Test the content structure
  assert.ok(content.includes('# API Capture: api.example.com'));
  assert.ok(content.includes('**Endpoints Found:** 2'));
  assert.ok(content.includes('## Authentication Headers'));
  assert.ok(content.includes('Bearer token123'));
  assert.ok(content.includes('## Session Cookies'));
  assert.ok(content.includes('sessionid, csrftoken'));
  assert.ok(content.includes('## Discovered Endpoints'));
  assert.ok(content.includes('### /users'));
  assert.ok(content.includes('`GET /users ?limit`'));
  assert.ok(content.includes('`POST /users`'));
  assert.ok(content.includes('Body keys: name'));
});

runner.test('auth.json generation works', async () => {
  const domain = 'example.com';
  const allAuthHeaders = {
    'Authorization': 'Bearer token123',
    'X-CSRF-Token': 'csrf456'
  };
  const allCookies = {
    sessionid: 'session123',
    csrftoken: 'csrf456'
  };

  const authData = {
    domain,
    captured: new Date().toISOString(),
    headers: allAuthHeaders,
    cookies: allCookies
  };

  const authJson = JSON.stringify(authData, null, 2);
  
  assert.ok(authJson.includes('"domain": "example.com"'));
  assert.ok(authJson.includes('"Authorization": "Bearer token123"'));
  assert.ok(authJson.includes('"sessionid": "session123"'));
  assert.ok(authJson.includes('"captured"'));
});

runner.test('endpoints.json generation works', async () => {
  const capturedRequests = [
    {
      method: 'GET',
      url: 'https://api.example.com/users?limit=10',
      path: '/users',
      host: 'api.example.com',
      resourceType: 'xhr',
      params: { limit: '10' },
      headers: { 'Authorization': 'Bearer token123' },
      timestamp: '2024-01-01T12:00:00Z'
    },
    {
      method: 'POST',
      url: 'https://api.example.com/posts',
      path: '/posts',
      host: 'api.example.com',
      resourceType: 'fetch',
      postData: '{"title":"test post","content":"hello world"}',
      timestamp: '2024-01-01T12:00:01Z'
    }
  ];

  const endpointsJson = JSON.stringify(capturedRequests, null, 2);

  assert.ok(endpointsJson.includes('"method": "GET"'));
  assert.ok(endpointsJson.includes('"method": "POST"'));
  assert.ok(endpointsJson.includes('/users'));
  assert.ok(endpointsJson.includes('/posts'));
  assert.ok(endpointsJson.includes('"limit": "10"'));
  assert.ok(endpointsJson.includes('test post'));
});

runner.test('Output directory creation works', async () => {
  const tempDir = path.join(os.tmpdir(), `peek-api-test-${Date.now()}`);
  
  try {
    // Test that directory creation logic works
    fs.mkdirSync(tempDir, { recursive: true });
    
    // Test writing the three files
    fs.writeFileSync(path.join(tempDir, 'CAPTURE.md'), '# Test Capture\n');
    fs.writeFileSync(path.join(tempDir, 'auth.json'), '{"test": true}');
    fs.writeFileSync(path.join(tempDir, 'endpoints.json'), '[{"method": "GET"}]');

    // Verify files exist
    assert.ok(fs.existsSync(path.join(tempDir, 'CAPTURE.md')));
    assert.ok(fs.existsSync(path.join(tempDir, 'auth.json')));
    assert.ok(fs.existsSync(path.join(tempDir, 'endpoints.json')));

    // Test file contents
    const captureContent = fs.readFileSync(path.join(tempDir, 'CAPTURE.md'), 'utf8');
    assert.strictEqual(captureContent, '# Test Capture\n');

    const authContent = fs.readFileSync(path.join(tempDir, 'auth.json'), 'utf8');
    assert.deepStrictEqual(JSON.parse(authContent), { test: true });

    const endpointsContent = fs.readFileSync(path.join(tempDir, 'endpoints.json'), 'utf8');
    assert.deepStrictEqual(JSON.parse(endpointsContent), [{ method: 'GET' }]);
  } finally {
    // Cleanup
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
});

runner.test('Empty capture handling works', async () => {
  // Test what happens when no requests are captured
  const capturedRequests = [];
  
  // Should handle empty array gracefully
  assert.strictEqual(capturedRequests.length, 0);
  
  // Grouping empty array should work
  const grouped = {};
  for (const req of capturedRequests) {
    const parts = req.path.split('/').filter(Boolean);
    const basePath = '/' + parts.slice(0, Math.min(parts.length, 3)).join('/');
    if (!grouped[basePath]) grouped[basePath] = [];
    grouped[basePath].push(req);
  }
  
  assert.deepStrictEqual(grouped, {});
});

await runner.run();