import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { connectDatabase } from '../../apps/api/src/database';
import { DEMO_PASSPHRASE } from '../../apps/web/src/demo';
import AxeBuilder from '@axe-core/playwright';

const phrase = 'fictional browser master passphrase';
const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  'postgresql://vaultline:local-development-only@127.0.0.1:54329/vaultline_test';
if (!new URL(databaseUrl).pathname.endsWith('_test'))
  throw new Error('Browser tests require a database ending in _test.');
const db = connectDatabase(databaseUrl);
const accountIds: string[] = [];
test.afterAll(async () => {
  await db.account.deleteMany({ where: { id: { in: accountIds } } });
  await db.$disconnect();
});
async function authenticator(context: BrowserContext, page: Page) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return { cdp, authenticatorId };
}
async function createAccount(page: Page, passphrase = phrase) {
  await page.goto('/');
  await page.getByPlaceholder('e.g. alex').fill(`e2e_${crypto.randomUUID().slice(0, 12)}`);
  await page.getByRole('button', { name: 'Create account with a passkey' }).click();
  await expect(page.getByRole('heading', { name: /Make yourself/ })).toBeVisible();
  const profile = await page.evaluate(
    async () => (await (await fetch('/api/context')).json()).profile,
  );
  accountIds.push(profile.id);
  await page.getByLabel('Master passphrase', { exact: true }).fill(passphrase);
  await page.getByLabel('Confirm master passphrase', { exact: true }).fill(passphrase);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create my vault' }).click();
  await expect(page.getByRole('heading', { name: 'Everything, safely in place.' })).toBeVisible();
  return profile.id as string;
}
async function addEntry(page: Page, title = 'Browser synthetic login') {
  await page.getByRole('button', { name: 'New item', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Title', { exact: true }).fill(title);
  await dialog.getByLabel('Website', { exact: true }).fill('https://example.com');
  await dialog.getByLabel('Username or email').fill('browser-fictional@example.com');
  await dialog.locator('input[type="password"]').fill('Browser-Synthetic-Secret!123');
  await dialog.getByLabel('Notes', { exact: true }).fill('Fictional browser private note');
  await dialog.getByRole('button', { name: 'Save item', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: new RegExp(title) }).first()).toBeVisible();
}
async function unlock(page: Page, passphrase = phrase) {
  await expect(page.getByRole('heading', { name: /Your vault is waiting/ })).toBeVisible();
  await page.getByLabel('Master passphrase', { exact: true }).fill(passphrase);
  await page.getByRole('button', { name: 'Unlock vault', exact: true }).click();
  await expect(page.getByRole('banner')).toBeVisible();
}

test('interactive demo, search, notes, generator, and responsive layouts', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore the interactive demo' }).click();
  await expect(page.getByRole('heading', { name: 'Everything, safely in place.' })).toBeVisible();
  await expect(page.getByText('alex@example.com').first()).toBeVisible();
  await mkdir('docs/screenshots', { recursive: true });
  await page.screenshot({
    path: 'docs/screenshots/desktop.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('textbox', { name: 'Search your vault' }).fill('GitHub');
  await expect(page.getByRole('button', { name: 'Open GitHub', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Figma', exact: true })).not.toBeVisible();
  await page.getByRole('textbox', { name: 'Search your vault' }).fill('');
  await page.getByRole('button', { name: 'Grid view' }).click();
  await expect(page.locator('.item-tile')).toHaveCount(8);
  await page.getByRole('button', { name: 'List view' }).click();
  await page
    .getByRole('navigation', { name: 'Vault navigation' })
    .getByRole('button', { name: /Secure notes/ })
    .click();
  await expect(
    page.getByRole('heading', { name: 'A little space for private things.' }),
  ).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Vault navigation' })
    .getByRole('button', { name: /All items/ })
    .click();
  await page.getByRole('button', { name: 'Password generator', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('slider').fill('32');
  await expect(page.locator('.generated-password')).toHaveText(/.{32}/);
  await page.getByRole('button', { name: 'Use in a new item' }).click();
  await expect(page.getByRole('dialog').locator('input[type="password"]')).toHaveValue(/.{32}/);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: 'docs/screenshots/mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Lock vault', exact: true }).click();
  await unlock(page, DEMO_PASSPHRASE);
  expect(errors).toEqual([]);
});

test('account and vault screens pass automated accessibility checks', async ({ page }) => {
  await page.goto('/');
  const auth = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(auth.violations).toEqual([]);
  await page.getByRole('button', { name: 'Explore the interactive demo' }).click();
  await expect(page.getByRole('heading', { name: 'Everything, safely in place.' })).toBeVisible();
  const vault = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(vault.violations).toEqual([]);
});

test('passkey account, encrypted save, lock, reload, sign-out, and sign-in', async ({
  page,
  context,
}) => {
  await authenticator(context, page);
  const payloads: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/')) payloads.push(request.postData() ?? '');
  });
  const accountId = await createAccount(page);
  await addEntry(page);
  const stored = await db.entry.findFirstOrThrow({ where: { vault: { accountId } } });
  const text = JSON.stringify(stored);
  for (const secret of [
    phrase,
    'Browser synthetic login',
    'browser-fictional@example.com',
    'Browser-Synthetic-Secret!123',
    'Fictional browser private note',
  ]) {
    expect(text).not.toContain(secret);
    expect(payloads.join('\n')).not.toContain(secret);
  }
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
  expect(await page.evaluate(() => Object.keys(sessionStorage))).toEqual([]);
  await page.reload();
  await unlock(page);
  await page.getByRole('button', { name: 'Open Browser synthetic login', exact: true }).click();
  await page.getByRole('button', { name: 'Reveal password', exact: true }).click();
  await expect(page.getByRole('dialog').locator('.password-input input')).toHaveValue(
    'Browser-Synthetic-Secret!123',
  );
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Lock vault', exact: true }).click();
  await page.getByLabel('Master passphrase', { exact: true }).fill('incorrect master passphrase');
  await page.getByRole('button', { name: 'Unlock vault', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('incorrect');
  await unlock(page);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Sign in with a passkey' }).click();
  await unlock(page);
  await expect(
    page.getByRole('button', { name: 'Open Browser synthetic login', exact: true }),
  ).toBeVisible();
});

test('lost response retry does not duplicate an already committed save', async ({
  page,
  context,
}) => {
  await authenticator(context, page);
  const accountId = await createAccount(page);
  await page.getByRole('button', { name: 'New item', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Title', { exact: true }).fill('Lost response example');
  let intercepted = false;
  await page.route('**/api/entries/**', async (route) => {
    if (route.request().method() === 'PUT' && !intercepted) {
      intercepted = true;
      await route.fetch();
      await route.abort('failed');
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'Save item', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Connection lost');
  expect(await db.entry.count({ where: { vault: { accountId } } })).toBe(1);
  await page.getByRole('button', { name: 'Save item', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(await db.entry.count({ where: { vault: { accountId } } })).toBe(1);
});

test('two tabs preserve stale drafts and coordinate locking', async ({ page, context }) => {
  await authenticator(context, page);
  await createAccount(page);
  await addEntry(page, 'Original title');
  const other = await context.newPage();
  await other.goto('/');
  await unlock(other);
  await page.getByRole('button', { name: 'Open Original title', exact: true }).click();
  await other.getByRole('button', { name: 'Open Original title', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Title', { exact: true }).fill('Newer title');
  await page.getByRole('button', { name: 'Save item', exact: true }).click();
  await other.getByRole('dialog').getByLabel('Title', { exact: true }).fill('Stale draft');
  await other.getByRole('button', { name: 'Save item', exact: true }).click();
  await expect(other.getByRole('alert')).toContainText('changed');
  await expect(other.getByRole('dialog').getByLabel('Title', { exact: true })).toHaveValue(
    'Stale draft',
  );
  await other.getByRole('button', { name: 'Discard draft and load latest version' }).click();
  await expect(other.getByRole('button', { name: 'Open Newer title', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Lock vault', exact: true }).click();
  await expect(other.getByRole('heading', { name: /Your vault is waiting/ })).toBeVisible();
});

test('encrypted export restores into a different account under a different key', async ({
  page,
  context,
  browser,
}) => {
  await authenticator(context, page);
  await createAccount(page);
  await addEntry(page, 'Backup restored login');
  await page.getByRole('button', { name: 'Encrypted backups', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download encrypted backup' }).click();
  const backupPath = await (await downloadPromise).path();
  const freshContext = await browser.newContext({ baseURL: 'http://localhost:5174' });
  const fresh = await freshContext.newPage();
  await authenticator(freshContext, fresh);
  await createAccount(fresh, 'a different target vault passphrase');
  await fresh.getByRole('button', { name: 'Encrypted backups', exact: true }).click();
  await fresh.getByLabel('Choose encrypted backup').setInputFiles(backupPath);
  await fresh.getByLabel('Backup’s master passphrase').fill(phrase);
  await fresh.getByRole('button', { name: 'Verify and restore backup' }).click();
  await expect(fresh.getByRole('status')).toContainText('1 item restored');
  await fresh
    .getByRole('navigation', { name: 'Vault navigation' })
    .getByRole('button', { name: /All items/ })
    .click();
  await fresh.getByRole('button', { name: 'Open Backup restored login', exact: true }).click();
  await expect(fresh.getByRole('dialog').getByLabel('Username or email')).toHaveValue(
    'browser-fictional@example.com',
  );
  await freshContext.close();
});

test('idle timeout clears decrypted UI and locks the worker', async ({ page, context }) => {
  await authenticator(context, page);
  await createAccount(page);
  await addEntry(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('select').selectOption('1');
  await page.clock.install();
  await page.clock.fastForward(61000);
  await expect(page.getByRole('heading', { name: /Your vault is waiting/ })).toBeVisible();
  await expect(page.getByText('Browser synthetic login')).not.toBeVisible();
});

test('additional passkey, reauthentication, session revocation, and passphrase change', async ({
  page,
  context,
  browser,
}) => {
  const firstAuthenticator = await authenticator(context, page);
  await createAccount(page);
  await addEntry(page, 'Key lifecycle example');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await firstAuthenticator.cdp.send('WebAuthn.removeVirtualAuthenticator', {
    authenticatorId: firstAuthenticator.authenticatorId,
  });
  const secondAuthenticator = await authenticator(context, page);
  await page.getByRole('button', { name: 'Add a passkey', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Additional passkey registered');
  await page.getByRole('button', { name: 'Verify passkey again', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Passkey verified');
  const { credentials } = await secondAuthenticator.cdp.send('WebAuthn.getCredentials', {
    authenticatorId: secondAuthenticator.authenticatorId,
  });
  const otherContext = await browser.newContext({ baseURL: 'http://localhost:5174' });
  const other = await otherContext.newPage();
  const remoteAuthenticator = await authenticator(otherContext, other);
  for (const credential of credentials)
    await remoteAuthenticator.cdp.send('WebAuthn.addCredential', {
      authenticatorId: remoteAuthenticator.authenticatorId,
      credential,
    });
  await other.goto('/');
  await other.getByRole('button', { name: 'Sign in', exact: true }).click();
  await other.getByRole('button', { name: 'Sign in with a passkey' }).click();
  await unlock(other);
  // Refresh the first browser's session list without changing its authenticated session.
  await page.getByRole('button', { name: 'Security activity', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Revoke', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Session revoked');
  await other.getByRole('button', { name: 'Security activity', exact: true }).click();
  await expect(other.getByRole('heading', { name: /Your private space/ })).toBeVisible();
  const nextPhrase = 'a changed fictional browser passphrase';
  await page.getByLabel('New master passphrase', { exact: true }).fill(nextPhrase);
  await page.getByLabel('Confirm passphrase', { exact: true }).fill(nextPhrase);
  await page.getByRole('button', { name: 'Change master passphrase', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Master passphrase changed');
  await expect(page.getByRole('heading', { name: /Your vault is waiting/ })).toBeVisible();
  await page.getByLabel('Master passphrase', { exact: true }).fill(phrase);
  await page.getByRole('button', { name: 'Unlock vault', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('incorrect');
  await unlock(page, nextPhrase);
  await page
    .getByRole('navigation', { name: 'Vault navigation' })
    .getByRole('button', { name: /All items/ })
    .click();
  await expect(
    page.getByRole('button', { name: 'Open Key lifecycle example', exact: true }),
  ).toBeVisible();
  await otherContext.close();
});
