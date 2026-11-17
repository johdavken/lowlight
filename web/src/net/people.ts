/** The people library's routes (character creator spec 2026-11-14), as the 1P creator calls them. */
import type { FigureFields } from '../../../shared/figure-prompt';
import type { PersonRow, PersonWho } from '../../../shared/person';

export interface PeopleApi {
  draft(): Promise<{ id: string }>;
  save(id: string, who: PersonWho): Promise<PersonRow>;
  generate(id: string, fields: FigureFields): Promise<{ take: string; cost: number | null }>;
  takes(id: string): Promise<{ takes: { take: string; made: number }[]; busy: boolean }>;
  keep(id: string, fit: { take: string; face: { x: number; y: number }; waist: number; fields: FigureFields }): Promise<PersonRow>;
  dropTakes(id: string): Promise<void>;
  remove(id: string): Promise<void>;
  takeUrl(id: string, take: string, raw?: boolean): string;
  figureUrl(id: string, made: string): string;
}

/** A refusal from the server: its `error` code and, for a failed take, OpenRouter's reason. */
export class PeopleError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** What each refusal means, in the creator's words. */
const READABLE: Record<string, string> = {
  busy: 'A take is already on its way for them: wait for it.',
  'no-key': 'No OpenRouter key is linked: link one at the model step to make a figure.',
  'bad-who': 'WHO needs a name, on one line, and nothing over the limits.',
  'no-wears': 'WEARS: say what they have on.',
  'bad-fit': 'Put the face box and the waist line on the picture first.',
  'no-take': 'That take is gone. Pick another, or make a new one.',
  'no-person': 'They are no longer in your people.',
  'no-palette': "The game can't find the cast palette, so it made no take (nothing was charged).",
  'no-stand-in': "The game can't find the stand-in's figure, so it made no take (nothing was charged).",
};

const person = (id: string) => `/api/people/${encodeURIComponent(id)}`;

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, { method, ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) });
  const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  const code = json.error ?? `http-${res.status}`;
  if (!res.ok) throw new PeopleError(code, json.message ?? READABLE[code] ?? `The game answered ${res.status} (${code}).`);
  return json as T;
}

export const peopleApi: PeopleApi = {
  draft: () => call('POST', '/api/people'),
  save: (id, who) => call('PUT', person(id), who),
  generate: (id, fields) => call('POST', `${person(id)}/generate`, { fields }),
  takes: (id) => call('GET', `${person(id)}/takes`),
  keep: (id, fit) => call('POST', `${person(id)}/keep`, fit),
  dropTakes: async (id) => void (await call('DELETE', `${person(id)}/takes`)),
  remove: async (id) => void (await call('DELETE', person(id))),
  takeUrl: (id, take, raw = false) => `${person(id)}/take/${encodeURIComponent(take)}${raw ? '?raw=1' : ''}`,
  figureUrl: (id, made) => `${person(id)}/figure.png?v=${encodeURIComponent(made)}`,
};
