/**
 * NanoGPT, the third key: OpenAI-compatible chat at `<host>/api/v1`, a $12 plan that covers open-weight models,
 * pay-as-you-go from a balance for the rest. Model ids are OpenRouter's (`z-ai/glm-5.2`), so stored ids need no
 * mapping. What lives here: the key check (plan + balance) the link routes and the probe share.
 */

/** The OpenAI-style base for chat and models. */
export const nanoApi = (host: string): string => `${host}/api/v1`;

/** The player's plan: whether it's on, and how much of the week's input tokens is left (0–1; null: not said). */
export interface NanoPlan {
  active: boolean;
  weekLeft: number | null;
}

export type NanoCheck =
  | { state: 'ok' | 'no-credit'; credit: number | null; plan: NanoPlan | null }
  | { state: 'key-rejected' }
  | { state: 'unreachable' };

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' || typeof v === 'number' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** The plan out of `/api/subscription/v1/usage`'s answer; null when it says nothing usable. */
export function planOf(body: unknown): NanoPlan | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as { active?: unknown; state?: unknown; weeklyInputTokens?: { used?: unknown; remaining?: unknown } };
  const active = b.active === true || b.state === 'active' || b.state === 'grace';
  const used = num(b.weeklyInputTokens?.used);
  const remaining = num(b.weeklyInputTokens?.remaining);
  const total = used !== null && remaining !== null ? used + remaining : null;
  const weekLeft = total && total > 0 ? Math.max(0, Math.min(1, remaining! / total)) : null;
  return { active, weekLeft };
}

/**
 * Checks a key: the plan (`GET /api/subscription/v1/usage`, which rejects a bad key with 401) and the balance
 * (`POST /api/check-balance`; with the plan answered, its failure only leaves the dollars unknown; without, it
 * decides). Usable when the plan is on or the balance isn't spent.
 */
export async function checkNanoGptKey(key: string, o: { host: string; fetchImpl?: typeof fetch; timeoutMs: number }): Promise<NanoCheck> {
  const fetchImpl = o.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await fetchImpl(`${o.host}/api/subscription/v1/usage`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(o.timeoutMs) });
  } catch {
    return { state: 'unreachable' };
  }
  if (res.status === 401) return { state: 'key-rejected' };
  if (res.status >= 500) return { state: 'unreachable' };
  // Any other refusal (a key with no plan, say): the balance call decides whether the key is good.
  const plan = res.ok ? planOf(await res.json().catch(() => null)) : null;
  let credit: number | null = null;
  try {
    const bal = await fetchImpl(`${o.host}/api/check-balance`, { method: 'POST', headers: { 'x-api-key': key }, signal: AbortSignal.timeout(o.timeoutMs) });
    if (!res.ok && (bal.status === 401 || bal.status === 403)) return { state: 'key-rejected' };
    if (bal.ok) credit = num(((await bal.json().catch(() => ({}))) as { usd_balance?: unknown }).usd_balance);
    else if (!res.ok) return { state: 'unreachable' };
  } catch {
    // The dollars stay unknown; with the plan call answered, the key itself checked out.
    if (!res.ok) return { state: 'unreachable' };
  }
  const spent = !plan?.active && credit !== null && credit <= 0;
  return { state: spent ? 'no-credit' : 'ok', credit, plan };
}

/** A 429 that is the plan's allowance running out (`api_key_weekly_subscription_token_limit` and kin), not a busy moment. */
export function isAllowanceOut(status: number, body: string): boolean {
  return status === 429 && /_subscription_token_limit/.test(body);
}
