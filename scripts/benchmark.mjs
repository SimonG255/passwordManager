import { chromium } from '@playwright/test';
import { cpus } from 'node:os';
import { mkdirSync, writeFileSync } from 'node:fs';
const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
await page.goto('http://localhost:5173/');
const measurements = await page.evaluate(async () => {
  const { cryptoCall, lockCrypto } = await import('/src/crypto-client.ts');
  const phrase = 'fictional benchmark master passphrase';
  let start = performance.now();
  const envelope = await cryptoCall('create', { passphrase: phrase });
  const createMs = performance.now() - start;
  start = performance.now();
  const entries = [];
  for (let i = 0; i < 1000; i++)
    entries.push(
      await cryptoCall('encrypt', {
        fields: {
          title: `Synthetic entry ${i}`,
          website: 'https://example.com',
          username: `fake-${i}@example.com`,
          password: `Synthetic-Only-Password!${i}`,
          notes: 'Fictional benchmark data',
          favorite: false,
          category: 'login',
        },
      }),
    );
  const encrypt1000Ms = performance.now() - start;
  lockCrypto();
  start = performance.now();
  await cryptoCall('unlock', { passphrase: phrase, envelope });
  const unlockMs = performance.now() - start;
  start = performance.now();
  const decrypted = await cryptoCall('decrypt', { entries });
  const decrypt1000Ms = performance.now() - start;
  const searches = [];
  for (let i = 0; i < 50; i++) {
    start = performance.now();
    decrypted.filter((entry) =>
      `${entry.title} ${entry.username}`.toLowerCase().includes('entry 50'),
    );
    searches.push(performance.now() - start);
  }
  lockCrypto();
  searches.sort((a, b) => a - b);
  return {
    kdf: envelope.kdf,
    createMs,
    unlockMs,
    encrypt1000Ms,
    decrypt1000Ms,
    searchMedianMs: searches[25],
    entries: 1000,
  };
});
const report = {
  measuredAt: new Date().toISOString(),
  browser: browser.version(),
  platform: process.platform,
  cpu: cpus()[0].model,
  ...Object.fromEntries(
    Object.entries(measurements).map(([key, value]) => [
      key,
      typeof value === 'number' ? Math.round(value * 100) / 100 : value,
    ]),
  ),
  note: 'One synthetic local benchmark run, including worker/RPC overhead; not a cross-device performance guarantee.',
};
mkdirSync('docs/evidence', { recursive: true });
writeFileSync('docs/evidence/benchmark.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
await browser.close();
