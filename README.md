# api-capture

Discover internal APIs from any website. Monitors browser network traffic, captures XHR/fetch calls, extracts authentication headers, and outputs structured endpoint catalogs.

Like opening Chrome DevTools Network tab, but automated and scriptable.

## Install

```bash
npm install -g api-capture
# or run directly
npx api-capture https://example.com
```

## Quick Start

```bash
# Capture APIs from a public site
api-capture https://example.com

# Authenticated capture with saved browser session
api-capture https://linkedin.com/feed --session ./session.json --stealth

# Connect to already-running Chrome
api-capture https://app.example.com --cdp ws://localhost:9222/devtools/browser/abc123

# Capture multiple pages on the same site
api-capture https://linkedin.com/feed -p /messaging/,/notifications/ --stealth -s ./session.json

# Visible browser for debugging
api-capture https://example.com --no-headless --duration 60
```

## Output

Creates an `api-capture-{domain}/` directory with three files:

### CAPTURE.md

Human-readable endpoint report with auth headers and grouped endpoints.

```markdown
# API Capture: linkedin.com
**Endpoints Found:** 26

## Authentication Headers
csrf-token, x-restli-protocol-version, ...

## Discovered Endpoints

### /voyager/api/relationships
- `GET /voyager/api/relationships/connectionsSummary`
- `GET /voyager/api/relationships/invitationsSummary`
```

### auth.json

Extracted authentication headers and session cookies.

```json
{
  "domain": "linkedin.com",
  "headers": {
    "csrf-token": "ajax:...",
    "x-restli-protocol-version": "2.0.0"
  },
  "cookies": {
    "li_at": "...",
    "JSESSIONID": "..."
  }
}
```

### endpoints.json

Full endpoint data including method, URL, params, headers, and POST bodies.

## Options

| Option | Description |
|--------|-------------|
| `-d, --duration <seconds>` | Capture duration per page (default: 30) |
| `-s, --session <file>` | Playwright storage state JSON for authenticated sessions |
| `--stealth` | Use stealth mode to avoid bot detection |
| `--headless / --no-headless` | Run headless or visible (default: headless) |
| `--cdp <endpoint>` | Connect to existing Chrome via CDP WebSocket |
| `-p, --pages <paths>` | Additional pages to visit (comma-separated) |
| `--scroll-interval <ms>` | Auto-scroll interval (default: 3000) |
| `--user-agent <string>` | Custom user agent |
| `-o, --output <dir>` | Custom output directory |
| `--verbose` | Show all captured requests in real-time |

## How It Works

1. Launches a browser (or connects to an existing one via CDP)
2. Optionally loads a saved session for authenticated access
3. Navigates to the target URL and any additional pages
4. Monitors all network requests, filtering for API calls (XHR/fetch)
5. Extracts authentication headers (Bearer tokens, CSRF, API keys, cookies)
6. Deduplicates endpoints by method + path
7. Generates a structured report with endpoint catalog and auth info

## Session Files

To capture APIs from authenticated sites, you need a Playwright storage state file. This is a JSON file containing cookies and localStorage from a logged-in browser session.

### Creating a Session File

The easiest way is to save your browser state after logging in:

```javascript
// save-session.js
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();
const page = await context.newPage();

await page.goto('https://example.com/login');
// Log in manually in the browser window...
// Then press Enter in the terminal when done

await new Promise(resolve => {
  process.stdin.once('data', resolve);
  console.log('Log in, then press Enter to save session...');
});

await context.storageState({ path: 'session.json' });
await browser.close();
```

### Stealth Mode

Some sites (LinkedIn, Instagram, etc.) detect and block browser automation. The `--stealth` flag uses [puppeteer-extra-plugin-stealth](https://github.com/nicedayfor/puppeteer-extra-plugin-stealth) to avoid detection.

## Filtering

The tool automatically filters out:
- Static assets (JS, CSS, images, fonts, etc.)
- Common analytics/tracking requests (Google Analytics, Facebook Pixel, etc.)
- Non-API resource types

Only XHR/fetch requests and URLs containing `/api/`, `/graphql/`, or `/rest/` are captured.

## Use Cases

- **API discovery** - Find what internal APIs a site uses
- **Build integrations** - Get structured endpoint data for direct API access
- **AI agent tooling** - Generate API catalogs that agents can call
- **Reverse engineering** - Understand how a web app communicates with its backend
- **Monitoring** - Track what APIs are called during specific user flows

## Inspired By

[Unbrowse](https://github.com/lekt9/unbrowse-openclaw) - an API discovery tool for the OpenClaw agent framework. This project provides the same core functionality as a standalone CLI with no framework dependencies.

## License

MIT
