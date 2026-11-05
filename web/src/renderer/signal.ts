import { Filter, GlProgram } from 'pixi.js';

const vertex = /* glsl */ `
in vec2 aPosition;
out vec2 vUv;
out vec2 vToTexture;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

void main(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  gl_Position = vec4(position, 0.0, 1.0);
  vUv = aPosition;
  vToTexture = uOutputFrame.zw * uInputSize.zw;
}
`;

const fragment = /* glsl */ `
in vec2 vUv;
in vec2 vToTexture;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uHeight;
uniform float uWidth;
uniform float uFlash;

void main(void) {
  vec2 p = vUv - 0.5;
  if (abs(p.y) > uHeight * 0.5 || abs(p.x) > uWidth * 0.5) {
    finalColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  vec3 c = texture(uTexture, vec2(vUv.x, p.y / uHeight + 0.5) * vToTexture).rgb;
  finalColor = vec4(mix(c * (1.0 + 2.0 * uFlash), vec3(0.85, 0.95, 1.0), uFlash), 1.0);
}
`;

/** Squeezes the picture to a white line and the line to nothing; black everywhere it has left. */
export class SignalFilter extends Filter {
  constructor() {
    super({
      glProgram: GlProgram.from({ vertex, fragment, name: 'nix-signal' }),
      resources: {
        signalUniforms: {
          uHeight: { value: 1, type: 'f32' },
          uWidth: { value: 1, type: 'f32' },
          uFlash: { value: 0, type: 'f32' },
        },
      },
    });
  }

  set(shape: { height: number; width: number; flash: number }): void {
    const u = this.resources.signalUniforms.uniforms;
    u.uHeight = shape.height;
    u.uWidth = shape.width;
    u.uFlash = shape.flash;
    this.resources.signalUniforms.update();
  }
}
