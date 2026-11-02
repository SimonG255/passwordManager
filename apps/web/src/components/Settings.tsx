import { useEffect, useState, type FormEvent } from 'react';
import {
  startAuthentication,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';
import {
  Check,
  Fingerprint,
  KeyRound,
  Laptop,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Plus,
  ShieldCheck,
} from 'lucide-react';
import type { Profile, SessionView } from '@vaultline/contracts';
import { api, context, setCsrf } from '../api';

type PasskeyView = { id: string; name: string; createdAt: string };
export function Settings({
  profile,
  idleMinutes,
  setIdleMinutes,
  onProfile,
  onChangePassphrase,
}: {
  profile: Profile;
  idleMinutes: number;
  setIdleMinutes: (minutes: number) => void;
  onProfile: (profile: Profile | null) => void;
  onChangePassphrase: (passphrase: string) => Promise<void>;
}) {
  const demo = profile.id === 'demo';
  const [sessions, setSessions] = useState<SessionView[]>([]);
  const [keys, setKeys] = useState<PasskeyView[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [confirmation, setConfirmation] = useState('');
  async function refresh() {
    const [nextSessions, nextKeys] = await Promise.all([
      api<SessionView[]>('/sessions'),
      api<PasskeyView[]>('/passkeys'),
    ]);
    setSessions(nextSessions);
    setKeys(nextKeys);
  }
  useEffect(() => {
    let active = true;
    if (!demo)
      void Promise.all([api<SessionView[]>('/sessions'), api<PasskeyView[]>('/passkeys')])
        .then(([nextSessions, nextKeys]) => {
          if (active) {
            setSessions(nextSessions);
            setKeys(nextKeys);
          }
        })
        .catch((error: Error) => {
          if (active) setError(error.message);
        });
    return () => {
      active = false;
    };
  }, [demo]);
  async function perform(action: string, operation: () => Promise<void>) {
    setBusy(action);
    setError('');
    setMessage('');
    try {
      await operation();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to complete this action.');
    } finally {
      setBusy('');
    }
  }
  async function reauthenticate() {
    const optionsJSON = await api<PublicKeyCredentialRequestOptionsJSON>(
      '/auth/login/options',
      'POST',
      {},
    );
    const response = await startAuthentication({ optionsJSON });
    const result = await api<{ csrf: string }>('/auth/login/verify', 'POST', { response });
    setCsrf(result.csrf);
    onProfile(await context());
    await refresh();
    setMessage('Passkey verified. Security changes are available for five minutes.');
  }
  async function addPasskey() {
    const optionsJSON = await api<PublicKeyCredentialCreationOptionsJSON>(
      '/auth/passkeys/options',
      'POST',
      {},
    );
    const response = await startRegistration({ optionsJSON });
    await api('/auth/passkeys/verify', 'POST', {
      response,
      name: `Backup passkey ${keys.length + 1}`,
    });
    await refresh();
    setMessage('Additional passkey registered.');
  }
  async function change(event: FormEvent) {
    event.preventDefault();
    if (passphrase !== confirmation) {
      setError('Your passphrases do not match.');
      return;
    }
    const secret = passphrase;
    setPassphrase('');
    setConfirmation('');
    await perform('passphrase', async () => {
      await onChangePassphrase(secret);
      setMessage(
        'Passphrase changed. Create a fresh backup; older backups still use the old passphrase.',
      );
    });
  }
  return (
    <div className="page-stack">
      <div className="page-intro">
        <span className="eyebrow">MAKE YOURSELF AT HOME</span>
        <h1>Your vault, your rules.</h1>
        <p>A few thoughtful controls for your private space.</p>
      </div>
      {demo && (
        <div className="info-box">
          You’re in the interactive demo. Passkeys and server sessions are available when you create
          an account.
        </div>
      )}
      {error && (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="success-box" role="status">
          <Check size={16} />
          {message}
        </div>
      )}
      <section className="panel settings-section">
        <div className="section-title">
          <span className="feature-icon">
            <LockKeyhole size={21} />
          </span>
          <div>
            <h2>Automatic locking</h2>
            <p className="muted">Your vault locks across tabs when you step away.</p>
          </div>
        </div>
        <label className="setting-row">
          <span>
            Lock after inactivity
            <small>Decrypted items and the encryption worker are cleared.</small>
          </span>
          <select
            value={idleMinutes}
            onChange={(event) => setIdleMinutes(Number(event.target.value))}
          >
            <option value={1}>1 minute</option>
            <option value={5}>5 minutes</option>
            <option value={10}>10 minutes</option>
            <option value={15}>15 minutes</option>
          </select>
        </label>
      </section>
      <section className="panel settings-section">
        <div className="section-title">
          <span className="feature-icon lavender">
            <Fingerprint size={22} />
          </span>
          <div>
            <h2>Your passkeys</h2>
            <p className="muted">Keep a second passkey as a backup way to sign in.</p>
          </div>
        </div>
        {keys.map((key) => (
          <div className="setting-row" key={key.id}>
            <span>
              <strong>{key.name}</strong>
              <small>Registered {new Date(key.createdAt).toLocaleDateString()}</small>
            </span>
            <ShieldCheck size={19} className="success-text" />
          </div>
        ))}
        <div className="button-row">
          <button
            className="button secondary"
            disabled={!!busy || demo}
            onClick={() => void perform('verify', reauthenticate)}
          >
            <Fingerprint size={16} />
            {busy === 'verify' ? 'Verifying…' : 'Verify passkey again'}
          </button>
          <button
            className="button primary"
            disabled={!!busy || demo || keys.length >= 5}
            onClick={() => void perform('add', addPasskey)}
          >
            <Plus size={16} />
            {busy === 'add' ? 'Registering…' : 'Add a passkey'}
          </button>
        </div>
      </section>
      <section className="panel settings-section">
        <div className="section-title">
          <span className="feature-icon peach">
            <KeyRound size={21} />
          </span>
          <div>
            <h2>Master passphrase</h2>
            <p className="muted">Rewrap your vault key with a new passphrase.</p>
          </div>
        </div>
        <form onSubmit={(event) => void change(event)}>
          <div className="two-column">
            <label>
              New master passphrase
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={14}
                maxLength={1024}
                value={passphrase}
                onChange={(event) => setPassphrase(event.target.value)}
                placeholder="At least 14 characters"
              />
            </label>
            <label>
              Confirm passphrase
              <input
                type="password"
                autoComplete="new-password"
                required
                maxLength={1024}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </label>
          </div>
          <p className="muted small">
            Verify your passkey first if your sign-in is older than five minutes. Historical backups
            keep their original passphrase.
          </p>
          <button className="button secondary" disabled={!!busy}>
            {busy === 'passphrase' ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <KeyRound size={16} />
            )}
            Change master passphrase
          </button>
        </form>
      </section>
      <section className="panel settings-section">
        <div className="section-title">
          <span className="feature-icon">
            <Laptop size={21} />
          </span>
          <div>
            <h2>Active sessions</h2>
            <p className="muted">24-hour maximum, with a 30-minute idle timeout.</p>
          </div>
        </div>
        {sessions.map((session) => (
          <div className="setting-row" key={session.id}>
            <span>
              <strong>{session.current ? 'This browser' : 'Another browser'}</strong>
              <small>
                {session.device.includes('Windows')
                  ? 'Windows'
                  : session.device.includes('Mac')
                    ? 'macOS'
                    : 'Browser'}{' '}
                · Last active {new Date(session.lastSeenAt).toLocaleString()}
              </small>
            </span>
            {session.current ? (
              <span className="tag green">Current</span>
            ) : (
              <button
                className="button secondary compact"
                disabled={!!busy}
                onClick={() =>
                  void perform('revoke', async () => {
                    await api(`/sessions/${session.id}`, 'DELETE', {});
                    await refresh();
                    setMessage('Session revoked.');
                  })
                }
              >
                <LogOut size={15} />
                Revoke
              </button>
            )}
          </div>
        ))}
        {demo && <p className="muted">The demo does not create a server session.</p>}
      </section>
    </div>
  );
}
