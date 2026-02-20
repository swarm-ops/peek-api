import { TestRunner, runCommand, createTempFile, cleanupTempFile, createMockSession } from './test-runner.js';
import assert from 'node:assert';
import path from 'node:path';

const runner = new TestRunner();
const cliPath = path.join(process.cwd(), 'bin/cli.js');

// Test HTTP CLI integration with httpbin.org
runner.test('HTTP CLI works with real endpoint', async () => {
  const sessionFile = createTempFile(JSON.stringify(createMockSession()));

  try {
    const result = await runCommand('node', [
      cliPath,
      'http',
      'https://httpbin.org/get',
      '--session', sessionFile,
      '--raw'
    ]);

    assert.strictEqual(result.code, 0);
    
    // Should get JSON response from httpbin
    const response = JSON.parse(result.stdout);
    assert.strictEqual(response.url, 'https://httpbin.org/get');
    assert.ok(response.headers);
    assert.ok(response.origin);
  } finally {
    cleanupTempFile(sessionFile);
  }
});

runner.test('HTTP CLI handles missing session file', async () => {
  const result = await runCommand('node', [
    cliPath,
    'http',
    'https://httpbin.org/get'
  ]);

  assert.strictEqual(result.code, 1);
  assert.ok(result.stderr.includes('Session file is required'));
});

runner.test('HTTP CLI handles missing URL', async () => {
  const result = await runCommand('node', [
    cliPath,
    'http',
    '--session', 'dummy.json'
  ]);

  assert.strictEqual(result.code, 1);
  assert.ok(result.stderr.includes('URL is required'));
});

runner.test('HTTP CLI with POST and custom headers', async () => {
  const sessionFile = createTempFile(JSON.stringify(createMockSession()));

  try {
    const result = await runCommand('node', [
      cliPath,
      'http',
      'https://httpbin.org/post',
      '--session', sessionFile,
      '-X', 'POST',
      '-d', '{"test": "data"}',
      '-H', 'X-Custom: test-value',
      '--raw'
    ]);

    assert.strictEqual(result.code, 0);
    
    const response = JSON.parse(result.stdout);
    assert.strictEqual(response.url, 'https://httpbin.org/post');
    assert.ok(response.json);
    assert.strictEqual(response.json.test, 'data');
    assert.strictEqual(response.headers['X-Custom'], 'test-value');
  } finally {
    cleanupTempFile(sessionFile);
  }
});

runner.test('HTTP CLI with verbose output', async () => {
  const sessionFile = createTempFile(JSON.stringify(createMockSession()));

  try {
    const result = await runCommand('node', [
      cliPath,
      'http',
      'https://httpbin.org/get',
      '--session', sessionFile,
      '--verbose'
    ]);

    assert.strictEqual(result.code, 0);
    
    // Should contain verbose output headers
    assert.ok(result.stdout.includes('Request Headers:'));
    assert.ok(result.stdout.includes('Response:'));
    assert.ok(result.stdout.includes('Content-Type:'));
  } finally {
    cleanupTempFile(sessionFile);
  }
});

await runner.run();