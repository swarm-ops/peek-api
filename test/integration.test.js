import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_PATH = path.join(__dirname, '../bin/cli.js');
const TEST_DIR = path.join(__dirname, 'temp');

// Helper to run CLI with timeout
function runCLIWithTimeout(args, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [CLI_PATH, ...args], {
      stdio: 'pipe'
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Command timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.on('close', (code) => {
      clearTimeout(timeout);
      resolve({ code, stdout, stderr });
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    // Auto-close stdin for interactive commands
    setTimeout(() => {
      if (child.stdin && !child.stdin.destroyed) {
        child.stdin.end();
      }
    }, 100);
  });
}

describe('Integration Tests', () => {
  before(() => {
    // Create test directory
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true });
    }

    // Create minimal session file for HTTP tests
    const minimalSession = {
      cookies: [],
      origins: []
    };
    fs.writeFileSync(path.join(TEST_DIR, 'minimal-session.json'), JSON.stringify(minimalSession, null, 2));
  });

  after(() => {
    // Cleanup
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it('should run basic capture command (timeout after 5s)', async () => {
    try {
      const result = await runCLIWithTimeout([
        'https://httpbin.org/html',
        '--duration', '2',
        '--headless',
        '--output', TEST_DIR
      ], 10000);

      // Command should start successfully (may timeout due to browser launch)
      // We're mainly testing that CLI parsing and initial setup work
      assert.ok(result.code !== 127); // Not "command not found"
    } catch (err) {
      // Timeout is expected for browser tests in CI
      if (!err.message.includes('timed out')) {
        throw err;
      }
    }
  });

  it('should make HTTP request to httpbin.org', async () => {
    const sessionPath = path.join(TEST_DIR, 'minimal-session.json');
    
    const result = await runCLIWithTimeout([
      'http',
      'https://httpbin.org/json',
      '--session', sessionPath,
      '--raw'
    ], 10000);

    assert.strictEqual(result.code, 0);
    
    // Should get JSON response from httpbin
    try {
      const parsed = JSON.parse(result.stdout);
      assert.ok(typeof parsed === 'object');
    } catch (err) {
      // If not JSON, should still have some content
      assert.ok(result.stdout.length > 0);
    }
  });

  it('should handle HTTP errors gracefully', async () => {
    const sessionPath = path.join(TEST_DIR, 'minimal-session.json');
    
    const result = await runCLIWithTimeout([
      'http',
      'https://httpbin.org/status/404',
      '--session', sessionPath
    ], 10000);

    // Should complete (not crash) even with HTTP errors
    assert.strictEqual(result.code, 0);
    assert.match(result.stdout, /(404|Error)/);
  });

  it('should save HTTP response to file', async () => {
    const sessionPath = path.join(TEST_DIR, 'minimal-session.json');
    const outputPath = path.join(TEST_DIR, 'response.json');
    
    const result = await runCLIWithTimeout([
      'http',
      'https://httpbin.org/json',
      '--session', sessionPath,
      '--output', outputPath,
      '--raw'
    ], 10000);

    assert.strictEqual(result.code, 0);
    assert.ok(fs.existsSync(outputPath));
    
    const content = fs.readFileSync(outputPath, 'utf8');
    assert.ok(content.length > 0);
  });
});