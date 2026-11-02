import { useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  FileLock2,
  LoaderCircle,
  ShieldCheck,
} from 'lucide-react';
import { MAX_BACKUP_BYTES, type EntryEnvelope } from '@vaultline/contracts';
import { cryptoCall } from '../crypto-client';

export function Backups({
  onExport,
  onImport,
  demo,
}: {
  onExport: () => Promise<string>;
  onImport: (entries: EntryEnvelope[], operationId: string) => Promise<void>;
  demo: boolean;
}) {
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [hasPrepared, setHasPrepared] = useState(false);
  const prepared = useRef<{ entries: EntryEnvelope[]; operationId: string } | null>(null);
  async function exportFile() {
    setBusy('export');
    setError('');
    setMessage('');
    try {
      const content = await onExport();
      const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `vaultline-${new Date().toISOString().slice(0, 10)}.vaultline`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage('Encrypted backup downloaded. Store it somewhere safe.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Export failed.');
    } finally {
      setBusy('');
    }
  }
  async function importFile() {
    setBusy('import');
    setError('');
    setMessage('');
    try {
      if (!prepared.current) {
        const secret = passphrase;
        setPassphrase('');
        const entries = await cryptoCall<EntryEnvelope[]>('import', { text, passphrase: secret });
        prepared.current = { entries, operationId: crypto.randomUUID() };
        setHasPrepared(true);
      }
      const count = prepared.current.entries.length;
      await onImport(prepared.current.entries, prepared.current.operationId);
      prepared.current = null;
      setHasPrepared(false);
      setText('');
      setFileName('');
      setMessage(
        `${count} ${count === 1 ? 'item' : 'items'} restored and encrypted for this vault.`,
      );
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Restore failed. No changes were confirmed.',
      );
    } finally {
      setBusy('');
    }
  }
  return (
    <div className="page-stack">
      <div className="page-intro">
        <span className="eyebrow">A LITTLE EXTRA PEACE OF MIND</span>
        <h1>Keep a safe copy.</h1>
        <p>Your encrypted backup. Your choice of where to keep it.</p>
      </div>
      <div className="two-column">
        <section className="panel backup-card">
          <span className="feature-icon">
            <ArrowDownToLine size={24} />
          </span>
          <h2>Export your vault</h2>
          <p className="muted">
            Download a complete encrypted snapshot. It includes the key envelope and authenticated
            manifest needed for restoration.
          </p>
          <div className="info-box">
            <ShieldCheck size={16} />
            You’ll need the master passphrase used when this backup was created.
          </div>
          <button className="button primary" disabled={!!busy} onClick={() => void exportFile()}>
            {busy === 'export' ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <ArrowDownToLine size={17} />
            )}
            Download encrypted backup
          </button>
        </section>
        <section className="panel backup-card">
          <span className="feature-icon lavender">
            <ArrowUpFromLine size={24} />
          </span>
          <h2>Restore a backup</h2>
          <p className="muted">
            Open a Vaultline backup with its original passphrase. Items are re-encrypted for this
            vault and added together.
          </p>
          <label className="file-drop">
            <FileLock2 size={23} />
            <span>
              {fileName || 'Choose an encrypted backup'}
              <small>.vaultline or .json · up to 20 MB</small>
            </span>
            <input
              type="file"
              accept=".vaultline,.json"
              aria-label="Choose encrypted backup"
              disabled={!!busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                prepared.current = null;
                setHasPrepared(false);
                setText('');
                setError('');
                setMessage('');
                setPassphrase('');
                setFileName('');
                if (!file) return;
                if (file.size > MAX_BACKUP_BYTES) {
                  setError('Backup must be smaller than 20 MB.');
                  return;
                }
                setFileName(file.name);
                void file
                  .text()
                  .then(setText)
                  .catch(() => setError('This file could not be read.'));
              }}
            />
          </label>
          <label>
            Backup’s master passphrase
            <input
              type="password"
              autoComplete="off"
              maxLength={1024}
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
              placeholder="The passphrase at the time of export"
            />
          </label>
          <button
            className="button secondary"
            disabled={!!busy || !text || (!passphrase && !hasPrepared)}
            onClick={() => void importFile()}
          >
            {busy === 'import' ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <ArrowUpFromLine size={17} />
            )}
            {busy === 'import' ? 'Verifying and restoring…' : 'Verify and restore backup'}
          </button>
        </section>
      </div>
      {error && (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="success-box" role="status">
          <Check size={17} />
          {message}
        </div>
      )}
      <div className="quiet-note">
        <FileLock2 size={18} />
        <p>
          A forgotten master passphrase cannot be recovered. Keep encrypted backups and their
          passphrases in separate safe places.
          {demo
            ? ' Demo imports stay in memory and disappear when you leave the demo.'
            : ' Imported items are added to your existing vault; existing items are preserved.'}
        </p>
      </div>
    </div>
  );
}
