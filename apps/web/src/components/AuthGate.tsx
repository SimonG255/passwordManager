import { useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowRight,
  Fingerprint,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  LoaderCircle,
  ArrowUpRight,
} from 'lucide-react';
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';
import type { Profile } from '@vaultline/contracts';
import { api, context, setCsrf } from '../api';
import { DEMO_PASSPHRASE } from '../demo';

export function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden="true">
        v<span />
      </span>
      vaultline<span className="brand-period">.</span>
    </div>
  );
}
function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="auth-shell">
      <section className="auth-story">
        <Brand />
        <div className="orbit-art" aria-hidden="true">
          <div />
          <div />
          <div />
          <span>
            <LockKeyhole size={46} strokeWidth={1.4} />
          </span>
        </div>
        <div className="story-copy">
          <span className="eyebrow">LESS TO REMEMBER. MORE PEACE OF MIND.</span>
          <h1>
            Your digital life.
            <br />
            <em>In a safer place.</em>
          </h1>
          <p>
            One thoughtfully protected home for your passwords, private notes, and everyday
            essentials.
          </p>
          <div className="story-badges">
            <span>
              <ShieldCheck size={16} /> Encrypted in your browser
            </span>
            <span>
              <KeyRound size={16} /> Your keys stay with you
            </span>
          </div>
        </div>
        <footer>
          PRIVATE BY DESIGN <span>PERSONAL BY NATURE</span>
        </footer>
      </section>
      <section className="auth-content">
        {children}
        <div className="prototype-note">
          <ShieldCheck size={15} /> Portfolio prototype · Use fictional credentials
        </div>
      </section>
    </main>
  );
}
export function SignIn({
  onProfile,
  onDemo,
  connectionError,
  retry,
}: {
  onProfile: (profile: Profile | null) => void;
  onDemo: () => Promise<void>;
  connectionError: string;
  retry: () => void;
}) {
  const [mode, setMode] = useState<'create' | 'signin'>('create');
  const [handle, setHandle] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setBusy('passkey');
    try {
      // Refresh the pre-authentication CSRF token before starting a new ceremony.
      await context();
      let result: { csrf: string };
      if (mode === 'create') {
        const optionsJSON = await api<PublicKeyCredentialCreationOptionsJSON>(
          '/auth/register/options',
          'POST',
          { handle },
        );
        const response = await startRegistration({ optionsJSON });
        result = await api('/auth/register/verify', 'POST', { response, name: 'My first passkey' });
      } else {
        const optionsJSON = await api<PublicKeyCredentialRequestOptionsJSON>(
          '/auth/login/options',
          'POST',
          {},
        );
        const response = await startAuthentication({ optionsJSON });
        result = await api('/auth/login/verify', 'POST', { response });
      }
      setCsrf(result.csrf);
      onProfile(await context());
    } catch (error) {
      setError(
        error instanceof Error && error.name === 'NotAllowedError'
          ? 'Passkey request cancelled. You can try again.'
          : error instanceof Error
            ? error.message
            : 'Unable to use this passkey.',
      );
    } finally {
      setBusy('');
    }
  }
  async function demo() {
    setBusy('demo');
    setError('');
    try {
      await onDemo();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to open demo.');
    } finally {
      setBusy('');
    }
  }
  return (
    <AuthShell>
      <div className="auth-card">
        <span className="small-badge">
          <Sparkles size={13} /> A little peace of mind
        </span>
        <h2>
          Your private space
          <br />
          starts here.
        </h2>
        <p className="muted">Good security should feel this simple.</p>
        <div className="auth-tabs">
          <button
            aria-pressed={mode === 'create'}
            onClick={() => {
              setMode('create');
              setError('');
            }}
          >
            Create an account
          </button>
          <button
            aria-pressed={mode === 'signin'}
            onClick={() => {
              setMode('signin');
              setError('');
            }}
          >
            Sign in
          </button>
        </div>
        <form onSubmit={(event) => void submit(event)}>
          {mode === 'create' && (
            <label>
              Your handle
              <div className="input-with-icon">
                <span>@</span>
                <input
                  autoComplete="username webauthn"
                  pattern="[a-z0-9][a-z0-9_-]{2,31}"
                  minLength={3}
                  maxLength={32}
                  required
                  placeholder="e.g. alex"
                  value={handle}
                  onChange={(event) => setHandle(event.target.value.toLowerCase())}
                />
              </div>
              <small>3–32 letters, numbers, underscores or hyphens.</small>
            </label>
          )}
          <button className="button primary full" disabled={!!busy || !!connectionError}>
            {busy === 'passkey' ? (
              <LoaderCircle className="spin" size={18} />
            ) : (
              <Fingerprint size={19} />
            )}
            {busy === 'passkey'
              ? 'Waiting for your passkey…'
              : mode === 'create'
                ? 'Create account with a passkey'
                : 'Sign in with a passkey'}
            {!busy && <ArrowRight size={17} />}
          </button>
        </form>
        <p className="auth-explanation">
          Your device handles sign-in. A separate master passphrase unlocks your encrypted vault.
        </p>
        {(error || connectionError) && (
          <div className="error-box" role="alert">
            {error || connectionError}
            {connectionError && (
              <button className="text-button" onClick={retry}>
                Retry connection
              </button>
            )}
          </div>
        )}
        <div className="divider">
          <span>just looking around?</span>
        </div>
        <button className="button secondary full" disabled={!!busy} onClick={() => void demo()}>
          {busy === 'demo' ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={17} />}
          Explore the interactive demo
          <ArrowUpRight size={17} />
        </button>
        <p className="demo-explanation">Fictional data. No account needed. Nothing saved.</p>
      </div>
    </AuthShell>
  );
}
export function Unlock({
  profile,
  onUnlock,
  onCreate,
  onSignOut,
}: {
  profile: Profile;
  onUnlock: (passphrase: string) => Promise<void>;
  onCreate: (passphrase: string) => Promise<void>;
  onSignOut: () => void;
}) {
  const creating = !profile.vault;
  const [passphrase, setPassphrase] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (creating && passphrase !== confirmation) {
      setError('Your passphrases do not match.');
      return;
    }
    setBusy(true);
    const secret = passphrase;
    setPassphrase('');
    setConfirmation('');
    try {
      if (creating) await onCreate(secret);
      else await onUnlock(secret);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to unlock this vault.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthShell>
      <div className="auth-card">
        <span className="small-badge">
          <LockKeyhole size={13} /> Signed in as @{profile.handle}
        </span>
        <h2>
          {creating ? (
            <>
              Make yourself
              <br />a private space.
            </>
          ) : (
            <>
              Welcome back.
              <br />
              Your vault is waiting.
            </>
          )}
        </h2>
        <p className="muted">
          {creating
            ? 'Choose a long, memorable master passphrase.'
            : 'Enter your master passphrase to unlock locally.'}
        </p>
        <form onSubmit={(event) => void submit(event)}>
          <label>
            Master passphrase
            <input
              autoFocus
              type="password"
              autoComplete={creating ? 'new-password' : 'current-password'}
              minLength={creating ? 14 : 1}
              maxLength={1024}
              required
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
              placeholder={creating ? 'At least 14 characters' : 'Your vault passphrase'}
            />
          </label>
          {creating && (
            <>
              <label>
                Confirm master passphrase
                <input
                  type="password"
                  autoComplete="new-password"
                  maxLength={1024}
                  required
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                />
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={accepted}
                  required
                  onChange={(event) => setAccepted(event.target.checked)}
                />
                <span>
                  I understand this passphrase cannot be recovered or reset to decrypt my vault.
                </span>
              </label>
            </>
          )}
          {profile.id === 'demo' && (
            <div className="info-box">
              Demo unlock phrase: <strong>{DEMO_PASSPHRASE}</strong>
            </div>
          )}
          {error && (
            <div className="error-box" role="alert">
              {error}
            </div>
          )}
          <button className="button primary full" disabled={busy}>
            {busy ? <LoaderCircle className="spin" size={18} /> : <LockKeyhole size={18} />}
            {busy ? 'Deriving your encryption key…' : creating ? 'Create my vault' : 'Unlock vault'}
            <ArrowRight size={17} />
          </button>
        </form>
        <p className="auth-explanation">
          Your passphrase and unwrapped keys stay in your browser. Closing or locking the vault
          clears the active encryption worker.
        </p>
        <button className="text-button" onClick={onSignOut}>
          Sign out of @{profile.handle}
        </button>
      </div>
    </AuthShell>
  );
}
