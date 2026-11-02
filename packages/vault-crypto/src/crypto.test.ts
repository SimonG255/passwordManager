import { beforeAll, describe, expect, it } from 'vitest';
import { argon2id } from 'hash-wasm';
import { backupSchema, type EntryEnvelope, type EntryFields } from '@vaultline/contracts';
import {
  createVault,
  decode,
  decryptEntry,
  encode,
  encryptEntry,
  exportBackup,
  generatePassword,
  readBackup,
  rewrapVault,
  unlockVault,
  type UnlockedVault,
} from './index';

const phrase = 'a long fictional master passphrase';
const fields: EntryFields = {
  title: 'A synthetic title',
  website: 'https://example.com',
  username: 'fictional@example.com',
  password: 'Synthetic!Secret-Only#123',
  notes: 'Private test note',
  favorite: true,
  category: 'login',
};
let vault: UnlockedVault;
let entry: EntryEnvelope;
beforeAll(async () => {
  vault = await createVault(phrase);
  entry = await encryptEntry(vault, fields);
});
describe('cryptographic boundaries', () => {
  it('matches an independent OpenSSL/Node Argon2id known-answer result', async () => {
    const value = await argon2id({
      password: 'vaultline-vector',
      salt: 'published-test-salt',
      parallelism: 4,
      iterations: 3,
      memorySize: 65536,
      hashLength: 32,
      outputType: 'hex',
    });
    expect(value).toBe('8aff98107378c520e4a3a93fd0f2f40cd5f2f37dbacf5e448ac0390798509d1a');
  });
  it('uses the AES-256-GCM NIST known-answer primitive correctly', async () => {
    const key = await crypto.subtle.importKey('raw', new Uint8Array(32), 'AES-GCM', false, [
      'encrypt',
    ]);
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: new Uint8Array(12), tagLength: 128 },
      key,
      new Uint8Array(16),
    );
    expect(Buffer.from(encrypted).toString('hex')).toBe(
      'cea7403d4d606b6e074ec5d3baf39d18d0d1c8a799996bf0265b98b5d48ab919',
    );
  });
  it('round-trips all fields through a separately unlocked key envelope', async () => {
    const unlocked = await unlockVault(phrase, JSON.parse(JSON.stringify(vault.envelope)));
    expect(await decryptEntry(unlocked, entry)).toMatchObject(fields);
    expect(JSON.stringify(entry)).not.toContain(fields.password);
    expect(JSON.stringify(vault.envelope)).not.toContain(phrase);
  });
  it('rejects the wrong master passphrase', async () => {
    await expect(unlockVault('wrong fictional passphrase', vault.envelope)).rejects.toThrow(
      'incorrect',
    );
  });
  it('rejects changed ciphertext and IVs', async () => {
    const changed = decode(entry.cipher.ciphertext);
    changed[0] ^= 1;
    await expect(
      decryptEntry(vault, { ...entry, cipher: { ...entry.cipher, ciphertext: encode(changed) } }),
    ).rejects.toThrow();
    await expect(
      decryptEntry(vault, {
        ...entry,
        cipher: { ...entry.cipher, iv: encode(new Uint8Array(12)) },
      }),
    ).rejects.toThrow();
  });
  it('authenticates entry identity and revision', async () => {
    await expect(decryptEntry(vault, { ...entry, id: crypto.randomUUID() })).rejects.toThrow();
    await expect(decryptEntry(vault, { ...entry, revision: 2 })).rejects.toThrow();
    await expect(decryptEntry(vault, { ...entry, vaultId: crypto.randomUUID() })).rejects.toThrow();
  });
  it('generates fresh encryption IVs on every edit', async () => {
    const next = await encryptEntry(
      vault,
      fields,
      entry.id as `${string}-${string}-${string}-${string}-${string}`,
      2,
    );
    expect(next.cipher.iv).not.toBe(entry.cipher.iv);
    expect(next.cipher.iv).toHaveLength(16);
  });
  it('rejects unsupported KDF settings before derivation', async () => {
    await expect(
      unlockVault(phrase, {
        ...vault.envelope,
        kdf: { ...vault.envelope.kdf, memoryKiB: 2 ** 32 },
      }),
    ).rejects.toThrow();
    await expect(unlockVault(phrase, { ...vault.envelope, format: 2 })).rejects.toThrow();
  });
  it('restores a complete authenticated backup independently', async () => {
    const text = await exportBackup(vault, [entry]);
    const restored = await readBackup(text, phrase);
    expect(restored).toEqual([{ ...fields, id: entry.id, revision: 1 }]);
    const target = await createVault('another fictional master passphrase');
    const { id: _id, revision: _revision, ...restoredFields } = restored[0];
    const imported = await encryptEntry(target, restoredFields);
    expect(imported.id).not.toBe(entry.id);
    expect(imported.vaultId).not.toBe(entry.vaultId);
    expect(await decryptEntry(target, imported)).toMatchObject(fields);
    await expect(decryptEntry(vault, imported)).rejects.toThrow();
  });
  it('rejects a damaged backup or altered authenticated manifest header', async () => {
    const backup = backupSchema.parse(JSON.parse(await exportBackup(vault, [entry])));
    const changed = decode(backup.snapshot.ciphertext);
    changed[0] ^= 1;
    await expect(
      readBackup(
        JSON.stringify({
          ...backup,
          snapshot: { ...backup.snapshot, ciphertext: encode(changed) },
        }),
        phrase,
      ),
    ).rejects.toThrow();
    await expect(
      readBackup(JSON.stringify({ ...backup, key: { ...backup.key, version: 2 } }), phrase),
    ).rejects.toThrow();
    await expect(readBackup('{broken', phrase)).rejects.toThrow();
  });
  it('rewraps the same data key with a new passphrase and independent IV/salt', async () => {
    const envelope = await rewrapVault(vault, 'a different fictional passphrase');
    expect(envelope.salt).not.toBe(vault.envelope.salt);
    expect(envelope.wrappedKey.iv).not.toBe(vault.envelope.wrappedKey.iv);
    const unlocked = await unlockVault('a different fictional passphrase', envelope);
    expect(await decryptEntry(unlocked, entry)).toMatchObject(fields);
    await expect(unlockVault(phrase, envelope)).rejects.toThrow();
  });
});
describe('password generator', () => {
  it('honors length/alphabet settings and rejects unsafe lengths', () => {
    expect(generatePassword()).toHaveLength(24);
    expect(generatePassword(64, false)).toMatch(/^[A-HJ-NP-Za-km-z2-9]{64}$/);
    expect(() => generatePassword(1)).toThrow();
    expect(() => generatePassword(129)).toThrow();
  });
});
