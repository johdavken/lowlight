/**
 * The bug-report relay (spec 2026-10-11 bug report §4.4): a Cloudflare Worker that takes a report from the
 * game and mails it to the developer through Resend. The Resend key lives only in this Worker's secrets; the game
 * holds nothing but this Worker's URL, so the size cap and the hourly limit are what keep it from being
 * useful to anyone else. Typed without Cloudflare's packages so it checks under the game's tsconfig.
 */
import { z } from 'zod';

export const ATTACHMENT_NAMES = ['screenshot.png', 'server-log.txt'] as const;
const MAX_BODY = 4 * 1024 * 1024;
const PER_HOUR = 5;
const HOUR_MS = 3_600_000;
/** Every IP together, so a few IPs can't spend Resend's free daily quota (100) for real players. */
const PER_DAY = 50;
const DAY_MS = 86_400_000;
const FROM = 'Lowlight bug reports <onboarding@resend.dev>';

const reportSchema = z.object({
  subject: z.string().min(1).max(200),
  text: z.string().min(1).max(200_000),
  replyTo: z.string().max(200).optional(),
  attachments: z.array(z.object({ filename: z.enum(ATTACHMENT_NAMES), content: z.string() })).max(2),
});
export type RelayReport = z.infer<typeof reportSchema>;

export interface KvLike {
  get(k: string): Promise<string | null>;
  put(k: string, v: string, o?: { expirationTtl?: number }): Promise<void>;
}

export interface RelayEnv {
  RESEND_API_KEY: string;
  REPORT_TO: string;
  REPORTS: KvLike;
}

const reply = (status: number, body: { ok: true } | { ok: false; reason: string }) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export default {
  async fetch(req: Request, env: RelayEnv): Promise<Response> {
    if (req.method !== 'POST') return reply(405, { ok: false, reason: 'POST only' });
    if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY) return reply(413, { ok: false, reason: 'too big' });
    const raw = await req.text();
    if (raw.length > MAX_BODY) return reply(413, { ok: false, reason: 'too big' });

    let parsed: RelayReport;
    try {
      parsed = reportSchema.parse(JSON.parse(raw));
    } catch {
      return reply(400, { ok: false, reason: 'bad report' });
    }

    // Counted only once a mail goes out (KV isn't atomic: a burst can slip a few past; the day cap bounds it).
    const ip = req.headers.get('cf-connecting-ip') ?? 'unknown';
    const hourKey = `rl:${ip}:${Math.floor(Date.now() / HOUR_MS)}`;
    const dayKey = `day:${Math.floor(Date.now() / DAY_MS)}`;
    const [hour, day] = await Promise.all([env.REPORTS.get(hourKey), env.REPORTS.get(dayKey)]);
    if (Number(day ?? 0) >= PER_DAY || Number(hour ?? 0) >= PER_HOUR) return reply(429, { ok: false, reason: 'rate limited' });

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: [env.REPORT_TO],
        subject: parsed.subject,
        text: parsed.text,
        ...(parsed.replyTo ? { reply_to: parsed.replyTo } : {}),
        attachments: parsed.attachments,
      }),
    });
    if (!res.ok) return reply(502, { ok: false, reason: 'mail failed' });
    await Promise.all([
      env.REPORTS.put(hourKey, String(Number(hour ?? 0) + 1), { expirationTtl: 3600 }),
      env.REPORTS.put(dayKey, String(Number(day ?? 0) + 1), { expirationTtl: 86_400 }),
    ]);
    return reply(200, { ok: true });
  },
};
