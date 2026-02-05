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
peek-api login - Save a browser session for authenticated captures

Usage:
  peek-api login <url> [options]

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
  peek-api login https://linkedin.com/login --stealth
  peek-api login https://app.example.com
  peek-api login https://instagram.com/accounts/login --stealth -o ig-session.json
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
    console.error('\nError: URL is required. Usage: peek-api login <url>\n');
    process.exit(1);
  }

  try {
    await login(loginOptions);
  } catch (err) {
    console.error(`\nError: ${err.message}`);
    process.exit(1);
  }
} else if (subcommand === 'http') {
  // Direct HTTP mode - make API calls using session cookies
  const { http } = await import('../lib/http.js');

  const args = process.argv.slice(3);
  const httpOptions = { method: 'GET', headers: [] };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '-h':
      case '--help':
        console.log(`
peek-api http - Make direct HTTP API calls using session cookies

Usage:
  peek-api http <url> [options]

Options:
  -s, --session <file>       Session file with cookies (required)
  -X, --method <method>      HTTP method (default: GET)
  -H, --header "Key: Val"    Additional header (repeatable)
  -d, --data <body>          Request body (for POST/PUT)
      --data-file <path>     Read request body from file
      --user-agent <string>  Custom user agent
  -o, --output <file>        Save response body to file
      --raw                  Output raw response (no formatting)
      --verbose              Show request/response headers
  -h, --help                 Show this help

The session file is a Playwright storage state JSON (created by peek-api login).
Cookies are automatically extracted and sent with the request. CSRF tokens
are detected and added as headers when found.

Examples:
  # GET an API endpoint using saved session
  peek-api http https://www.instagram.com/api/v1/direct_v2/inbox/ -s ./instagram.com-session.json

  # Search Instagram
  peek-api http "https://www.instagram.com/api/v1/web/search/topsearch/?context=blended&query=coffee" -s ./ig.json

  # POST with a body
  peek-api http https://api.example.com/data -s ./session.json -X POST -d '{"key":"value"}'

  # Add custom headers
  peek-api http https://api.example.com/data -s ./session.json -H "X-Custom: value"

  # Save response to file
  peek-api http https://www.instagram.com/api/v1/feed/timeline/ -s ./ig.json -o timeline.json

  # Pipe-friendly raw output
  peek-api http https://api.example.com/data -s ./session.json --raw | jq .
`);
        process.exit(0);
      case '-s':
      case '--session':
        httpOptions.session = args[++i];
        break;
      case '-X':
      case '--method':
        httpOptions.method = args[++i].toUpperCase();
        break;
      case '-H':
      case '--header':
        httpOptions.headers.push(args[++i]);
        break;
      case '-d':
      case '--data':
        httpOptions.data = args[++i];
        break;
      case '--data-file':
        httpOptions.dataFile = args[++i];
        break;
      case '--user-agent':
        httpOptions.userAgent = args[++i];
        break;
      case '-o':
      case '--output':
        httpOptions.output = args[++i];
        break;
      case '--raw':
        httpOptions.raw = true;
        break;
      case '--verbose':
        httpOptions.verbose = true;
        break;
      default:
        if (!args[i].startsWith('-')) {
          httpOptions.url = args[i];
        }
        break;
    }
  }

  if (!httpOptions.url) {
    console.error('\nError: URL is required. Usage: peek-api http <url> -s <session-file>\n');
    process.exit(1);
  }

  if (!httpOptions.session) {
    console.error('\nError: Session file is required. Usage: peek-api http <url> -s <session-file>\n');
    console.error('Create a session with: peek-api login <url>\n');
    process.exit(1);
  }

  try {
    await http(httpOptions);
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
peek-api - Discover and call internal APIs from any website

Usage:
  peek-api <url> [options]          Capture API traffic from a URL (browser mode)
  peek-api login <url> [options]    Save a browser session for authenticated access
  peek-api http <url> [options]     Make direct HTTP API calls using session cookies

Commands:
  login                     Open a browser to log in and save your session
  http                      Make direct API calls with session cookies (no browser)
  (default)                 Capture API traffic from a URL using a browser

Capture Options:
  -d, --duration <seconds>    Capture duration per page (default: 30)
  -s, --session <file>        Playwright session/storage state JSON file
      --stealth               Use stealth mode to avoid bot detection
      --headless              Run headless (default: true, use --no-headless for visible)
      --cdp <endpoint>        Connect to existing Chrome via CDP (ws://host:port/...)
  -p, --pages <urls>          Additional pages to visit (comma-separated paths)
      --scroll-interval <ms>  Auto-scroll interval in ms (default: 3000)
      --user-agent <string>   Custom user agent string
  -o, --output <dir>          Output directory (default: ./peek-api-{domain})
      --verbose               Show all captured requests in real-time
  -h, --help                  Show this help
  -v, --version               Show version

Getting Started:
  # 1. Save a login session (opens a browser window)
  peek-api login https://linkedin.com/login --stealth

  # 2. Capture API traffic (browser mode)
  peek-api https://linkedin.com/feed --session ./linkedin.com-session.json --stealth

  # 3. Or call APIs directly (no browser needed)
  peek-api http https://www.instagram.com/api/v1/direct_v2/inbox/ -s ./ig-session.json

Examples:
  # Basic capture
  peek-api https://example.com

  # Direct API call with session cookies
  peek-api http https://www.instagram.com/api/v1/users/web_profile_info/?username=natgeo -s ./ig.json

  # Connect to running Chrome
  peek-api https://app.example.com --cdp ws://localhost:9222/devtools/browser/abc123

  # Capture multiple pages
  peek-api https://linkedin.com/feed -p /messaging/,/notifications/ --stealth -s ./session.json
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
