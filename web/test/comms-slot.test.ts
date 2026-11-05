import { describe, expect, it } from 'vitest';
import { mountCommsSlot, slotFor } from '../src/room/comms-slot';

const NIX = { name: 'Nix', face: '/api/agents/nix-direct/sprite', where: 'Lowlight Intake', accent: '#ff4fa3' };
const VENN = { name: 'Arlo Venn', url: '/api/extras/sdg-07' };
const LUND = { name: 'Teodora Lund', url: '/api/extras/local-07' };

describe('slotFor (comms speaker slot, spec 2026-11-01 §1)', () => {
  it('with one of them up, that one; with neither, nobody', () => {
    expect(slotFor(null, false, false, 'contact')).toBe(null);
    expect(slotFor(null, true, false, 'stranger')).toBe('comms');
    expect(slotFor(null, false, true, 'contact')).toBe('stranger');
  });
  it('with both up: her page is hers, theirs is theirs', () => {
    expect(slotFor('stranger', true, true, 'contact')).toBe('comms');
    expect(slotFor('comms', true, true, 'stranger')).toBe('stranger');
  });
  it('your line, an other or no line keeps whoever had it, else the stranger', () => {
    expect(slotFor('comms', true, true, 'user')).toBe('comms');
    expect(slotFor('stranger', true, true, 'other')).toBe('stranger');
    expect(slotFor(null, true, true, null)).toBe('stranger');
  });
});

function rig() {
  const her: unknown[] = [];
  const them: unknown[] = [];
  const slot = mountCommsSlot({ show: (s) => her.push(s) }, { show: (s) => them.push(s) });
  return { slot, her, them };
}

describe('mountCommsSlot', () => {
  it('on comms alone: her small monitor, as before', () => {
    const { slot, her, them } = rig();
    slot.setComms(NIX);
    expect(her).toEqual([{ ...NIX, bust: false }]);
    expect(them).toEqual([]);
  });

  it('a stranger comes in on her page: they take the slot until the next line, and her monitor goes', () => {
    const { slot, her, them } = rig();
    slot.setComms(NIX);
    slot.setLine('m1:contact', 'contact');
    slot.setStranger(VENN);
    expect(her.at(-1)).toBe(null);
    expect(them.at(-1)).toEqual(VENN);
    // The same line seen again changes nothing.
    slot.setLine('m1:contact', 'contact');
    expect(them.at(-1)).toEqual(VENN);
  });

  it('the slot follows the speaker; her monitor is bust-sized beside a stranger; your line moves nothing', () => {
    const { slot, her, them } = rig();
    slot.setComms(NIX);
    slot.setStranger(VENN);
    slot.setLine('m2:contact', 'contact');
    expect(her.at(-1)).toEqual({ ...NIX, bust: true });
    expect(them.at(-1)).toBe(null);
    slot.setLine('u3:user', 'user');
    expect(her.at(-1)).toEqual({ ...NIX, bust: true });
    slot.setLine('m4:stranger', 'stranger');
    expect(her.at(-1)).toBe(null);
    expect(them.at(-1)).toEqual(VENN);
    slot.setLine('u5:user', 'user');
    expect(them.at(-1)).toEqual(VENN);
  });

  it('shows each face only on a change, so nothing replays its entrance', () => {
    const { slot, her, them } = rig();
    slot.setComms(NIX);
    slot.setStranger(VENN);
    slot.setLine('m4:stranger', 'stranger');
    slot.setLine('m4:stranger', 'stranger');
    slot.setStranger(VENN);
    expect(them.filter((t) => t !== null)).toHaveLength(1);
    expect(her).toEqual([{ ...NIX, bust: false }, null]);
  });

  it('the stranger leaves: her small monitor comes back; a new stranger takes the slot again', () => {
    const { slot, her, them } = rig();
    slot.setComms(NIX);
    slot.setStranger(VENN);
    slot.setLine('m2:contact', 'contact');
    slot.setStranger(null);
    expect(her.at(-1)).toEqual({ ...NIX, bust: false });
    expect(them.at(-1)).toBe(null);
    slot.setStranger(LUND);
    expect(them.at(-1)).toEqual(LUND);
    expect(her.at(-1)).toBe(null);
  });

  it('off comms: the stranger shows whoever is speaking', () => {
    const { slot, her, them } = rig();
    slot.setStranger(VENN);
    slot.setLine('m2:contact', 'contact');
    expect(them).toEqual([VENN]);
    expect(her).toEqual([]);
  });
});
