#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { capture } from '../lib/capture.js';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    duration: { type: 'string', short: 'd', default: '30' },
    session: { type: 'string', short: 's' },
    stealth: { type: 'boolean', default: false },
    output: { type: 'string', short: 'o' },
    headless: { type: 'boolean', default: true },
    'scroll-interval': { type: 'string', default: '3000' },
    'user-agent': { type: 'string' },
    help: { type: 'boolean', short: 'h' },
    version: { type: 'boolean', short: 'v' },
    cdp: { type: 'string' },
    pages: { type: 'string', short: 'p' },
    verbose: { type: 'boolean', default: false }
  }
});

if (values.version) {
  const pkg = await import('../package.json', { with: { type: 'json' } });
  console.log(pkg.default.version);
  process.exit(0);
}

if (values.help || positionals.length === 0) {
  console.log(`
api-capture - Discover internal APIs from any website

Usage:
  api-capture <url> [options]
  api-capture https://example.com
  api-capture https://linkedin.com --session ./session.json --stealth

Options:
  -d, --duration <seconds>    Capture duration per page (default: 30)
  -s, --session <file>        Playwright session/storage state JSON file
      --stealth               Use stealth mode to avoid bot detection
      --headless              Run headless (default: true, use --no-headless for visible)
      --cdp <endpoint>        Connect to existing Chrome via CDP (ws://host:port/...)
  -p, --pages <urls>          Additional pages to visit (comma-separated paths)
      --scroll-interval <ms>  Auto-scroll interval in ms (default: 3000)
      --user-agent <string>   Custom user agent string
  -o, --output <dir>          Output directory (default: ./api-capture-{domain})
      --verbose               Show all captured requests in real-time
  -h, --help                  Show this help
  -v, --version               Show version

Output:
  CAPTURE.md       Human-readable endpoint report
  auth.json        Extracted auth headers and cookies
  endpoints.json   Full endpoint data with params and bodies

Examples:
  # Basic capture - browse a site for 30 seconds
  api-capture https://example.com

  # Authenticated capture with saved session
  api-capture https://linkedin.com/feed --session ./linkedin-session.json --stealth

  # Connect to an already-running Chrome instance
  api-capture https://app.example.com --cdp ws://localhost:9222/devtools/browser/abc123

  # Capture multiple pages on the same site
  api-capture https://linkedin.com/feed -p /messaging/,/notifications/,/mynetwork/ --stealth -s ./session.json

  # Visible browser for debugging
  api-capture https://example.com --no-headless --duration 60
`);
  process.exit(0);
}

const url = positionals[0];
const additionalPages = values.pages ? values.pages.split(',').map(p => p.trim()) : [];

try {
  await capture({
    url,
    duration: parseInt(values.duration, 10),
    sessionFile: values.session,
    stealth: values.stealth,
    headless: values.headless,
    cdpEndpoint: values.cdp,
    additionalPages,
    scrollInterval: parseInt(values['scroll-interval'], 10),
    userAgent: values['user-agent'],
    outputDir: values.output,
    verbose: values.verbose
  });
} catch (err) {
  console.error(`\nError: ${err.message}`);
  process.exit(1);
}
