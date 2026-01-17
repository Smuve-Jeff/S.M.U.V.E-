import {
  Component,
  ChangeDetectionStrategy,
  input,
  signal,
  computed,
  inject,
  effect,
  output,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppTheme } from '../../services/app-theme';
import { AiService, Type } from '../../services/ai.service';
import { MOCK_ARTISTS } from './mock-artists';

export interface ArtistProfile {
  id: string;
  name: string;
  genre: string;
  location: string;
  bio: string;
  contact: string;
  imageUrl: string;
  collaborationInterest: string[];
  genres: string[];
  influences: string[];
  links: { type: string; url: string }[];
}

@Component({
  selector: 'app-networking',
  templateUrl: './networking.component.html',
  styleUrls: ['./networking.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [FormsModule],
})
export class NetworkingComponent {
  theme = input.required<AppTheme>();
  initialSearchQuery = input<string | null>(null);
  artistProfileSelected = output<ArtistProfile>();

  searchLocation = signal('');
  collaborationFilter = signal<string>('');
  displayedArtists = signal<ArtistProfile[]>(MOCK_ARTISTS);
  isLoading = signal(false);
  errorMessage = signal<string | null>(null);

  private aiService = inject(AiService);
  isAiAvailable = computed(() => this.aiService.isAiAvailable());

  constructor() {
    effect(() => {
      const query = this.initialSearchQuery();
      if (query) {
        this.searchLocation.set(query);
        this.searchArtists();
      }
    });
  }

  async searchArtists(): Promise<void> {
    const locationQuery = this.searchLocation().trim();
    const filter = this.collaborationFilter().trim();
    this.isLoading.set(true);
    this.errorMessage.set(null);

    if (!this.isAiAvailable()) {
      this.fallbackSearch(locationQuery, filter);
      return;
    }

    try {
      const prompt = `Given artists: ${JSON.stringify(MOCK_ARTISTS)}. Find artists matching location "${locationQuery}" and collaboration interest "${filter}". Return IDs as JSON: {"matchingArtistIds": ["id1"]}.`;
      const response = await this.aiService.genAI!.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              matchingArtistIds: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
          },
        },
      });

      let jsonText = response.text || '{}';
      // Clean up potential markdown code blocks which can cause JSON parse errors
      jsonText = jsonText
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      // Guard against invalid JSON strings before parsing
      if (!jsonText || jsonText === 'undefined' || jsonText === 'null') {
        throw new Error('Invalid JSON received from AI');
      }

      const result = JSON.parse(jsonText);
      const ids = new Set(result.matchingArtistIds || []);
      const filtered = MOCK_ARTISTS.filter((a) => ids.has(a.id));
      this.displayedArtists.set(filtered);
      if (filtered.length === 0)
        this.errorMessage.set('AI found no matching artists.');
    } catch (error) {
      console.error('Networking search error:', error);
      this.errorMessage.set('AI search failed. Using basic filter.');
      this.fallbackSearch(locationQuery, filter);
    } finally {
      this.isLoading.set(false);
    }
  }

  private fallbackSearch(location: string, filter: string) {
    const filtered = MOCK_ARTISTS.filter(
      (artist) =>
        (!location ||
          artist.location.toLowerCase().includes(location.toLowerCase())) &&
        (!filter ||
          artist.collaborationInterest.some((i) =>
            i.toLowerCase().includes(filter.toLowerCase())
          ))
    );
    this.displayedArtists.set(filtered);
    if (filtered.length === 0) this.errorMessage.set('No artists found.');
    this.isLoading.set(false);
  }

  clearSearch(): void {
    this.searchLocation.set('');
    this.collaborationFilter.set('');
    this.displayedArtists.set(MOCK_ARTISTS);
    this.errorMessage.set(null);
  }

  viewArtistDetail(artist: ArtistProfile): void {
    this.artistProfileSelected.emit(artist);
  }
}
