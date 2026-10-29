import fs from 'node:fs';
import { z } from 'zod';
import type { Fact, Face } from '../../shared/types';
import type { Character } from './character';
import { characterFile } from './character';

/** The select-screen dossier fields resolved from a character (and its base, via `extends`). */
export interface CharacterProfile {
  tagline: string;
  bio: string[];
  facts: Fact[];
  face: Face;
}

/** A character file plus the folder it lives in, for resolving its relative paths (e.g. `bio`). */
export interface ProfileSource {
  dir: string;
  c: Character;
}

export const DEFAULT_FACE: Face = { x: 0.5, y: 0.08 };
export const BIO_MAX = 2000;

const unit = () => z.number().min(0).max(1);
const faceSchema = z.object({ x: unit(), y: unit() });

/**
 * A bio file's text into paragraphs: blank lines split, single newlines inside a paragraph
 * become spaces, each paragraph is trimmed, empty paragraphs are dropped.
 */
export function splitBio(text: string): string[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const paras: string[] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (line.trim() === '') {
      if (current.length) {
        paras.push(current.join(' ').trim());
        current = [];
      }
    } else {
      current.push(line.trim());
    }
  }
  if (current.length) paras.push(current.join(' ').trim());
  return paras.filter((p) => p.length > 0);
}

/** Keeps whole paragraphs (joined by `\n\n`) within `max` characters; drops the rest. */
export function capBio(paras: string[], max: number = BIO_MAX): { paras: string[]; cut: boolean } {
  const kept: string[] = [];
  for (const p of paras) {
    const candidate = [...kept, p].join('\n\n');
    if (candidate.length > max) break;
    kept.push(p);
  }
  return { paras: kept, cut: kept.length < paras.length };
}

const SENTENCE_END_RE = /^.*?[.!?](?=\s|$)/;

/** Text up to the first `.`, `!` or `?` followed by whitespace or end; capped at a word boundary. */
export function firstSentence(text: string, max = 80): string {
  const trimmed = text.trim();
  const match = trimmed.match(SENTENCE_END_RE);
  let candidate = match ? match[0] : trimmed;
  if (candidate.length > max) {
    candidate = candidate.slice(0, max);
    const lastSpace = candidate.lastIndexOf(' ');
    if (lastSpace > 0) candidate = candidate.slice(0, lastSpace);
  }
  return candidate;
}

/** The first source (own, then base) whose field is set, with the source it came from. */
function findSource<T>(sources: ProfileSource[], getter: (c: Character) => T | undefined): { source: ProfileSource; raw: T } | undefined {
  for (const source of sources) {
    const raw = getter(source.c);
    if (raw !== undefined) return { source, raw };
  }
  return undefined;
}

function resolveTagline(sources: ProfileSource[], description: string, warn: (msg: string) => void): string {
  const fallback = firstSentence(description, 80);
  const found = findSource(sources, (c) => c.tagline);
  if (!found) return fallback;
  const raw = found.raw;
  if (typeof raw === 'string' && raw.length >= 1 && raw.length <= 80 && !/[\r\n]/.test(raw)) return raw;
  warn('tagline: must be 1–80 characters on one line; using the default');
  return fallback;
}

function resolveBio(sources: ProfileSource[], description: string, warn: (msg: string) => void): string[] {
  const fallback = description ? [description] : [];
  const found = findSource(sources, (c) => c.bio);
  if (!found) return fallback;
  const raw = found.raw;
  if (typeof raw !== 'string') {
    warn('bio: must be a file name; using the description');
    return fallback;
  }
  const file = characterFile(found.source.dir, raw);
  if (!file) {
    warn(`bio: file '${raw}' is missing or outside the folder; using the description`);
    return fallback;
  }
  let text: string;
  try {
    if (!fs.statSync(file).isFile()) throw new Error('not a regular file');
    text = fs.readFileSync(file, 'utf8');
  } catch {
    warn(`bio: file '${raw}' can't be read; using the description`);
    return fallback;
  }
  const paras = splitBio(text);
  if (paras.length === 0) return fallback;
  const { paras: capped, cut } = capBio(paras, BIO_MAX);
  if (cut) warn(`bio: longer than ${BIO_MAX} characters; cut at the last whole paragraph`);
  return capped;
}

function isValidFact(item: unknown): item is Fact {
  if (typeof item !== 'object' || item === null) return false;
  const { label, value } = item as Record<string, unknown>;
  return typeof label === 'string' && label.length >= 1 && label.length <= 16 && typeof value === 'string' && value.length >= 1 && value.length <= 60;
}

function resolveFacts(sources: ProfileSource[], warn: (msg: string) => void): Fact[] {
  const found = findSource(sources, (c) => c.facts);
  if (!found) return [];
  const raw = found.raw;
  if (!Array.isArray(raw)) {
    warn('facts: must be an array; using the default');
    return [];
  }
  const valid = raw.filter(isValidFact);
  const result = valid.slice(0, 6);
  if (valid.length !== raw.length || valid.length > 6) {
    warn(`facts: contains an invalid entry or too many entries; keeping the first ${result.length} valid ones`);
  }
  return result;
}

function resolveFace(sources: ProfileSource[], warn: (msg: string) => void): Face {
  const found = findSource(sources, (c) => c.face);
  if (!found) return DEFAULT_FACE;
  const parsed = faceSchema.safeParse(found.raw);
  if (!parsed.success) {
    warn('face: must be {x, y} with 0 ≤ x, y ≤ 1; using the default');
    return DEFAULT_FACE;
  }
  return parsed.data;
}

/**
 * The select-screen profile for a character, from its own file (`sources[0]`) and, for each field
 * it doesn't set, its base's (`sources[1]`, when it `extends` one). A field present but invalid
 * warns once and falls back to its §3 default — it does not fall through to the base.
 */
export function resolveProfile(sources: ProfileSource[], description: string, warn: (msg: string) => void): CharacterProfile {
  return {
    tagline: resolveTagline(sources, description, warn),
    bio: resolveBio(sources, description, warn),
    facts: resolveFacts(sources, warn),
    face: resolveFace(sources, warn),
  };
}
