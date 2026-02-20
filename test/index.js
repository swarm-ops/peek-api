#!/usr/bin/env node

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const testFiles = [
  'cli-args.test.js',
  'lib.test.js', 
  'output.test.js',
  'http-integration.test.js',
  'capture.test.js'
];

console.log('🧪 Running peek-api test suite\n');

let totalPassed = 0;
let totalFailed = 0;

for (const testFile of testFiles) {
  console.log(`📄 ${testFile}`);
  console.log('─'.repeat(50));
  
  const result = await new Promise((resolve) => {
    const child = spawn('node', [join(__dirname, testFile)], {
      stdio: 'inherit'
    });
    
    child.on('close', (code) => {
      resolve(code);
    });
  });

  if (result === 0) {
    console.log('✅ All tests passed\n');
  } else {
    console.log('❌ Some tests failed\n');
    totalFailed++;
  }
}

if (totalFailed === 0) {
  console.log('🎉 All test suites passed!');
  process.exit(0);
} else {
  console.log(`💥 ${totalFailed} test suite(s) failed`);
  process.exit(1);
}