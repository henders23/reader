// Drives the real UI in two browser contexts: Alice creates a session, Bob joins by passcode,
// then checks cursors, highlights and comments flow between them. Saves screenshots to /tmp/shots.
import { chromium } from '@playwright/test';
import path from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:8081';
const fixture = path.resolve('test/fixtures/paper.pdf');
const shots = process.env.SHOTS ?? '/tmp/shots';
const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
};

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const alice = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  const bob = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  var errors = { alice: [], bob: [] };
  alice.on('pageerror', (e) => errors.alice.push(String(e)));
  bob.on('pageerror', (e) => errors.bob.push(String(e)));
  alice.on('console', (m) => m.type() === 'error' && errors.alice.push(m.text()));
  bob.on('console', (m) => m.type() === 'error' && errors.bob.push(m.text()));

  // --- Alice creates ---
  await alice.goto(BASE);
  await alice.getByPlaceholder('How others will see you').fill('Alice');
  await alice.locator('input[type=file]').setInputFiles(fixture);
  await alice.getByRole('button', { name: 'Create session' }).click();
  await alice.waitForURL(/\/s\//, { timeout: 15000 });
  await alice.locator('.textLayer span[data-i]').first().waitFor({ timeout: 20000 });
  const sessionUrl = alice.url();
  await alice.getByRole('button', { name: 'Host ▾' }).click();
  const passcode = (await alice.locator('code').first().textContent()).trim();
  await alice.keyboard.press('Escape');
  await alice.mouse.move(700, 400); // close the menu by leaving it
  check('session created with passcode', /^\w+-\w+-\w+$/.test(passcode), passcode);
  await alice.screenshot({ path: `${shots}/01-alice-host.png` });

  // --- Bob joins ---
  await bob.goto(BASE);
  await bob.getByPlaceholder('How others will see you').fill('Bob');
  await bob.getByPlaceholder('amber-fox-river').fill(passcode);
  await bob.getByRole('button', { name: 'Join', exact: true }).click();
  await bob.waitForURL(/\/s\//, { timeout: 15000 });
  await bob.locator('.textLayer span[data-i]').first().waitFor({ timeout: 20000 });
  check('bob joined the same session', bob.url() === sessionUrl);
  await alice.waitForFunction(() => document.querySelectorAll('header span[title]').length >= 2);

  // --- presence: Bob moves; Alice sees his cursor on page 1 ---
  const bobPage1 = bob.locator('[data-page="1"]');
  const bb = await bobPage1.boundingBox();
  await bob.mouse.move(bb.x + bb.width * 0.5, bb.y + bb.height * 0.3);
  await bob.mouse.move(bb.x + bb.width * 0.52, bb.y + bb.height * 0.32, { steps: 5 });
  await alice.waitForTimeout(400);
  const cursorVisible = await alice.locator('[data-page="1"] div:has(> svg path) >> visible=true').filter({ hasText: 'Bob' }).count();
  check('alice sees bob cursor', cursorVisible > 0);

  // --- Alice highlights text via selection popover ---
  const spans = alice.locator('[data-page="1"] .textLayer span[data-i]');
  const s1 = await spans.nth(1).boundingBox();
  await alice.mouse.move(s1.x + 2, s1.y + s1.height / 2);
  await alice.mouse.down();
  await alice.mouse.move(s1.x + s1.width * 0.6, s1.y + s1.height / 2, { steps: 8 });
  await alice.mouse.up();
  await alice.locator('.sel-popover').waitFor({ timeout: 5000 });
  await alice.screenshot({ path: `${shots}/02-alice-popover.png` });
  await alice.locator('.sel-popover').getByRole('button', { name: 'Highlight', exact: true }).click();
  await bob.locator('[data-page="1"] svg g rect').first().waitFor({ timeout: 5000 });
  check('bob sees alice highlight', (await bob.locator('[data-page="1"] svg g rect').count()) > 0);
  const quote = await alice.locator('aside p').first().textContent();
  check('sidebar shows quoted text', /observe|speedup|Abstract/i.test(quote ?? ''), quote?.slice(0, 60));

  // --- Alice comments with LaTeX; Bob sees it rendered ---
  await alice.locator('aside textarea').first().fill('Is $3.2\\times$ from Table 2? @Bob');
  await alice.locator('aside').getByRole('button', { name: 'Post' }).click();
  await alice.waitForTimeout(500);
  await alice.screenshot({ path: `${shots}/03a-alice-posted.png` });
  await bob.locator('aside [data-ann]').first().click();
  await bob.locator('aside .katex').first().waitFor({ timeout: 5000 });
  check('bob sees comment with katex', (await bob.locator('aside .katex').count()) > 0);
  check('mention rendered', (await bob.locator('aside .mention').count()) > 0);
  await bob.screenshot({ path: `${shots}/03-bob-thread.png` });

  // --- Bob replies ---
  await bob.locator('aside').getByRole('button', { name: 'Reply' }).click();
  await bob.locator('aside textarea').first().fill('Yes, Table 2, second row.');
  await bob.locator('aside').getByRole('button', { name: 'Post' }).first().click();
  await alice.locator('aside').getByText('Yes, Table 2').waitFor({ timeout: 5000 });
  check('alice sees bob reply', true);

  // --- pin tool on Bob ---
  await bob.keyboard.press('p');
  await bob.mouse.click(bb.x + bb.width * 0.7, bb.y + bb.height * 0.6);
  await alice.locator('[data-page="1"] button[title*="Bob"]').waitFor({ timeout: 5000 });
  check('alice sees bob pin', true);

  // --- follow: Alice scrolls to page 2, Bob follows ---
  await bob.keyboard.press('v');
  await bob.locator('header').getByTitle(/Alice · click to follow/).click();
  await alice.locator('button[title="Page 2"]').click();
  await bob.waitForTimeout(1200);
  const bobPage = await bob.locator('header').getByText(/p\. 2\/2/).count();
  check('bob follows alice to page 2', bobPage > 0);
  await bob.screenshot({ path: `${shots}/04-bob-following.png` });

  // --- export ---
  const token = await alice.evaluate(() => Object.values(JSON.parse(localStorage.getItem('reader:sessions')))[0].token);
  const md = await (await fetch(`${BASE}/api/session/export.md`, { headers: { authorization: `Bearer ${token}` } })).text();
  check('export contains quote and comments', md.includes('highlighted by Alice') && md.includes('Table 2, second row'));

  check('no console errors (alice)', errors.alice.length === 0, errors.alice.slice(0, 3).join(' | '));
  check('no console errors (bob)', errors.bob.length === 0, errors.bob.slice(0, 3).join(' | '));
} catch (e) {
  console.log('ERROR', String(e).split('\n')[0]);
  console.log('alice errors:', errors.alice.slice(0, 5));
  console.log('bob errors:', errors.bob.slice(0, 5));
  for (const ctx of browser.contexts()) for (const [i, p] of ctx.pages().entries()) await p.screenshot({ path: `${shots}/fail-${browser.contexts().indexOf(ctx)}-${i}.png` });
  results.push({ name: 'script completed', ok: false });
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
