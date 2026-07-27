import { Component, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { UserProfileService } from '../../services/user-profile.service';
import { AiService } from '../../services/ai.service';
import { ArtistIdentityService } from '../../services/artist-identity.service';
import { EnhancedArtistQuestionnaireEngine } from '../../services/enhanced-artist-questionnaire-engine';

@Component({
  selector: 'app-artist-landing',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './artist-landing.component.html',
  styleUrls: ['./artist-landing.component.css'],
})
export class ArtistLandingComponent {
  private route = inject(ActivatedRoute);
  private userProfileService = inject(UserProfileService);
  private aiService = inject(AiService);
  private artistIdentityService = inject(ArtistIdentityService);
  private questionnaireEngine = inject(EnhancedArtistQuestionnaireEngine);

  artistName = signal('');
  profile = this.userProfileService.profile;

  personaSynthesis = computed(
    () => this.profile().musicalJourney?.personaSynthesis
  );
  journey = computed(() => this.profile().musicalJourney);

  strengthMeter = computed(() => {
    return this.questionnaireEngine.calculateStrength(this.profile());
  });

  getStrengthColor(score: number): string {
    if (score >= 80) return '#10b981';
    if (score >= 60) return '#0e7c7b';
    if (score >= 40) return '#f59e0b';
    if (score >= 20) return '#f97316';
    return '#ef4444';
  }

  strengthDimensions = computed(() => {
    const s = this.strengthMeter();
    return [
      { label: 'Identity Clarity', score: s.identityClarity },
      { label: 'Musical Depth', score: s.musicalDepth },
      { label: 'Technical Ability', score: s.technicalAbility },
      { label: 'Business Readiness', score: s.businessReadiness },
      { label: 'Brand Definition', score: s.brandDefinition },
      { label: 'AI Integration', score: s.aiIntegration },
    ];
  });

  identitySnapshot = computed(() =>
    this.artistIdentityService.buildIdentitySnapshot(this.profile())
  );

  strategicInsights = computed(() =>
    this.aiService.getUpgradeRecommendations().slice(0, 4)
  );

  socialLinks = computed(() => ({
    spotify: this.profile().services?.includes('Spotify'),
    apple: this.profile().services?.includes('Apple Music'),
    soundcloud: this.profile().services?.includes('SoundCloud'),
    youtube: this.profile().services?.includes('YouTube'),
    tiktok: this.profile().services?.includes('TikTok'),
    instagram: this.profile().services?.includes('Instagram'),
    website: !!this.profile().website,
  }));

  aiBio = computed(() => {
    const j = this.journey();
    const synth = this.personaSynthesis();
    if (!j) return '';

    const parts: string[] = [];
    parts.push(`${this.profile().artistName || 'This artist'} is `);

    if (synth?.archetype) {
      const arch = synth.archetype.split(' — ')[0] || synth.archetype;
      parts.push(`${arch.toLowerCase()} `);
    }

    parts.push(
      `an independent ${this.profile().primaryGenre?.toLowerCase() || 'music'} artist `
    );

    if (j.originStory) {
      const originMap: Record<string, string> = {
        'self-taught':
          'who forged their sound through raw passion and self-discovery',
        formal:
          'with classical discipline now channeled into modern sonic landscapes',
        community: 'raised by the energy of their community and local scene',
        industry: 'who cut their teeth in the industry trenches',
        digital: 'born in the digital age, crafting sound from bedroom studios',
        late: "who proves it's never too late to find your voice",
      };
      parts.push(originMap[j.originStory] || 'with a unique story to tell');
    } else {
      parts.push('with a unique vision and uncompromising creative drive');
    }

    parts.push('. ');

    if (j.songwritingStyle) {
      parts.push(
        `Their creative process follows a ${j.songwritingStyle.toLowerCase()} approach, `
      );
    }

    if (j.productionPhilosophy) {
      parts.push(
        `embracing a ${j.productionPhilosophy.toLowerCase()} production philosophy `
      );
    }

    if (j.creativeCatalyst) {
      parts.push(`fueled by ${j.creativeCatalyst.toLowerCase()}. `);
    } else {
      parts.push(`driven by an unstoppable creative impulse. `);
    }

    if (j.ultimateVision) {
      parts.push(`Vision: ${j.ultimateVision}`);
    }

    if (synth?.productionAphorism) {
      parts.push(` \u201C${synth.productionAphorism}\u201D`);
    }

    return parts.join('');
  });

  featuredTrack = computed(() => {
    const catalog = this.profile().catalog || [];
    return catalog.length > 0 ? catalog[0] : null;
  });

  constructor() {
    effect(() => {
      const name = this.route.snapshot.paramMap.get('name');
      if (name) {
        this.artistName.set(name);
      }
    });
  }
}
