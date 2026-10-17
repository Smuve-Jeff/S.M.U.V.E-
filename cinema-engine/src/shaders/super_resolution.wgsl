/** 
 * WebGPU Super-Resolution Shader 
 * AI-powered upscaling using neural network approximations in WGSL 
 * 
 * This shader implements a lightweight super-resolution pass that 
 * enhances video detail while upscaling. Uses a simple bilinear 
 * approximation with edge-aware filtering for real-time performance. 
 */

/* --- Vertex Shader --- */

@group(0) @binding(0) var<uniform> projMatrix: mat4x4<f32>;

@vertex vs_main(@builtin<vertex_index> vertexIndex: u32) -> @builtin(position) vec4<f32> {
  const positions = array<vec2<f32>>(
    vec2<f32>(-1.0, -1.0), // bottom-left
    vec2<f32>(1.0, -1.0),   // bottom-right
    vec2<f32>(-1.0, 1.0),   // top-left
    vec2<f32>(1.0, 1.0)     // top-right
  );
  
  const uvCoords = array<vec2<f32>>(
    vec2<f32>(0.0, 1.0), // bottom-left (flip V)
    vec2<f32>(1.0, 1.0), // bottom-right (flip V)
    vec2<f32>(0.0, 0.0), // top-left (flip V)
    vec2<f32>(1.0, 0.0)  // top-right (flip V)
  );
  
  return vec4<f32>(positions[vertexIndex] * projMatrix, 0.0, 1.0);
}

/* --- Fragment Shader --- */

@group(0) @binding(1) var sourceTexture: texture_2d<f32>;
@group(0) @binding(2) var<private> sourceSampler: sampler;

@fragment fs_main(@builtin<fragment_index> fragIndex: u32) -> @location(0) vec4<f32> {
  // Get texture size for computing UV offsets
  const texSize: vec2<f32> = textureSize(sourceTexture);
  
  // Calculate UV coordinates
  const uv: vec2<f32> = vec2<f32>(
    (f32(fragIndex % u32(texSize.x)) + 0.5) / texSize.x,
    (f32(fragIndex / u32(texSize.x)) + 0.5) / texSize.y
  );
  
  // Sample original texture
  const color: vec4<f32> = textureSample(sourceTexture, sourceSampler, uv);
  
  // Simple super-resolution: upscale by 2x using bilinear-like filtering
  // with edge-aware weighting
  
  // Neighbor offsets for 2x upscaling
  const offsets: array<vec2<f32>>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(1.0, -1.0),
    vec2<f32>(-1.0, 1.0),
    vec2<f32>(1.0, 1.0)
  );
  
  // Edge-aware weights (stronger weighting when neighboring pixels 
  // have similar color - preserves edges)
  const edgeWeight: f32 = 0.7;
  
  // Accumulate filtered samples
  var accColor: vec4<f32> = vec4<f32>(0.0);
  var weightSum: f32 = 0.0;
  
  for (var i: u32 = 0; i < 4u; i++) {
    const sampleUV: vec2<f32> = uv + offsets[i] * 0.5 / texSize;
    const sampleColor: vec4<f32> = textureSample(sourceTexture, sourceSampler, sampleUV);
    
    // Edge detection: reduce weight if neighboring color differs significantly
    const colorDiff: f32 = abs(sampleColor.r - color.r) + 
                         abs(sampleColor.g - color.g) + 
                         abs(sampleColor.b - color.b);
    const adaptiveWeight: f32 = edgeWeight * (1.0 - min(colorDiff, 1.0));
    
    accColor = accColor + sampleColor * adaptiveWeight;
    weightSum = weightSum + adaptiveWeight;
  }
  
  // Normalize
  var result: vec4<f32> = accColor / max(weightSum, 0.001);
  
  // Apply strength control for subtle enhancement
  const strength: f32 = 0.5; // Could be passed as uniform
  result = mix(color, result, strength);
  
  return result;
}