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

  personaSynthesis = computed(() => this.profile().musicalJourney?.personaSynthesis);
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

  constructor() {
    effect(() => {
      const name = this.route.snapshot.paramMap.get('name');
      if (name) {
        this.artistName.set(name);
        // In a full implementation, fetch the artist profile by name
      }
    });
  }
}
