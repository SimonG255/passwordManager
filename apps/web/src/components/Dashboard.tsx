import { useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  Code2,
  FileText,
  Globe,
  Grid2X2,
  KeyRound,
  List,
  LockKeyhole,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
} from 'lucide-react';
import type { VaultEntry } from '@vaultline/contracts';
import { passwordHealth } from '../health';

export type VaultFilter = 'all' | 'favorites' | 'notes';
export function EntryAvatar({ entry }: { entry: VaultEntry }) {
  const title = entry.title.toLowerCase();
  const brand = ['github', 'figma', 'google', 'linear', 'notion', 'vercel'].includes(title)
    ? title
    : entry.category === 'note'
      ? 'note'
      : 'generic';
  return (
    <span className={`entry-avatar ${brand}`} aria-hidden="true">
      {brand === 'github' ? (
        <Code2 size={21} />
      ) : brand === 'figma' ? (
        <span className="figma-symbol">
          <i />
          <i />
          <i />
          <i />
          <i />
        </span>
      ) : brand === 'google' ? (
        'G'
      ) : brand === 'linear' ? (
        <span className="linear-symbol" />
      ) : brand === 'notion' ? (
        'N'
      ) : brand === 'vercel' ? (
        <span className="triangle" />
      ) : brand === 'note' ? (
        <FileText size={20} />
      ) : (
        entry.title.charAt(0).toUpperCase()
      )}
    </span>
  );
}
function website(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.hostname.replace(/^www\./, '')
      : 'Login';
  } catch {
    return 'Login';
  }
}
function modified(value?: string) {
  if (!value) return 'Just now';
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return 'Today';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
export function Dashboard({
  entries,
  filter,
  setFilter,
  search,
  setSearch,
  onNew,
  onOpen,
  onFavorite,
  onGenerator,
  onSecurity,
}: {
  entries: VaultEntry[];
  filter: VaultFilter;
  setFilter: (filter: VaultFilter) => void;
  search: string;
  setSearch: (search: string) => void;
  onNew: () => void;
  onOpen: (entry: VaultEntry) => void;
  onFavorite: (entry: VaultEntry) => void;
  onGenerator: () => void;
  onSecurity: () => void;
}) {
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [sort, setSort] = useState('recent');
  const health = passwordHealth(entries);
  const visible = entries
    .filter(
      (entry) =>
        (filter === 'all' ||
          (filter === 'favorites' && entry.favorite) ||
          (filter === 'notes' && entry.category === 'note')) &&
        `${entry.title} ${entry.username} ${entry.website}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      sort === 'name'
        ? a.title.localeCompare(b.title)
        : (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''),
    );
  const title =
    filter === 'favorites'
      ? 'Your everyday essentials.'
      : filter === 'notes'
        ? 'A little space for private things.'
        : 'Everything, safely in place.';
  return (
    <>
      <div className="page-intro dashboard-intro">
        <div>
          <span className="eyebrow">YOUR PERSONAL VAULT</span>
          <h1>{title}</h1>
          <p>Less to remember. More room for what matters.</p>
        </div>
        <button className="button primary" onClick={onNew}>
          <Plus size={17} />
          New item
        </button>
      </div>
      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-icon">
            <KeyRound size={18} />
          </span>
          <div>
            <span>Total items</span>
            <strong>
              {entries.length}
              <small>all in one place</small>
            </strong>
          </div>
          <span className="stat-decoration">↗</span>
        </div>
        <div className="stat-card">
          <span className="stat-icon peach">
            <Star size={18} />
          </span>
          <div>
            <span>Favorites</span>
            <strong>
              {entries.filter((entry) => entry.favorite).length}
              <small>always within reach</small>
            </strong>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon green">
            <ShieldCheck size={19} />
          </span>
          <div>
            <span>Vault status</span>
            <strong className="status-word">
              Encrypted
              <small>
                <span className="status-dot" />
                keys held in your browser
              </small>
            </strong>
          </div>
        </div>
      </div>
      <div className="dashboard-columns">
        <section className="vault-list-section">
          <div className="section-heading">
            <h2>
              {filter === 'favorites'
                ? 'Favorite items'
                : filter === 'notes'
                  ? 'Secure notes'
                  : 'All items'}
              <span className="count-badge">{visible.length}</span>
            </h2>
            <div className="view-switch">
              <button
                aria-label="List view"
                aria-pressed={view === 'list'}
                onClick={() => setView('list')}
              >
                <List size={17} />
              </button>
              <button
                aria-label="Grid view"
                aria-pressed={view === 'grid'}
                onClick={() => setView('grid')}
              >
                <Grid2X2 size={16} />
              </button>
            </div>
          </div>
          <div className="list-toolbar">
            <div className="search-box">
              <Search size={17} />
              <input
                id="vault-search"
                aria-label="Search your vault"
                placeholder="Search your vault…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <kbd>⌘ K</kbd>
            </div>
            <select
              aria-label="Sort items"
              value={sort}
              onChange={(event) => setSort(event.target.value)}
            >
              <option value="recent">Last updated</option>
              <option value="name">Name A–Z</option>
            </select>
          </div>
          <div className="filter-tabs">
            <button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
              All items
            </button>
            <button aria-pressed={filter === 'favorites'} onClick={() => setFilter('favorites')}>
              Favorites
            </button>
            <button aria-pressed={filter === 'notes'} onClick={() => setFilter('notes')}>
              Secure notes
            </button>
          </div>
          {!visible.length ? (
            <div className="empty-state panel">
              <span className="empty-icon">
                <KeyRound size={29} />
              </span>
              <h2>
                {search
                  ? 'Nothing here by that name.'
                  : entries.length
                    ? 'A little room for something new.'
                    : 'Your private space is ready.'}
              </h2>
              <p>
                {search
                  ? 'Try another title, website, or username.'
                  : 'Add a login or a private note. Every field will be encrypted.'}
              </p>
              {!search && (
                <button className="button primary" onClick={onNew}>
                  <Plus size={16} />
                  Add your first item
                </button>
              )}
            </div>
          ) : view === 'list' ? (
            <div className="items-table-wrap">
              <table className="items-table">
                <thead>
                  <tr>
                    <th>ITEM NAME</th>
                    <th className="username-column">USERNAME</th>
                    <th className="modified-column">MODIFIED</th>
                    <th>
                      <span className="sr-only">Favorite</span>
                    </th>
                    <th>
                      <span className="sr-only">Open</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((entry) => (
                    <tr key={entry.id}>
                      <td>
                        <button className="item-main" onClick={() => onOpen(entry)}>
                          <EntryAvatar entry={entry} />
                          <span>
                            <strong>{entry.title}</strong>
                            <small>
                              {entry.category === 'note' ? 'Secure note' : website(entry.website)}
                            </small>
                          </span>
                        </button>
                      </td>
                      <td className="username-column">
                        <span className="username">{entry.username || '—'}</span>
                      </td>
                      <td className="modified-column">
                        <span className="modified">{modified(entry.updatedAt)}</span>
                      </td>
                      <td>
                        <button
                          className={`icon-button favorite-button ${entry.favorite ? 'is-favorite' : ''}`}
                          aria-label={`${entry.favorite ? 'Unfavorite' : 'Favorite'} ${entry.title}`}
                          aria-pressed={entry.favorite}
                          onClick={() => onFavorite(entry)}
                        >
                          <Star size={16} fill={entry.favorite ? 'currentColor' : 'none'} />
                        </button>
                      </td>
                      <td>
                        <button
                          className="icon-button row-arrow"
                          aria-label={`Open ${entry.title}`}
                          onClick={() => onOpen(entry)}
                        >
                          <ChevronRight size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="item-grid">
              {visible.map((entry) => (
                <div className="item-tile" key={entry.id}>
                  <button className="tile-main" onClick={() => onOpen(entry)}>
                    <EntryAvatar entry={entry} />
                    <strong>{entry.title}</strong>
                    <span>
                      {entry.category === 'note' ? 'Secure note' : website(entry.website)}
                    </span>
                    <small>{entry.username || 'Private note'}</small>
                  </button>
                  <button
                    className={`icon-button tile-star ${entry.favorite ? 'is-favorite' : ''}`}
                    aria-label={`${entry.favorite ? 'Unfavorite' : 'Favorite'} ${entry.title}`}
                    onClick={() => onFavorite(entry)}
                  >
                    <Star size={16} fill={entry.favorite ? 'currentColor' : 'none'} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="list-footer">
            <LockKeyhole size={13} />
            Only you can read what’s inside.
            <span>
              {visible.length} {visible.length === 1 ? 'item' : 'items'}
            </span>
          </div>
        </section>
        <aside className="vault-aside">
          <section className="health-card panel">
            <div className="card-heading">
              <span>
                <ShieldCheck size={16} />
                Password check
              </span>
              <ArrowUpRight size={16} />
            </div>
            <div className="health-illustration">
              <svg viewBox="0 0 100 100" aria-hidden="true">
                <circle className="ring-track" cx="50" cy="50" r="40" />
                <circle
                  className="ring-value"
                  cx="50"
                  cy="50"
                  r="40"
                  strokeDasharray={`${(health.score ?? 0) * 2.513} 251.3`}
                />
              </svg>
              <span>
                {health.score === null ? (
                  <ShieldCheck size={27} />
                ) : (
                  <>
                    <strong>{health.score}</strong>
                    <small>%</small>
                  </>
                )}
              </span>
            </div>
            <h3>
              {health.score === null
                ? 'A fresh start.'
                : health.score === 100
                  ? 'Looking good.'
                  : 'A little care goes a long way.'}
            </h3>
            <p>
              {health.score === null
                ? 'Add your first login to run local checks.'
                : health.score === 100
                  ? 'Your passwords pass our local length and reuse checks.'
                  : `${health.attention.size} ${health.attention.size === 1 ? 'password needs' : 'passwords need'} a little attention.`}
            </p>
            <div className="health-detail">
              <span>
                {health.short.length ? <span className="warning-dot" /> : <Check size={14} />}Short
                passwords
              </span>
              <strong>{health.short.length}</strong>
            </div>
            <div className="health-detail">
              <span>
                {health.reused.length ? <span className="warning-dot" /> : <Check size={14} />}
                Reused passwords
              </span>
              <strong>{health.reused.length}</strong>
            </div>
            <button className="card-link" onClick={onSecurity}>
              View password check
              <ArrowRight size={15} />
            </button>
          </section>
          <section className="generator-card">
            <span className="generator-spark">
              <Sparkles size={22} />
            </span>
            <span className="eyebrow">STRONGER BY CHANCE</span>
            <h3>
              A better password.
              <br />
              In one click.
            </h3>
            <p>Long, random, and one less thing to think about.</p>
            <button onClick={onGenerator}>
              Generate a password
              <ArrowRight size={16} />
            </button>
            <div className="generator-art" aria-hidden="true">
              a<span>9</span>✳<i>k</i>
            </div>
          </section>
        </aside>
      </div>
      <div className="privacy-strip">
        <span className="privacy-icon">
          <LockKeyhole size={19} />
        </span>
        <div>
          <strong>Your secrets stay yours.</strong>
          <p>Every title, password, and note is encrypted in your browser before storage.</p>
        </div>
        <span className="privacy-label">
          <ShieldCheck size={14} />
          PRIVATE BY DESIGN
        </span>
      </div>
    </>
  );
}
export function SecurityPage({
  entries,
  onOpen,
  onGenerator,
}: {
  entries: VaultEntry[];
  onOpen: (entry: VaultEntry) => void;
  onGenerator: () => void;
}) {
  const health = passwordHealth(entries);
  return (
    <div className="page-stack">
      <div className="page-intro">
        <span className="eyebrow">SMALL CHECKS. GOOD HABITS.</span>
        <h1>A healthier digital life.</h1>
        <p>Password checks run locally while your vault is unlocked.</p>
      </div>
      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-icon green">
            <ShieldCheck size={20} />
          </span>
          <div>
            <span>Passing local checks</span>
            <strong>{health.score === null ? '—' : `${health.score}%`}</strong>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon peach">
            <KeyRound size={20} />
          </span>
          <div>
            <span>Short passwords</span>
            <strong>{health.short.length}</strong>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon">
            <Globe size={20} />
          </span>
          <div>
            <span>Reused passwords</span>
            <strong>{health.reused.length}</strong>
          </div>
        </div>
      </div>
      <section className="panel security-checks">
        <div className="section-heading">
          <h2>
            {health.attention.size ? 'A few things to look at' : 'All clear for these checks'}
          </h2>
          <button className="button secondary compact" onClick={onGenerator}>
            <Sparkles size={15} />
            Generate a password
          </button>
        </div>
        {health.attention.size ? (
          entries
            .filter((entry) => health.attention.has(entry.id))
            .map((entry) => (
              <button className="security-entry" key={entry.id} onClick={() => onOpen(entry)}>
                <EntryAvatar entry={entry} />
                <strong>{entry.title}</strong>
                <span className="tag amber">
                  {entry.password.length < 16 ? 'Under 16 characters' : 'Reused password'}
                </span>
                <ChevronRight size={17} />
              </button>
            ))
        ) : (
          <div className="empty-state">
            <ShieldCheck size={34} />
            <h2>{health.logins.length ? 'A good foundation.' : 'Ready when you are.'}</h2>
            <p>
              {health.logins.length
                ? 'Your stored passwords are at least 16 characters and unique within this vault.'
                : 'Add a login with a password to start checking.'}
            </p>
          </div>
        )}
      </section>
      <div className="quiet-note">
        <ShieldCheck size={20} />
        <p>
          These are simple length and reuse checks, not an entropy estimate or a breach database
          search. A long password may still be predictable. Use the generator for random passwords
          and a unique passphrase for your vault.
        </p>
      </div>
    </div>
  );
}
