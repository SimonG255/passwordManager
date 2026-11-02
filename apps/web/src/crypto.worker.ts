import {
  createVault,
  decryptEntry,
  encryptEntry,
  exportBackup,
  readBackup,
  rewrapVault,
  unlockVault,
  type UnlockedVault,
} from '@vaultline/vault-crypto';
import { type EntryEnvelope, type EntryFields, type KeyEnvelope } from '@vaultline/contracts';

let vault: UnlockedVault | undefined;
// Serial processing avoids races between unlock, import, and rewrap operations.
let queue = Promise.resolve();
self.onmessage = (
  event: MessageEvent<{ id: number; action: string; payload: Record<string, unknown> }>,
) => {
  queue = queue.then(async () => {
    const { id, action, payload } = event.data;
    try {
      let result: unknown;
      if (action === 'create') {
        vault = await createVault(payload.passphrase as string);
        result = vault.envelope;
      } else if (action === 'unlock') {
        vault = await unlockVault(payload.passphrase as string, payload.envelope);
        result = true;
      } else if (action === 'readBackup')
        result = await readBackup(payload.text as string, payload.passphrase as string);
      else {
        if (!vault) throw new Error('Unlock your vault first.');
        if (action === 'decrypt')
          result = await Promise.all(
            (payload.entries as EntryEnvelope[]).map((entry) => decryptEntry(vault!, entry)),
          );
        else if (action === 'encrypt')
          result = await encryptEntry(
            vault,
            payload.fields as EntryFields,
            payload.id as `${string}-${string}-${string}-${string}-${string}` | undefined,
            payload.revision as number | undefined,
          );
        else if (action === 'export')
          result = await exportBackup(vault, payload.entries as EntryEnvelope[]);
        else if (action === 'rewrap')
          result = await rewrapVault(vault, payload.passphrase as string);
        else if (action === 'commitKey') {
          vault.envelope = payload.envelope as KeyEnvelope;
          result = true;
        } else if (action === 'import') {
          const entries = await readBackup(payload.text as string, payload.passphrase as string);
          result = await Promise.all(
            entries.map(({ id: _id, revision: _revision, ...fields }) =>
              encryptEntry(vault!, fields),
            ),
          );
        } else throw new Error('Unsupported crypto operation.');
      }
      self.postMessage({ id, result });
    } catch (error) {
      self.postMessage({
        id,
        error: error instanceof Error ? error.message : 'Cryptographic operation failed.',
      });
    }
  });
};
