/**
 * ENCOUNTER (spec 2026-10-09 encounter cards §2): from ◆ DRAW in the room, three events her model
 * deals for this moment. Enter plays one (she reacts at once), R redraws, Esc cancels. The modal
 * itself is cards-panel.ts, which SUGGEST shares.
 */
import type { Encounter, EncounterKind } from '../../../shared/encounter';
import { NarratorFailure } from '../net/scenario';
import { her } from './her-copy';
import { CardsPanel, el } from './cards-panel';

export const ENCOUNTER_COPY = {
  title: 'ENCOUNTER',
  loading: '// DEALING THREE EVENTS…',
  failed: (why: string) => `// COULDN'T DEAL EVENTS — ${why}`,
  redraw: '↻ REDRAW',
  cancel: '[ESC] CANCEL',
  hints: '[▲▼] CHOOSE · [ENTER] PLAY · [R] REDRAW · [ESC] CANCEL',
  foot: "Written from: the room's lore and art, the time and weather, both public files, who else is here, and the last 8 lines.",
  noKey: 'Link a key at select to have events dealt.',
} as const;

/** Each kind's word beside a card's title. */
export const KIND_WORD: Record<EncounterKind, string> = { stranger: 'STRANGER', city: 'THE CITY', personal: 'PERSONAL' };
/** Each kind's picture (art/cards/sheet-04.png, cut like the table cards); STRANGER shows the stranger's face instead. */
export const KIND_ART: Partial<Record<EncounterKind, string>> = { city: '/draw/city.webp', personal: '/draw/personal.webp' };

/** The picture down an event's card: the stranger's face, else its kind's art. */
export function encounterArt(e: Encounter): string | undefined {
  if (e.stranger?.face) return `/api/extras/${e.stranger.face}`;
  return e.kind ? KIND_ART[e.kind] : undefined;
}

/** The header's who's-here part: `SILAS IS HERE`, `HAE, SILAS ARE HERE`; null with no one else here. */
export function hereLine(names: string[]): string | null {
  if (names.length === 0) return null;
  return `${names.map((n) => n.toUpperCase()).join(', ')} ${names.length === 1 ? 'IS' : 'ARE'} HERE`;
}

/** A refusal shown as it is (no key, busy), not as // COULDN'T DEAL EVENTS. */
export class EncounterNotice extends Error {}

export interface EncounterPanelOptions {
  /** "<YOU> × <HER> · <ROOM> · <TIME> · <WEATHER>[ · <OTHERS> IS|ARE HERE]" */
  header: string;
  /** Her model's label, at the header's right. */
  model?: string;
  /** A set already dealt (and not yet played past): shown without a call. */
  cached: Encounter[] | null;
  /** Deals three; rejects with an Error (or an EncounterNotice). */
  load(): Promise<Encounter[]>;
  onPlay(e: Encounter): void;
  onCancel(): void;
  /** A fresh set, for the room to keep until a new turn lands. */
  onCache(e: Encounter[]): void;
}

/** DRAW's events on the three-card modal (cards-panel.ts). */
export class EncounterPanel {
  private readonly panel: CardsPanel<Encounter>;

  constructor(host: HTMLElement, o: EncounterPanelOptions) {
    this.panel = new CardsPanel<Encounter>(host, {
      copy: ENCOUNTER_COPY,
      header: o.header,
      ...(o.model ? { model: o.model } : {}),
      cached: o.cached,
      load: o.load,
      card: (e) => {
        const art = encounterArt(e);
        const look = { ...(e.kind ? { sub: KIND_WORD[e.kind] } : {}), ...(art ? { art } : {}) };
        if (!e.stranger) return { title: e.title, text: e.text, ...look };
        const who = el('span', 'ep-who', `+ ${e.stranger.name.toUpperCase()}`);
        who.append(el('em', 'ep-voice', e.stranger.voice));
        return { title: e.title, text: e.text, extra: who, ...look };
      },
      failed: (err) => {
        if (err instanceof EncounterNotice) return err.message;
        // The raw reason is for whoever's debugging, never on screen (spec 2026-10-14 §1).
        console.warn('[narrator] events:', err instanceof Error ? err.message : String(err));
        // Plain words for the player (spec 2026-10-14 §4).
        return ENCOUNTER_COPY.failed(her().encounters.failedWhy(err instanceof NarratorFailure ? err.kind : 'unknown'));
      },
      onPlay: o.onPlay,
      onCancel: o.onCancel,
      onCache: o.onCache,
    });
  }

  get el(): HTMLElement {
    return this.panel.el;
  }

  key(e: KeyboardEvent): boolean {
    return this.panel.key(e);
  }

  showRefusal(text: string): void {
    this.panel.showRefusal(text);
  }

  destroy(): void {
    this.panel.destroy();
  }
}
