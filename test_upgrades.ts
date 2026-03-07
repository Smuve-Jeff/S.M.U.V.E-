import { provideAiService, AiService } from './src/app/services/ai.service';
import { UserProfileService } from './src/app/services/user-profile.service';
import { ReputationService } from './src/app/services/reputation.service';
import { TestBed } from '@angular/core/testing';
import 'zone.js';
import 'zone.js/testing';
import { BrowserDynamicTestingModule, platformBrowserDynamicTesting } from '@angular/platform-browser-dynamic/testing';

TestBed.initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting());

const profileService = new UserProfileService();
const reputationService = new ReputationService();
const aiService = new AiService();

// Mock dependencies manually if needed, but here they are injected or used directly
(aiService as any).userProfileService = profileService;
(aiService as any).reputationService = reputationService;

console.log('--- Testing Level 5 ---');
reputationService.state.set({ level: 5, xp: 0, totalXp: 5000, title: 'Novice Producer' });
let recs = aiService.getUpgradeRecommendations();
console.log(recs.map(r => `${r.id}: ${r.title} (Level ${r.minLevel})`));

console.log('\n--- Testing Level 50 ---');
reputationService.state.set({ level: 50, xp: 0, totalXp: 50000, title: 'Legendary Strategic Commander' });
recs = aiService.getUpgradeRecommendations();
console.log(recs.map(r => `${r.id}: ${r.title} (Level ${r.minLevel})`));
