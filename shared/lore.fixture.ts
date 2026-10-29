import type { CityMapData } from './map-schema';

/** A small city map for lore tests: Karasu (the stall, the intake) and Velvet (the Orchid). */
export const LORE_TEST_MAP = {
  version: 1,
  image: '/map/x.webp',
  panelAt: [0, 0],
  districts: [
    { id: 'karasu', name: 'Karasu', area: 'Old Town / The Ribbon', label: [0, 0] },
    { id: 'velvet', name: 'Velvet', area: 'Red-Light Quarter', label: [0, 0] },
  ],
  places: [
    { id: 'haes-noodles', name: "Hae's Noodles", district: 'karasu', pin: [0, 0], scene: 'ribbon/noodle-stall' },
    { id: 'lowlight-intake', name: 'Lowlight Intake', district: 'karasu', pin: [0, 0], scene: 'ribbon/lowlight-intake' },
    { id: 'glass-orchid', name: 'Glass Orchid', district: 'velvet', pin: [0, 0] },
  ],
} as unknown as CityMapData;
