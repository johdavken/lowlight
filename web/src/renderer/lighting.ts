import { Filter, GlProgram } from 'pixi.js';
import { parseHex } from '../../../shared/color';
import { dimmedAmbientLevel } from '../../../shared/light-share';
import type { Atmosphere, Hex, RoomState } from '../../../shared/types';

/** At most 8 lights per scene (the scene schema rejects more). */
export const MAX_LIGHTS = 8;
/** What the shader holds: the room's lights and one more for a passing light. */
export const SHADER_LIGHTS = MAX_LIGHTS + 1;

/**
 * Exposure gains for the pre-lit placeholder art: the diffuse PNGs are already dark, so the
 * spec's multiply alone leaves everything outside a pool near black. Light pools may brighten
 * the art beyond its painted value (gain > 1), which is what makes them read as pooling light.
 */
export const AMBIENT_GAIN = 2.3;
export const LIGHT_GAIN = 2.2;
/** Share of the ambient hue kept (the rest is white), so a deep blue ambient doesn't erase the art's other channels. */
export const AMBIENT_SATURATION = 0.65;

export interface ShaderLight {
  /** Render-texture px. */
  pos: [number, number];
  color: Hex;
  /** Already multiplied by the light's flicker factor. */
  intensity: number;
  radius: number;
}

const vertex = /* glsl */ `
in vec2 aPosition;
out vec2 vTextureCoord;
out vec2 vScenePos;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

void main(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  vScenePos = position;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  gl_Position = vec4(position, 0.0, 1.0);
  vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
}
`;

const fragment = /* glsl */ `
in vec2 vTextureCoord;
in vec2 vScenePos;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec3 uAmbient;
uniform float uSnap;
uniform int uLightCount;
uniform vec4 uLightGeom[${SHADER_LIGHTS}];
uniform vec3 uLightColor[${SHADER_LIGHTS}];

void main(void) {
  vec4 base = texture(uTexture, vTextureCoord);
  // 480 rooms light each art pixel at its centre so pools keep hard pixel edges; flat rooms are smooth.
  vec2 p = uSnap > 0.5 ? floor(vScenePos) + 0.5 : vScenePos;
  vec3 light = uAmbient;
  for (int i = 0; i < ${SHADER_LIGHTS}; i++) {
    if (i >= uLightCount) break;
    vec4 g = uLightGeom[i];
    float f = 1.0 - smoothstep(0.0, g.z, distance(p, g.xy));
    light += uLightColor[i] * (f * f);
  }
  finalColor = vec4(base.rgb * light, base.a);
}
`;

/**
 * Ambient multiply plus additive point lights on the diffuse layers:
 * `base * (ambient * ambientLevel) + base * Σ color * intensity * falloff`,
 * `falloff = (1 - smoothstep(0, radius, dist))²`, positions in render-texture px.
 *
 * The ambient color is used as a hue: it is normalized so its brightest channel is 1 before being
 * scaled by `ambientLevel` (scene ambients like `#1a1030` are near-black, and a literal multiply would
 * crush everything outside the light pools to black; this keeps `ambientLevel` meaning "how bright").
 */
/** What the filter shaded with this frame, for answering "the light at this point" off the GPU. */
export interface LightingFrame {
  /** The ambient multiplier (ambientTerm, plus any ambient lift), per channel. */
  ambient: [number, number, number];
  /** Each light: render-texture position, radius, and colour × intensity × LIGHT_GAIN. */
  lights: { pos: [number, number]; radius: number; rgb: [number, number, number] }[];
}

/** The values `update` gives the shader: the same ambient and lights, as plain numbers. */
export function frameFor(atmo: Atmosphere, lights: ShaderLight[], ambientLift = 0): LightingFrame {
  const ambient = ambientTerm(atmo.ambient, atmo.ambientLevel).map((c) => c + ambientLift) as [number, number, number];
  return {
    ambient,
    lights: lights.slice(0, SHADER_LIGHTS).map((l) => {
      const rgb = parseHex(l.color) ?? [1, 1, 1];
      const k = Math.max(0, l.intensity) * LIGHT_GAIN;
      return { pos: [l.pos[0], l.pos[1]], radius: Math.max(1e-3, l.radius), rgb: [rgb[0] * k, rgb[1] * k, rgb[2] * k] };
    }),
  };
}

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** The shader's light at render-texture point `p`: ambient + Σ rgb × (1 − smoothstep(0, radius, distance))². */
export function lightAt(p: [number, number], f: LightingFrame): [number, number, number] {
  const out: [number, number, number] = [f.ambient[0], f.ambient[1], f.ambient[2]];
  for (const l of f.lights) {
    const d = Math.hypot(p[0] - l.pos[0], p[1] - l.pos[1]);
    const k = (1 - smoothstep(0, l.radius, d)) ** 2;
    out[0] += l.rgb[0] * k;
    out[1] += l.rgb[1] * k;
    out[2] += l.rgb[2] * k;
  }
  return out;
}

export class LightingFilter extends Filter {
  private readonly geom = new Float32Array(SHADER_LIGHTS * 4);
  private readonly colors = new Float32Array(SHADER_LIGHTS * 3);
  private readonly ambient = new Float32Array(3);

  constructor() {
    super({
      glProgram: GlProgram.from({ vertex, fragment, name: 'nix-lighting' }),
      resources: {
        lightUniforms: {
          uAmbient: { value: new Float32Array(3), type: 'vec3<f32>' },
          uSnap: { value: 1, type: 'f32' },
          uLightCount: { value: 0, type: 'i32' },
          uLightGeom: { value: new Float32Array(SHADER_LIGHTS * 4), type: 'vec4<f32>', size: SHADER_LIGHTS },
          uLightColor: { value: new Float32Array(SHADER_LIGHTS * 3), type: 'vec3<f32>', size: SHADER_LIGHTS },
        },
      },
    });
  }

  /** On (480 rooms): light each art pixel at its centre for hard-edged pools. Off (flat rooms): smooth pools. */
  setSnap(on: boolean): void {
    this.resources.lightUniforms.uniforms.uSnap = on ? 1 : 0;
    this.resources.lightUniforms.update();
  }

  /** The values shaded last frame (null until the first update). */
  frame: LightingFrame | null = null;

  /** `ambientLift` brightens the whole room for a moment (a lightning flash). */
  update(atmo: Atmosphere, lights: ShaderLight[], ambientLift = 0): void {
    const u = this.resources.lightUniforms.uniforms;
    const f = frameFor(atmo, lights, ambientLift);
    this.frame = f;
    this.ambient.set(f.ambient);
    this.geom.fill(0);
    this.colors.fill(0);
    const n = f.lights.length;
    for (let i = 0; i < n; i++) {
      const l = f.lights[i];
      this.geom.set([l.pos[0], l.pos[1], l.radius, 0], i * 4);
      this.colors.set(l.rgb, i * 3);
    }
    u.uAmbient = this.ambient;
    u.uLightCount = n;
    u.uLightGeom = this.geom;
    u.uLightColor = this.colors;
    this.resources.lightUniforms.update();
  }
}

/** Ambient multiplier: the ambient hue (brightest channel normalized to 1, partly desaturated) × ambientLevel × gain. */
export function ambientTerm(ambient: Hex, level: number): [number, number, number] {
  const rgb = parseHex(ambient) ?? [1, 1, 1];
  const peak = Math.max(rgb[0], rgb[1], rgb[2]);
  const k = Math.max(0, Math.min(1, level));
  if (peak <= 0) return [0, 0, 0];
  const g = k * AMBIENT_GAIN;
  const ch = (c: number) => (1 - AMBIENT_SATURATION + AMBIENT_SATURATION * (c / peak)) * g;
  return [ch(rgb[0]), ch(rgb[1]), ch(rgb[2])];
}

/** The atmosphere the room is shaded with: its ambient dims as its own (indoor) lights go out. */
export function shadedAtmosphere(state: RoomState): Atmosphere {
  return { ...state.atmosphere, ambientLevel: dimmedAmbientLevel(state.atmosphere.ambientLevel, state.lights) };
}
