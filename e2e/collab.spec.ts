import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

const fixture = path.resolve('test/fixtures/paper.pdf');

async function waitForTextLayer(page: Page) {
  await page.locator('.textLayer span[data-i]').first().waitFor({ timeout: 20_000 });
}

test('two people read a paper together', async ({ browser, baseURL }) => {
  const alice = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  const bob = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();

  // Alice creates a session.
  await alice.goto(baseURL!);
  await alice.getByPlaceholder('How others will see you').fill('Alice');
  await alice.locator('input[type=file]').setInputFiles(fixture);
  await alice.getByRole('button', { name: 'Create session' }).click();
  await alice.waitForURL(/\/s\//);
  await waitForTextLayer(alice);
  await alice.getByRole('button', { name: 'Host ▾' }).click();
  const passcode = (await alice.locator('code').first().textContent())!.trim();
  expect(passcode).toMatch(/^\w+-\w+-\w+$/);
  await alice.mouse.click(700, 500);

  // Bob joins with the passcode.
  await bob.goto(baseURL!);
  await bob.getByPlaceholder('How others will see you').fill('Bob');
  await bob.getByPlaceholder('amber-fox-river').fill(passcode);
  await bob.getByRole('button', { name: 'Join', exact: true }).click();
  await bob.waitForURL(/\/s\//);
  await waitForTextLayer(bob);
  expect(bob.url()).toBe(alice.url());

  // Bob's cursor shows up for Alice.
  const bb = (await bob.locator('[data-page="1"]').boundingBox())!;
  await bob.mouse.move(bb.x + bb.width * 0.5, bb.y + bb.height * 0.3);
  await bob.mouse.move(bb.x + bb.width * 0.52, bb.y + bb.height * 0.32, { steps: 5 });
  await expect(alice.locator('[data-page="1"]').getByText('Bob')).toBeVisible();

  // Alice highlights a sentence; Bob sees it and the sidebar quotes it.
  const span = (await alice.locator('[data-page="1"] .textLayer span[data-i]').nth(1).boundingBox())!;
  await alice.mouse.move(span.x + 2, span.y + span.height / 2);
  await alice.mouse.down();
  await alice.mouse.move(span.x + span.width * 0.6, span.y + span.height / 2, { steps: 8 });
  await alice.mouse.up();
  await alice.locator('.sel-popover').getByRole('button', { name: 'Highlight', exact: true }).click();
  await expect(bob.locator('[data-page="1"] svg g rect').first()).toBeVisible();
  await expect(alice.locator('aside p').first()).toContainText('observe');

  // A comment with LaTeX and a mention renders for Bob.
  await alice.locator('aside textarea').first().fill('Is $3.2\\times$ from Table 2? @Bob');
  await alice.locator('aside').getByRole('button', { name: 'Post' }).click();
  await bob.locator('aside [data-ann]').first().click();
  await expect(bob.locator('aside .katex').first()).toBeVisible();
  await expect(bob.locator('aside .mention').first()).toHaveText('@Bob');

  // Bob replies; Alice sees it.
  await bob.locator('aside').getByRole('button', { name: 'Reply' }).click();
  await bob.locator('aside textarea').first().fill('Yes, Table 2, second row.');
  await bob.locator('aside').getByRole('button', { name: 'Post' }).first().click();
  await expect(alice.locator('aside').getByText('Yes, Table 2')).toBeVisible();

  // Export contains the discussion.
  const token = await alice.evaluate(() => (Object.values(JSON.parse(localStorage.getItem('reader:sessions')!)) as { token: string }[])[0].token);
  const md = await (await alice.request.get(`${baseURL}/api/session/export.md`, { headers: { authorization: `Bearer ${token}` } })).text();
  expect(md).toContain('highlighted by Alice');
  expect(md).toContain('Table 2, second row');
});
