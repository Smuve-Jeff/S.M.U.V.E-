/** 
 * WebGPU Denoise Shader 
 * AI-powered noise reduction using spatial filtering in WGSL 
 * 
 * This shader implements a lightweight temporal/spatial noise reduction 
 * pass that reduces grain and random color noise while preserving edges 
 * and fine detail. Uses a weighted averaging approach with edge-aware filtering. 
 */

/* --- Fragment Shader --- */

@group(0) @binding(0) var<uniform> denoiseStrength: f32; // 0.0 to 1.0

@group(0) @binding(1) var sourceTexture: texture_2d<f32>;
@group(0) @binding(2) var<private> sourceSampler: sampler;

/* Edge detection helper - returns how different neighboring pixels are */
@fn calcEdgeWeight(pixelColor: vec4<f32>, neighborColor: vec4<f32>) -> f32 {
  const colorDiff: f32 = abs(pixelColor.r - neighborColor.r) + 
                       abs(pixelColor.g - neighborColor.g) + 
                       abs(pixelColor.b - neighborColor.b);
  // Stronger smoothing when colors are similar (edge-preserving)
  return 1.0 - min(colorDiff * 0.5, 1.0);
}

@fs_main @location(0) -> vec4<f32> {
  // Get texture size
  const texSize: vec2<f32> = textureSize(sourceTexture);
  
  // Calculate UV from fragment position
  const fragUV: vec2<f32> = vec2<f32>(
    (fragIndex % u32(texSize.x)) as f32 / texSize.x,
    (fragIndex / u32(texSize.x)) as f32 / texSize.y
  );
  
  // Sample original texture at current pixel
  const centerColor: vec4<f32> = textureSample(sourceTexture, sourceSampler, fragUV);
  
  // Accumulate denoised color
  var accColor: vec4<f32> = vec4<f32>(0.0);
  var weightSum: f32 = 0.0;
  
  // Sample a 5x5 neighborhood with center at current pixel
  // Search range: -2 to +2 pixels
  for (var yOffset: i32 = -2; yOffset <= 2; yOffset++) {
    for (var xOffset: i32 = -2; xOffset <= 2; xOffset++) {
      if (xOffset === 0 && yOffset === 0) {
        // Center pixel - full weight
        accColor = accColor + centerColor;
        weightSum = weightSum + 1.0;
      } else {
        // Neighboring pixel
        const sampleUV: vec2<f32> = fragUV + vec2<f32>(f32(xOffset), f32(yOffset)) / texSize;
        const neighborColor: vec4<f32> = textureSample(sourceTexture, sourceSampler, sampleUV);
        
        // Edge-aware weighting
        const edgeW: f32 = calcEdgeWeight(centerColor, neighborColor);
        const spatialWeight: f32 = 1.0 / (1.0 + f32(xOffset * xOffset + yOffset * yOffset));
        
        const combinedWeight: f32 = spatialWeight * max(edgeW, 0.1);
        
        accColor = accColor + neighborColor * combinedWeight;
        weightSum = weightSum + combinedWeight;
      }
    }
  }
  
  // Normalize
  var result: vec4<f32> = accColor / max(weightSum, 0.001);
  
  // Apply strength control
  const strength: f32 = denoiseStrength;
  result = mix(centerColor, result, strength);
  
  return result;
}