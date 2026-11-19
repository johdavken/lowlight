import { describe, expect, it } from 'vitest';
import type { ContactEntry } from '../../shared/types';
import type { District, Place } from '../../shared/map-schema';
import { buildFileStrip } from '../src/ui/map/file-strip';
import { recommendedPins } from '../src/ui/map/who';

const place = { id: 'sdg-floor', name: 'SDG Floor', district: 'nexus', pin: { x: 0, y: 0 }, scene: 'nexus/sdg-floor' } as unknown as Place;
const district = { id: 'nexus', name: 'Nexus' } as unknown as District;
const entry = (o: Partial<ContactEntry>): ContactEntry => ({ id: 'kroll', name: 'Kroll', accent: '#fff', portrait: null, status: 'knows', sceneId: 'spine/home', placeName: 'Home', timeOfDay: null, lastLine: null, ...o });

describe('RECOMMENDED on the map card (Kroll\'s desk spec)', () => {
  it('recommendedPins: each recommended contact\'s job place, with the tag', () => {
    const pins = recommendedPins([entry({ recommended: { title: 'Come Up', pitch: 'p', from: '09:00', place: 'sdg-floor' } }), entry({ id: 'nix' })]);
    expect(pins).toEqual({ 'sdg-floor': 'RECOMMENDED · FROM 09:00' });
    // Past a day, her weekday in caps.
    expect(recommendedPins([entry({ recommended: { title: 'Come Up', pitch: 'p', from: 'Mon 09:00', place: 'sdg-floor' } })])).toEqual({ 'sdg-floor': 'RECOMMENDED · FROM MON 09:00' });
  });
  it('the card carries the tag under the place name when the pin has one, and none otherwise', () => {
    const strip = buildFileStrip({ place, district, who: { people: [], recommended: { 'sdg-floor': 'RECOMMENDED' } } });
    const tag = strip.querySelector('.rec');
    expect(tag?.textContent).toBe('RECOMMENDED');
    expect(tag?.previousElementSibling?.classList.contains('t')).toBe(true);
    expect(buildFileStrip({ place, district, who: { people: [] } }).querySelector('.rec')).toBeNull();
  });
});
