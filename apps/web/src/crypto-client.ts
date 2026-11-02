let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<
  number,
  { resolve: (value: unknown) => void; reject: (reason: Error) => void }
>();

export function lockCrypto() {
  worker?.terminate();
  worker = null;
  for (const item of pending.values())
    item.reject(new Error('Vault locked. Please unlock and try again.'));
  pending.clear();
}
export function cryptoCall<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  if (!worker) {
    worker = new Worker(new URL('./crypto.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<{ id: number; result?: unknown; error?: string }>) => {
      const item = pending.get(event.data.id);
      if (!item) return;
      pending.delete(event.data.id);
      if (event.data.error) item.reject(new Error(event.data.error));
      else item.resolve(event.data.result);
    };
    worker.onerror = () => lockCrypto();
  }
  const id = ++nextId;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: (value) => resolve(value as T), reject });
    worker!.postMessage({ id, action, payload });
  });
}
