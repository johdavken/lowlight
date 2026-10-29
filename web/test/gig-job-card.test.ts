import { describe, expect, it, vi } from 'vitest';
import { jobCard, TIER_LABEL } from '../src/ui/gig/job-card';
import type { Brief } from '../../shared/gig/brief';

const held: Brief = { id: 'held-pay', title: 'Held Pay', tier: 'hard', place: 'the-tilt', client: 'Nobody', target: 'Glass Orchid · house ledger', take: 'a payout', text: 'Thick lacquer.' };

describe('jobCard', () => {
  it('draws the card the hack window deals', () => {
    const c = jobCard(held, {});
    expect(c.tagName).toBe('ARTICLE');
    expect(c.className).toBe('gig-job');
    expect(c.querySelector('.gig-job-tier')!.textContent).toBe('HARD ▮▮▮');
    expect(c.querySelector('h4.gig-job-title')!.textContent).toBe('Held Pay');
    expect([...c.querySelectorAll('.gig-job-facts dt')].map((d) => d.textContent)).toEqual(['CLIENT', 'TARGET', 'TAKE']);
    expect([...c.querySelectorAll('.gig-job-facts dd')].map((d) => d.textContent)).toEqual(['Nobody', 'Glass Orchid · house ledger', 'a payout']);
    expect(c.querySelector('p.gig-job-brief')!.textContent).toBe('Thick lacquer.');
    expect(c.querySelector('.gig-job-foot')!.textContent).toBe('TRACE 14');
    expect(TIER_LABEL).toEqual({ easy: 'EASY ▮▯▯', medium: 'MEDIUM ▮▮▯', hard: 'HARD ▮▮▮' });
  });
  it('a hack card is ◢ GRID; a slip card is ◢ FLOOR with HEAT and SLIP IN', () => {
    expect(jobCard(held, {}).querySelector('.gig-job-kind')!.textContent).toBe('◢ GRID');
    const slip = jobCard({ ...held, kind: 'slip', tier: 'medium' }, { onJackIn: vi.fn() });
    expect(slip.querySelector('.gig-job-kind')!.textContent).toBe('◢ FLOOR');
    expect(slip.querySelector('.gig-job-foot')!.textContent).toBe('HEAT 8SLIP IN');
  });
  it('picked, and with JACK IN only when asked for', () => {
    expect(jobCard(held, { picked: true }).classList.contains('gig-on')).toBe(true);
    expect(jobCard(held, {}).querySelector('.gig-job-go')).toBeNull();
    const go = vi.fn();
    const c = jobCard(held, { onJackIn: go });
    c.querySelector<HTMLButtonElement>('button.gig-job-go')!.click();
    expect(go).toHaveBeenCalledTimes(1);
    expect(c.querySelector('.gig-job-foot')!.textContent).toBe('TRACE 14JACK IN');
  });
});
