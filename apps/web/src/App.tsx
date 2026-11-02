import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity as ActivityIcon,
  ArrowUpRight,
  Check,
  ChevronDown,
  FileLock2,
  FileText,
  Fingerprint,
  LayoutGrid,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Menu,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Star,
  X,
} from 'lucide-react';
import type { Profile, VaultEntry } from '@vaultline/contracts';
import { api, context } from './api';
import { useVault } from './use-vault';
import { Brand, SignIn, Unlock } from './components/AuthGate';
import { Dashboard, SecurityPage, type VaultFilter } from './components/Dashboard';
import { EntryEditor } from './components/EntryEditor';
import { Generator } from './components/Generator';
import { Backups } from './components/Backups';
import { Settings } from './components/Settings';
import { Activity } from './components/Activity';

type Page = 'vault' | 'security' | 'backups' | 'settings' | 'activity';
type Dialog = { type: 'entry'; entry: VaultEntry } | { type: 'generator' } | null;
const blankEntry = (password = ''): VaultEntry => ({
  id: crypto.randomUUID(),
  revision: 0,
  title: '',
  website: '',
  username: '',
  password,
  notes: '',
  favorite: false,
  category: 'login',
});
export default function App() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState('');
  const [page, setPage] = useState<Page>('vault');
  const [filter, setFilter] = useState<VaultFilter>('all');
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [toast, setToast] = useState('');
  const [mobileNav, setMobileNav] = useState(false);
  const [idleMinutes, setIdleMinutes] = useState(5);
  const [tabId] = useState(() => crypto.randomUUID());
  const vault = useVault(profile, setProfile);
  const lastActivity = useRef(0);
  const lockVault = vault.lock;
  const clearVaultUI = useCallback(() => {
    lockVault();
    setDialog(null);
    setSearch('');
    setToast('');
  }, [lockVault]);
  const lockAll = useCallback(() => {
    clearVaultUI();
    const channel = new BroadcastChannel('vaultline-security');
    channel.postMessage({ type: 'lock', sender: tabId });
    channel.close();
  }, [clearVaultUI, tabId]);
  const bootstrap = useCallback(async () => {
    try {
      const next = await context();
      setConnectionError('');
      setProfile(next);
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : 'Unable to connect to the API.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    let active = true;
    void context()
      .then((next) => {
        if (active) {
          setConnectionError('');
          setProfile(next);
        }
      })
      .catch((error: Error) => {
        if (active) setConnectionError(error.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const channel = new BroadcastChannel('vaultline-security');
    channel.onmessage = (event: MessageEvent<{ type: string; sender: string }>) => {
      if (event.data?.type === 'lock' && event.data.sender !== tabId) clearVaultUI();
    };
    const expired = () => {
      clearVaultUI();
      setProfile(null);
      void bootstrap();
    };
    window.addEventListener('vaultline:session-expired', expired);
    window.addEventListener('pagehide', clearVaultUI);
    return () => {
      channel.close();
      window.removeEventListener('vaultline:session-expired', expired);
      window.removeEventListener('pagehide', clearVaultUI);
    };
  }, [bootstrap, clearVaultUI, tabId]);
  useEffect(() => {
    if (!vault.unlocked) return;
    lastActivity.current = Date.now();
    const activity = () => {
      lastActivity.current = Date.now();
    };
    const check = () => {
      if (Date.now() - lastActivity.current >= idleMinutes * 60000) lockAll();
    };
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    for (const event of events) window.addEventListener(event, activity, { passive: true });
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    const timer = setInterval(check, 1000);
    return () => {
      clearInterval(timer);
      for (const event of events) window.removeEventListener(event, activity);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [vault.unlocked, idleMinutes, lockAll]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && vault.unlocked) {
        event.preventDefault();
        setPage('vault');
        setTimeout(() => document.getElementById('vault-search')?.focus(), 0);
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [vault.unlocked]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  async function signOut() {
    lockAll();
    if (profile?.id === 'demo') {
      vault.forget();
      setProfile(null);
      setPage('vault');
      void bootstrap();
      return;
    }
    try {
      await api('/auth/logout', 'POST', {});
      vault.forget();
      setProfile(await context());
      setPage('vault');
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Sign out was not confirmed.');
    }
  }
  async function copy(value: string) {
    await navigator.clipboard.writeText(value);
    setToast('Copied to clipboard. Your clipboard is shared with other apps.');
  }
  function navigate(next: Page, nextFilter: VaultFilter = 'all') {
    setPage(next);
    setFilter(nextFilter);
    setSearch('');
    setMobileNav(false);
  }
  function newEntry(password = '') {
    setDialog({ type: 'entry', entry: blankEntry(password) });
  }
  async function reloadDraft() {
    if (dialog?.type !== 'entry') return;
    const id = dialog.entry.id;
    try {
      await vault.refresh();
      setDialog(null);
      setToast('Latest items loaded. Reopen the item to edit its current version.');
    } catch (error) {
      setToast(error instanceof Error ? error.message : `Unable to reload item ${id}.`);
    }
  }
  if (loading)
    return (
      <div className="loading-screen">
        <Brand />
        <LoaderCircle size={25} className="spin" />
        <p>Opening your private space…</p>
      </div>
    );
  if (!profile)
    return (
      <SignIn
        onProfile={setProfile}
        onDemo={vault.startDemo}
        connectionError={connectionError}
        retry={() => void bootstrap()}
      />
    );
  if (!vault.unlocked)
    return (
      <>
        <Unlock
          key={profile.id}
          profile={profile}
          onUnlock={vault.unlock}
          onCreate={vault.create}
          onSignOut={() => void signOut()}
        />
        {toast && (
          <div className="toast" role="status">
            {toast}
          </div>
        )}
      </>
    );
  const favoriteCount = vault.entries.filter((entry) => entry.favorite).length;
  const noteCount = vault.entries.filter((entry) => entry.category === 'note').length;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {mobileNav && (
        <button
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        />
      )}
      <aside className={`sidebar ${mobileNav ? 'is-open' : ''}`}>
        <div className="sidebar-brand">
          <Brand />
          <button
            className="icon-button mobile-close"
            aria-label="Close navigation"
            onClick={() => setMobileNav(false)}
          >
            <X size={20} />
          </button>
        </div>
        <button className="workspace-switch" onClick={() => navigate('settings')}>
          <span className="workspace-avatar">
            <LockKeyhole size={18} />
          </span>
          <span>
            <strong>Personal vault</strong>
            <small>Your private space</small>
          </span>
          <ChevronDown size={15} />
        </button>
        <span className="nav-label">WORKSPACE</span>
        <nav aria-label="Vault navigation">
          <button
            className={page === 'vault' && filter === 'all' ? 'active' : ''}
            onClick={() => navigate('vault')}
          >
            <LayoutGrid size={18} />
            All items<span>{vault.entries.length}</span>
          </button>
          <button
            className={page === 'vault' && filter === 'favorites' ? 'active' : ''}
            onClick={() => navigate('vault', 'favorites')}
          >
            <Star size={18} />
            Favorites<span>{favoriteCount}</span>
          </button>
          <button
            className={page === 'vault' && filter === 'notes' ? 'active' : ''}
            onClick={() => navigate('vault', 'notes')}
          >
            <FileText size={18} />
            Secure notes<span>{noteCount}</span>
          </button>
        </nav>
        <span className="nav-label tools-label">TOOLS & SECURITY</span>
        <nav aria-label="Tools and security">
          <button
            className={page === 'security' ? 'active' : ''}
            onClick={() => navigate('security')}
          >
            <ShieldCheck size={18} />
            Password check
          </button>
          <button
            onClick={() => {
              setDialog({ type: 'generator' });
              setMobileNav(false);
            }}
          >
            <Sparkles size={18} />
            Password generator
          </button>
          <button
            className={page === 'backups' ? 'active' : ''}
            onClick={() => navigate('backups')}
          >
            <FileLock2 size={18} />
            Encrypted backups
          </button>
          <button
            className={page === 'activity' ? 'active' : ''}
            onClick={() => navigate('activity')}
          >
            <ActivityIcon size={18} />
            Security activity
          </button>
          <button
            className={page === 'settings' ? 'active' : ''}
            onClick={() => navigate('settings')}
          >
            <Settings2 size={18} />
            Settings
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <span className="status-dot" />
            <strong>A little peace of mind.</strong>
            <p>
              Your vault is encrypted.
              <br />
              Your keys stay in your browser.
            </p>
            <button onClick={() => navigate('security')}>
              Built around your privacy
              <ArrowUpRight size={13} />
            </button>
          </div>
          <button className="lock-button" aria-label="Lock vault" onClick={lockAll}>
            <LockKeyhole size={17} />
            Lock vault<kbd aria-hidden="true">↗</kbd>
          </button>
          <div className="profile-row">
            <span className="profile-avatar">{profile.handle.slice(0, 1).toUpperCase()}</span>
            <span>
              <strong>@{profile.handle}</strong>
              <small>{vault.demo ? 'Interactive demo' : 'Personal account'}</small>
            </span>
            <button
              className="icon-button"
              aria-label={vault.demo ? 'Leave demo' : 'Sign out'}
              onClick={() => void signOut()}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Open navigation"
            aria-expanded={mobileNav}
            onClick={() => setMobileNav(true)}
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumb">
            <LockKeyhole size={14} />
            <span>Personal vault</span>
            <span>/</span>
            <strong>
              {page === 'vault'
                ? filter === 'favorites'
                  ? 'Favorites'
                  : filter === 'notes'
                    ? 'Secure notes'
                    : 'Overview'
                : page === 'security'
                  ? 'Password check'
                  : page === 'backups'
                    ? 'Backups'
                    : page === 'activity'
                      ? 'Activity'
                      : 'Settings'}
            </strong>
          </div>
          <div className="topbar-right">
            <span className={`connection-pill ${vault.demo ? 'demo-pill' : ''}`}>
              <span className="status-dot" />
              {vault.demo ? 'Interactive demo' : 'Vault unlocked'}
            </span>
            <button
              className="icon-button"
              aria-label="Open account settings"
              onClick={() => navigate('settings')}
            >
              <Fingerprint size={19} />
            </button>
            <span className="topbar-avatar">{profile.handle.charAt(0).toUpperCase()}</span>
          </div>
        </header>
        <main id="main" className="main-content">
          {vault.demo && (
            <div className="demo-banner">
              <Sparkles size={14} />
              <span>A little look around. Fictional credentials; changes stay in memory.</span>
              <button onClick={() => void signOut()}>
                Leave demo
                <ArrowUpRight size={13} />
              </button>
            </div>
          )}
          {vault.syncError && (
            <div className="error-box" role="alert">
              {vault.syncError}
              <button
                className="text-button"
                onClick={() =>
                  void vault.refresh().catch((error: Error) => setToast(error.message))
                }
              >
                Retry synchronization
              </button>
            </div>
          )}
          {page === 'vault' ? (
            <Dashboard
              entries={vault.entries}
              filter={filter}
              setFilter={setFilter}
              search={search}
              setSearch={setSearch}
              onNew={() => newEntry()}
              onOpen={(entry) => setDialog({ type: 'entry', entry })}
              onFavorite={(entry) => {
                const { id, revision, updatedAt: _time, ...fields } = entry;
                void vault
                  .save({ ...fields, favorite: !entry.favorite }, id, revision)
                  .catch((error: Error) => setToast(error.message));
              }}
              onGenerator={() => setDialog({ type: 'generator' })}
              onSecurity={() => navigate('security')}
            />
          ) : page === 'security' ? (
            <SecurityPage
              entries={vault.entries}
              onOpen={(entry) => setDialog({ type: 'entry', entry })}
              onGenerator={() => setDialog({ type: 'generator' })}
            />
          ) : page === 'backups' ? (
            <Backups onExport={vault.exportVault} onImport={vault.importVault} demo={vault.demo} />
          ) : page === 'activity' ? (
            <Activity demo={vault.demo} />
          ) : (
            <Settings
              profile={profile}
              idleMinutes={idleMinutes}
              setIdleMinutes={setIdleMinutes}
              onProfile={setProfile}
              onChangePassphrase={async (passphrase) => {
                await vault.changePassphrase(passphrase);
                lockAll();
                setToast('Master passphrase changed. Unlock with your new passphrase.');
              }}
            />
          )}
        </main>
        <footer className="app-footer">
          <span>
            <ShieldCheck size={13} />A personal vault, thoughtfully protected.
          </span>
          <span>
            {vault.demo ? (
              'LOCAL DEMO · NOT SAVED'
            ) : vault.lastSynced ? (
              <>
                <Check size={12} /> Last synchronized{' '}
                {vault.lastSynced.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </>
            ) : (
              <>
                <RefreshCw size={12} /> Ready
              </>
            )}
          </span>
        </footer>
      </div>
      {dialog?.type === 'entry' && (
        <EntryEditor
          key={`${dialog.entry.id}:${dialog.entry.revision}`}
          entry={dialog.entry}
          onSave={vault.save}
          onDelete={vault.remove}
          onReload={reloadDraft}
          onClose={() => setDialog(null)}
          onCopy={copy}
        />
      )}
      {dialog?.type === 'generator' && (
        <Generator onClose={() => setDialog(null)} onCopy={copy} onUse={newEntry} />
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
    </div>
  );
}
