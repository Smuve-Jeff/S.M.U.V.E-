import {
  Component,
  ChangeDetectionStrategy,
  signal,
  ElementRef,
  viewChild,
  output,
  input,
  effect,
  inject,
  computed,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AiService } from '../../services/ai.service';
// FIX: Update AppTheme import to break circular dependency
import { AppTheme } from '../../services/user-context.service';

@Component({
  selector: 'app-image-editor',
  templateUrl: './image-editor.component.html',
  styleUrls: ['./image-editor.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [FormsModule],
})
export class ImageEditorComponent {
  initialPrompt = input<string | null>(null);
  theme = input.required<AppTheme>();

  originalImageUrl = signal<string | null>(null);
  editPrompt = signal('');
  generatedImageUrls = signal<string[]>([]);
  isLoading = signal(false);
  errorMessage = signal<string | null>(null);
  aspectRatio = signal<
    '1:1' | '3:4' | '4:3' | '9:16' | '16:9' | '2:3' | '3:2' | '21:9'
  >('1:1');

  private aiService = inject(AiService);
  // FIX: A computed signal's value must be read by calling it as a function.
  isAiAvailable = computed(() => this.aiService.isAiAvailable());
  fileInputRef = viewChild<ElementRef<HTMLInputElement>>('fileInput');
  imageSelected = output<string>();
  imageAnalysisRequest = output<string>();
  imageGenerated = output<string>();

  constructor() {
    effect(() => {
      const prompt = this.initialPrompt();
      if (prompt) this.editPrompt.set(prompt);
    });
  }

  handleImageUpload(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) =>
        this.originalImageUrl.set(e.target?.result as string);
      reader.readAsDataURL(file);
    }
  }

  async generateImage(): Promise<void> {
    if (!this.isAiAvailable() || !this.aiService.genAI) {
      this.errorMessage.set('AI features are unavailable.');
      return;
    }
    const prompt = this.editPrompt().trim();
    if (!prompt) {
      this.errorMessage.set('Please enter a prompt.');
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);
    try {
      const response = await this.aiService.genAI.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt: prompt,
        config: {
          numberOfImages: 1,
          outputMimeType: 'image/png',
          aspectRatio: this.aspectRatio(),
        },
      });
      const base64ImageBytes = response.generatedImages[0]?.image?.imageBytes;
      if (base64ImageBytes) {
        const imageUrl = `data:image/png;base64,${base64ImageBytes}`;
        this.generatedImageUrls.set([imageUrl]);
        this.imageGenerated.emit(imageUrl);
      } else {
        this.errorMessage.set('No image generated.');
      }
    } catch (error: unknown) {
      this.errorMessage.set(
        `Image generation failed: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      this.isLoading.set(false);
    }
  }

  async editImage(): Promise<void> {
    if (!this.isAiAvailable() || !this.aiService.genAI) {
      this.errorMessage.set('AI features are unavailable.');
      return;
    }
    const originalImage = this.originalImageUrl();
    if (!originalImage) {
      this.errorMessage.set('Please upload an image to edit.');
      return;
    }
    const prompt = this.editPrompt().trim();
    if (!prompt) {
      this.errorMessage.set('Please enter an edit prompt.');
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);
    try {
      // Step 1: Use the multimodal model to generate a new, detailed prompt
      const mimeType = originalImage.split(';')[0].split(':')[1];
      const imageData = originalImage.split(',')[1];
      const imagePart = { inlineData: { mimeType, data: imageData } };
      const textPart = {
        text: `Based on the attached image, create a new, highly detailed and descriptive image generation prompt that incorporates the following user request: "${prompt}". The new prompt should vividly describe the entire desired scene from scratch as if for a text-to-image AI, not just the changes.`,
      };

      const promptResponse = await this.aiService.genAI.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ parts: [imagePart, textPart] }] as any,
      });
      const newPrompt = promptResponse.text;

      // Step 2: Use the generated prompt to create the new image
      const imageResponse = await this.aiService.genAI.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt: newPrompt,
        config: {
          numberOfImages: 1,
          outputMimeType: 'image/png',
          aspectRatio: this.aspectRatio(),
        },
      });

      const base64ImageBytes =
        imageResponse.generatedImages[0]?.image?.imageBytes;
      if (base64ImageBytes) {
        const imageUrl = `data:image/png;base64,${base64ImageBytes}`;
        this.generatedImageUrls.set([imageUrl]);
        this.imageGenerated.emit(imageUrl);
      } else {
        this.errorMessage.set('Image editing failed to produce an image.');
      }
    } catch (error: unknown) {
      this.errorMessage.set(
        `Image editing failed: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      this.isLoading.set(false);
    }
  }

  clearImage(): void {
    this.originalImageUrl.set(null);
    this.generatedImageUrls.set([]);
    this.editPrompt.set('');
    this.errorMessage.set(null);
    if (this.fileInputRef()) this.fileInputRef()!.nativeElement.value = '';
  }

  useAsAlbumArt(): void {
    const urlToEmit = this.generatedImageUrls()[0] || this.originalImageUrl();
    if (urlToEmit) this.imageSelected.emit(urlToEmit);
  }

  requestImageAnalysis(): void {
    const urlToAnalyze =
      this.generatedImageUrls()[0] || this.originalImageUrl();
    if (urlToAnalyze) this.imageAnalysisRequest.emit(urlToAnalyze);
  }
}
