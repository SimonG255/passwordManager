import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type EntryEnvelope,
  type EntryFields,
  type KeyEnvelope,
  type Profile,
  type StoredEntry,
  type VaultEntry,
} from '@vaultline/contracts';
import { cryptoCall, lockCrypto } from './crypto-client';
import { api, context } from './api';
import { DEMO_PASSPHRASE, demoEntries } from './demo';

type Snapshot = {
  vault: KeyEnvelope;
  keyVersion: number;
  generation: number;
  entries: StoredEntry[];
};
export function useVault(profile: Profile | null, onProfile: (profile: Profile | null) => void) {
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [unlocked, setUnlocked] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const snapshot = useRef<Snapshot | null>(null);
  const epoch = useRef(0);
  const mutation = useRef<{ signature: string; entry: EntryEnvelope } | null>(null);
  const demo = profile?.id === 'demo';
  const lock = useCallback(() => {
    epoch.current++;
    lockCrypto();
    mutation.current = null;
    setEntries([]);
    setUnlocked(false);
    setSyncError('');
  }, []);
  const forget = useCallback(() => {
    lock();
    snapshot.current = null;
  }, [lock]);
  const apply = useCallback(async (value: Snapshot, operationEpoch: number) => {
    const decrypted = await cryptoCall<VaultEntry[]>('decrypt', {
      entries: value.entries.map(({ updatedAt: _time, ...entry }) => entry),
    });
    if (epoch.current !== operationEpoch) return;
    snapshot.current = value;
    setEntries(
      decrypted.map((entry) => ({
        ...entry,
        updatedAt: value.entries.find((saved) => saved.id === entry.id)?.updatedAt,
      })),
    );
    setLastSynced(new Date());
    setSyncError('');
  }, []);
  const refresh = useCallback(async () => {
    const operationEpoch = epoch.current;
    const value = demo ? snapshot.current : await api<Snapshot>('/vault');
    if (!value || operationEpoch !== epoch.current) return;
    if (snapshot.current && value.keyVersion !== snapshot.current.keyVersion) {
      lock();
      throw new Error('Your master passphrase changed. Unlock again.');
    }
    await apply(value, operationEpoch);
    return value;
  }, [apply, demo, lock]);
  const unlock = useCallback(
    async (passphrase: string) => {
      const operationEpoch = epoch.current;
      const value = demo ? snapshot.current : await api<Snapshot>('/vault');
      if (!value || operationEpoch !== epoch.current) return;
      await cryptoCall('unlock', { passphrase, envelope: value.vault });
      await apply(value, operationEpoch);
      if (operationEpoch === epoch.current) setUnlocked(true);
    },
    [apply, demo],
  );
  const create = useCallback(
    async (passphrase: string) => {
      const operationEpoch = epoch.current;
      const envelope = await cryptoCall<KeyEnvelope>('create', { passphrase });
      if (operationEpoch !== epoch.current) return;
      await api('/vault', 'POST', envelope);
      const next = await context();
      if (operationEpoch !== epoch.current) return;
      snapshot.current = { vault: envelope, keyVersion: 1, generation: 0, entries: [] };
      onProfile(next);
      setEntries([]);
      setUnlocked(true);
      setLastSynced(new Date());
    },
    [onProfile],
  );
  const startDemo = useCallback(async () => {
    lock();
    const operationEpoch = epoch.current;
    const envelope = await cryptoCall<KeyEnvelope>('create', { passphrase: DEMO_PASSPHRASE });
    const encrypted: EntryEnvelope[] = [];
    for (const fields of demoEntries)
      encrypted.push(await cryptoCall<EntryEnvelope>('encrypt', { fields }));
    const value: Snapshot = {
      vault: envelope,
      keyVersion: 1,
      generation: 0,
      entries: encrypted.map((entry, i) => ({
        ...entry,
        updatedAt: new Date(Date.now() - i * 86400000).toISOString(),
      })),
    };
    await apply(value, operationEpoch);
    if (operationEpoch !== epoch.current) return;
    onProfile({
      id: 'demo',
      handle: 'alex',
      csrf: '',
      vault: envelope,
      keyVersion: 1,
      generation: 0,
    });
    setUnlocked(true);
  }, [apply, lock, onProfile]);
  const save = useCallback(
    async (fields: EntryFields, id: string, revision: number) => {
      if (!snapshot.current) throw new Error('Unlock your vault first.');
      const operationEpoch = epoch.current;
      const signature = JSON.stringify([fields, id, revision, snapshot.current.keyVersion]);
      const entry =
        mutation.current?.signature === signature
          ? mutation.current.entry
          : await cryptoCall<EntryEnvelope>('encrypt', { fields, id, revision: revision + 1 });
      mutation.current = { signature, entry };
      if (operationEpoch !== epoch.current) return;
      if (!demo)
        await api(`/entries/${id}`, 'PUT', {
          entry,
          expectedRevision: revision,
          keyVersion: snapshot.current.keyVersion,
        });
      else {
        const existing = snapshot.current.entries.find((saved) => saved.id === id);
        if ((existing?.revision ?? 0) !== revision)
          throw new Error('Entry changed. Reload and try again.');
      }
      if (operationEpoch !== epoch.current || !snapshot.current) return;
      const stored = { ...entry, updatedAt: new Date().toISOString() };
      snapshot.current.entries = [
        stored,
        ...snapshot.current.entries.filter((saved) => saved.id !== id),
      ];
      setEntries((current) => [
        { ...fields, id, revision: entry.revision, updatedAt: stored.updatedAt },
        ...current.filter((saved) => saved.id !== id),
      ]);
      mutation.current = null;
      setLastSynced(new Date());
      setSyncError('');
    },
    [demo],
  );
  const remove = useCallback(
    async (entry: VaultEntry) => {
      if (!snapshot.current) return;
      const operationEpoch = epoch.current;
      if (!demo)
        await api(`/entries/${entry.id}`, 'DELETE', {
          expectedRevision: entry.revision,
          keyVersion: snapshot.current.keyVersion,
        });
      if (operationEpoch !== epoch.current || !snapshot.current) return;
      snapshot.current.entries = snapshot.current.entries.filter((item) => item.id !== entry.id);
      setEntries((current) => current.filter((item) => item.id !== entry.id));
      setLastSynced(new Date());
    },
    [demo],
  );
  const exportVault = useCallback(async () => {
    const value = await refresh();
    if (!value) throw new Error('Unlock your vault first.');
    return cryptoCall<string>('export', {
      entries: value.entries.map(({ updatedAt: _time, ...entry }) => entry),
    });
  }, [refresh]);
  const importVault = useCallback(
    async (encrypted: EntryEnvelope[], operationId: string) => {
      if (!snapshot.current) throw new Error('Unlock your vault first.');
      if (!encrypted.length) return;
      if (encrypted.some((entry) => entry.vaultId !== snapshot.current?.vault.id))
        throw new Error('Unlock the original target vault before retrying.');
      if (demo) {
        if (snapshot.current.entries.length + encrypted.length > 1000)
          throw new Error('Import would exceed the 1,000-entry limit.');
        const known = new Set(snapshot.current.entries.map((entry) => entry.id));
        snapshot.current.entries.push(...encrypted.filter((entry) => !known.has(entry.id)));
      } else
        await api('/vault/import', 'POST', {
          entries: encrypted,
          keyVersion: snapshot.current.keyVersion,
          operationId,
        });
      await refresh();
    },
    [demo, refresh],
  );
  const changePassphrase = useCallback(
    async (passphrase: string) => {
      if (!snapshot.current) throw new Error('Unlock your vault first.');
      const operationEpoch = epoch.current;
      const envelope = await cryptoCall<KeyEnvelope>('rewrap', { passphrase });
      if (!demo)
        await api('/vault/key', 'PUT', { envelope, expectedVersion: snapshot.current.keyVersion });
      if (operationEpoch !== epoch.current || !snapshot.current) return;
      await cryptoCall('commitKey', { envelope });
      snapshot.current = { ...snapshot.current, vault: envelope, keyVersion: envelope.version };
      if (profile) onProfile({ ...profile, vault: envelope, keyVersion: envelope.version });
    },
    [demo, onProfile, profile],
  );
  useEffect(() => {
    if (!unlocked || demo) return;
    const timer = setInterval(() => {
      void refresh().catch((error: Error) => setSyncError(error.message));
    }, 30000);
    return () => clearInterval(timer);
  }, [unlocked, demo, refresh]);
  useEffect(() => () => lockCrypto(), []);
  return {
    entries,
    unlocked,
    syncError,
    lastSynced,
    lock,
    forget,
    unlock,
    create,
    startDemo,
    save,
    remove,
    refresh,
    exportVault,
    importVault,
    changePassphrase,
    demo,
  };
}
