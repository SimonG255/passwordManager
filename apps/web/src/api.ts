import type { Profile } from '@vaultline/contracts';

let csrf = '';
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: method === 'GET' ? {} : { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiError(
      0,
      'Connection lost. Your changes have not been confirmed. Reconnect and retry.',
    );
  }
  const value = await response
    .json()
    .catch(() => ({ error: 'The server returned an unexpected response.' }));
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event('vaultline:session-expired'));
    throw new ApiError(
      response.status,
      typeof value.error === 'string' ? value.error : 'The request failed.',
    );
  }
  return value as T;
}
export async function context(): Promise<Profile | null> {
  const result = await api<{ csrf: string; profile: Profile | null }>('/context');
  csrf = result.csrf;
  return result.profile;
}
export function setCsrf(value: string) {
  csrf = value;
}
