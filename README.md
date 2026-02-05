# api-capture

Discover internal APIs from any website. Monitors browser network traffic, captures XHR/fetch calls, extracts authentication headers, and outputs structured endpoint catalogs.

Like opening Chrome DevTools Network tab, but automated and scriptable.

> Built on the ideas from [Unbrowse](https://github.com/lekt9/unbrowse-openclaw) by [@nicedayfor](https://github.com/nicedayfor). Their work on API discovery for AI agents is what inspired this project. This is a standalone reimplementation with no framework dependencies -- the core capture/extract/report workflow works with any agent platform, any automation stack, or just on its own from the command line.
>
> <details>
> <summary>How this differs from Unbrowse</summary>
>
> Unbrowse is a plugin for the [OpenClaw](https://github.com/nicedayfor/openclaw) agent framework. It's tightly integrated -- it uses OpenClaw's browser service, generates OpenClaw-specific "skills", and requires the OpenClaw runtime.
>
> `api-capture` extracts the same core idea (browse a site, capture API traffic, extract auth, catalog endpoints) and makes it a standalone CLI:
>
> | | Unbrowse | api-capture |
> |---|---|---|
> | **Runtime** | Requires OpenClaw agent framework | Standalone Node.js CLI |
> | **Browser** | OpenClaw's managed browser service | Playwright (local or remote CDP) |
> | **Auth** | Managed by OpenClaw | `login` command saves portable session files |
> | **Bot detection** | OpenClaw handles it | Built-in stealth mode via `--stealth` |
> | **Output** | OpenClaw skill definitions | Markdown report + JSON (use with anything) |
> | **Agent integration** | OpenClaw only | Agent-agnostic (works with Claude, GPT, etc.) |
>
> If you're using OpenClaw, use Unbrowse. If you want API capture without framework lock-in, use this.
> </details>

## Install

```bash
npm install -g api-capture
# or run directly
npx api-capture https://example.com
```

## Quick Start

```bash
# 1. Save a login session (opens a browser for you to log in)
api-capture login https://linkedin.com/login --stealth

# 2. Capture authenticated API traffic using the saved session
api-capture https://linkedin.com/feed --session ./linkedin.com-session.json --stealth

# Capture APIs from a public site (no login needed)
api-capture https://example.com

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

## Login & Sessions

Most interesting APIs require authentication. The `login` command handles this:

```bash
# Opens a browser window - log in manually, then press Enter
api-capture login https://linkedin.com/login --stealth

# Session is saved to linkedin.com-session.json
# Now use it for captures:
api-capture https://linkedin.com/feed --session ./linkedin.com-session.json --stealth
```

The login flow:
1. Opens a visible Chrome window pointed at the URL you specify
2. You log in manually -- handle 2FA, captchas, security checks at your own pace
3. Come back to the terminal and press Enter
4. Cookies and localStorage are saved to a JSON file (Playwright storage state format)

Sessions typically last 7-30 days before you need to re-login.

### Login Options

| Option | Description |
|--------|-------------|
| `--stealth` | Use stealth mode (recommended for LinkedIn, Instagram, etc.) |
| `-o, --output <file>` | Custom session file path (default: `{domain}-session.json`) |

### Stealth Mode

Some sites (LinkedIn, Instagram, etc.) detect and block browser automation. The `--stealth` flag uses [puppeteer-extra-plugin-stealth](https://github.com/nicedayfor/puppeteer-extra-plugin-stealth) to avoid detection. Use it for both `login` and `capture` commands.

## Filtering

The tool automatically filters out:
- Static assets (JS, CSS, images, fonts, etc.)
- Common analytics/tracking requests (Google Analytics, Facebook Pixel, etc.)
- Non-API resource types

Only XHR/fetch requests and URLs containing `/api/`, `/graphql/`, or `/rest/` are captured.

## When Browser Capture Doesn't Work

Some sites (notably Instagram) block all automated browsers -- even stealth mode with real Chrome. In these cases, the session file saved by `api-capture login` is still valuable: you can make direct HTTP requests using the cookies.

```bash
# 1. Login normally to get session cookies
api-capture login https://instagram.com/accounts/login --stealth

# 2. Use the session file for direct API calls (no browser needed)
# The session JSON contains cookies you can use with curl, fetch, etc.
```

This "direct HTTP" approach bypasses browser detection entirely. The session file format (Playwright storage state) contains all cookies and localStorage needed to authenticate API requests from any HTTP client.

## Use Cases

- **API discovery** - Find what internal APIs a site uses
- **Build integrations** - Get structured endpoint data for direct API access
- **AI agent tooling** - Generate API catalogs that agents can call
- **Reverse engineering** - Understand how a web app communicates with its backend
- **Monitoring** - Track what APIs are called during specific user flows
- **Direct HTTP fallback** - Use saved sessions for API calls when browser capture is blocked

## License

MIT
