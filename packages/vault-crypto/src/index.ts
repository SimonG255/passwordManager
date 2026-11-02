import { argon2id } from 'hash-wasm';
import {
  backupSchema,
  entryEnvelopeSchema,
  entryFieldsSchema,
  keyEnvelopeSchema,
  snapshotSchema,
  MAX_BACKUP_BYTES,
  type Cipher,
  type EntryEnvelope,
  type EntryFields,
  type KeyEnvelope,
  type VaultEntry,
} from '@vaultline/contracts';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
export const KDF = {
  algorithm: 'argon2id',
  memoryKiB: 65536,
  iterations: 3,
  parallelism: 4,
} as const;

export function encode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 16384)
    binary += String.fromCharCode(...bytes.subarray(i, i + 16384));
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
export function decode(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid encoded data.');
  return Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), (c) =>
    c.charCodeAt(0),
  );
}
function aad(parts: unknown[]): Uint8Array<ArrayBuffer> {
  return encoder.encode(JSON.stringify(parts));
}
function wrappingData(envelope: Omit<KeyEnvelope, 'wrappedKey'>) {
  return aad(['vaultline', 1, 'key', envelope.id, envelope.version, envelope.kdf, envelope.salt]);
}
function entryData(entry: Omit<EntryEnvelope, 'cipher'>) {
  return aad(['vaultline', 1, 'entry', entry.vaultId, entry.id, entry.revision]);
}
export async function importKey(raw: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}
async function derive(
  passphrase: string,
  envelope: Omit<KeyEnvelope, 'wrappedKey'>,
): Promise<CryptoKey> {
  // The schema is checked before invoking a memory-hard KDF, including on imported files.
  if (passphrase.length > 1024) throw new Error('Passphrase is too long.');
  const raw = await argon2id({
    password: passphrase,
    salt: decode(envelope.salt),
    parallelism: envelope.kdf.parallelism,
    iterations: envelope.kdf.iterations,
    memorySize: envelope.kdf.memoryKiB,
    hashLength: 32,
    outputType: 'binary',
  });
  try {
    return await importKey(new Uint8Array(raw));
  } finally {
    raw.fill(0);
  }
}
export async function encrypt(
  key: CryptoKey,
  plaintext: Uint8Array<ArrayBuffer>,
  additionalData: Uint8Array<ArrayBuffer>,
): Promise<Cipher> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData, tagLength: 128 },
    key,
    plaintext,
  );
  return { iv: encode(iv), ciphertext: encode(new Uint8Array(data)) };
}
async function decrypt(
  key: CryptoKey,
  cipher: Cipher,
  additionalData: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: decode(cipher.iv), additionalData, tagLength: 128 },
      key,
      decode(cipher.ciphertext),
    ),
  );
}
export type UnlockedVault = {
  envelope: KeyEnvelope;
  key: CryptoKey;
  rawKey: Uint8Array<ArrayBuffer>;
};
export async function createVault(passphrase: string): Promise<UnlockedVault> {
  if (passphrase.length < 14 || !passphrase.trim())
    throw new Error('Use a master passphrase of at least 14 characters.');
  const rawKey = crypto.getRandomValues(new Uint8Array(32));
  const header = {
    format: 1 as const,
    id: crypto.randomUUID(),
    version: 1,
    kdf: KDF,
    salt: encode(crypto.getRandomValues(new Uint8Array(16))),
  };
  const kek = await derive(passphrase, header);
  const envelope = { ...header, wrappedKey: await encrypt(kek, rawKey, wrappingData(header)) };
  return { envelope, key: await importKey(rawKey), rawKey };
}
export async function unlockVault(passphrase: string, value: unknown): Promise<UnlockedVault> {
  const envelope = keyEnvelopeSchema.parse(value);
  const kek = await derive(passphrase, envelope);
  let rawKey: Uint8Array<ArrayBuffer>;
  try {
    rawKey = await decrypt(kek, envelope.wrappedKey, wrappingData(envelope));
  } catch {
    throw new Error('The passphrase is incorrect, or the vault data has been changed.');
  }
  if (rawKey.length !== 32) {
    rawKey.fill(0);
    throw new Error('Invalid vault key.');
  }
  return { envelope, key: await importKey(rawKey), rawKey };
}
export async function rewrapVault(vault: UnlockedVault, passphrase: string): Promise<KeyEnvelope> {
  if (passphrase.length < 14) throw new Error('Use a master passphrase of at least 14 characters.');
  const header = {
    ...vault.envelope,
    version: vault.envelope.version + 1,
    salt: encode(crypto.getRandomValues(new Uint8Array(16))),
  };
  const kek = await derive(passphrase, header);
  return keyEnvelopeSchema.parse({
    ...header,
    wrappedKey: await encrypt(kek, vault.rawKey, wrappingData(header)),
  });
}
export async function encryptEntry(
  vault: UnlockedVault,
  fields: EntryFields,
  id = crypto.randomUUID(),
  revision = 1,
): Promise<EntryEnvelope> {
  const parsed = entryFieldsSchema.parse(fields);
  const header = { format: 1 as const, id, vaultId: vault.envelope.id, revision };
  return {
    ...header,
    cipher: await encrypt(vault.key, encoder.encode(JSON.stringify(parsed)), entryData(header)),
  };
}
export async function decryptEntry(vault: UnlockedVault, value: unknown): Promise<VaultEntry> {
  const entry = entryEnvelopeSchema.parse(value);
  if (entry.vaultId !== vault.envelope.id) throw new Error('This entry belongs to another vault.');
  const data = await decrypt(vault.key, entry.cipher, entryData(entry));
  try {
    return {
      ...entryFieldsSchema.parse(JSON.parse(decoder.decode(data))),
      id: entry.id,
      revision: entry.revision,
    };
  } finally {
    data.fill(0);
  }
}
export async function exportBackup(
  vault: UnlockedVault,
  entries: EntryEnvelope[],
): Promise<string> {
  const snapshot = snapshotSchema.parse({
    format: 1,
    vaultId: vault.envelope.id,
    exportedAt: new Date().toISOString(),
    entries,
  });
  // One authenticated snapshot protects the complete manifest as well as individual records.
  const cipher = await encrypt(
    vault.key,
    encoder.encode(JSON.stringify(snapshot)),
    aad(['vaultline', 1, 'backup', vault.envelope]),
  );
  return JSON.stringify(
    { application: 'vaultline', format: 1, key: vault.envelope, snapshot: cipher },
    null,
    2,
  );
}
export async function readBackup(text: string, passphrase: string): Promise<VaultEntry[]> {
  if (encoder.encode(text).length > MAX_BACKUP_BYTES) throw new Error('Backup is too large.');
  const backup = backupSchema.parse(JSON.parse(text));
  const source = await unlockVault(passphrase, backup.key);
  try {
    const raw = await decrypt(
      source.key,
      backup.snapshot,
      aad(['vaultline', 1, 'backup', backup.key]),
    );
    let snapshot;
    try {
      snapshot = snapshotSchema.parse(JSON.parse(decoder.decode(raw)));
    } finally {
      raw.fill(0);
    }
    if (snapshot.vaultId !== source.envelope.id) throw new Error('Backup identity does not match.');
    if (new Set(snapshot.entries.map((entry) => entry.id)).size !== snapshot.entries.length)
      throw new Error('Backup contains duplicate entries.');
    return await Promise.all(snapshot.entries.map((entry) => decryptEntry(source, entry)));
  } finally {
    source.rawKey.fill(0);
  }
}
export function generatePassword(length = 24, symbols = true): string {
  if (!Number.isInteger(length) || length < 12 || length > 128)
    throw new Error('Choose a length between 12 and 128.');
  const alphabet =
    'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789' + (symbols ? '!@#$%&*+-=?' : '');
  const limit = 256 - (256 % alphabet.length);
  let result = '';
  const buffer = new Uint8Array(128);
  while (result.length < length) {
    crypto.getRandomValues(buffer);
    for (const byte of buffer) {
      if (byte < limit) result += alphabet[byte % alphabet.length];
      if (result.length === length) break;
    }
  }
  buffer.fill(0);
  return result;
}
