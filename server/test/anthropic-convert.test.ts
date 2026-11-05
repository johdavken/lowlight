import { describe, expect, it } from 'vitest';
import { ANTHROPIC_OPENER, ANTHROPIC_THINKING_ROOM, toAnthropicRequest, type ChatBody } from '../src/anthropic-convert';
import type { ToolDefinition } from '../src/direct-tools';

const SONNET = 'claude-sonnet-5-5';
const tool: ToolDefinition = { type: 'function', function: { name: 'set_expression', description: 'Her face.', parameters: { type: 'object', properties: { name: { type: 'string' } } } } };
const tool2: ToolDefinition = { type: 'function', function: { name: 'go_to', description: 'Walk.', parameters: { type: 'object' } } };
const body = (o: Partial<ChatBody> = {}): ChatBody => ({
  max_tokens: 1500,
  effort: 'low',
  messages: [
    { role: 'system', content: 'You are Nix.' },
    { role: 'user', content: 'hey' },
  ],
  ...o,
});

describe('toAnthropicRequest', () => {
  it('system becomes one cached block, with automatic caching on the rest', () => {
    const r = toAnthropicRequest(body(), SONNET);
    expect(r.system).toEqual([{ type: 'text', text: 'You are Nix.', cache_control: { type: 'ephemeral' } }]);
    expect(r.cache_control).toEqual({ type: 'ephemeral' });
    expect(r.messages).toEqual([{ role: 'user', content: [{ type: 'text', text: 'hey' }] }]);
  });

  it('no temperature; effort and the thinking room', () => {
    const r = toAnthropicRequest(body({ effort: 'medium' }), SONNET) as unknown as Record<string, unknown>;
    expect('temperature' in r).toBe(false);
    expect(r.output_config).toEqual({ effort: 'medium' });
    expect(r.max_tokens).toBe(1500 + ANTHROPIC_THINKING_ROOM);
    expect(r.model).toBe(SONNET);
  });

  it('tools in order, tool_choice none', () => {
    const r = toAnthropicRequest(body({ tools: [tool, tool2], tool_choice: 'none' }), SONNET);
    expect(r.tools).toEqual([
      { name: 'set_expression', description: 'Her face.', input_schema: tool.function.parameters },
      { name: 'go_to', description: 'Walk.', input_schema: { type: 'object' } },
    ]);
    expect(r.tool_choice).toEqual({ type: 'none' });
    expect('tools' in toAnthropicRequest(body(), SONNET)).toBe(false);
  });

  it('tool calls and their results; one user message for a round, the nudge after', () => {
    const r = toAnthropicRequest(
      body({
        messages: [
          { role: 'system', content: 'S' },
          { role: 'user', content: 'hey' },
          { role: 'assistant', content: 'hi', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'set_expression', arguments: '{"name":"smile"}' } }, { id: 'c2', type: 'function', function: { name: 'go_to', arguments: 'not json' } }] },
          { role: 'tool', tool_call_id: 'c1', content: 'ok' },
          { role: 'tool', tool_call_id: 'c2', content: 'error: nope' },
          { role: 'user', content: '(speak)' },
        ],
      }),
      SONNET,
    );
    expect(r.messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'hey' }] },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'hi' },
          { type: 'tool_use', id: 'c1', name: 'set_expression', input: { name: 'smile' } },
          { type: 'tool_use', id: 'c2', name: 'go_to', input: {}, cache_control: { type: 'ephemeral' } },
        ],
      },
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'c1', content: 'ok' },
          { type: 'tool_result', tool_use_id: 'c2', content: 'error: nope' },
          { type: 'text', text: '(speak)' },
        ],
      },
    ]);
  });

  it('her thinking goes first in the assistant turn that called the tools', () => {
    const thinking = [{ type: 'thinking', thinking: 'hm', signature: 'sig' }];
    const r = toAnthropicRequest(
      body({
        messages: [
          { role: 'system', content: 'S' },
          { role: 'user', content: 'hey' },
          { role: 'assistant', content: 'hi', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'go_to', arguments: '{}' } }], thinking },
          { role: 'tool', tool_call_id: 'c1', content: 'ok' },
        ],
      }),
      SONNET,
    );
    expect((r.messages[1]!.content as { type: string }[]).map((b) => b.type)).toEqual(['thinking', 'text', 'tool_use']);
  });

  it('whitespace-only text is never sent', () => {
    const r = toAnthropicRequest(
      body({ messages: [{ role: 'system', content: 'S' }, { role: 'user', content: 'a' }, { role: 'assistant', content: '\n\n', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'go_to', arguments: '{}' } }] }, { role: 'tool', tool_call_id: 'c1', content: 'ok' }] }),
      SONNET,
    );
    expect(r.messages[1]).toEqual({ role: 'assistant', content: [{ type: 'tool_use', id: 'c1', name: 'go_to', input: {}, cache_control: { type: 'ephemeral' } }] });
  });

  it('her line first: a fixed opener goes before it', () => {
    const r = toAnthropicRequest(body({ messages: [{ role: 'system', content: 'S' }, { role: 'assistant', content: '*waves*' }, { role: 'user', content: 'hey' }] }), SONNET);
    expect(r.messages[0]).toEqual({ role: 'user', content: [{ type: 'text', text: ANTHROPIC_OPENER }] });
    expect(r.messages[1]).toEqual({ role: 'assistant', content: [{ type: 'text', text: '*waves*', cache_control: { type: 'ephemeral' } }] });
  });

  it('empty text is never sent; an empty message is dropped', () => {
    const r = toAnthropicRequest(
      body({
        messages: [
          { role: 'system', content: 'S' },
          { role: 'user', content: 'a' },
          { role: 'assistant', content: '' },
          { role: 'user', content: 'b' },
          { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'go_to', arguments: '{}' } }] },
          { role: 'tool', tool_call_id: 'c1', content: 'ok' },
        ],
      }),
      SONNET,
    );
    expect(r.messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] },
      { role: 'assistant', content: [{ type: 'tool_use', id: 'c1', name: 'go_to', input: {}, cache_control: { type: 'ephemeral' } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'c1', content: 'ok' }] },
    ]);
  });

  it('the refusal fallback only on the models that take it', () => {
    const on = toAnthropicRequest(body(), SONNET);
    expect(on.betas).toEqual(['server-side-fallback-2026-07-01']);
    expect(on.fallbacks).toBe('default');
    const off = toAnthropicRequest(body(), 'claude-haiku-5-5') as unknown as Record<string, unknown>;
    expect('betas' in off || 'fallbacks' in off).toBe(false);
  });

  it('effort goes only to the models that take it (final review I2)', () => {
    const effort = (native: string) => (toAnthropicRequest(body(), native) as unknown as Record<string, unknown>).output_config;
    for (const m of ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5', 'claude-fable-5-1', 'claude-sonnet-5', 'claude-opus-4-8', 'claude-sonnet-4-6', 'claude-opus-4-5']) expect(effort(m)).toEqual({ effort: 'low' });
    for (const m of ['claude-haiku-4-5', 'claude-sonnet-4-5', 'claude-3-7-sonnet-20250219', 'claude-sonnet-4']) expect(effort(m)).toBeUndefined();
  });

  it('a cache point on her last reply: the history before the new line is read back next turn (live check)', () => {
    const r = toAnthropicRequest(
      body({ messages: [{ role: 'system', content: 'S' }, { role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }, { role: 'user', content: '[lore] x\n\nc' }] }),
      SONNET,
    );
    expect(r.messages[1]).toEqual({ role: 'assistant', content: [{ type: 'text', text: 'b', cache_control: { type: 'ephemeral' } }] });
    expect(JSON.stringify(r.messages[2])).not.toContain('cache_control');
  });

  it('no assistant turn yet: no extra cache point', () => {
    const r = toAnthropicRequest(body(), SONNET);
    expect(JSON.stringify(r.messages)).not.toContain('cache_control');
  });

  it('the same input gives the same request (a stable cached prefix)', () => {
    const b = body({ tools: [tool, tool2] });
    expect(toAnthropicRequest(b, SONNET)).toEqual(toAnthropicRequest(structuredClone(b), SONNET));
  });
});
