import assert from 'node:assert';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export class TestRunner {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
  }

  test(name, fn) {
    this.tests.push({ name, fn });
  }

  async run() {
    console.log(`\n  Running ${this.tests.length} tests...\n`);

    for (const { name, fn } of this.tests) {
      try {
        process.stdout.write(`  ${name}... `);
        await fn();
        console.log('✓');
        this.passed++;
      } catch (err) {
        console.log('✗');
        console.log(`    Error: ${err.message}`);
        this.failed++;
      }
    }

    console.log(`\n  Results: ${this.passed} passed, ${this.failed} failed\n`);
    
    if (this.failed > 0) {
      process.exit(1);
    }
  }
}

export async function runCommand(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
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
      resolve({
        code,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      });
    });

    child.on('error', reject);
  });
}

export function createTempFile(content, extension = '.json') {
  const tempPath = path.join(process.cwd(), `temp-test-${Date.now()}${extension}`);
  fs.writeFileSync(tempPath, content);
  return tempPath;
}

export function cleanupTempFile(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch {
    // Ignore errors
  }
}

export function createMockSession() {
  return {
    cookies: [
      { name: 'sessionid', value: 'mock-session-123', domain: '.example.com' },
      { name: 'csrftoken', value: 'mock-csrf-456', domain: '.example.com' },
      { name: 'user_id', value: '789', domain: '.example.com' }
    ],
    origins: [
      {
        origin: 'https://example.com',
        localStorage: [
          { name: 'last_visit', value: '2024-01-01' }
        ]
      }
    ]
  };
}