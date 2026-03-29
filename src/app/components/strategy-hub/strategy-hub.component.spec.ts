import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StrategyHubComponent } from './strategy-hub.component';
import { provideRouter } from '@angular/router';
import { API_KEY_TOKEN, AiService } from '../../services/ai.service';
import { MarketingService } from '../../services/marketing.service';
import { UserProfileService } from '../../services/user-profile.service';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { signal } from '@angular/core';

describe('StrategyHubComponent', () => {
  let component: StrategyHubComponent;
  let fixture: ComponentFixture<StrategyHubComponent>;

  const mockProfile = {
    id: 'test',
    artistName: 'Test Artist',
    primaryGenre: 'Hip-Hop',
    careerGoals: ['Streaming Growth'],
    catalog: [],
    marketingCampaigns: [],
  };

  const mockAiService = {
    systemStatus: signal({
      cpuLoad: 10,
      neuralSync: 90,
      memoryUsage: 40,
      latency: 1,
      marketVelocity: 50,
      activeProcesses: 5,
    }),
    intelligenceBriefs: signal([]),
    marketAlerts: signal([]),
    advisorAdvice: signal([]),
    getDynamicChecklist: jest.fn().mockReturnValue([
      { id: 'task-1', label: 'Test Task', completed: false, category: 'Production', impact: 'High', description: 'Do something' },
    ]),
    getViralHooks: jest.fn().mockReturnValue(['Hook 1', 'Hook 2']),
    getUpgradeRecommendations: jest.fn().mockReturnValue([
      { id: 'upg-1', title: 'Test Upgrade', type: 'Software', description: 'Desc', cost: '$0', url: '', impact: 'High' },
    ]),
  };

  const mockMarketingService = {
    campaigns: signal([]),
    socialData: signal([
      { platform: 'Instagram', followers: 12500, engagementRate: 4.2, topPosts: [], lastUpdated: Date.now() },
    ]),
    streamingData: signal([
      { platform: 'Spotify', monthlyListeners: 85000, totalStreams: 1200000, topTracks: [], playlistAdds: 1250, lastUpdated: Date.now() },
    ]),
    createCampaign: jest.fn().mockResolvedValue(undefined),
    deleteCampaign: jest.fn().mockResolvedValue(undefined),
    getProjections: jest.fn().mockReturnValue({ reach: 1500, conversions: 15, engagement: 50 }),
  };

  const mockProfileService = {
    profile: signal(mockProfile),
    updateProfile: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StrategyHubComponent, NoopAnimationsModule],
      providers: [
        provideRouter([]),
        { provide: AiService, useValue: mockAiService },
        { provide: MarketingService, useValue: mockMarketingService },
        { provide: UserProfileService, useValue: mockProfileService },
        { provide: API_KEY_TOKEN, useValue: 'TEST_KEY' },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(StrategyHubComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should default to overview tab', () => {
    expect(component.activeHubTab()).toBe('overview');
  });

  it('should switch tabs via setTab()', () => {
    component.setTab('campaigns');
    expect(component.activeHubTab()).toBe('campaigns');

    component.setTab('analytics');
    expect(component.activeHubTab()).toBe('analytics');

    component.setTab('social');
    expect(component.activeHubTab()).toBe('social');
  });

  it('should load strategic tasks on init', () => {
    expect(mockAiService.getDynamicChecklist).toHaveBeenCalled();
    expect(component.strategicTasks().length).toBeGreaterThan(0);
  });

  it('should toggle task completion reactively', () => {
    const tasks = component.strategicTasks();
    expect(tasks[0].completed).toBe(false);

    component.toggleTask('task-1');
    expect(component.strategicTasks()[0].completed).toBe(true);

    component.toggleTask('task-1');
    expect(component.strategicTasks()[0].completed).toBe(false);
  });

  it('should compute totalFollowers from social data', () => {
    expect(component.totalFollowers()).toBe(12500);
  });

  it('should compute totalStreams from streaming data', () => {
    expect(component.totalStreams()).toBe(1200000);
  });

  it('should compute totalMonthlyListeners from streaming data', () => {
    expect(component.totalMonthlyListeners()).toBe(85000);
  });

  it('should format numbers correctly', () => {
    expect(component.formatNumber(1000)).toBe('1.0K');
    expect(component.formatNumber(1500000)).toBe('1.5M');
    expect(component.formatNumber(500)).toBe('500');
  });

  it('should show/hide campaign form', () => {
    expect(component.showCampaignForm()).toBe(false);
    component.showCampaignForm.set(true);
    expect(component.showCampaignForm()).toBe(true);
  });

  it('should call deleteCampaign on service', async () => {
    await component.deleteCampaign('camp-123');
    expect(mockMarketingService.deleteCampaign).toHaveBeenCalledWith('camp-123');
  });

  it('should not save campaign if name is empty', async () => {
    component.newCampaign.set({ name: '', budget: 0, platforms: ['Instagram'], strategyLevel: 'Modern Professional' });
    await component.saveCampaign();
    expect(mockMarketingService.createCampaign).not.toHaveBeenCalled();
  });

  it('should save campaign and reset form when name is provided', async () => {
    component.newCampaign.set({ name: 'Test Campaign', budget: 500, platforms: ['TikTok'], strategyLevel: 'Aggressive High Energy' });
    component.showCampaignForm.set(true);
    await component.saveCampaign();
    expect(mockMarketingService.createCampaign).toHaveBeenCalled();
    expect(component.newCampaign().name).toBe('');
    expect(component.showCampaignForm()).toBe(false);
  });

  it('should return correct impact colors', () => {
    expect(component.getImpactColor('Extreme')).toContain('font-black');
    expect(component.getImpactColor('High')).toBe('text-brand-primary');
    expect(component.getImpactColor('Medium')).toBe('text-yellow-400');
    expect(component.getImpactColor('Low')).toBe('text-white');
  });

  it('should return correct campaign status classes', () => {
    expect(component.getCampaignStatusClass('Active')).toContain('brand-primary');
    expect(component.getCampaignStatusClass('Paused')).toContain('yellow-400');
    expect(component.getCampaignStatusClass('Completed')).toContain('blue-400');
    expect(component.getCampaignStatusClass('Draft')).toContain('silver-dim');
  });

  it('should load viral hooks from AI service', () => {
    expect(component.viralHooks).toEqual(['Hook 1', 'Hook 2']);
  });

  it('should load upgrade recommendations from AI service', () => {
    expect(component.upgradeRecs.length).toBe(1);
  });
});
