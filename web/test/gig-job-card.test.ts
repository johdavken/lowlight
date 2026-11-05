import { describe, expect, it, vi } from 'vitest';
import { jobCard, TIER_LABEL } from '../src/ui/gig/job-card';
import type { Brief } from '../../shared/gig/brief';

const desk: Brief = { id: 'night-pilot', title: 'Night Pilot', tier: 'hard', kind: 'papers', place: 'ferry-stairs', client: 'A pilot', target: 'Tidal Isle · customs, booth nine', take: 'one crossing', text: 'The wrong cargo, once.' };

describe('jobCard', () => {
  it('draws the papers card the gig window deals', () => {
    const c = jobCard(desk, {});
    expect(c.tagName).toBe('ARTICLE');
    expect(c.className).toBe('gig-job');
    expect(c.querySelector('.gig-job-kind')!.textContent).toBe('◢ DESK');
    expect(c.querySelector('.gig-job-tier')!.textContent).toBe('HARD ▮▮▮');
    expect(c.querySelector('h4.gig-job-title')!.textContent).toBe('Night Pilot');
    expect([...c.querySelectorAll('.gig-job-facts dt')].map((d) => d.textContent)).toEqual(['CLIENT', 'TARGET', 'TAKE']);
    expect([...c.querySelectorAll('.gig-job-facts dd')].map((d) => d.textContent)).toEqual(['A pilot', 'Tidal Isle · customs, booth nine', 'one crossing']);
    expect(c.querySelector('p.gig-job-brief')!.textContent).toBe('The wrong cargo, once.');
    expect(c.querySelector('.gig-job-foot')!.textContent).toBe('RISK');
    expect(TIER_LABEL).toEqual({ easy: 'EASY ▮▯▯', medium: 'MEDIUM ▮▮▯', hard: 'HARD ▮▮▮' });
  });
  it('picked, with its cap, and SIT DOWN only when asked for', () => {
    expect(jobCard(desk, { picked: true }).classList.contains('gig-on')).toBe(true);
    expect(jobCard(desk, {}).querySelector('.gig-job-go')).toBeNull();
    const go = vi.fn();
    const c = jobCard(desk, { onJackIn: go, cap: 5 });
    c.querySelector<HTMLButtonElement>('button.gig-job-go')!.click();
    expect(go).toHaveBeenCalledTimes(1);
    expect(c.querySelector('.gig-job-foot')!.textContent).toBe('RISK 5SIT DOWN');
  });
});
