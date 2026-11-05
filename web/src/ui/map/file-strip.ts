/** The focused place's file, on a slanted strip at the map's right edge: its readout, who's there, then GIGS. GO rides on the pin's tag (buildGo). */
import { her } from '../../room/her-copy';
import type { District, Place } from '../../../../shared/map-schema';
import type { SideRoom } from '../../../../shared/exits';
import type { MapPerson, WhoIsWhere } from './city-map';
import { el } from './band';

const ROLE: Record<MapPerson['role'], string> = { you: 'YOU', contact: 'CONTACT', fixed: 'FIXED' };

export interface FileStripOpts {
  place: Place;
  district: District;
  who: WhoIsWhere;
  /** GIGS: run a job from a gig place. Without it, no GIGS. */
  onGigs?: (place: Place, district: District) => void;
}

export function buildFileStrip(o: FileStripOpts): HTMLElement {
  const strip = el('div', 'map-strip');
  strip.addEventListener('click', (e) => e.stopPropagation());
  const body = el('div', 'body');
  body.append(el('div', 't', o.place.name.toUpperCase()), el('div', 's', o.district.name.toUpperCase()));
  // Its dossier lines (world/readouts/<id>.md): a label, then the line.
  if (o.place.readout?.length) {
    const dl = el('dl', 'readout');
    for (const r of o.place.readout) dl.append(el('dt', '', r.label), el('dd', '', r.text));
    body.append(dl);
  }
  const names = new Map<string, string>();
  const walk = (rooms: SideRoom[]): void => rooms.forEach((r) => (names.set(r.room, r.name), walk(r.inside)));
  walk(o.who.inside?.[o.place.id] ?? []);
  body.append(peopleList(o.who.people.filter((m) => m.place === o.place.id), names));
  const acts = el('div', 'acts');
  if (o.onGigs && o.place.gigs) acts.append(gigsControl(o.place, o.district, o.who, o.onGigs));
  if (acts.childElementCount) body.append(acts);
  strip.append(body);
  return strip;
}

/** Who's here; someone in one of the pin's side rooms says which. */
function peopleList(people: MapPerson[], sideNames: ReadonlyMap<string, string>): HTMLElement {
  const w = el('div', 'who');
  if (!people.length) {
    w.append(el('span', 'none', 'nobody here'));
    return w;
  }
  for (const m of people) {
    const chip = el('span', 'chip');
    chip.style.setProperty('--c', m.accent);
    const mono = el('span', 'mono', m.name.slice(0, 1).toUpperCase());
    if (m.face) {
      const img = el('img', 'face');
      img.alt = '';
      img.src = m.face;
      img.addEventListener('error', () => img.replaceWith(mono));
      chip.append(img);
    } else chip.append(mono);
    const inRoom = m.room ? sideNames.get(m.room) : undefined;
    chip.append(el('b', '', m.name.toUpperCase()), el('span', 'tag', `· ${ROLE[m.role]}${inRoom ? ` · IN ${inRoom.toUpperCase()}` : ''}`));
    w.append(chip);
  }
  return w;
}

/** Why GO can't go there, or null when it can. */
export function goBlocked(p: Place, who: WhoIsWhere): string | null {
  if (who.here === p.id && !who.away) return "you're here";
  if (!p.scene) return 'no room yet';
  if (who.busy) return her().waitFor;
  return null;
}

/** GO on the picked pin's tag (mockup 2026-11-02, B): slanted chips just past the name. */
export function buildGo(p: Place, who: WhoIsWhere, onTravel: (placeId: string, comms?: boolean) => void): HTMLElement {
  const box = el('span', 'map-go');
  box.addEventListener('click', (e) => e.stopPropagation());
  box.append(travelControl(p, who, onTravel));
  return box;
}

/** GO, or a lock for a place only she can bring you to. With her deal in force and not on comms: WITH HER or ON COMMS (comms spec §1). */
function travelControl(p: Place, who: WhoIsWhere, onTravel: (placeId: string, comms?: boolean) => void): HTMLElement {
  if (p.inviteOnly) return el('span', 'invite', '🔒 invite only');
  const blocked = goBlocked(p, who);
  const button = (cls: string, label: string, comms: boolean) => {
    const b = el('button', cls, label);
    b.type = 'button';
    if (blocked) {
      b.disabled = true;
      b.title = blocked;
    }
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!b.disabled) (comms ? onTravel(p.id, true) : onTravel(p.id));
    });
    return b;
  };
  // No ON COMMS to where she already is (final review I2): you'd just be going to her.
  if (!who.comms?.can || who.comms.on || (who.comms.herAt != null && p.scene === who.comms.herAt)) return button('go', 'GO', false);
  const pair = el('span', 'go-pair');
  pair.append(button('go', 'WITH HER', false), button('go-comms', 'ON COMMS', true));
  return pair;
}

/** GIGS: a gig place's jobs, from here (no travel). Disabled while she replies, or with gigBlock's reason. */
function gigsControl(p: Place, district: District, who: WhoIsWhere, onGigs: (place: Place, district: District) => void): HTMLElement {
  const b = el('button', 'gig-open', 'GIGS');
  b.type = 'button';
  const blocked = who.busy ? her().waitFor : (who.gigBlock ?? null);
  if (blocked) {
    b.disabled = true;
    b.title = blocked;
  }
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!b.disabled) onGigs(p, district);
  });
  return b;
}
