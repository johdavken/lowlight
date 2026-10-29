import http from 'node:http';
import type { ServerResponse } from 'node:http';
import { BAD_KEY, DIRECT, SECOND, STUB_OR_LOG_PORT } from './fixtures';

/**
 * A reply long enough to span at least 3 pages of the room's dialogue box: plain prose sentences
 * (about 2,500 characters) with a couple of `*actions*` mixed in, for the typing/paging e2e test.
 */
const LONG_STORY = [
  'The warehouse had been quiet for three days straight, the kind of quiet that settles into the walls and makes every small sound feel too loud.',
  'Rain had come through twice that week, and both times the gutters on the east side gave up halfway through, flooding the loading dock in a thin, patient sheet of water.',
  '*she leans back against the cold metal frame, arms crossed, watching the door*',
  'Nobody had come through that door since Tuesday, not even the runners who usually dropped by for a smoke and a complaint about the weather.',
  'The radio on the shelf crackled through three stations before it settled on something that sounded like a shipping forecast from a city nobody in the room had ever visited.',
  'She counted the crates stacked against the far wall out of habit more than any real need, and came up one short, same as she had the day before.',
  'A thin strip of orange neon leaked in through the gap under the shutter and laid itself across the floor in long, uneven stripes that shifted whenever the wind outside picked up.',
  'Somebody, a long time ago, had scratched a name into the paint by the doorframe, and the years had worn it down until only the first two letters were still legible.',
  'It was the kind of night that asked nothing of anyone and gave back even less in return, the sort you forgot by morning except for a vague, unplaceable unease.',
  'The generator in the back coughed twice, settled into its usual low hum, and kept the single working light overhead flickering just enough to notice.',
  '*she exhales slowly, and lets the silence have the room for a while*',
  'Somewhere beyond the warehouse, a train went by on the elevated line, close enough to rattle the windows but far enough that the sound arrived soft, almost gentle.',
  'She remembered the smell of diesel and salt long before she remembered most of the faces from those years, and that felt right, somehow, like the city kept its own order of memory.',
  'The rain had stopped an hour ago, but the gutters kept dripping anyway, a slow uneven percussion against the dock that nobody bothered to fix.',
  'Every so often a shadow moved across the frosted window near the stairs, too quick to be anyone standing still, too slow to be anything worth worrying about.',
  'She had learned, over the years, which silences meant something and which ones were just the building settling, and this one, she decided, was only the building.',
].join(' ');

/**
 * Plain prose exactly `n` characters long (LONG_STORY repeated and cut), with its `*actions*`
 * kept balanced: a cut that leaves an action open turns that last `*` into a space.
 */
export function proseOfLength(n: number): string {
  let s = LONG_STORY;
  while (s.length < n) s += ` ${LONG_STORY}`;
  s = s.slice(0, n);
  if ((s.match(/\*/g)?.length ?? 0) % 2 === 1) {
    const i = s.lastIndexOf('*');
    s = `${s.slice(0, i)} ${s.slice(i + 1)}`;
  }
  return s.trimEnd().padEnd(n, '.');
}

/** The fake narrator's opening (e2e "opening:"; arrival screen spec §3). */
export const E2E_OPENING = { title: 'E2E After closing', text: 'Rain has shut the Ribbon early, and the light upstairs is still on.' };

/** The fake narrator's three events (e2e "encounter:"): the first brings a stranger. */
export const E2E_ENCOUNTERS = [
  { title: 'E2E Wrong package', text: 'A courier drops a sealed box on the counter with her name on it.', stranger: { name: 'Courier', voice: 'clipped, chewing gum' } },
  { title: 'E2E Blackout', text: 'The grid drops and every sign on the street dies at once.', stranger: null },
  { title: 'E2E Regular', text: 'An old man takes the last stool and orders without looking.', stranger: null },
];

/** The fake SUGGEST line (e2e "suggest:"). */
export const E2E_SUGGESTION = '*I tap the counter twice.* "E2E suggested line."';

/**
 * A fake OpenRouter for every chat: `a bowl, Hae` gets a reply with a line of Hae's,
 * `dim the lamp` gets a set_light tool call first, `where do I find Alpha` a share_contact for alpha,
 * `out of credit` a 402, `tell me a long story` LONG_STORY, `len:N` N characters of prose (see
 * below); anything else `GLM reply #n` (SECOND gets `Alpha here. … #n`), with `(heard: [journal …])`
 * when the turn carried a journal line. Its requests are served on `logPort` (default
 * STUB_OR_LOG_PORT; null: not served). Used by e2e/serve.ts and the packaged-app smoke test.
 */
export async function startFakeOpenRouter(opts: { logPort?: number | null } = {}): Promise<string> {
  const requests: { method: string; url: string; body: unknown }[] = [];
  let n = 0;
  const sse = (res: ServerResponse, chunks: unknown[]) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    for (const c of chunks) res.write(`data: ${JSON.stringify(c)}\n\n`);
    res.end('data: [DONE]\n\n');
  };
  const choice = (delta: unknown, finish: string | null = null) => ({ choices: [{ index: 0, delta, finish_reason: finish }] });
  const server = http.createServer((req, res) => {
    let text = '';
    req.on('data', (c) => (text += c));
    req.on('end', () => {
      const body = text ? (JSON.parse(text) as { messages?: { role: string; content: string | null }[] }) : {};
      requests.push({ method: req.method ?? '', url: req.url ?? '', body });
      if (req.url === '/api/v1/key') {
        // The link panel's check: one key the fake refuses, the rest have credit.
        if (req.headers.authorization === `Bearer ${BAD_KEY}`) return void res.writeHead(401, { 'Content-Type': 'application/json' }).end('{}');
        return void res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ data: { limit_remaining: 9.5 } }));
      }
      if (req.url === '/api/v1/models') {
        const data = DIRECT.models.map((m) => ({ ...m, pricing: { prompt: '0.0000004', completion: '0.0000016' } }));
        return void res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ data }));
      }
      // Scenario cards' narrator (one non-streaming request): three fixed setups.
      if ((body as { stream?: boolean }).stream === false && body.messages?.[0]?.content?.startsWith('You write openings')) {
        const content = JSON.stringify(E2E_OPENING);
        return void res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }));
      }
      // Encounter cards' narrator: three fixed events.
      if ((body as { stream?: boolean }).stream === false && body.messages?.[0]?.content?.startsWith('You write events')) {
        const content = JSON.stringify(E2E_ENCOUNTERS);
        return void res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }));
      }
      // SUGGEST: the player's next line, with a "Name:" in front to be cleaned off; a steer is echoed back.
      if ((body as { stream?: boolean }).stream === false && body.messages?.[0]?.content?.startsWith('You help the user play')) {
        const steer = /means to do next \([^)]*\): (.*)$/s.exec(body.messages.at(-1)?.content ?? '')?.[1];
        const who = /^You help the user play (.+?) in a roleplay/.exec(body.messages[0].content)?.[1] ?? 'Nobody';
        const content = `${who}: ${E2E_SUGGESTION}${steer ? ` (${steer})` : ''}`;
        return void res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }));
      }
      /** The first `[places: …]` id that isn't the `[room: <id>` she's in (her plans e2e). */
      const awayFrom = (asked: string) => {
        const room = /\[room: (\S+)/.exec(asked)?.[1] ?? '';
        const ids = [...(/\[places: ([^\]]*)\]/.exec(asked)?.[1] ?? '').matchAll(/(\S+) "[^"]*"/g)].map((m) => m[1]);
        return ids.find((id) => id !== room) ?? ids[0];
      };
      // Cipher (e2e/cipher.spec.ts): the cipher run keeps one place truth, by the first of the cast.
      if ((body as { stream?: boolean }).stream === false && body.messages?.[0]?.content?.startsWith('You keep the secrets')) {
        const cast = /\[cast: (\S+) "/.exec(body.messages.at(-1)?.content ?? '')?.[1];
        const content = JSON.stringify({ truths: [{ kind: 'place', truth: 'The intake is a drop for the Tilt.', knownBy: cast ? [cast] : [], comesOutWhen: 'someone opens the till', changes: 'the Tilt knows your face', clueIdeas: 'an envelope, a chalk mark' }] });
        return void res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }));
      }
      // The Residual (scribe spec): her bookkeeping after each reply, and the rolling summary. The blue mug line
      // (e2e/branch.spec.ts) gets a note; everything else nothing to write.
      if ((body as { stream?: boolean }).stream === false && body.messages?.[0]?.content?.startsWith('You keep the records')) {
        const asked = body.messages.at(-1)?.content ?? '';
        const content = body.messages[0].content.includes('running summary')
          ? 'They talked for a while.'
          : /go home and shower/i.test(asked) && /\[places: /.test(asked)
            ? // Her plans (e2e/plans.spec.ts): she heads to the first place listed that isn't her room (final review M4).
              JSON.stringify({ notes: [], plan: { going: { place: awayFrom(asked), until: null }, meet: null } })
            : /text me when you're home/i.test(asked) && /\[places: [^\]]*nix-apartment/.test(asked)
              ? // Promised texts, the place path (e2e/deck.spec.ts): she'll text when she's home (her apartment from 05:00).
                JSON.stringify({ notes: [], promise: { place: /(\S*nix-apartment)/.exec(asked)![1], about: "that she's home" } })
            : /text me in an hour/i.test(asked) && /\[clock: [^\]]*?(\d{2}):(\d{2})\]/.test(asked)
              ? // Promised texts (e2e/deck.spec.ts): she'll text in an hour, by the Residual's clock.
                (() => {
                  const [, h, m] = /\[clock: [^\]]*?(\d{2}):(\d{2})\]/.exec(asked)!;
                  const t = (Number(h) * 60 + Number(m) + 60) % 1440;
                  const at = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
                  return JSON.stringify({ notes: [], promise: { at, about: "that she's home" } });
                })()
            : /\[cipher: T1/.test(asked) && asked.includes('look under the register')
              ? // Cipher (e2e/cipher.spec.ts): her reply showed the envelope.
                JSON.stringify({ notes: [], cipher: { clues: [{ id: 'T1', text: 'a thick envelope under the register' }], learned: [] } })
            : /\[cipher: T1/.test(asked) && asked.includes('tell me the truth')
              ? JSON.stringify({ notes: [], cipher: { clues: [], learned: ['T1'] } })
            : asked.includes('remember the blue mug')
              ? JSON.stringify({ notes: [{ op: 'add', about: 'you', text: 'the blue mug is yours now', keys: ['blue mug'], pin: false }] })
              : JSON.stringify({ notes: [] });
        return void res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }));
      }
      // The quest pick check (quest lines spec §3): a line about the morning stalls him; anything else is talk.
      if ((body as { stream?: boolean }).stream === false && body.messages?.[0]?.content?.startsWith('You read one line a player just typed')) {
        const line = /The line: (.*)$/s.exec(body.messages.at(-1)?.content ?? '')?.[1] ?? '';
        const content = JSON.stringify({ pick: /morning/i.test(line) ? 'stall' : null });
        return void res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }));
      }
      // Liar's dice: her line after a round (one non-streaming request).
      if ((body as { stream?: boolean }).stream === false && body.messages?.[0]?.content?.includes("You're playing liar's dice")) {
        const content = JSON.stringify({ line: 'Count them again, sweetheart.', expression: 'smirk' });
        return void res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }));
      }
      const last = body.messages?.at(-1);
      if (last?.role === 'user' && last.content?.includes('out of credit')) {
        return void res.writeHead(402, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: { message: 'Insufficient credits' } }));
      }
      // Her reaction to an encounter: the courier gets a line of his own.
      if (last?.role === 'user' && last.content?.includes('[event:')) {
        return sse(res, [choice({ content: '*Nix sets the chopsticks down.* That is not my name.\n\nCourier: Print here or I eat the fine.' }), choice({}, 'stop')]);
      }
      // Cipher (e2e/cipher.spec.ts): a reply the clue can be on.
      if (last?.role === 'user' && last.content?.includes('look under the register')) {
        return sse(res, [choice({ content: '*Nix slides a thick envelope out of sight under the register.* Nothing there.' }), choice({}, 'stop')]);
      }
      if (last?.role === 'user' && last.content?.includes('a bowl, Hae')) {
        return sse(res, [choice({ content: '*Nix slides onto a stool.*\n\nHae: Pork broth, chili oil, soft egg.' }), choice({}, 'stop')]);
      }
      if (last?.role === 'user' && last.content?.includes('where do I find Alpha')) {
        const call = { index: 0, id: 'call_share', type: 'function', function: { name: 'share_contact', arguments: JSON.stringify({ who: 'alpha', how: 'gave you her number' }) } };
        return sse(res, [choice({ tool_calls: [call] }), choice({}, 'tool_calls')]);
      }
      // Branch from here (e2e/branch.spec.ts): a line the Residual notes (above), one that moves her room.
      if (last?.role === 'user' && last.content?.includes('take me up to the roof')) {
        const call = { index: 0, id: 'call_roof', type: 'function', function: { name: 'go_to', arguments: JSON.stringify({ id: 'karasu/ribbon-rooftop' }) } };
        return sse(res, [choice({ tool_calls: [call] }), choice({}, 'tool_calls')]);
      }
      // Room exits (e2e/exits.spec.ts): through the intake's way out.
      if (last?.role === 'user' && last.content?.includes('take me out the back')) {
        const call = { index: 0, id: 'call_back', type: 'function', function: { name: 'go_to', arguments: JSON.stringify({ id: 'karasu/zz-side-room' }) } };
        return sse(res, [choice({ tool_calls: [call] }), choice({}, 'tool_calls')]);
      }
      if (last?.role === 'user' && last.content?.includes('dim the lamp')) {
        const call = { index: 0, id: 'call_1', type: 'function', function: { name: 'set_light', arguments: JSON.stringify({ light_id: 'desk_lamp', intensity: 0 }) } };
        return sse(res, [choice({ tool_calls: [call] }), choice({}, 'tool_calls')]);
      }
      // The deck (e2e/deck.spec.ts): a text turn answers as texts, one per line.
      if (body.messages?.[0]?.role === 'system' && (body.messages[0].content ?? '').includes('# Texting')) {
        // Photos (photos spec §3): asked for a pic with photos offered, she sends the first one offered.
        const turn = last?.role === 'user' ? (last.content ?? '') : '';
        const offered = /\[photos you could send: ([a-z0-9-]+) "/.exec(turn);
        if (offered && /send a pic/i.test(turn)) return sse(res, [choice({ content: `here\n[photo: ${offered[1]}]` }), choice({}, 'stop')]);
        return sse(res, [choice({ content: 'till four\nslow night\nroof. 4:15' }), choice({}, 'stop')]);
      }
      n++;
      const sent = last?.role === 'user' ? (last.content ?? '') : '';
      const len = /len:(\d+)/.exec(sent);
      if (len) {
        // `len:N`: exactly N characters of prose, sent whole but held open for a moment before
        // [DONE], so a test can see the full reply both while streaming and once finished.
        // `len:N chunk:K every:MS` streams it K characters at a time, MS apart, instead.
        const prose = proseOfLength(Number(len[1]));
        const k = Number(/chunk:(\d+)/.exec(sent)?.[1] ?? prose.length);
        const every = Number(/every:(\d+)/.exec(sent)?.[1] ?? 0);
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        const frame = (c: unknown) => res.write(`data: ${JSON.stringify(c)}\n\n`);
        let at = 0;
        const next = () => {
          if (res.destroyed) return;
          frame(choice({ content: prose.slice(at, at + k) }));
          at += k;
          if (at < prose.length) setTimeout(next, every);
          else setTimeout(() => (frame(choice({}, 'stop')), res.end('data: [DONE]\n\n')), 1_200);
        };
        return next();
      }
      if (sent.includes('tell me a long story')) return sse(res, [choice({ content: LONG_STORY }), choice({}, 'stop')]);
      // Each reply is numbered, so two takes differ; the journal line she was sent is echoed, so a
      // test can see the player's edit reach her next turn.
      const system = body.messages?.[0]?.role === 'system' ? (body.messages[0].content ?? '') : '';
      const reply = `${system.includes(SECOND.identityLine) ? SECOND.reply : DIRECT.reply} #${n}`;
      const journal = sent.split('\n').find((l) => l.startsWith('[journal'));
      sse(res, [choice({ content: journal ? `${reply} (heard: ${journal})` : reply }), choice({}, 'stop')]);
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const logPort = opts.logPort === undefined ? STUB_OR_LOG_PORT : opts.logPort;
  if (logPort !== null) {
    const log = http.createServer((_q, res) => res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(requests)));
    await new Promise<void>((r) => log.listen(logPort, '127.0.0.1', r));
  }
  return `http://127.0.0.1:${(server.address() as { port: number }).port}/api/v1`;
}
