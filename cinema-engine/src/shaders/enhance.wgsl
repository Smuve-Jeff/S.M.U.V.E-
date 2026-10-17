/** 
 * WebGPU Enhance Shader 
 * AI-powered general video quality enhancement in WGSL 
 * 
 * This shader implements a comprehensive enhancement pass that improves 
 * overall video quality by adjusting contrast, saturation, sharpness, 
 * and applying subtle color grading. Uses a combination of spatial 
 * filtering and color space adjustments for real-time performance. 
 */

/* --- Fragment Shader --- */

@group(0) @binding(0) var<uniform> contrast: f32; // 1.0 = normal, >1 = more contrast
@group(0) @binding(1) var<uniform> saturation: f32; // 1.0 = normal, >1 = more saturated
@group(0) @binding(2) var<uniform> sharpness: f32; // 0.0 to 1.0 edge enhancement
@group(0) @binding(3) var<uniform> colorTint: vec3<f33>; // RGB tint

@group(0) @binding(1) var sourceTexture: texture_2d<f32>;
@group(0) @binding(2) var<private> sourceSampler: sampler;

/* Apply contrast adjustment */
@fn applyContrast(color: vec3<f32>, contrastFactor: f32) -> vec3<f32> {
  const midGray: vec3<f32> = vec3<f32>(0.5);
  return mix(midGray, color, contrastFactor) * contrastFactor + (1.0 - contrastFactor);
}

/* Apply saturation adjustment */
@fn applySaturation(color: vec3<f32>, saturationFactor: f32) -> vec3<f32> {
  // Luminance-based saturation
  const luminance: f32 = dot(color, vec3<f32>(0.299, 0.587, 0.114));
  return mix(luminance, color, saturationFactor);
}

@fs_main @location(0) -> vec4<f32> {
  // Get texture size
  const texSize: vec2<f32> = textureSize(sourceTexture);
  
  // Calculate UV
  const fragUV: vec2<f32> = vec2<f32>(
    (fragIndex % u32(texSize.x)) as f32 / texSize.x,
    (fragIndex / u32(texSize.x)) as f32 / texSize.y
  );
  
  // Sample original texture
  const color: vec4<f32> = textureSample(sourceTexture, sourceSampler, fragUV);
  
  // Extract RGB, preserve alpha
  const rgb: vec3<f32> = color.rgb;
  const alpha: f32 = color.a;
  
  // Apply contrast
  const enhancedRgb: vec3<f32> = applyContrast(rgb, contrast);
  
  // Apply saturation
  const saturatedRgb: vec3<f32> = applySaturation(enhancedRgb, saturation);
  
  // Apply sharpness with edge-aware sharpening
  // Sample neighbors for unsharp mask effect
  var sharpRgb: vec3<f32> = vec3<f32>(0.0);
  var sharpWeightSum: f32 = 0.0;
  
  // Center weight
  const centerWeight: f32 = 1.0 + sharpness;
  sharpRgb = sharpRgb + saturatedRgb * centerWeight;
  sharpWeightSum = sharpWeightSum + centerWeight;
  
  // Neighborhood offsets for sharpening
  const neighborOffsets: array<vec2<f32>>(4) = array(
    vec2<f32>(-1.0 / texSize.x, 0.0),
    vec2<f32>(1.0 / texSize.x, 0.0),
    vec2<f32>(0.0, -1.0 / texSize.y),
    vec2<f32>(0.0, 1.0 / texSize.y)
  );
  
  for (var i: u32 = 0; i < 4u; i++) {
    const sampleUV: vec2<f32> = fragUV + neighborOffsets[i];
    const neighborColor: vec4<f32> = textureSample(sourceTexture, sourceSampler, sampleUV);
    const neighborRgb: vec3<f32> = neighborColor.rgb;
    
    // Weaker sharpening for large color differences (edge preservation)
    const colorDiff: f32 = abs(neighborRgb - rgb.rgb);
    const edgeFactor: f32 = min(1.0 - colorDiff.r * 0.5, 1.0);
    
    const neighborWeight: f32 = 0.5 * sharpness * edgeFactor;
    sharpRgb = sharpRgb + neighborRgb * neighborWeight;
    sharpWeightSum = sharpWeightSum + neighborWeight;
  }
  
  if (sharpWeightSum > 0.0) {
    sharpRgb = sharpRgb / sharpWeightSum;
  }
  
  // Apply color tint
  const finalRgb: vec3<f32> = sharpRgb * colorTint;
  
  // Return with alpha preserved
  return vec4<f32>(finalRgb, alpha);
}