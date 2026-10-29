# Bug-report relay

A Cloudflare Worker that takes a bug report from the game and mails it to `REPORT_TO` through Resend
(spec `docs/superpowers/specs/2026-10-11-bug-report-design.md` §4.4). Its own package, so Wrangler stays
out of the game's dependencies. The tests run with the game's suite (`npx vitest run tools/bug-relay`).

## Setup (once)

1. A Resend account on the `REPORT_TO` address (sending from `onboarding@resend.dev` only reaches the
   account's own address, which is all this needs); create an API key.
2. A Cloudflare account.
3. Here, in `tools/bug-relay/`:
   ```
   npm install
   npx wrangler login
   npx wrangler kv namespace create REPORTS   # paste the id into wrangler.toml
   npx wrangler secret put RESEND_API_KEY     # paste the Resend key
   npx wrangler deploy                        # prints the https://….workers.dev URL
   ```
4. Put the URL in the repo's `release.json` as `"bugRelay"`.

## Limits

POST JSON only, ≤ 4 MB; at most two attachments, named `screenshot.png` and `server-log.txt`;
5 reports an hour per IP (counted in KV `REPORTS`).
