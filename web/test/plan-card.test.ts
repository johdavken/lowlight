import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountPlanCard } from '../src/ui/plan-card';

// Her plans spec §5: NIX IS HEADING HOME · Hae's at 21:00, LET HER GO / GO WITH HER.
const CARD = { name: 'Nix', going: 'home', meet: "Hae's Noodles at 21:00", from: 'r1' };
afterEach(() => (document.body.innerHTML = ''));
const setup = () => {
  document.body.innerHTML = '<div id="root"></div>';
  const root = document.getElementById('root')!;
  const o = { letGo: vi.fn(), stay: vi.fn() };
  return { root, o, card: mountPlanCard(root, o) };
};

describe('the plan card', () => {
  it('shows the heading, the meeting and the two answers', () => {
    const { root, card } = setup();
    card.show(CARD);
    const el = root.querySelector('.plan-card')!;
    expect(el.querySelector('.pcd-title')?.textContent).toBe('NIX IS HEADING HOME');
    expect(el.querySelector('.pcd-meet')?.textContent).toBe("HAE'S NOODLES AT 21:00");
    expect([...el.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['LET HER GO', 'GO WITH HER']);
  });
  it('no meeting: no meeting line', () => {
    const { root, card } = setup();
    card.show({ ...CARD, meet: null });
    expect(root.querySelector('.pcd-meet')).toBeNull();
  });
  it('the buttons answer once each', () => {
    const { root, o, card } = setup();
    card.show(CARD);
    const [go, stay] = root.querySelectorAll<HTMLButtonElement>('.plan-card button');
    go.click();
    stay.click();
    expect(o.letGo).toHaveBeenCalledTimes(1);
    expect(o.stay).toHaveBeenCalledTimes(1);
  });
  it('null takes it away; a second card replaces the first in the same element', () => {
    const { root, card } = setup();
    card.show(CARD);
    const first = root.querySelector('.plan-card');
    card.show({ ...CARD, going: 'the Tilt', meet: null });
    expect(root.querySelectorAll('.plan-card')).toHaveLength(1);
    expect(root.querySelector('.plan-card')).toBe(first);
    expect(root.querySelector('.pcd-title')?.textContent).toBe('NIX IS HEADING THE TILT');
    card.show(null);
    expect(root.querySelector('.plan-card')).toBeNull();
  });
});
