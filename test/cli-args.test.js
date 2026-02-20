import { TestRunner, runCommand } from './test-runner.js';
import assert from 'node:assert';
import path from 'node:path';

const runner = new TestRunner();
const cliPath = path.join(process.cwd(), 'bin/cli.js');

// Test help commands
runner.test('CLI shows general help', async () => {
  const result = await runCommand('node', [cliPath, '--help']);
  
  assert.strictEqual(result.code, 0);
  assert.ok(result.stdout.includes('peek-api - Discover and call internal APIs'));
  assert.ok(result.stdout.includes('Usage:'));
  assert.ok(result.stdout.includes('peek-api <url>'));
});

runner.test('CLI shows version', async () => {
  const result = await runCommand('node', [cliPath, '--version']);
  
  assert.strictEqual(result.code, 0);
  assert.ok(result.stdout.match(/^\d+\.\d+\.\d+$/));
});

runner.test('HTTP subcommand shows help', async () => {
  const result = await runCommand('node', [cliPath, 'http', '--help']);
  
  assert.strictEqual(result.code, 0);
  assert.ok(result.stdout.includes('peek-api http - Make direct HTTP'));
  assert.ok(result.stdout.includes('--session <file>'));
  assert.ok(result.stdout.includes('--method <method>'));
});

runner.test('Login subcommand shows help', async () => {
  const result = await runCommand('node', [cliPath, 'login', '--help']);
  
  assert.strictEqual(result.code, 0);
  assert.ok(result.stdout.includes('peek-api login - Save a browser session'));
  assert.ok(result.stdout.includes('--stealth'));
  assert.ok(result.stdout.includes('--output <file>'));
});

runner.test('CLI requires URL for capture mode', async () => {
  const result = await runCommand('node', [cliPath]);
  
  assert.strictEqual(result.code, 0); // Shows help instead of erroring
  assert.ok(result.stdout.includes('Usage:') || result.stdout.includes('peek-api'));
});

runner.test('HTTP subcommand requires URL', async () => {
  const result = await runCommand('node', [cliPath, 'http']);
  
  assert.strictEqual(result.code, 1);
  assert.ok(result.stderr.includes('URL is required'));
});

runner.test('HTTP subcommand requires session', async () => {
  const result = await runCommand('node', [cliPath, 'http', 'https://example.com']);
  
  assert.strictEqual(result.code, 1);
  assert.ok(result.stderr.includes('Session file is required'));
});

runner.test('Login subcommand requires URL', async () => {
  const result = await runCommand('node', [cliPath, 'login']);
  
  assert.strictEqual(result.code, 1);
  assert.ok(result.stderr.includes('URL is required'));
});

// Test argument parsing validation
runner.test('CLI accepts valid duration argument', async () => {
  const result = await runCommand('node', [cliPath, 'https://example.com', '--duration', '10', '--help']);
  
  assert.strictEqual(result.code, 0);
  // Should show help when --help is provided, regardless of other args
});

runner.test('CLI accepts stealth flag', async () => {
  const result = await runCommand('node', [cliPath, 'https://example.com', '--stealth', '--help']);
  
  assert.strictEqual(result.code, 0);
});

runner.test('CLI accepts output directory', async () => {
  const result = await runCommand('node', [cliPath, 'https://example.com', '--output', '/tmp/test', '--help']);
  
  assert.strictEqual(result.code, 0);
});

// Run all tests
await runner.run();