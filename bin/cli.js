#!/usr/bin/env node

import { capture } from '../lib/capture.js';
import { login } from '../lib/login.js';

// Check for subcommands first
const subcommand = process.argv[2];

if (subcommand === 'login') {
  // Parse login-specific args
  const args = process.argv.slice(3);
  const loginOptions = { stealth: false };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '-h':
      case '--help':
        console.log(`
api-capture login - Save a browser session for authenticated captures

Usage:
  api-capture login <url> [options]

Options:
      --stealth            Use stealth mode (recommended for LinkedIn, Instagram, etc.)
  -o, --output <file>      Output session file (default: {domain}-session.json)
  -h, --help               Show this help

How it works:
  1. Opens a visible Chrome window
  2. You log in manually (handle 2FA, captchas, etc.)
  3. Press Enter when done
  4. Session cookies and storage are saved to a JSON file

Examples:
  api-capture login https://linkedin.com/login --stealth
  api-capture login https://app.example.com
  api-capture login https://instagram.com/accounts/login --stealth -o ig-session.json
`);
        process.exit(0);
      case '--stealth':
        loginOptions.stealth = true;
        break;
      case '-o':
      case '--output':
        loginOptions.output = args[++i];
        break;
      default:
        if (!args[i].startsWith('-')) {
          loginOptions.url = args[i];
        }
        break;
    }
  }

  if (!loginOptions.url) {
    console.error('\nError: URL is required. Usage: api-capture login <url>\n');
    process.exit(1);
  }

  try {
    await login(loginOptions);
  } catch (err) {
    console.error(`\nError: ${err.message}`);
    process.exit(1);
  }
} else {
  // Main capture command
  const { parseArgs } = await import('node:util');

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
  api-capture login <url> [options]    Save a browser session for authenticated captures

Commands:
  login                     Open a browser to log in and save your session
  (default)                 Capture API traffic from a URL

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

Getting Started:
  # 1. Save a login session (opens a browser window)
  api-capture login https://linkedin.com/login --stealth

  # 2. Use that session to capture authenticated API traffic
  api-capture https://linkedin.com/feed --session ./linkedin.com-session.json --stealth

Examples:
  # Basic capture - browse a site for 30 seconds
  api-capture https://example.com

  # Connect to an already-running Chrome instance
  api-capture https://app.example.com --cdp ws://localhost:9222/devtools/browser/abc123

  # Capture multiple pages on the same site
  api-capture https://linkedin.com/feed -p /messaging/,/notifications/ --stealth -s ./session.json

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
}
