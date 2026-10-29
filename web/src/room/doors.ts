/**
 * Doors (clickable doors spec §3): one hotspot per door box of the room's exits, over the room picture.
 * Hover shows the way; a click asks the server to go through. The layer lives inside the zoomed #game,
 * so boxes go from room px to window px (the room's rect) and then to stage px.
 */
import type { ExitDef } from '../../../shared/types';
import type { StageRect } from '../ui/game-stage';
import './doors.css';

type Box = [number, number, number, number];
type Rect = { left: number; top: number; width: number; height: number };

/** A label under the box when the box starts this close to the room's top, in stage px. */
const LABEL_ROOM = 24;

/** `box` (room px, in a `frame`-sized picture) in stage px, for a room drawn at `room` (window px) on `stage`. */
export function placeDoor(box: Box, frame: readonly [number, number], room: Rect, stage: StageRect): Rect {
  const sx = room.width / frame[0];
  const sy = room.height / frame[1];
  return {
    left: (room.left - stage.left + box[0] * sx) / stage.scale,
    top: (room.top - stage.top + box[1] * sy) / stage.scale,
    width: (box[2] * sx) / stage.scale,
    height: (box[3] * sy) / stage.scale,
  };
}

export class DoorLayer {
  private scene: { resolution: readonly [number, number]; exits?: ExitDef[] } | null = null;
  /** Whether a panel was open when the click began: its click-away closes it on press, before the click. */
  private blockedAtPress = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly o: { send(to: string): void; blocked(): boolean; roomRect(): Rect; stage(): StageRect },
  ) {
    root.classList.add('door-layer', 'door-none');
    // Window capture runs before the document-capture click-away that closes the panel.
    window.addEventListener('pointerdown', () => (this.blockedAtPress = this.o.blocked()), true);
  }

  /** The room now: its doors replace the last room's. */
  show(scene: { resolution: readonly [number, number]; exits?: ExitDef[] } | null): void {
    this.scene = scene;
    const doors = (scene?.exits ?? []).filter((e): e is ExitDef & { door: Box } => e.door !== undefined);
    this.root.replaceChildren(...doors.map((e) => this.spot(e)));
    this.root.classList.toggle('door-none', doors.length === 0);
    this.layout();
  }

  /** Puts every spot on its door again (after a resize). */
  layout(): void {
    if (!this.scene) return;
    const room = this.o.roomRect();
    const stage = this.o.stage();
    const roomTop = (room.top - stage.top) / stage.scale;
    for (const s of this.root.querySelectorAll<HTMLElement>('.door-spot')) {
      const box = JSON.parse(s.dataset.box!) as Box;
      const r = placeDoor(box, this.scene.resolution, room, stage);
      Object.assign(s.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
      s.classList.toggle('door-label-below', r.top - roomTop < LABEL_ROOM);
    }
  }

  /** The server said no: the label goes, the room stays. */
  refused(): void {
    for (const s of this.root.querySelectorAll('.door-spot')) s.classList.remove('door-hover');
  }

  private spot(e: ExitDef & { door: Box }): HTMLElement {
    const s = document.createElement('div');
    s.className = 'door-spot';
    s.dataset.to = e.to;
    s.dataset.box = JSON.stringify(e.door);
    const label = document.createElement('span');
    label.className = 'door-label';
    label.textContent = e.way.toUpperCase();
    s.append(label);
    s.addEventListener('mouseenter', () => {
      if (!this.o.blocked()) s.classList.add('door-hover');
    });
    s.addEventListener('mouseleave', () => s.classList.remove('door-hover'));
    // The click goes on to the page too, so click-away menus and file cards close as for any click.
    s.addEventListener('click', () => {
      if (this.blockedAtPress || this.o.blocked()) return;
      this.o.send(e.to);
    });
    return s;
  }
}
