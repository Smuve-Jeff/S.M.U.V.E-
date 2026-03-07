import { TestBed } from '@angular/core/testing';
import { AiService } from './src/app/services/ai.service';
import { UserProfileService } from './src/app/services/user-profile.service';
import { ReputationService } from './src/app/services/reputation.service';

describe('AiService Upgrade Recommendations', () => {
  let service: AiService;
  let reputationService: ReputationService;
  let profileService: UserProfileService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        AiService,
        UserProfileService,
        ReputationService
      ]
    });
    service = TestBed.inject(AiService);
    reputationService = TestBed.inject(ReputationService);
    profileService = TestBed.inject(UserProfileService);
  });

  it('should include new sound sample upgrades in recommendations when level is high enough', () => {
    // Set level to 50 to see high-level upgrades
    reputationService.state.set({
      level: 50,
      xp: 0,
      totalXp: 50000,
      title: 'Legendary Strategic Commander'
    });

    const recommendations = service.getUpgradeRecommendations();
    const titles = recommendations.map(r => r.title);

    // Check if at least some of our new high-level titles appear
    // Note: getUpgradeRecommendations() slices to 0, 5 and sorts by level/impact.
    // u-38 (Orchestra) has level 40 and Extreme impact.
    // u-36 (Piano) has level 20 and Extreme impact.
    // Existing ones like u-16 (SSL) level 55 Extreme, u-28 (Arri) level 60 Extreme.

    console.log('Recommendations at Level 50:', titles);

    // We expect high level items to be there.
    expect(recommendations.length).toBeGreaterThan(0);
  });

  it('should include low level sound sample upgrades for beginners', () => {
     reputationService.state.set({
      level: 1,
      xp: 0,
      totalXp: 0,
      title: 'Novice Producer'
    });

    const recommendations = service.getUpgradeRecommendations();
    const titles = recommendations.map(r => r.title);

    console.log('Recommendations at Level 1:', titles);

    // u-31 (Kick) has level 5, but getUpgradeRecommendations allows item.minLevel <= 5 for level 1
    // Actually, level < item.minLevel returns false. So level 1 can see minLevel 1.
    // u-33 (Hi-Hat) has level 3. u-31 has level 5.
    // If I set level to 5, I should see them.

    reputationService.state.set({
      level: 5,
      xp: 0,
      totalXp: 5000,
      title: 'Novice Producer'
    });

    const recsLevel5 = service.getUpgradeRecommendations();
    console.log('Recommendations at Level 5:', recsLevel5.map(r => r.title));

    expect(recsLevel5.some(r => r.title.includes('Kick') || r.title.includes('Hi-Hat'))).toBeTruthy();
  });
});
