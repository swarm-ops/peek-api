import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_PATH = path.join(__dirname, '../bin/cli.js');
const TEST_DIR = path.join(__dirname, 'temp');

// Helper to run CLI and capture output
function runCLI(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [CLI_PATH, ...args], {
      stdio: 'pipe',
      ...options
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });

    child.on('error', reject);

    // Auto-close stdin after a short delay to handle interactive prompts
    setTimeout(() => {
      if (child.stdin && !child.stdin.destroyed) {
        child.stdin.end();
      }
    }, 100);
  });
}

describe('CLI Argument Parsing', () => {
  before(() => {
    // Create test directory
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true });
    }
  });

  after(() => {
    // Cleanup test directory
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it('should show help when no arguments provided', async () => {
    const result = await runCLI([]);
    assert.strictEqual(result.code, 0);
    assert.match(result.stdout, /peek-api - Discover and call internal APIs/);
    assert.match(result.stdout, /Usage:/);
  });

  it('should show version with --version flag', async () => {
    const result = await runCLI(['--version']);
    assert.strictEqual(result.code, 0);
    assert.match(result.stdout, /^\d+\.\d+\.\d+/);
  });

  it('should show help with --help flag', async () => {
    const result = await runCLI(['--help']);
    assert.strictEqual(result.code, 0);
    assert.match(result.stdout, /peek-api - Discover and call internal APIs/);
  });

  it('should handle duration argument', async () => {
    const result = await runCLI(['https://example.com', '--duration', '10', '--help']);
    assert.strictEqual(result.code, 0);
    assert.match(result.stdout, /duration/);
  });

  it('should handle session argument', async () => {
    const result = await runCLI(['https://example.com', '--session', 'test.json', '--help']);
    assert.strictEqual(result.code, 0);
    assert.match(result.stdout, /session/);
  });

  it('should handle stealth flag', async () => {
    const result = await runCLI(['https://example.com', '--stealth', '--help']);
    assert.strictEqual(result.code, 0);
    assert.match(result.stdout, /stealth/);
  });

  it('should handle output directory argument', async () => {
    const result = await runCLI(['https://example.com', '--output', './custom-dir', '--help']);
    assert.strictEqual(result.code, 0);
    assert.match(result.stdout, /output/);
  });
});

describe('Login Command', () => {
  it('should show login help', async () => {
    const result = await runCLI(['login', '--help']);
    assert.strictEqual(result.code, 0);
    assert.match(result.stdout, /peek-api login - Save a browser session/);
  });

  it('should require URL for login', async () => {
    const result = await runCLI(['login']);
    assert.strictEqual(result.code, 1);
    assert.match(result.stderr, /Error: URL is required/);
  });

  it('should accept stealth option for login', async () => {
    const result = await runCLI(['login', '--help']);
    assert.strictEqual(result.code, 0);
    assert.match(result.stdout, /--stealth/);
  });
});

describe('HTTP Command', () => {
  it('should show http help', async () => {
    const result = await runCLI(['http', '--help']);
    assert.strictEqual(result.code, 0);
    assert.match(result.stdout, /peek-api http - Make direct HTTP API calls/);
  });

  it('should require URL for http command', async () => {
    const result = await runCLI(['http']);
    assert.strictEqual(result.code, 1);
    assert.match(result.stderr, /Error: URL is required/);
  });

  it('should require session file for http command', async () => {
    const result = await runCLI(['http', 'https://example.com']);
    assert.strictEqual(result.code, 1);
    assert.match(result.stderr, /Error: Session file is required/);
  });

  it('should accept various HTTP options', async () => {
    const result = await runCLI(['http', '--help']);
    assert.strictEqual(result.code, 0);
    assert.match(result.stdout, /--method/);
    assert.match(result.stdout, /--header/);
    assert.match(result.stdout, /--data/);
    assert.match(result.stdout, /--output/);
    assert.match(result.stdout, /--raw/);
    assert.match(result.stdout, /--verbose/);
  });
});