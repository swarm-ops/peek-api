import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

function waitForEnter(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(prompt, () => {
      rl.close();
      resolve();
    });
  });
}

export async function login(options) {
  const { url, output, stealth = false } = options;

  const parsedUrl = new URL(url);
  const domain = parsedUrl.hostname.replace('www.', '');
  const sessionFile = output || `${domain}-session.json`;

  console.log('');
  console.log('  api-capture login');
  console.log('  ─────────────────');
  console.log('');
  console.log(`  This will open a browser window so you can log into ${domain}.`);
  console.log('  After you log in, your session will be saved for future captures.');
  console.log('');
  console.log('  Steps:');
  console.log('    1. A Chrome window will open');
  console.log(`    2. Log into ${domain} as you normally would`);
  console.log('    3. Once you see your logged-in dashboard/homepage,');
  console.log('       come back here and press Enter');
  console.log(`    4. Your session will be saved to ${sessionFile}`);
  console.log('');

  // Launch browser
  let chromiumModule;
  if (stealth) {
    const pe = await import('playwright-extra');
    const stealthPlugin = await import('puppeteer-extra-plugin-stealth');
    pe.chromium.use(stealthPlugin.default());
    chromiumModule = pe.chromium;
    console.log('  Using stealth mode (recommended for LinkedIn, Instagram, etc.)');
  } else {
    const pw = await import('playwright');
    chromiumModule = pw.chromium;
  }

  console.log('  Launching browser...');
  console.log('');

  const browser = await chromiumModule.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled']
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 }
  });

  const page = await context.newPage();

  console.log(`  Navigating to ${url}`);
  console.log('');
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

  console.log('  ┌─────────────────────────────────────────────┐');
  console.log('  │                                             │');
  console.log('  │   Browser is open. Log in now.              │');
  console.log('  │                                             │');
  console.log('  │   Take your time - complete any 2FA,        │');
  console.log('  │   security checks, or captchas as needed.   │');
  console.log('  │                                             │');
  console.log('  │   When you see your logged-in page:         │');
  console.log('  │   → Come back here and press Enter          │');
  console.log('  │                                             │');
  console.log('  └─────────────────────────────────────────────┘');
  console.log('');

  await waitForEnter('  Press Enter when logged in... ');

  // Verify we're on a different page (basic login detection)
  const currentUrl = page.url();
  const currentTitle = await page.title();
  console.log('');
  console.log(`  Current page: ${currentTitle}`);
  console.log(`  URL: ${currentUrl}`);

  const lowerTitle = currentTitle.toLowerCase();
  if (lowerTitle.includes('login') || lowerTitle.includes('sign in') || lowerTitle.includes('sign up')) {
    console.log('');
    console.log('  ⚠  Warning: Page title still looks like a login page.');
    console.log('     Make sure you completed the login process.');
    console.log('');
    await waitForEnter('  Press Enter to save anyway, or Ctrl+C to cancel... ');
  }

  // Save session
  console.log('');
  console.log('  Saving session...');

  await context.storageState({ path: sessionFile });

  // Read back to report what was saved
  const saved = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
  const cookieCount = saved.cookies ? saved.cookies.length : 0;
  const originCount = saved.origins ? saved.origins.length : 0;

  console.log(`  Saved ${cookieCount} cookies and ${originCount} origins`);
  console.log('');
  console.log('  ✓ Session saved to ' + sessionFile);
  console.log('');
  console.log('  Now you can run authenticated captures:');
  console.log('');
  console.log(`    api-capture ${parsedUrl.origin} --session ./${path.basename(sessionFile)}`);
  console.log('');
  if (domain.includes('linkedin') || domain.includes('instagram') || domain.includes('facebook')) {
    console.log(`  Tip: ${domain} has bot detection. Add --stealth:`);
    console.log('');
    console.log(`    api-capture ${parsedUrl.origin} --session ./${path.basename(sessionFile)} --stealth`);
    console.log('');
  }
  console.log('  Sessions typically last 7-30 days before needing refresh.');
  console.log('  Re-run this command when your session expires.');
  console.log('');

  await browser.close();
}
