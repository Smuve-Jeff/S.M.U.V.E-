/** Vertex shader: transforms 2D world-space vertices by camera matrix */
export const VERTEX_SHADER_2D = /* glsl */ `#version 300 es
precision highp float;

uniform mat4 uProjection;
uniform mat4 uCamera;

in vec2 aPosition;
in vec4 aColor;
in vec2 aTexCoord;
in float aBorderRadius;
in float aBorderWidth;

out vec4 vColor;
out vec2 vTexCoord;
out vec2 vLocalPos;
out float vBorderRadius;
out float vBorderWidth;

void main() {
  vec4 worldPos = uCamera * vec4(aPosition, 0.0, 1.0);
  gl_Position = uProjection * worldPos;
  vColor = aColor;
  vTexCoord = aTexCoord;
  vLocalPos = aTexCoord;
  vBorderRadius = aBorderRadius;
  vBorderWidth = aBorderWidth;
}
`;

/** Fragment shader: renders solid color quads with optional rounded corners and borders */
export const FRAGMENT_SHADER_2D = /* glsl */ `#version 300 es
precision highp float;

in vec4 vColor;
in vec2 vTexCoord;
in vec2 vLocalPos;
in float vBorderRadius;
in float vBorderWidth;

out vec4 fragColor;

float roundedBoxSDF(vec2 p, vec2 halfSize, float r) {
  vec2 d = abs(p) - halfSize + r;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
}

void main() {
  if (vBorderRadius > 0.0) {
    vec2 halfSize = vec2(0.5, 0.5);
    vec2 p = vLocalPos - 0.5;
    float d = roundedBoxSDF(p, halfSize, vBorderRadius);
    float alpha = 1.0 - smoothstep(-0.002, 0.0, d);
    if (alpha < 0.01) discard;

    if (vBorderWidth > 0.0) {
      float innerD = roundedBoxSDF(p, halfSize - vBorderWidth, max(0.0, vBorderRadius - vBorderWidth));
      float innerAlpha = 1.0 - smoothstep(-0.002, 0.0, innerD);
      float borderAlpha = alpha - innerAlpha;
      fragColor = vec4(vColor.rgb, vColor.a * alpha);
    } else {
      fragColor = vec4(vColor.rgb, vColor.a * alpha);
    }
  } else {
    fragColor = vColor;
  }
}
`;

/** Vertex shader for lines (grid, playhead) */
export const VERTEX_SHADER_LINE = /* glsl */ `#version 300 es
precision highp float;

uniform mat4 uProjection;
uniform mat4 uCamera;

in vec2 aPosition;
in vec4 aColor;

out vec4 vColor;

void main() {
  vec4 worldPos = uCamera * vec4(aPosition, 0.0, 1.0);
  gl_Position = uProjection * worldPos;
  vColor = aColor;
}
`;

/** Fragment shader for lines */
export const FRAGMENT_SHADER_LINE = /* glsl */ `#version 300 es
precision highp float;

in vec4 vColor;
out vec4 fragColor;

void main() {
  fragColor = vColor;
}
`;
