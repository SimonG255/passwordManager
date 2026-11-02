import type { VaultEntry } from '@vaultline/contracts';

export function passwordHealth(entries: VaultEntry[]) {
  const logins = entries.filter((entry) => entry.category === 'login' && entry.password);
  const counts = new Map<string, number>();
  for (const entry of logins) counts.set(entry.password, (counts.get(entry.password) ?? 0) + 1);
  const reused = logins.filter((entry) => (counts.get(entry.password) ?? 0) > 1);
  const short = logins.filter((entry) => entry.password.length < 16);
  const attention = new Set([...short, ...reused].map((entry) => entry.id));
  const score = logins.length
    ? Math.round((100 * (logins.length - attention.size)) / logins.length)
    : null;
  return { logins, reused, short, attention, score };
}
