/**
 * Text Editor Module
 * Text editing capabilities for captions, titles, and on-screen text
 */

export interface TextStyle {
  // Index signature to allow flexible style properties
  [key: string]: any;
  fontFamily?: string;
  fontSize?: number;
  fontColor?: string;
  backgroundColor?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  alignment?: 'left' | 'center' | 'right';
  opacity?: number;
  shadow?: {
    enabled?: boolean;
    color?: string;
    offsetX?: number;
    offsetY?: number;
  };
}

/**
 * Text editor capabilities
 */
export class TextEditor {
  private defaultStyle: TextStyle = {
    fontFamily: 'Arial',
    fontSize: 36,
    fontColor: '#FFFFFF',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    bold: false,
    italic: false,
    underline: false,
    alignment: 'center',
    opacity: 1.0,
    shadow: {
      enabled: false,
      color: '#000000',
      offsetX: 2,
      offsetY: 2,
    },
  };

  private textEffects = [
    'outline',
    'shadow',
    'glow',
    'gradient',
    'stroke',
    'reflection',
    'flip',
    'rotate',
    'scale',
    'skew',
  ];

  /**
   * Edit a single text string with style
   * @param text Text content
   * @param style Text style options
   * @returns Edited text configuration
   */
  edit(text: string, style?: any): any {
    // Merge with default style
    const textStyle = { ...this.defaultStyle, ...style };

    // Validate text
    if (!text || text.trim() === '') {
      throw new Error('Text content cannot be empty');
    }

    // Return text editing configuration
    return {
      text,
      style: textStyle,
      description: `Text: "${text.substring(0, 30)}${text.length > 30 ? '...' : ''}" with ${Object.keys(textStyle).filter(k => textStyle[k] !== this.defaultStyle[k]).length} custom style properties`,
    };
  }

  /**
   * Edit multiple text strings (batch)
   * @param texts Array of text strings
   * @param style Common style for all texts
   * @returns Batch text editing configuration
   */
  editBatch(texts: string[], style?: any): any {
    // Apply style to all texts
    const editedTexts = texts.map(text => this.edit(text, style));

    return {
      texts: editedTexts.map(t => t.text),
      styles: editedTexts.map(t => t.style),
      count: editedTexts.length,
      description: `${editedTexts.length} text(s) edited with custom styles`,
    };
  }

  /**
   * Add text effect to text
   * @param text Text content
   * @param effect Text effect to apply
   * @param effectParams Effect parameters
   * @returns Text with effect
   */
  addEffect(text: string, effect: string, effectParams: any = {}): any {
    // Validate effect
    if (!this.textEffects.includes(effect)) {
      throw new Error(`Unknown text effect: ${effect}. Available: ${this.textEffects.join(', ')}`);
    }

    // Apply effect based on name
    const baseStyle = this.edit(text);

    switch (effect) {
      case 'outline':
        return this.addOutlineEffect(baseStyle, effectParams);
      case 'shadow':
        return this.addShadowEffect(baseStyle, effectParams);
      case 'glow':
        return this.addGlowEffect(baseStyle, effectParams);
      case 'gradient':
        return this.addGradientEffect(baseStyle, effectParams);
      case 'stroke':
        return this.addStrokeEffect(baseStyle, effectParams);
      case 'reflection':
        return this.addReflectionEffect(baseStyle, effectParams);
      case 'flip':
        return this.addFlipEffect(baseStyle, effectParams);
      case 'rotate':
        return this.addRotateEffect(baseStyle, effectParams);
      case 'scale':
        return this.addScaleEffect(baseStyle, effectParams);
      case 'skew':
        return this.addSkewEffect(baseStyle, effectParams);
      default:
        return this.addGenericEffect(baseStyle, effect, effectParams);
    }
  }

  /**
   * Get available text effects
   * @returns Array of text effect names
   */
  getTextEffects(): string[] {
    return [...this.textEffects];
  }

  /**
   * Check if text effect is supported
   * @param effect Text effect to check
   * @returns Whether the text effect is supported
   */
  isTextEffectSupported(effect: string): boolean {
    return this.textEffects.includes(effect);
  }

  // Individual text effect implementations

  private addOutlineEffect(style: TextStyle, params: any): any {
    return {
      ...style,
      effect: 'outline',
      effectParams: { ...params, color: params.color || '#000000', width: params.width || 2 },
      description: `Outline effect with ${params.color || '#000000'} color and ${params.width || 2}px width`,
    };
  }

  private addShadowEffect(style: TextStyle, params: any): any {
    return {
      ...style,
      effect: 'shadow',
      effectParams: { ...params, color: params.color || '#000000', offsetX: params.offsetX || 2, offsetY: params.offsetY || 2 },
      description: `Shadow effect with ${params.color || '#000000'} color and ${params.offsetX || 2}px offset`,
    };
  }

  private addGlowEffect(style: TextStyle, params: any): any {
    return {
      ...style,
      effect: 'glow',
      effectParams: { ...params, color: params.color || '#FFFFFF', intensity: params.intensity || 0.5 },
      description: `Glow effect with ${params.color || '#FFFFFF'} color and ${params.intensity || 0.5} intensity`,
    };
  }

  private addGradientEffect(style: TextStyle, params: any): any {
    return {
      ...style,
      effect: 'gradient',
      effectParams: { ...params, colors: params.colors || ['#FF0000', '#0000FF'] },
      description: `Gradient effect with colors ${params.colors?.join(' to ') || 'red to blue'}`,
    };
  }

  private addStrokeEffect(style: TextStyle, params: any): any {
    return {
      ...style,
      effect: 'stroke',
      effectParams: { ...params, color: params.color || '#000000', width: params.width || 2 },
      description: `Stroke effect with ${params.color || '#000000'} color and ${params.width || 2}px width`,
    };
  }

  private addReflectionEffect(style: TextStyle, params: any): any {
    return {
      ...style,
      effect: 'reflection',
      effectParams: { ...params, height: params.height || 20, opacity: params.opacity || 0.5 },
      description: `Reflection effect with ${params.height || 20}px height and ${params.opacity || 0.5} opacity`,
    };
  }

  private addFlipEffect(style: TextStyle, params: any): any {
    const direction = params.direction || 'horizontal';
    return {
      ...style,
      effect: 'flip',
      effectParams: { ...params, direction },
      description: `Flip ${direction} effect`,
    };
  }

  private addRotateEffect(style: TextStyle, params: any): any {
    const angle = params.angle || 0;
    return {
      ...style,
      effect: 'rotate',
      effectParams: { ...params, angle },
      description: `Rotate ${angle} degrees effect`,
    };
  }

  private addScaleEffect(style: TextStyle, params: any): any {
    const factor = params.factor || 1;
    return {
      ...style,
      effect: 'scale',
      effectParams: { ...params, factor },
      description: `Scale ${factor}x effect`,
    };
  }

  private addSkewEffect(style: TextStyle, params: any): any {
    const horizontal = params.horizontal !== undefined ? params.horizontal : true;
    const vertical = params.vertical !== undefined ? params.vertical : false;
    return {
      ...style,
      effect: 'skew',
      effectParams: { ...params, horizontal, vertical },
      description: `Skew ${horizontal ? 'horizontal' : ''}${vertical ? 'vertical' : ''} effect`,
    };
  }

  private addGenericEffect(style: TextStyle, effect: string, params: any): any {
    return {
      ...style,
      effect,
      effectParams: params,
      description: `${effect} effect`,
    };
  }
}

export default TextEditor;