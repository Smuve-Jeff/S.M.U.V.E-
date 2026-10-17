/**
 * Transitions Module
 * Transition effects between video clips
 */

export interface TransitionParams {
  duration?: number;
  easing?: string;
  direction?: string;
}

/**
 * Transition effects capabilities
 */
export class Transitions {
  private transitions = [
    'fade',
    'slide',
    'dissolve',
    'wipe',
    'zoom',
    'rotate',
    'flip',
    'push',
    'pull',
    'fade-through-black',
    'fade-through-white',
    'dissolve-through-black',
    'dissolve-through-white',
    'slide-left',
    'slide-right',
    'slide-up',
    'slide-down',
    'zoom-in',
    'zoom-out',
    'rotate-left',
    'rotate-right',
    'flip-horizontal',
    'flip-vertical',
  ];

  /**
   * Apply a transition between two video clips
   * @param transitionName Name of the transition to apply
   * @param fromClip Source clip data
   * @param toClip Target clip data
   * @param params Transition parameters
   * @returns Transition result
   */
  apply(transitionName: string, fromClip: any, toClip: any, params: TransitionParams = {}): any {
    // Validate transition exists
    if (!this.transitions.includes(transitionName)) {
      throw new Error(`Unknown transition: ${transitionName}. Available: ${this.transitions.join(', ')}`);
    }

    // Apply transition based on name
    switch (transitionName) {
      case 'fade':
        return this.applyFade(fromClip, toClip, params);
      case 'slide':
        return this.applySlide(fromClip, toClip, params);
      case 'dissolve':
        return this.applyDissolve(fromClip, toClip, params);
      case 'wipe':
        return this.applyWipe(fromClip, toClip, params);
      case 'zoom':
        return this.applyZoom(fromClip, toClip, params);
      case 'rotate':
        return this.applyRotate(fromClip, toClip, params);
      case 'flip':
        return this.applyFlip(fromClip, toClip, params);
      case 'push':
        return this.applyPush(fromClip, toClip, params);
      case 'pull':
        return this.applyPull(fromClip, toClip, params);
      case 'fade-through-black':
        return this.applyFadeThroughBlack(fromClip, toClip, params);
      case 'fade-through-white':
        return this.applyFadeThroughWhite(fromClip, toClip, params);
      case 'dissolve-through-black':
        return this.applyDissolveThroughBlack(fromClip, toClip, params);
      case 'dissolve-through-white':
        return this.applyDissolveThroughWhite(fromClip, toClip, params);
      case 'slide-left':
        return this.applySlideLeft(fromClip, toClip, params);
      case 'slide-right':
        return this.applySlideRight(fromClip, toClip, params);
      case 'slide-up':
        return this.applySlideUp(fromClip, toClip, params);
      case 'slide-down':
        return this.applySlideDown(fromClip, toClip, params);
      case 'zoom-in':
        return this.applyZoomIn(fromClip, toClip, params);
      case 'zoom-out':
        return this.applyZoomOut(fromClip, toClip, params);
      case 'rotate-left':
        return this.applyRotateLeft(fromClip, toClip, params);
      case 'rotate-right':
        return this.applyRotateRight(fromClip, toClip, params);
      case 'flip-horizontal':
        return this.applyFlipHorizontal(fromClip, toClip, params);
      case 'flip-vertical':
        return this.applyFlipVertical(fromClip, toClip, params);
      default:
        return this.applyGeneric(transitionName, fromClip, toClip, params);
    }
  }

  /**
   * Enhance video with transition effects
   * @param videoInput Input video data
   * @param transitionName Name of the transition
   * @param toClip Target clip data
   * @param params Transition parameters
   * @returns Enhanced video data
   */
  enhance(videoInput: any, transitionName: string, toClip: any, params: TransitionParams = {}): any {
    // Validate transition exists
    if (!this.transitions.includes(transitionName)) {
      throw new Error(`Unknown transition: ${transitionName}`);
    }

    // Apply the transition
    return this.apply(transitionName, videoInput, toClip, params);
  }

  // Individual transition implementations

  private applyFade(fromClip: any, toClip: any, params: TransitionParams): any {
    const duration = params.duration || 1000;
    const easing = params.easing || 'linear';
    return {
      ...params,
      transition: 'fade',
      duration,
      easing,
      fromClip,
      toClip,
      description: `Fade transition over ${duration}ms with ${easing} easing`,
    };
  }

  private applySlide(fromClip: any, toClip: any, params: TransitionParams): any {
    const duration = params.duration || 1000;
    const direction = params.direction || 'left';
    const easing = params.easing || 'linear';
    return {
      ...params,
      transition: 'slide',
      duration,
      direction,
      easing,
      fromClip,
      toClip,
      description: `Slide ${direction} transition over ${duration}ms with ${easing} easing`,
    };
  }

  private applyDissolve(fromClip: any, toClip: any, params: TransitionParams): any {
    const duration = params.duration || 1000;
    const easing = params.easing || 'linear';
    return {
      ...params,
      transition: 'dissolve',
      duration,
      easing,
      fromClip,
      toClip,
      description: `Dissolve transition over ${duration}ms with ${easing} easing`,
    };
  }

  private applyWipe(fromClip: any, toClip: any, params: TransitionParams): any {
    const duration = params.duration || 1000;
    const direction = params.direction || 'left';
    const easing = params.easing || 'linear';
    return {
      ...params,
      transition: 'wipe',
      duration,
      direction,
      easing,
      fromClip,
      toClip,
      description: `Wipe ${direction} transition over ${duration}ms with ${easing} easing`,
    };
  }

  private applyZoom(fromClip: any, toClip: any, params: TransitionParams): any {
    const duration = params.duration || 1000;
    const easing = params.easing || 'linear';
    return {
      ...params,
      transition: 'zoom',
      duration,
      easing,
      fromClip,
      toClip,
      description: `Zoom transition over ${duration}ms with ${easing} easing`,
    };
  }

  private applyRotate(fromClip: any, toClip: any, params: TransitionParams): any {
    const duration = params.duration || 1000;
    const easing = params.easing || 'linear';
    return {
      ...params,
      transition: 'rotate',
      duration,
      easing,
      fromClip,
      toClip,
      description: `Rotate transition over ${duration}ms with ${easing} easing`,
    };
  }

  private applyFlip(fromClip: any, toClip: any, params: TransitionParams): any {
    const duration = params.duration || 1000;
    const direction = params.direction || 'horizontal';
    const easing = params.easing || 'linear';
    return {
      ...params,
      transition: 'flip',
      duration,
      direction,
      easing,
      fromClip,
      toClip,
      description: `Flip ${direction} transition over ${duration}ms with ${easing} easing`,
    };
  }

  private applyPush(fromClip: any, toClip: any, params: TransitionParams): any {
    const duration = params.duration || 1000;
    const direction = params.direction || 'left';
    const easing = params.easing || 'linear';
    return {
      ...params,
      transition: 'push',
      duration,
      direction,
      easing,
      fromClip,
      toClip,
      description: `Push ${direction} transition over ${duration}ms with ${easing} easing`,
    };
  }

  private applyPull(fromClip: any, toClip: any, params: TransitionParams): any {
    const duration = params.duration || 1000;
    const direction = params.direction || 'left';
    const easing = params.easing || 'linear';
    return {
      ...params,
      transition: 'pull',
      duration,
      direction,
      easing,
      fromClip,
      toClip,
      description: `Pull ${direction} transition over ${duration}ms with ${easing} easing`,
    };
  }

  private applyFadeThroughBlack(fromClip: any, toClip: any, params: TransitionParams): any {
    const duration = params.duration || 1000;
    const easing = params.easing || 'linear';
    return {
      ...params,
      transition: 'fade-through-black',
      duration,
      easing,
      fromClip,
      toClip,
      description: `Fade through black transition over ${duration}ms with ${easing} easing`,
    };
  }

  private applyFadeThroughWhite(fromClip: any, toClip: any, params: TransitionParams): any {
    const duration = params.duration || 1000;
    const easing = params.easing || 'linear';
    return {
      ...params,
      transition: 'fade-through-white',
      duration,
      easing,
      fromClip,
      toClip,
      description: `Fade through white transition over ${duration}ms with ${easing} easing`,
    };
  }

  private applyDissolveThroughBlack(fromClip: any, toClip: any, params: TransitionParams): any {
    const duration = params.duration || 1000;
    const easing = params.easing || 'linear';
    return {
      ...params,
      transition: 'dissolve-through-black',
      duration,
      easing,
      fromClip,
      toClip,
      description: `Dissolve through black transition over ${duration}ms with ${easing} easing`,
    };
  }

  private applyDissolveThroughWhite(fromClip: any, toClip: any, params: TransitionParams): any {
    const duration = params.duration || 1000;
    const easing = params.easing || 'linear';
    return {
      ...params,
      transition: 'dissolve-through-white',
      duration,
      easing,
      fromClip,
      toClip,
      description: `Dissolve through white transition over ${duration}ms with ${easing} easing`,
    };
  }

  private applySlideLeft(fromClip: any, toClip: any, params: TransitionParams): any {
    const duration = params.duration || 1000;
    const easing = params.easing || 'linear';
    return {
      ...params,
      transition: 'slide-left',
      duration,
      easing,
      fromClip,
      toClip,
      description: `Slide left transition over ${duration}ms with ${easing} easing`,
    };
  }

  private applySlideRight(fromClip: any, toClip: any, params: TransitionParams): any {
    const duration = params.duration || 1000;
    const easing = params.easing || 'linear';
    return {
      ...params,
      transition: 'slide-right',
      duration,
      easing,
      fromClip,
      toClip,
      description: `Slide right transition over ${duration}ms with ${easing} easing`,
    };
  }

  private applySlideUp(fromClip: any, toClip: any, params: TransitionParams): any {
    const duration = params.duration || 1000;
    const easing = params.easing || 'linear';
    return {
      ...params,
      transition: 'slide-up',
      duration,
      easing,
      fromClip,
      toClip,
      description: `Slide up transition over ${duration}ms with ${easing} easing`,
    };
  }

  private applySlideDown(fromClip: any, toClip: any, params: TransitionParams): any {
    const duration = params.duration || 1000;
    const easing = params.easing || 'linear';
    return {
      ...params,
      transition: 'slide-down',
      duration,
      easing,
      fromClip,
      toClip,
      description: `Slide down transition over ${duration}ms with ${easing} easing`,
    };
  }

  private applyZoomIn(fromClip: any, toClip: any, params: TransitionParams): any {
    const duration = params.duration || 1000;
    const easing = params.easing || 'linear';
    return {
      ...params,
      transition: 'zoom-in',
      duration,
      easing,
      fromClip,
      toClip,
      description: `Zoom in transition over ${duration}ms with ${easing} easing`,
    };
  }

  private applyZoomOut(fromClip: any, toClip: any, params: TransitionParams): any {
    const duration = params.duration || 1000;
    const easing = params.easing || 'linear';
    return {
      ...params,
      transition: 'zoom-out',
      duration,
      easing,
      fromClip,
      toClip,
      description: `Zoom out transition over ${duration}ms with ${easing} easing`,
    };
  }

  private applyRotateLeft(fromClip: any, toClip: any, params: TransitionParams): any {
    const duration = params.duration || 1000;
    const easing = params.easing || 'linear';
    return {
      ...params,
      transition: 'rotate-left',
      duration,
      easing,
      fromClip,
      toClip,
      description: `Rotate left transition over ${duration}ms with ${easing} easing`,
    };
  }

  private applyRotateRight(fromClip: any, toClip: any, params: TransitionParams): any {
    const duration = params.duration || 1000;
    const easing = params.easing || 'linear';
    return {
      ...params,
      transition: 'rotate-right',
      duration,
      easing,
      fromClip,
      toClip,
      description: `Rotate right transition over ${duration}ms with ${easing} easing`,
    };
  }

  private applyFlipHorizontal(fromClip: any, toClip: any, params: TransitionParams): any {
    const duration = params.duration || 1000;
    const easing = params.easing || 'linear';
    return {
      ...params,
      transition: 'flip-horizontal',
      duration,
      easing,
      fromClip,
      toClip,
      description: `Flip horizontal transition over ${duration}ms with ${easing} easing`,
    };
  }

  private applyFlipVertical(fromClip: any, toClip: any, params: TransitionParams): any {
    const duration = params.duration || 1000;
    const easing = params.easing || 'linear';
    return {
      ...params,
      transition: 'flip-vertical',
      duration,
      easing,
      fromClip,
      toClip,
      description: `Flip vertical transition over ${duration}ms with ${easing} easing`,
    };
  }

  private applyGeneric(transitionName: string, fromClip: any, toClip: any, params: TransitionParams): any {
    return {
      ...params,
      transition: transitionName,
      duration: params.duration || 1000,
      easing: params.easing || 'linear',
      fromClip,
      toClip,
      description: `${transitionName} transition`,
    };
  }
}

export default Transitions;