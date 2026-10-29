/**
 * A character that runs on a model directly: OpenRouter's (OpenAI-compatible) chat completions,
 * streamed, with the room's tools run in-process. The relay sees one turn's frames, whatever the provider.
 * The key goes only into the Authorization header; error text is redacted before it leaves here.
 */
import { modelLabel } from '../../shared/model-label';
import type { LinkState } from '../../shared/types';
import type { DirectSetup } from './agents';
import type { Backend, TurnRequest } from './backend';
import { DIRECT_TOOL_ROUNDS, runToolCall, ToolCallAssembler, toolDefinitions } from './direct-tools';
import { TurnError, STREAM_OPEN_EVENT, type CompletionMessage } from './turn';
import { parseSse, type SseFrame } from './sse';
import { StrayCallFilter } from './stray-calls';

/** Extra room for the retry of a round her thinking used up (the narrator's retry uses the same, scenario.ts). */
const DIRECT_THINKING_ROOM = 2100;
/**
 * No bytes from OpenRouter for this long and the round has stalled: the turn fails plainly instead of waiting
 * forever (a 180 s silent turn in the chat stress, 2026-10-15). Thinking streams send reasoning all along, and
 * queues send keep-alive comments, so any byte counts.
 */
const DIRECT_STALL_MS = 60_000;
export const DIRECT_STALL_TEXT = 'the model went quiet mid-reply';
import { TOOLS, type ToolContext } from './tools';

export const REGENERATE_TEMPERATURE_BOOST = 0.2;
export const MAX_TEMPERATURE = 1.5;
/**
 * Sent once when she used tools and then ended the turn without a word (some models treat the
 * saving as the whole job): a silent box reads as broken, so she gets one more round to speak.
 */
export const DIRECT_SPEAK_NUDGE = "(Your tool calls are done. Now write your reply; don't mention the tools.)";
/** Her last round broke off ("hold on —", "let me…") before tools that worked: one more round, no tools, to finish it. */
export const DIRECT_CONTINUE_NUDGE =
  "(Your reply so far is on their screen. If you stopped partway — you said you'd do something, or broke off — carry on from exactly where it stops, without repeating any of it. If it's already complete, answer with nothing.)";

/** Whether her text stops mid-thought: a dash, colon or ellipsis at the end, or a short "hold on" / "let me…" last line. */
export function brokeOff(text: string): boolean {
  const last = text.replace(/\*[^*]*\*/g, '').trim().split(/\n\s*\n/).at(-1)?.trim() ?? '';
  if (last === '') return false;
  if (/(?:—|–|-|:|…|\.\.\.)$/.test(last)) return true;
  return last.length <= 120 && /\b(hold on|hang on|one (?:sec|second|moment)|give me a (?:sec|second|moment)|let me|wait)\b/i.test(last);
}

const keyOf = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
const triples = (s: string): string[] => {
  const w = s.toLowerCase().match(/[a-z0-9']+/g) ?? [];
  return w.slice(2).map((_, i) => `${w[i]} ${w[i + 1]} ${w[i + 2]}`);
};
/**
 * A later round's text without what she already wrote: sentences and *actions* already in `before` are dropped,
 * and a round that is mostly her reply again in other words (half its word triples already said) is dropped whole.
 * GLM fills a fix-up round by writing its reply again (2026-10-12 stress test).
 */
export function unrepeated(text: string, before: string): string {
  const seen = keyOf(before);
  const pieces = text.match(/\*[^*]*\*\s*|[^*.!?…\n]+(?:[.!?…]+["”’)]*)?\s*|[\s\S]/g) ?? [];
  let out = pieces.filter((p) => { const k = keyOf(p); return k.length < 12 || !seen.includes(k); }).join('');
  out = out.replace(/\n{3,}/g, '\n\n').replace(/^\s+/, '');
  const t = triples(out);
  if (t.length >= 6) {
    const said = new Set(triples(before));
    if (t.filter((x) => said.has(x)).length / t.length >= 0.5) return '';
  }
  return out.trim() === '' ? '' : out;
}

/** Added to a failed call's error when she has already spoken: the fix-up round wrote the reply out again (2026-10-12). */
export const DIRECT_ALREADY_SHOWN = "Your reply so far is already on their screen: fix the call if it matters, and don't write that reply again.";
const PROBE_CACHE_MS = 15_000;
const PROBE_TIMEOUT_MS = 5_000;
const RETRY_AFTER_CAP_MS = 5_000;
const RETRY_AFTER_DEFAULT_MS = 2_000;

export interface DirectBackendOptions {
  setup: DirectSetup;
  /** Where her tool calls run (the room and her journal). */
  tools: ToolContext;
  /** Her saved model choice (null: back to her default). */
  model: { get(): string; set(id: string | null): void };
  /** The linked key, read per request (null: none linked yet; '' for an address without auth). */
  apiKey: () => string | null;
  /** A quiet line for the dialogue box. */
  onNotice: (text: string) => void;
  /** A model's short label (the catalog's, once loaded). */
  labelFor?: (id: string) => string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  /** Give up on the status check after this long (default 5 s). */
  probeTimeoutMs?: number;
  /** A round's stream that sends nothing for this long has stalled (default 60 s). */
  stallMs?: number;
}

export type DirectBackend = Backend & {
  credit(): number | null;
  /** A key is linked (or none is needed). */
  ready(): boolean;
  /** Forget the cached status (the key just changed). */
  resetProbe(): void;
};

/** Request-body messages: the conversation plus, within a turn, tool calls and their results. */
/** Whether the text says something beyond *actions* (a line of dialogue or plain narration). */
export const spoke = (text: string): boolean => text.replace(/\*[^*]*\*/g, '').trim() !== '';

export type WireMessage = CompletionMessage | { role: 'assistant'; content: string | null; tool_calls: unknown[] } | { role: 'tool'; tool_call_id: string; content: string };

/** `text` when it parses to a JSON object, else `fallback`. */
function jsonObjectOr(text: string, fallback: string): string {
  try {
    const v = JSON.parse(text) as unknown;
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? text : fallback;
  } catch {
    return fallback;
  }
}

export function createDirectBackend(opts: DirectBackendOptions): DirectBackend {
  const { setup } = opts;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = opts.now ?? Date.now;
  const label = (id: string) => (opts.labelFor ?? ((m: string) => modelLabel(m)))(id);
  let probed: { at: number; state: LinkState } | null = null;
  let credit: number | null = null;

  /** Every key a request was sent with (the key can change mid-turn): all are redacted. */
  const sentKeys = new Set<string>();

  /** Removes the key (and anything key-shaped) from text that may reach a log or the page. */
  const redact = (text: string): string => {
    let out = text.replace(/sk-or-[A-Za-z0-9_-]+/g, 'sk-or-…');
    const current = opts.apiKey();
    for (const key of current ? [...sentKeys, current] : sentKeys) out = out.split(key).join('…');
    return out;
  };

  const headers = (key: string): Record<string, string> => ({
    ...(key ? { Authorization: `Bearer ${key}` } : {}),
    'Content-Type': 'application/json',
    'X-Title': 'Lowlight',
  });

  async function request(path: string, init: RequestInit): Promise<Response> {
    // Read now: unlinked since the turn began means no request at all, not an unauthenticated one.
    const key = opts.apiKey();
    if (key === null) throw new TurnError('no-link', 'no key linked');
    if (key) sentKeys.add(key);
    try {
      return await fetchImpl(`${setup.baseUrl}${path}`, { ...init, headers: headers(key) });
    } catch (err) {
      if (err instanceof TypeError) throw new TurnError('unreachable', redact(err.message));
      throw err;
    }
  }

  async function errorFor(res: Response): Promise<TurnError> {
    let message = `HTTP ${res.status}`;
    try {
      const text = await res.text();
      try {
        const body = JSON.parse(text) as { error?: { message?: unknown } };
        if (typeof body.error?.message === 'string') message = body.error.message;
        else if (text) message = text;
      } catch {
        if (text) message = text;
      }
    } catch {
      // keep the status-only message
    }
    message = redact(message).slice(0, 300);
    const kind = res.status === 401 ? 'auth' : res.status === 402 ? 'credit' : res.status === 403 ? 'refused' : res.status === 429 ? 'busy' : 'http';
    return new TurnError(kind, message, res.status);
  }

  /** Opens a streamed completion: one wait-and-retry on 429, one fall back to her default on an unknown model. */
  async function open(body: Record<string, unknown>, model: string, signal?: AbortSignal): Promise<{ res: Response; model: string }> {
    const post = (m: string) => request('/chat/completions', { method: 'POST', body: JSON.stringify({ ...body, model: m }), signal });
    let res = await post(model);
    if (res.status === 429) {
      const after = Number(res.headers.get('retry-after'));
      await res.body?.cancel();
      await sleep(Number.isFinite(after) && after > 0 ? Math.min(after * 1000, RETRY_AFTER_CAP_MS) : RETRY_AFTER_DEFAULT_MS);
      res = await post(model);
    }
    if (res.ok) return { res, model };
    const err = await errorFor(res);
    const unknownModel = (res.status === 400 || res.status === 404) && /model|endpoints/i.test(err.message);
    if (!unknownModel || model === setup.defaultModel) throw err;
    opts.onNotice(`// ${label(model).toUpperCase()} UNAVAILABLE — BACK ON ${label(setup.defaultModel).toUpperCase()}`);
    opts.model.set(setup.defaultModel);
    res = await post(setup.defaultModel);
    if (!res.ok) throw await errorFor(res);
    return { res, model: setup.defaultModel };
  }

  return {
    async *streamTurn(req: TurnRequest, signal?: AbortSignal): AsyncGenerator<SseFrame> {
      const temperature = Math.min(setup.temperature + (req.regenerate ? REGENERATE_TEMPERATURE_BOOST : 0), MAX_TEMPERATURE);
      const messages: WireMessage[] = [...req.messages];
      const tools = req.noTools ? null : toolDefinitions(opts.tools);
      let model = req.model?.model ?? opts.model.get();
      let written = '';
      let usedTools = false;
      let nudged = false;
      let nudging = false;
      let finishing = false;
      // Once per turn, when she used tools and would end having said nothing.
      const nudge = (): boolean => {
        if (!usedTools || nudged || written.trim() !== '') return false;
        nudged = nudging = true;
        messages.push({ role: 'user', content: DIRECT_SPEAK_NUDGE });
        return true;
      };
      const stray = new StrayCallFilter();
      // Her hidden thinking counts toward the cap: a round can run out before a word (GLM on some providers,
      // 2026-10-15). Such a round is asked once more, thinking low with more room.
      let thinkingLow = false;
      for (let round = 1; ; round++) {
        // The nudge round may not call tools: she's there to speak.
        const body = {
          stream: true,
          temperature,
          max_tokens: thinkingLow ? setup.maxTokens + DIRECT_THINKING_ROOM : setup.maxTokens,
          ...(tools ? { tools } : {}),
          messages,
          ...(tools && (nudging || finishing) ? { tool_choice: 'none' } : {}),
          ...(thinkingLow ? { reasoning: { effort: 'low' } } : {}),
        };
        const idle = new AbortController();
        let stallTimer: ReturnType<typeof setTimeout> | undefined;
        const poke = () => {
          clearTimeout(stallTimer);
          stallTimer = setTimeout(() => idle.abort(), opts.stallMs ?? DIRECT_STALL_MS);
        };
        poke();
        let opened: Awaited<ReturnType<typeof open>>;
        try {
          opened = await open(body, model, signal ? AbortSignal.any([signal, idle.signal]) : idle.signal);
        } catch (err) {
          clearTimeout(stallTimer);
          if (!idle.signal.aborted) throw err;
          yield { event: 'run.failed', data: DIRECT_STALL_TEXT };
          return;
        }
        model = opened.model;
        if (round === 1) yield { event: STREAM_OPEN_EVENT, data: { model } };
        if (!opened.res.body) return;
        const assembler = new ToolCallAssembler();
        let roundText = '';
        let finished = false;
        let cutOff = false;
        // After she's spoken, a round is held until it ends so what she already wrote can be taken out of it.
        const holding = spoke(written);
        // A held round's text, shown once it's checked against what she wrote; a live round's held-back line.
        const release = function* (): Generator<SseFrame> {
          if (!holding) {
            const tail = stray.flush();
            if (tail !== '') {
              written += tail;
              yield { event: 'assistant.delta', data: { delta: tail } };
            }
            return;
          }
          const fresh = unrepeated(roundText, written);
          if (fresh === '') return;
          const delta = stray.push(!/\s$/.test(written) && !/^\s/.test(fresh) ? ` ${fresh}` : fresh) + stray.flush();
          if (delta === '') return;
          written += delta;
          yield { event: 'assistant.delta', data: { delta } };
        };
        // Every byte from OpenRouter resets the stall clock.
        const watched = (opened.res.body as ReadableStream<Uint8Array>).pipeThrough(
          new TransformStream<Uint8Array, Uint8Array>({
            transform(c, out) {
              poke();
              out.enqueue(c);
            },
          }),
        );
        try {
          for await (const frame of parseSse(watched)) {
            if (frame.event !== 'message') continue;
            if (frame.data === '[DONE]') {
              finished = true;
              break;
            }
            const data = frame.data as { error?: unknown; choices?: { delta?: { content?: unknown; tool_calls?: unknown }; finish_reason?: unknown }[] } | undefined;
            const choice = data?.choices?.[0];
            const content = choice?.delta?.content;
            if (typeof content === 'string' && content.length > 0 && holding) roundText += content;
            else if (typeof content === 'string' && content.length > 0) {
              // A new round's text continues the reply: one space at a bare seam.
              const seam = roundText === '' && written !== '' && !/\s$/.test(written) && !/^\s/.test(content) ? ` ${content}` : content;
              roundText += content;
              // A tool call written out as a story line never reaches the screen.
              const delta = stray.push(seam);
              if (delta !== '') {
                written += delta;
                yield { event: 'assistant.delta', data: { delta } };
              }
            }
            assembler.add(choice?.delta?.tool_calls);
            if (data?.error || choice?.finish_reason === 'error') {
              yield* release();
              yield { event: 'run.failed', data: redact(JSON.stringify(data?.error ?? choice)) };
              return;
            }
            // 'length': the cap ran out mid-reply (a reasoning model's thinking counts toward it).
            if (choice?.finish_reason === 'length') cutOff = true;
            if (choice?.finish_reason) finished = true;
          }
        } catch (err) {
          if (!idle.signal.aborted) throw err;
          yield* release();
          yield { event: 'run.failed', data: DIRECT_STALL_TEXT };
          return;
        } finally {
          clearTimeout(stallTimer);
        }
        yield* release();
        const calls = assembler.calls();
        if (cutOff && roundText === '' && calls.length === 0 && !thinkingLow) {
          thinkingLow = true;
          continue;
        }
        // Cut off after some text (her thinking and a long reply share the cap: a quest beat, 2026-10-16): what's
        // shown stays, and one more round, thinking low with more room and no tools, finishes it.
        if (cutOff && roundText.trim() !== '' && calls.length === 0 && !finishing) {
          thinkingLow = finishing = true;
          messages.push({ role: 'assistant', content: roundText }, { role: 'user', content: DIRECT_CONTINUE_NUDGE });
          continue;
        }
        if (cutOff) opts.onNotice('// REPLY CUT OFF — RAISE MAX TOKENS');
        if (finishing) {
          // The finishing round can't call tools: whatever it added is out; the reply is done.
          yield { event: 'run.completed', data: undefined };
          return;
        }
        // A text (deck spec §4): no tools were offered, so a stray call is ignored, never run.
        if (!tools && calls.length > 0) {
          yield { event: 'run.completed', data: undefined };
          return;
        }
        if (calls.length === 0) {
          if (finished && nudge()) continue;
          // Ended without a terminal frame: the stream was cut (the relay marks the reply lost).
          if (finished) yield { event: 'run.completed', data: undefined };
          return;
        }
        usedTools = true;
        messages.push({
          role: 'assistant',
          content: roundText || null,
          // Echo only valid JSON objects: strict providers refuse a garbled call on the next round.
          tool_calls: calls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: jsonObjectOr(c.args, '{}') } })),
        });
        const results = calls.map((c) => {
          const out = runToolCall(opts.tools, c);
          return out.startsWith('error: ') && spoke(written) ? `${out} — ${DIRECT_ALREADY_SHOWN}` : out;
        });
        calls.forEach((c, i) => messages.push({ role: 'tool', tool_call_id: c.id, content: results[i]! }));
        // She's spoken, and these calls only changed things (a note, her face, a light) and all worked: the reply is
        // done. Another round has nothing to answer, and GLM fills it by writing the whole reply again.
        const changesOnly = calls.every((c) => TOOLS.find((t) => t.name === c.name)?.readOnly === false);
        // Only an action so far (*The smile drops.*): she means to speak after the tools, so give her the round.
        if (spoke(roundText) && changesOnly && results.every((r) => !r.startsWith('error: '))) {
          // Unless she broke off ("hold on —", "let me…"): then one more round, no tools, to finish it.
          if (!brokeOff(roundText)) {
            yield { event: 'run.completed', data: undefined };
            return;
          }
          finishing = true;
          messages.push({ role: 'user', content: DIRECT_CONTINUE_NUDGE });
          continue;
        }
        if (round >= DIRECT_TOOL_ROUNDS) {
          if (nudge()) continue;
          yield { event: 'run.completed', data: undefined };
          return;
        }
      }
    },

    async probe(): Promise<LinkState> {
      if (probed && now() - probed.at < PROBE_CACHE_MS) return probed.state;
      let state: LinkState;
      if (opts.apiKey() === null) {
        credit = null;
        probed = { at: now(), state: 'no-link' };
        return 'no-link';
      }
      try {
        const res = await request('/key', { method: 'GET', signal: AbortSignal.timeout(opts.probeTimeoutMs ?? PROBE_TIMEOUT_MS) });
        if (res.status === 401) state = 'key-rejected';
        else if (res.status === 404) {
          state = 'ok';
          credit = null;
        } else if (res.ok) {
          const body = (await res.json().catch(() => ({}))) as { data?: { limit_remaining?: unknown } };
          const left = body.data?.limit_remaining;
          credit = typeof left === 'number' ? left : null;
          state = credit !== null && credit <= 0 ? 'no-credit' : 'ok';
        } else state = 'unreachable';
      } catch {
        state = 'unreachable';
      }
      probed = { at: now(), state };
      return state;
    },

    async currentModel() {
      return { model: opts.model.get(), provider: setup.provider };
    },

    credit: () => credit,
    ready: () => opts.apiKey() !== null,
    resetProbe() {
      probed = null;
    },
  };
}
