import { useState, type FormEvent } from 'react';
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  Globe,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Star,
  Trash2,
} from 'lucide-react';
import type { EntryFields, VaultEntry } from '@vaultline/contracts';
import { entryFieldsSchema } from '@vaultline/contracts';
import { generatePassword } from '@vaultline/vault-crypto';
import { Modal } from './Modal';
import { ApiError } from '../api';

export function EntryEditor({
  entry,
  onSave,
  onDelete,
  onReload,
  onClose,
  onCopy,
}: {
  entry: VaultEntry;
  onSave: (fields: EntryFields, id: string, revision: number) => Promise<void>;
  onDelete: (entry: VaultEntry) => Promise<void>;
  onReload: () => Promise<void>;
  onClose: () => void;
  onCopy: (text: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<EntryFields>(() => ({
    title: entry.title,
    website: entry.website,
    username: entry.username,
    password: entry.password,
    notes: entry.notes,
    favorite: entry.favorite,
    category: entry.category,
  }));
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);
  function field<K extends keyof EntryFields>(name: K, value: EntryFields[K]) {
    setDraft((current) => ({ ...current, [name]: value }));
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setConflict(false);
    try {
      await onSave(entryFieldsSchema.parse(draft), entry.id, entry.revision);
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to save.');
      setConflict(error instanceof ApiError && error.status === 409);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    setError('');
    try {
      await onDelete(entry);
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to delete.');
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    try {
      await onCopy(draft.password);
      setCopied(true);
    } catch {
      setError('Clipboard access is unavailable. Reveal the password to copy it manually.');
    }
  }
  return (
    <Modal
      title={entry.revision ? 'Item details' : 'A new safe place'}
      eyebrow={entry.revision ? `VAULT ITEM · REVISION ${entry.revision}` : 'ADD TO YOUR VAULT'}
      onClose={onClose}
    >
      <form onSubmit={(event) => void submit(event)} className="editor-form">
        <div className="editor-type">
          <button
            type="button"
            aria-pressed={draft.category === 'login'}
            onClick={() => field('category', 'login')}
          >
            <Globe size={16} />
            Login
          </button>
          <button
            type="button"
            aria-pressed={draft.category === 'note'}
            onClick={() => field('category', 'note')}
          >
            Secure note
          </button>
          <button
            type="button"
            className={`favorite-toggle ${draft.favorite ? 'is-favorite' : ''}`}
            aria-label={draft.favorite ? 'Remove from favorites' : 'Add to favorites'}
            aria-pressed={draft.favorite}
            onClick={() => field('favorite', !draft.favorite)}
          >
            <Star size={17} fill={draft.favorite ? 'currentColor' : 'none'} />
          </button>
        </div>
        <label>
          Title
          <input
            autoFocus
            required
            maxLength={200}
            placeholder={draft.category === 'note' ? 'e.g. Travel essentials' : 'e.g. GitHub'}
            value={draft.title}
            onChange={(event) => field('title', event.target.value)}
          />
        </label>
        {draft.category === 'login' && (
          <>
            <label>
              Website
              <input
                type="url"
                maxLength={2000}
                placeholder="https://example.com"
                value={draft.website}
                onChange={(event) => field('website', event.target.value)}
              />
            </label>
            <label>
              Username or email
              <input
                autoComplete="off"
                maxLength={500}
                placeholder="you@example.com"
                value={draft.username}
                onChange={(event) => field('username', event.target.value)}
              />
            </label>
            <label>
              Password
              <div className="password-input">
                <input
                  type={revealed ? 'text' : 'password'}
                  autoComplete="off"
                  maxLength={2000}
                  value={draft.password}
                  onChange={(event) => field('password', event.target.value)}
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label={revealed ? 'Hide password' : 'Reveal password'}
                  onClick={() => setRevealed(!revealed)}
                >
                  {revealed ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Copy password"
                  onClick={() => void copy()}
                >
                  {copied ? <Check size={17} /> : <Copy size={17} />}
                </button>
              </div>
            </label>
            <button
              className="generate-inline"
              type="button"
              onClick={() => field('password', generatePassword())}
            >
              <RefreshCw size={14} />
              Generate a strong password<span>24 characters</span>
            </button>
          </>
        )}
        <label>
          {draft.category === 'note' ? 'Private note' : 'Notes'}
          <textarea
            rows={draft.category === 'note' ? 7 : 3}
            maxLength={10000}
            placeholder="Anything else worth keeping safe…"
            value={draft.notes}
            onChange={(event) => field('notes', event.target.value)}
          />
        </label>
        <p className="encryption-caption">
          <ShieldCheck size={14} />
          Every field is encrypted before it leaves your browser.
        </p>
        {error && (
          <div className="error-box" role="alert">
            {error}
            {conflict && (
              <button type="button" className="text-button" onClick={() => void onReload()}>
                Discard draft and load latest version
              </button>
            )}
          </div>
        )}
        {deleting && (
          <div className="error-box">
            <p>Delete this item permanently? Export a backup first if you need a copy.</p>
            <button
              type="button"
              className="button danger"
              disabled={busy}
              onClick={() => void remove()}
            >
              Delete permanently
            </button>
            <button type="button" className="text-button" onClick={() => setDeleting(false)}>
              Keep item
            </button>
          </div>
        )}
        <div className="modal-actions">
          {entry.revision > 0 ? (
            <button
              type="button"
              className="icon-button danger-text"
              aria-label="Delete item"
              disabled={busy}
              onClick={() => setDeleting(true)}
            >
              <Trash2 size={18} />
            </button>
          ) : (
            <span />
          )}
          <div>
            <button type="button" className="button secondary" onClick={onClose}>
              Cancel
            </button>
            <button className="button primary" disabled={busy}>
              {busy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}
              {busy ? 'Saving encrypted item…' : 'Save item'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
