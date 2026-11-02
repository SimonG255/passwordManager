import { useState } from 'react';
import { Check, Copy, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import { generatePassword } from '@vaultline/vault-crypto';
import { Modal } from './Modal';

export function Generator({
  onClose,
  onCopy,
  onUse,
}: {
  onClose: () => void;
  onCopy: (value: string) => Promise<void>;
  onUse: (value: string) => void;
}) {
  const [length, setLength] = useState(24);
  const [symbols, setSymbols] = useState(true);
  const [password, setPassword] = useState(() => generatePassword());
  const [message, setMessage] = useState('');
  function regenerate(nextLength = length, nextSymbols = symbols) {
    setPassword(generatePassword(nextLength, nextSymbols));
    setMessage('');
  }
  return (
    <Modal title="One less thing to invent." eyebrow="PASSWORD GENERATOR" onClose={onClose}>
      <p className="muted">A fresh, random password. Created right here in your browser.</p>
      <div className="generated-password" aria-live="polite">
        {password}
      </div>
      <div className="generator-tools">
        <span className="success-text">
          <ShieldCheck size={14} />
          Cryptographically random
        </span>
        <button
          className="icon-button"
          aria-label="Generate another password"
          onClick={() => regenerate()}
        >
          <RefreshCw size={17} />
        </button>
      </div>
      <label className="range-label">
        Password length<strong>{length}</strong>
        <input
          type="range"
          min={12}
          max={64}
          value={length}
          onChange={(event) => {
            const next = Number(event.target.value);
            setLength(next);
            regenerate(next);
          }}
        />
      </label>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={symbols}
          onChange={(event) => {
            setSymbols(event.target.checked);
            regenerate(length, event.target.checked);
          }}
        />
        <span>
          Include symbols <span className="muted">! @ # $ %</span>
        </span>
      </label>
      {message && (
        <p className="muted" role="status">
          {message}
        </p>
      )}
      <div className="modal-actions">
        <button
          className="button secondary"
          onClick={() => {
            void onCopy(password)
              .then(() => setMessage('Copied to clipboard.'))
              .catch(() => setMessage('Clipboard unavailable. Select the password to copy it.'));
          }}
        >
          {message.startsWith('Copied') ? <Check size={16} /> : <Copy size={16} />}Copy password
        </button>
        <button className="button primary" onClick={() => onUse(password)}>
          <Sparkles size={16} />
          Use in a new item
        </button>
      </div>
    </Modal>
  );
}
