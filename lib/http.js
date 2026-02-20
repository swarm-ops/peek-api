import fs from 'node:fs';
import https from 'node:https';
import httpModule from 'node:http';

// Known platform-specific headers that should be auto-added
const PLATFORM_HEADERS = {
  'instagram.com': {
    'X-IG-App-ID': '936619743392459',
    'X-Requested-With': 'XMLHttpRequest'
  }
};

function loadSession(sessionFile) {
  const raw = fs.readFileSync(sessionFile, 'utf8');
  const session = JSON.parse(raw);

  const cookies = session.cookies || [];
  const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');

  // Extract known CSRF tokens
  const csrf = {};
  for (const c of cookies) {
    if (c.name === 'csrftoken') csrf['X-CSRFToken'] = c.value;         // Instagram/Facebook
    if (c.name === 'JSESSIONID') csrf['csrf-token'] = c.value;         // LinkedIn
  }

  // Extract claim headers from cookies (Instagram)
  const wwwClaim = cookies.find(c => c.name === 'x-ig-www-claim');

  return { cookies, cookieStr, csrf, wwwClaim, session };
}

function detectPlatform(hostname) {
  for (const [domain, headers] of Object.entries(PLATFORM_HEADERS)) {
    if (hostname.includes(domain)) return headers;
  }
  return {};
}

function parseCustomHeaders(headerStrings) {
  const headers = {};
  for (const h of headerStrings) {
    const colonIdx = h.indexOf(':');
    if (colonIdx === -1) continue;
    const key = h.slice(0, colonIdx).trim();
    const val = h.slice(colonIdx + 1).trim();
    headers[key] = val;
  }
  return headers;
}

function formatJson(data) {
  try {
    const parsed = typeof data === 'string' ? JSON.parse(data) : data;
    return JSON.stringify(parsed, null, 2);
  } catch {
    return data;
  }
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export async function http(options) {
  const {
    url,
    session: sessionFile,
    method = 'GET',
    headers: headerStrings = [],
    data,
    dataFile,
    userAgent,
    output,
    raw = false,
    verbose = false
  } = options;

  const parsedUrl = new URL(url);
  const isHttps = parsedUrl.protocol === 'https:';
  const requestModule = isHttps ? https : httpModule;

  // Load session
  const { cookieStr, csrf, wwwClaim } = loadSession(sessionFile);

  // Build headers
  const platformHeaders = detectPlatform(parsedUrl.hostname);
  const customHeaders = parseCustomHeaders(headerStrings);

  const requestHeaders = {
    'Cookie': cookieStr,
    'User-Agent': userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    ...csrf,
    ...platformHeaders,
    ...customHeaders
  };

  // Add Instagram www-claim if present
  if (wwwClaim && parsedUrl.hostname.includes('instagram.com')) {
    requestHeaders['X-IG-WWW-Claim'] = wwwClaim.value;
  }

  // Request body
  let body = null;
  if (data) {
    body = data;
  } else if (dataFile) {
    body = fs.readFileSync(dataFile, 'utf8');
  }

  if (body && !requestHeaders['Content-Type']) {
    try {
      JSON.parse(body);
      requestHeaders['Content-Type'] = 'application/json';
    } catch {
      requestHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
    }
  }

  if (!raw) {
    console.log('');
    console.log(`  peek-api http`);
    console.log(`  ${method} ${parsedUrl.pathname}${parsedUrl.search}`);
    console.log(`  Host: ${parsedUrl.hostname}`);
    if (verbose) {
      console.log('');
      console.log('  Request Headers:');
      for (const [k, v] of Object.entries(requestHeaders)) {
        if (k === 'Cookie') {
          const count = v.split(';').length;
          console.log(`    ${k}: [${count} cookies]`);
        } else {
          console.log(`    ${k}: ${v}`);
        }
      }
    }
    console.log('');
  }

  // Make the request
  return new Promise((resolve, reject) => {
    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method,
      headers: requestHeaders
    };

    const req = requestModule.request(reqOptions, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const responseBody = Buffer.concat(chunks).toString('utf8');
        const contentType = res.headers['content-type'] || '';

        if (verbose && !raw) {
          console.log(`  Response: ${res.statusCode} ${res.statusMessage}`);
          console.log(`  Content-Type: ${contentType}`);
          console.log(`  Size: ${formatSize(Buffer.byteLength(responseBody))}`);
          console.log('');
        }

        // Handle redirects (session expired)
        if (res.statusCode === 302 || res.statusCode === 301) {
          const location = res.headers.location || '';
          if (!raw) {
            console.log(`  Redirected to: ${location}`);
            if (location.includes('login') || location.includes('accounts')) {
              console.log('');
              console.log('  Session appears expired. Re-run:');
              console.log(`    peek-api login ${parsedUrl.origin} --stealth`);
            }
            console.log('');
          }
          resolve();
          return;
        }

        // Output
        if (raw) {
          process.stdout.write(responseBody);
        } else {
          if (res.statusCode >= 400) {
            console.log(`  Error: ${res.statusCode} ${res.statusMessage}`);
            console.log('');
          }

          if (contentType.includes('json')) {
            console.log(formatJson(responseBody));
          } else {
            console.log(responseBody);
          }

          if (!verbose) {
            console.log('');
            console.log(`  Status: ${res.statusCode} | Size: ${formatSize(Buffer.byteLength(responseBody))}`);
          }
          console.log('');
        }

        // Save to file
        if (output) {
          const toWrite = contentType.includes('json') ? formatJson(responseBody) : responseBody;
          fs.writeFileSync(output, toWrite);
          if (!raw) {
            console.log(`  Saved to ${output}`);
            console.log('');
          }
        }

        resolve();
      });
    });

    req.on('error', (err) => {
      reject(new Error(`Request failed: ${err.message}`));
    });

    if (body) {
      req.write(body);
    }

    req.end();
  });
}
