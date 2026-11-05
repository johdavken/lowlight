/**
 * Our chat-completions wire shape to Anthropic's Messages API and back (Anthropic backend spec §3–4). Pure:
 * the SDK calls are in anthropic.ts. The same input always gives the same request, so the cached prefix holds.
 */
import type {
  BetaContentBlockParam,
  BetaMessageParam,
  BetaRawMessageStreamEvent,
  BetaToolResultBlockParam,
  MessageCreateParamsNonStreaming,
} from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type { ToolDefinition } from './direct-tools';
import type { WireMessage } from './direct';

/** Her thinking counts toward max_tokens and can't be turned off on the current Claude models: room on top of the cap. */
export const ANTHROPIC_THINKING_ROOM = 2000;
/** Anthropic needs a user turn first; a history that opens with her line gets this before it (fixed, for the cache). */
export const ANTHROPIC_OPENER = '(The scene opens.)';
/** The models that take the server-side refusal fallback. */
export const FALLBACK_MODELS: ReadonlySet<string> = new Set(['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5']);
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

/**
 * Whether a model takes `output_config.effort`: Claude 4.6 and later, and Opus 4.5. Older ones (Sonnet/Haiku 4.5,
 * Claude 3) answer it with a 400, so they get none.
 */
export function takesEffort(native: string): boolean {
  const m = /^claude-([a-z]+)-(\d+)(?:-(\d))?(?:-\d{8})?$/.exec(native);
  if (!m) return false;
  const v = Number(m[2]) + Number(m[3] ?? 0) / 10;
  return v >= 4.6 || (m[1] === 'opus' && v >= 4.5);
}

/** One round's request, provider-neutral. */
export interface ChatBody {
  max_tokens: number;
  messages: WireMessage[];
  tools?: ToolDefinition[];
  tool_choice?: 'none';
  effort: 'low' | 'medium';
}

/** `text` parsed when it's a JSON object, else {}. */
function objectOf(text: string): Record<string, unknown> {
  try {
    const v = JSON.parse(text) as unknown;
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

// Anthropic refuses empty and whitespace-only text blocks.
const text = (t: string | null | undefined): BetaContentBlockParam[] => (t?.trim() ? [{ type: 'text', text: t }] : []);

export function toAnthropicRequest(body: ChatBody, native: string): MessageCreateParamsNonStreaming {
  const system = body.messages.filter((m) => m.role === 'system').map((m) => m.content as string).join('\n\n');
  const out: BetaMessageParam[] = [];
  // Consecutive turns of one role join (tool results and the nudge after them are one user turn).
  const push = (role: 'user' | 'assistant', content: BetaContentBlockParam[]) => {
    if (content.length === 0) return;
    const last = out.at(-1);
    if (last && last.role === role) (last.content as BetaContentBlockParam[]).push(...content);
    else out.push({ role, content: [...content] });
  };
  for (const m of body.messages) {
    if (m.role === 'system') continue;
    if (m.role === 'tool') {
      const result: BetaToolResultBlockParam = { type: 'tool_result', tool_use_id: m.tool_call_id, content: m.content };
      push('user', [result]);
    } else if (m.role === 'assistant' && 'tool_calls' in m) {
      const calls = (m.tool_calls as { id: string; function: { name: string; arguments: string } }[]).map(
        (c): BetaContentBlockParam => ({ type: 'tool_use', id: c.id, name: c.function.name, input: objectOf(c.function.arguments) }),
      );
      // Her thinking from that round goes back first, unchanged: Anthropic needs it beside her tool calls.
      push('assistant', [...((m.thinking ?? []) as BetaContentBlockParam[]), ...text(m.content), ...calls]);
    } else push(m.role, text(m.content));
  }
  if (out[0]?.role === 'assistant') out.unshift({ role: 'user', content: text(ANTHROPIC_OPENER) });
  // A cache point on her last reply: per-turn lines ride on the newest user line and change once it's history,
  // so the automatic point at the end never repeats; everything up to her last reply does (live check 2026-10-31).
  const lastReply = out.findLast((m) => m.role === 'assistant');
  const lastBlock = (lastReply?.content as BetaContentBlockParam[] | undefined)?.at(-1);
  if (lastBlock && lastBlock.type !== 'thinking' && lastBlock.type !== 'redacted_thinking') (lastBlock as { cache_control?: unknown }).cache_control = { type: 'ephemeral' };

  return {
    model: native,
    max_tokens: body.max_tokens + ANTHROPIC_THINKING_ROOM,
    ...(system ? { system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }] } : {}),
    cache_control: { type: 'ephemeral' },
    messages: out,
    ...(body.tools ? { tools: body.tools.map((t) => ({ name: t.function.name, description: t.function.description, input_schema: t.function.parameters as { type: 'object' } })) } : {}),
    ...(body.tool_choice === 'none' ? { tool_choice: { type: 'none' } } : {}),
    ...(takesEffort(native) ? { output_config: { effort: body.effort } } : {}),
    ...(FALLBACK_MODELS.has(native) ? { betas: [FALLBACK_BETA], fallbacks: 'default' as const } : {}),
  };
}

/** One chat-completions stream chunk, as the direct turn loop reads it from OpenRouter. */
export type ChunkData = {
  error?: unknown;
  choices?: { delta?: { content?: string; tool_calls?: unknown[] }; finish_reason?: string | null }[];
  /** Anthropic only: a whole thinking block, to send back with that round's tool calls. */
  blocks?: unknown[];
};

/** What one Anthropic call cost, cache included (logged, spec §4); `model` is the one that answered (a fallback shows here). */
export interface AnthropicUsage {
  model: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

const FINISH: Record<string, string> = { end_turn: 'stop', stop_sequence: 'stop', tool_use: 'tool_calls', max_tokens: 'length', pause_turn: 'stop' };

/**
 * Anthropic's stream events as chat chunks: text deltas, tool calls as index-keyed fragments (the turn loop's
 * ToolCallAssembler joins them), a finish reason at the end. Thinking yields `{}`: nothing to show, but a sign of life.
 */
export async function* toChunks(events: AsyncIterable<BetaRawMessageStreamEvent>, onUsage?: (u: AnthropicUsage) => void): AsyncGenerator<ChunkData> {
  const u: AnthropicUsage = { model: '', input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  // Thinking blocks being streamed, by index: given back whole when each one stops.
  const thinking = new Map<number, { type: 'thinking'; thinking: string; signature: string } | { type: 'redacted_thinking'; data: string }>();
  for await (const e of events) {
    switch (e.type) {
      case 'message_start': {
        const s = e.message.usage;
        Object.assign(u, { model: e.message.model, input: s.input_tokens ?? 0, output: s.output_tokens ?? 0, cacheRead: s.cache_read_input_tokens ?? 0, cacheWrite: s.cache_creation_input_tokens ?? 0 });
        yield {};
        break;
      }
      case 'content_block_start':
        if (e.content_block.type === 'tool_use') yield { choices: [{ delta: { tool_calls: [{ index: e.index, id: e.content_block.id, function: { name: e.content_block.name, arguments: '' } }] } }] };
        else {
          if (e.content_block.type === 'thinking') thinking.set(e.index, { type: 'thinking', thinking: e.content_block.thinking ?? '', signature: e.content_block.signature ?? '' });
          else if (e.content_block.type === 'redacted_thinking') thinking.set(e.index, { type: 'redacted_thinking', data: e.content_block.data });
          yield {};
        }
        break;
      case 'content_block_delta':
        if (e.delta.type === 'text_delta') yield { choices: [{ delta: { content: e.delta.text } }] };
        else if (e.delta.type === 'input_json_delta') yield { choices: [{ delta: { tool_calls: [{ index: e.index, function: { arguments: e.delta.partial_json } }] } }] };
        else {
          const t = thinking.get(e.index);
          if (t?.type === 'thinking' && e.delta.type === 'thinking_delta') t.thinking += e.delta.thinking;
          else if (t?.type === 'thinking' && e.delta.type === 'signature_delta') t.signature += e.delta.signature;
          yield {};
        }
        break;
      case 'message_delta': {
        const d = e.usage;
        if (d) Object.assign(u, { output: d.output_tokens ?? u.output, cacheRead: d.cache_read_input_tokens ?? u.cacheRead, cacheWrite: d.cache_creation_input_tokens ?? u.cacheWrite });
        onUsage?.({ ...u });
        const reason = e.delta.stop_reason;
        if (reason === 'refusal') yield { error: { message: 'refused' } };
        else if (reason) yield { choices: [{ delta: {}, finish_reason: FINISH[reason] ?? 'stop' }] };
        break;
      }
      case 'content_block_stop': {
        const t = thinking.get(e.index);
        thinking.delete(e.index);
        yield t ? { blocks: [t] } : {};
        break;
      }
      case 'message_stop':
        break;
      default:
        yield {};
    }
  }
}
