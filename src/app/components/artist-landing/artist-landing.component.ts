import {
  Component,
  inject,
  signal,
  computed,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import { UserProfileService } from '../../services/user-profile.service';
import { AiService } from '../../services/ai.service';
import { ArtistOnlineFingerprintService } from '../../services/artist-online-fingerprint.service';
import { EnhancedArtistQuestionnaireEngine } from '../../services/enhanced-artist-questionnaire-engine';

/**
 * Accent and icon per fingerprint destination, so the public page shows the
 * artist's own platforms rather than a fixed list.
 */
const PLATFORM_STYLE: Record<string, { icon: string; color: string }> = {
  'spotify-for-artists': { icon: '🟢', color: '#1DB954' },
  'apple-music-for-artists': { icon: '🍎', color: '#FA243C' },
  'youtube-for-artists': { icon: '▶️', color: '#FF0000' },
  'soundcloud-for-artists': { icon: '☁️', color: '#FF7700' },
  'amazon-for-artists': { icon: '📦', color: '#25D1DA' },
  'deezer-for-creators': { icon: '🎧', color: '#A238FF' },
  'tidal-artist-home': { icon: '🌊', color: '#00FFFF' },
  bandcamp: { icon: '🎪', color: '#629AA9' },
  audiomack: { icon: '🎵', color: '#FFA200' },
  'pandora-amp': { icon: '📻', color: '#3668FF' },
  chartmetric: { icon: '📊', color: '#0E7C7B' },
  soundcharts: { icon: '📊', color: '#0E7C7B' },
  viberate: { icon: '📊', color: '#0E7C7B' },
  songstats: { icon: '📊', color: '#0E7C7B' },
};

@Component({
  selector: 'app-artist-landing',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './artist-landing.component.html',
  styleUrls: ['./artist-landing.component.css'],
})
export class ArtistLandingComponent implements OnDestroy {
  private route = inject(ActivatedRoute);
  private routeSub: Subscription | null = null;
  private userProfileService = inject(UserProfileService);
  private aiService = inject(AiService);
  private fingerprint = inject(ArtistOnlineFingerprintService);
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

  /**
   * The artist's real, recorded links.
   *
   * This used to be read from `profile.services`, which is the production
   * services chip group ("Stem delivery", "Mixing"), so the page advertised
   * Spotify, Apple and TikTok buttons for artists who had claimed none of them —
   * and every one of those buttons pointed at `"#"`. Buttons now come from the
   * official profile record and go to the address the artist stored.
   */
  socialLinks = computed(() => {
    const profile = this.profile() as any;
    const seen = new Set<string>();
    const links: Array<{
      label: string;
      url: string;
      icon: string;
      color: string;
    }> = [];

    const push = (label: string, url: unknown, icon: string, color: string) => {
      const value = typeof url === 'string' ? url.trim() : '';
      // Only real, navigable addresses: a button that goes nowhere is worse
      // than no button on the artist's public page.
      if (!/^https?:\/\//i.test(value) || seen.has(value)) return;
      seen.add(value);
      links.push({ label, url: value, icon, color });
    };

    (profile.officialArtistProfiles || []).forEach((link: any) => {
      const destinationId = String(link?.destinationId || '');
      const destination = this.fingerprint.destination(destinationId);
      const style = PLATFORM_STYLE[destinationId] || {
        icon: '🔗',
        color: '#0E7C7B',
      };
      push(
        destination?.label || destinationId || 'Official profile',
        link?.url,
        style.icon,
        style.color
      );
    });

    push(
      'Website',
      profile.website || profile.artistIdentity?.core?.officialWebsite,
      '🌐',
      '#0E7C7B'
    );

    return links;
  });

  strategicInsights = computed(() =>
    this.aiService.getUpgradeRecommendations().slice(0, 4)
  );

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
    // Keep the heading reactive when the route param changes while the
    // component instance is reused (/artist/A -> /artist/B). Reading
    // route.snapshot inside an effect never re-runs for param changes.
    this.routeSub = this.route.paramMap.subscribe((params) => {
      const name = params.get('name');
      if (name) {
        this.artistName.set(name);
      }
    });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
  }
}
