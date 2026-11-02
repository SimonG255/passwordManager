import { z } from 'zod';

export const MAX_ENTRIES = 1000;
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;
export const MAX_VAULT_BYTES = 10 * 1024 * 1024;
export const MAX_VAULT_WRITES = 1000000;
export const idSchema = z.uuid();
export const handleSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9][a-z0-9_-]{2,31}$/,
    'Use 3–32 lowercase letters, numbers, underscores or hyphens.',
  );
const base64 = (min: number, max: number) =>
  z
    .string()
    .min(min)
    .max(max)
    .regex(/^[A-Za-z0-9_-]+$/);
export const cipherSchema = z.strictObject({ iv: base64(16, 16), ciphertext: base64(22, 90000) });
export const kdfSchema = z.strictObject({
  algorithm: z.literal('argon2id'),
  memoryKiB: z.literal(65536),
  iterations: z.literal(3),
  parallelism: z.literal(4),
});
export const keyEnvelopeSchema = z.strictObject({
  format: z.literal(1),
  id: idSchema,
  version: z.number().int().min(1).max(1000000),
  kdf: kdfSchema,
  salt: base64(22, 22),
  wrappedKey: cipherSchema.extend({ ciphertext: base64(64, 64) }),
});
export const entryEnvelopeSchema = z.strictObject({
  format: z.literal(1),
  id: idSchema,
  vaultId: idSchema,
  revision: z.number().int().min(1).max(1000000),
  cipher: cipherSchema,
});
export const entryFieldsSchema = z.strictObject({
  title: z.string().trim().min(1, 'Add a title.').max(200),
  website: z.string().max(2000),
  username: z.string().max(500),
  password: z.string().max(2000),
  notes: z.string().max(10000),
  favorite: z.boolean(),
  category: z.enum(['login', 'note']),
});
export const backupSchema = z.strictObject({
  application: z.literal('vaultline'),
  format: z.literal(1),
  key: keyEnvelopeSchema,
  snapshot: cipherSchema.extend({ ciphertext: base64(22, 28 * 1024 * 1024) }),
});
export const snapshotSchema = z.strictObject({
  format: z.literal(1),
  vaultId: idSchema,
  exportedAt: z.iso.datetime(),
  entries: z.array(entryEnvelopeSchema).max(MAX_ENTRIES),
});
export type Cipher = z.infer<typeof cipherSchema>;
export type KeyEnvelope = z.infer<typeof keyEnvelopeSchema>;
export type EntryEnvelope = z.infer<typeof entryEnvelopeSchema>;
export type EntryFields = z.infer<typeof entryFieldsSchema>;
export type Backup = z.infer<typeof backupSchema>;
export type VaultEntry = EntryFields & { id: string; revision: number; updatedAt?: string };
export type StoredEntry = EntryEnvelope & { updatedAt?: string };
export type Profile = {
  id: string;
  handle: string;
  csrf: string;
  vault: KeyEnvelope | null;
  keyVersion: number;
  generation: number;
};
export type SessionView = {
  id: string;
  current: boolean;
  device: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
};
export type EventView = { id: string; action: string; createdAt: string };
