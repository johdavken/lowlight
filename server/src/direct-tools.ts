/** The room's tools for a direct character: definitions for the model, reassembly, in-process runs. */
import { appendFileSync } from 'node:fs';
import { z } from 'zod';
import { dispatchTool, NOT_HERS, toolsFor, type ToolContext } from './tools';

/** Tool rounds per turn before the turn ends with what she wrote. */
export const DIRECT_TOOL_ROUNDS = 4;

export interface ToolDefinition {
  type: 'function';
  function: { name: string; description: string; parameters: object };
}

/** One function definition per tool she is offered, its parameters from the tool's own zod schema. */
export function toolDefinitions(ctx: ToolContext): ToolDefinition[] {
  return toolsFor(ctx, { agent: true }).map((t) => {
    const { $schema: _drop, ...parameters } = z.toJSONSchema(t.args) as Record<string, unknown>;
    return { type: 'function', function: { name: t.name, description: t.description, parameters } };
  });
}

/** Joins streamed `delta.tool_calls` fragments (by index) into whole calls. */
export class ToolCallAssembler {
  private readonly byIndex = new Map<number, { id: string; name: string; args: string }>();

  add(fragments: unknown): void {
    if (!Array.isArray(fragments)) return;
    for (const f of fragments as { index?: unknown; id?: unknown; function?: { name?: unknown; arguments?: unknown } }[]) {
      const index = typeof f?.index === 'number' ? f.index : this.byIndex.size;
      const call = this.byIndex.get(index) ?? { id: '', name: '', args: '' };
      if (typeof f.id === 'string' && f.id) call.id = f.id;
      if (typeof f.function?.name === 'string') call.name += f.function.name;
      if (typeof f.function?.arguments === 'string') call.args += f.function.arguments;
      this.byIndex.set(index, call);
    }
  }

  calls(): { id: string; name: string; args: string }[] {
    return [...this.byIndex.entries()].sort(([a], [b]) => a - b).map(([i, c]) => ({ ...c, id: c.id || `call_${i}` }));
  }
}

/** Runs one call against the room; the text is what goes back to the model (errors included). */
export function runToolCall(ctx: ToolContext, call: { name: string; args: string }): string {
  const out = runCall(ctx, call);
  // `npm run chat-stress` sets NIX_TOOL_TRACE on its own server: every call, as a JSON line. Unset, nothing is written.
  const trace = process.env.NIX_TOOL_TRACE;
  if (trace) appendFileSync(trace, `${JSON.stringify({ at: Date.now(), self: ctx.self?.[0] ?? null, name: call.name, args: call.args, out })}\n`);
  return out;
}

function runCall(ctx: ToolContext, call: { name: string; args: string }): string {
  let args: unknown = {};
  if (call.args.trim() !== '') {
    try {
      args = JSON.parse(call.args);
    } catch {
      return `error: arguments for ${call.name} are not valid JSON`;
    }
  }
  if (typeof args !== 'object' || args === null || Array.isArray(args)) return `error: arguments for ${call.name} must be an object`;
  // Her bookkeeping is the Residual's (scribe spec §1), her face her actions': a call she makes anyway is an unknown tool to her.
  if (NOT_HERS.includes(call.name)) return `error: unknown tool '${call.name}'; available: ${toolsFor(ctx, { agent: true }).map((t) => t.name).join(', ')}`;
  const result = dispatchTool(ctx, call.name, args, 'agent');
  return result.ok ? result.text : `error: ${result.error}`;
}
