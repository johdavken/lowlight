/** The playthrough and save routes (spec 2026-10-07 §4), one function per route. */
import type { AroundEntry, ContactEntry, LeadView, Location, LooseEndsView, PlaythroughInfo, SaveInfo } from '../../../shared/types';
import type { PlaythroughPersona } from '../../../shared/persona';

/** A route answered with an error: its HTTP status, the body's `error`, and (for `busy`) the contact whose turn is streaming. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly error: string,
    readonly contact?: string,
  ) {
    super(contact ? `${error} (${contact})` : error);
    this.name = 'ApiError';
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const b = (await res.json().catch(() => ({}))) as { error?: unknown; contact?: unknown };
    throw new ApiError(res.status, typeof b.error === 'string' ? b.error : `HTTP ${res.status}`, typeof b.contact === 'string' ? b.contact : undefined);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

const pt = (id: string) => `/api/playthroughs/${encodeURIComponent(id)}`;
const save = (id: string) => `/api/saves/${encodeURIComponent(id)}`;

/** A listed playthrough: its info plus how many contacts its player knows (null when the server couldn't read them). */
/** `sprite`: whether the player has one (absent from an older server: ask anyway). */
export type PlaythroughListing = PlaythroughInfo & { contacts: number | null; sprite?: boolean };
export const listPlaythroughs = () => call<{ active: string | null; playthroughs: PlaythroughListing[] }>('GET', '/api/playthroughs');
/** A new game as `player`; `persona` (EDIT / CUSTOM at the YOU step) is who you are on them. */
export const createPlaythrough = (player: string, startContact: string, persona?: PlaythroughPersona) =>
  call<PlaythroughInfo>('POST', '/api/playthroughs', { player, startContact, ...(persona ? { persona } : {}) });
export const activate = (id: string) => call<PlaythroughInfo>('POST', `${pt(id)}/activate`);
export const rename = (id: string, name: string) => call<PlaythroughInfo>('PATCH', pt(id), { name });
export const removePlaythrough = (id: string) => call<void>('DELETE', pt(id));
export const listSaves = (id: string) => call<SaveInfo[]>('GET', `${pt(id)}/saves`);
/** A manual save; from a contact's room (`contactId`), it's at her room and the playthrough moves there. */
export const saveNow = (id: string, name: string, contactId?: string) =>
  call<SaveInfo>('POST', `${pt(id)}/saves`, contactId === undefined ? { name } : { name, contactId });
/** Forks the save into a new playthrough, now active. */
export const loadSave = (saveId: string) => call<PlaythroughInfo>('POST', `${save(saveId)}/load`);
export const removeSave = (saveId: string) => call<void>('DELETE', save(saveId));
/** BRANCH HERE: the story from this line of `contactId`'s chat, as a new playthrough, now active. */
export const branchFrom = (contactId: string, messageId: string) => call<PlaythroughInfo>('POST', '/api/branch', { contactId, messageId });
/** The contacts the player knows in the active playthrough (§7). */
export const contacts = () => call<ContactEntry[]>('GET', '/api/playthroughs/active/contacts');
export const leads = () => call<LeadView[]>('GET', '/api/playthroughs/active/leads');
export const looseEnds = () => call<LooseEndsView>('GET', '/api/playthroughs/active/loose-ends');
/** WALK OUT: the active playthrough goes solo (between scenes, with no one). */
export const goSolo = () => call<PlaythroughInfo>('POST', '/api/playthroughs/active/solo');
/** The active playthrough's story clock. */
export const clock = () => call<{ clock: number }>('GET', '/api/playthroughs/active/clock');
/** WAIT (between scenes): the clock moves on by `minutes`, or to the next `until` (HH:MM). */
export const wait = (b: { minutes: number } | { until: string }) => call<{ clock: number }>('POST', '/api/playthroughs/active/wait', b);
/** AROUND LOWLIGHT: who the player hasn't met yet, by place. */
export const around = () => call<AroundEntry[]>('GET', '/api/playthroughs/active/around');
export const setLocation = (contactId: string) => call<Location>('POST', '/api/playthroughs/active/location', { contactId });
/** The YOU sheet's wardrobe: what the player wears in the active playthrough (null: the plain sprite). */
export const setOutfit = (outfit: string | null) => call<{ outfit?: string }>('POST', '/api/persona/outfit', { outfit });
/** The active playthrough's persona (`/api/persona` resolves to its player), or null without one. */
export const persona = () => call<{ persona: { id: string; name: string } | null }>('GET', '/api/persona').then((b) => b.persona);

/** This module's routes, as the title and load screens take them (tests pass fakes). */
export type PlaythroughApi = Omit<typeof import('./playthroughs'), 'ApiError'>;
