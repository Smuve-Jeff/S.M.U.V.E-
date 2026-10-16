/**
 * Crop Module
 * Video crop and resize capabilities
 */

export interface CropParams {
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  aspectRatio?: string;
  maintainAspectRatio?: boolean;
}

/**
 * Crop and resize capabilities
 */
export class Crop {
  private aspectRatios = [
    '16:9',
    '4:3',
    '1:1',
    '9:16',
    '21:9',
    '3:2',
    '2:1',
  ];

  /**
   * Crop a video frame
   * @param width Original width
   * @param height Original height
   * @param x X offset
   * @param y Y offset
   * @param params Additional crop parameters
   * @returns Cropped frame data
   */
  crop(width: number, height: number, x: number, y: number, params: CropParams = {}): any {
    // Set default parameters
    const cropParams = {
      x: params.x || 0,
      y: params.y || 0,
      width: params.width,
      height: params.height,
      aspectRatio: params.aspectRatio,
      maintainAspectRatio: params.maintainAspectRatio !== undefined ? params.maintainAspectRatio : true,
    };

    // Calculate crop dimensions if maintainAspectRatio is true
    let cropWidth = cropParams.width || width - cropParams.x;
    let cropHeight = cropParams.height || height - cropParams.y;

    if (cropParams.maintainAspectRatio && cropParams.aspectRatio) {
      const [ratioWidth, ratioHeight] = cropParams.aspectRatio.split(':').map(Number);
      const targetRatio = ratioWidth / ratioHeight;
      const currentRatio = cropWidth / cropHeight;

      if (currentRatio > targetRatio) {
        cropHeight = cropWidth / targetRatio;
      } else {
        cropWidth = cropHeight * targetRatio;
      }
    }

    // Ensure crop dimensions don't exceed original
    cropWidth = Math.min(cropWidth, width - cropParams.x);
    cropHeight = Math.min(cropHeight, height - cropParams.y);

    // Return crop configuration
    return {
      ...params,
      crop: {
        x: cropParams.x,
        y: cropParams.y,
        width: Math.max(1, Math.floor(cropWidth)),
        height: Math.max(1, Math.floor(cropHeight)),
      },
      originalWidth: width,
      originalHeight: height,
      description: `Crop from (${cropParams.x}, ${cropParams.y}) to ${cropParams.width}x${cropParams.height || 'auto'} (${cropWidth}x${cropHeight})`,
    };
  }

  /**
   * Resize video frame
   * @param width Original width
   * @param height Original height
   * @param params Resize parameters
   * @returns Resized frame data
   */
  resize(width: number, height: number, params: CropParams = {}): any {
    // Set default parameters
    const resizeParams = {
      width: params.width,
      height: params.height,
      aspectRatio: params.aspectRatio,
      maintainAspectRatio: params.maintainAspectRatio !== undefined ? params.maintainAspectRatio : true,
    };

    let resizeWidth = resizeParams.width || width;
    let resizeHeight = resizeParams.height || height;

    if (resizeParams.maintainAspectRatio && resizeParams.aspectRatio) {
      const [ratioWidth, ratioHeight] = resizeParams.aspectRatio.split(':').map(Number);
      const targetRatio = ratioWidth / ratioHeight;
      const currentRatio = resizeWidth / resizeHeight;

      if (currentRatio > targetRatio) {
        resizeHeight = resizeWidth / targetRatio;
      } else {
        resizeWidth = resizeHeight * targetRatio;
      }
    }

    // Ensure resize dimensions are reasonable
    resizeWidth = Math.max(1, Math.floor(resizeWidth));
    resizeHeight = Math.max(1, Math.floor(resizeHeight));

    return {
      ...params,
      resize: {
        width: resizeWidth,
        height: resizeHeight,
      },
      originalWidth: width,
      originalHeight: height,
      description: `Resize from ${width}x${height} to ${resizeWidth}x${resizeHeight}`,
    };
  }

  /**
   * Fit video to frame with cropping
   * @param width Original width
   * @param height Original height
   * @param targetWidth Target width
   * @param targetHeight Target height
   * @param params Fit parameters
   * @returns Fitted frame data
   */
  fit(width: number, height: number, targetWidth: number, targetHeight: number, params: CropParams = {}): any {
    // Calculate resize ratio to fit within target while maintaining aspect ratio
    const ratio = Math.min(targetWidth / width, targetHeight / height);
    
    // Calculate resized dimensions
    let resizedWidth = Math.floor(width * ratio);
    let resizedHeight = Math.floor(height * ratio);

    // If maintaining aspect ratio and target has different ratio, crop
    if (params.maintainAspectRatio !== false) {
      const [targetRatioW, targetRatioH] = (params.aspectRatio || '16:9').split(':').map(Number);
      const targetRatio = targetRatioW / targetRatioH;
      const currentRatio = resizedWidth / resizedHeight;

      if (Math.abs(currentRatio - targetRatio) > 0.01) {
        // Need to crop to match target aspect ratio
        if (currentRatio > targetRatio) {
          // Too wide, crop width
          resizedWidth = Math.floor(resizedHeight * targetRatio);
        } else {
          // Too tall, crop height
          resizedHeight = Math.floor(resizedWidth / targetRatio);
        }
      }
    }

    // Center the crop
    const cropX = params.x !== undefined ? params.x : Math.max(0, Math.floor((width - resizedWidth) / 2));
    const cropY = params.y !== undefined ? params.y : Math.max(0, Math.floor((height - resizedHeight) / 2));

    // Perform the crop
    return this.crop(width, height, cropX, cropY, {
      ...params,
      width: resizedWidth,
      height: resizedHeight,
      x: cropX,
      y: cropY,
    });
  }

  /**
   * Get supported aspect ratios
   */
  getAspectRatios(): string[] {
    return [...this.aspectRatios];
  }

  /**
   * Check if aspect ratio is supported
   * @param aspectRatio Aspect ratio to check
   * @returns Whether the aspect ratio is supported
   */
  isAspectRatioSupported(aspectRatio: string): boolean {
    return this.aspectRatios.includes(aspectRatio);
  }
}

export default Crop;