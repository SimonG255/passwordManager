import { useEffect, useState } from 'react';
import { Activity as ActivityIcon, Check, Clock3, ShieldCheck } from 'lucide-react';
import type { EventView } from '@vaultline/contracts';
import { api } from '../api';

export function Activity({ demo }: { demo: boolean }) {
  const [events, setEvents] = useState<EventView[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(!demo);
  useEffect(() => {
    if (demo) return;
    let active = true;
    void api<EventView[]>('/events')
      .then((result) => {
        if (active) setEvents(result);
      })
      .catch((error: Error) => {
        if (active) setError(error.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [demo]);
  return (
    <div className="page-stack">
      <div className="page-intro">
        <span className="eyebrow">A CLEARER PICTURE</span>
        <h1>Your security activity.</h1>
        <p>A minimal record of actions the server can verify.</p>
      </div>
      <div className="info-box">
        <ShieldCheck size={17} />
        Events never contain your passwords, entry names, or private notes. Activity is retained for
        90 days.
      </div>
      {error && (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}
      <section className="panel activity-panel">
        {demo ? (
          <div className="empty-state">
            <ActivityIcon size={32} />
            <h2>No server activity in this demo</h2>
            <p>
              Demo actions happen in memory. Create an account to see actual sign-ins and accepted
              vault changes.
            </p>
          </div>
        ) : loading ? (
          <p className="muted">Loading security activity…</p>
        ) : !events.length ? (
          <p className="muted">No activity yet.</p>
        ) : (
          events.map((event) => (
            <div className="activity-row" key={event.id}>
              <span className="activity-dot">
                <Check size={14} />
              </span>
              <div>
                <strong>{event.action}</strong>
                <span>Verified server event</span>
              </div>
              <time dateTime={event.createdAt}>
                <Clock3 size={13} />
                {new Date(event.createdAt).toLocaleString()}
              </time>
            </div>
          ))
        )}
      </section>
      <p className="muted small">
        Local unlocks, reveals, clipboard copies, and exports are not server-verifiable and are not
        presented as audit events. Database administrators can modify the event store.
      </p>
    </div>
  );
}
