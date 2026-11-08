/** UPDATE on the title (plan 2026-11-08): whether public main has moved on, and the press that updates. */
import type { UpdateInfo } from '../../../shared/update';
import { ApiError } from './playthroughs';

async function call<T>(method: string, path: string): Promise<T> {
  const res = await fetch(path, { method });
  if (!res.ok) {
    const b = (await res.json().catch(() => ({}))) as { error?: unknown };
    throw new ApiError(res.status, typeof b.error === 'string' ? b.error : `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export const updateStatus = () => call<UpdateInfo>('GET', '/api/update');
/** The game closes after answering; the title then waits for it to come back. */
export const startUpdate = async (): Promise<void> => {
  await call<{ ok: boolean }>('POST', '/api/update');
};
