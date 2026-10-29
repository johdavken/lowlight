import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

// The Blender script only runs inside Blender: these check it wires the blackout passes (spec 2026-10-27).
const py = fs.readFileSync('tools/map3d/blender/render.py', 'utf8');

describe('render.py blackout passes', () => {
  it('emission is scaled by the view layer power attribute everywhere', () => {
    expect(py).toMatch(/_attr\('VIEW_LAYER', 'power'\)/);
    expect(py).toMatch(/\['power'\]/);
  });
  it('the jobs loop renders dark and mask passes when a job asks', () => {
    expect(py).toMatch(/png-dark/);
    expect(py).toMatch(/png-mask/);
    expect(py).toMatch(/j\.get\('passes'/);
  });
  it('the mask is flat: an override material, Raw view, no compositing, one sample, no filter, no dither', () => {
    expect(py).toMatch(/material_override\s*=\s*mask_mat/);
    expect(py).toMatch(/'Raw'/);
    expect(py).toMatch(/filter_size/);
    expect(py).toMatch(/dither_intensity/);
  });
  it("the mask's floor stands in for the water and the gaps in the mask pass only", () => {
    expect(py).toMatch(/G\.get\('maskFloor'\)/);
    expect(py).toMatch(/MASK_FLOOR\.hide_render = False/);
  });
});

// Blackouts phase 2 §1: who powers each light.
describe('render.py supply and backup', () => {
  it('emission reads each object’s own/emergency supply and each building face’s backup', () => {
    expect(py).toMatch(/_attr\('OBJECT', 'own'\)/);
    expect(py).toMatch(/_attr\('OBJECT', 'emergency'\)/);
    expect(py).toMatch(/_attr\('GEOMETRY', 'backup'\)/);
    expect(py).toMatch(/node_tree = SUPPLY/);
    expect(py).toMatch(/layers\.float\.new\('backup'\)/);
  });
  it('point lights split by supply; the dark pass shows the emergency ones', () => {
    expect(py).toMatch(/OWN_POINTS/);
    expect(py).toMatch(/EMERGENCY_POINTS/);
    expect(py).toMatch(/for o in EMERGENCY_POINTS \+ EMERGENCY_OBJECTS: o\.hide_render = False/);
    expect(py).toMatch(/EMERGENCY_OBJECTS\.append\(ob\)/);
  });
  it('props are grouped by supply as well as district', () => {
    expect(py).toMatch(/p\.get\('supply'\)/);
  });
  it('stops on more than 31 districts or an unknown district id', () => {
    expect(py).toMatch(/len\(IDX\) > 31/);
    expect(py).toMatch(/unknown district/);
  });
});
