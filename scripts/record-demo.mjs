import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
mkdirSync('docs', { recursive: true });
const browser = await chromium.launch({ slowMo: 100 });
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  recordVideo: { dir: '.local/recordings', size: { width: 1280, height: 900 } },
});
const page = await context.newPage();
const pause = () => new Promise((resolve) => setTimeout(resolve, 1400));
try {
  await page.goto('http://localhost:5173/');
  await page.getByRole('button', { name: 'Explore the interactive demo' }).waitFor();
  await pause();
  await page.getByRole('button', { name: 'Explore the interactive demo' }).click();
  await page.getByRole('heading', { name: 'Everything, safely in place.' }).waitFor();
  console.log('Recording the fictional demo workspace.');
  await pause();
  await page.getByRole('button', { name: 'Open GitHub', exact: true }).click();
  await page.getByRole('button', { name: 'Reveal password', exact: true }).click();
  await pause();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Password generator', exact: true }).click();
  await page.getByRole('slider').fill('32');
  await pause();
  await page.getByRole('button', { name: 'Use in a new item' }).click();
  await page.getByRole('dialog').getByLabel('Title', { exact: true }).fill('Example project');
  await page.getByRole('dialog').getByLabel('Website', { exact: true }).fill('https://example.com');
  await page.getByRole('dialog').getByLabel('Username or email').fill('fictional@example.com');
  await page.getByRole('button', { name: 'Save item', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await pause();
  await page.getByRole('textbox', { name: 'Search your vault' }).fill('Example');
  await pause();
  await page.getByRole('textbox', { name: 'Search your vault' }).fill('');
  await page.getByRole('button', { name: 'Password check', exact: true }).click();
  await pause();
  await page.getByRole('button', { name: 'Encrypted backups', exact: true }).click();
  await pause();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await pause();
  await page.getByRole('button', { name: 'Lock vault', exact: true }).click();
  await page.getByRole('heading', { name: /Your vault is waiting/ }).waitFor();
  await pause();
  const video = page.video();
  await context.close();
  await video.saveAs('docs/demo.webm');
  console.log('Saved docs/demo.webm (fictional demo data; no real account or credentials).');
} finally {
  await browser.close();
}
