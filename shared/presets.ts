import { withBase } from './light-share';
import type { PresetDef, RoomState } from './types';

/** A preset over a room state: atmosphere fields replace, named lights take their overrides, and every light's level becomes its base. */
export function applyPresetTo(state: RoomState, preset: PresetDef): RoomState {
  const { lights: lightOverrides, ...atmosphereOverrides } = preset;
  return {
    ...state,
    atmosphere: { ...state.atmosphere, ...atmosphereOverrides },
    lights: withBase(
      state.lights.map((light) => {
        const override = lightOverrides?.[light.id];
        return override ? { ...light, ...override } : light;
      }),
    ),
  };
}
