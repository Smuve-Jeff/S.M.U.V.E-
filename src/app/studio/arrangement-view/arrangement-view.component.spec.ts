import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ArrangementViewComponent } from './arrangement-view.component';
import { MusicManagerService } from '../../services/music-manager.service';
import { signal } from '@angular/core';

describe('ArrangementViewComponent', () => {
  let component: ArrangementViewComponent;
  let fixture: ComponentFixture<ArrangementViewComponent>;
  let mockMusicManager: any;

  beforeEach(async () => {
    mockMusicManager = {
      tracks: signal([]),
      currentStep: signal(-1),
      selectedTrackId: signal(null),
      structure: signal([]),
      chords: signal([]),
      ensureTrack: jest.fn(),
      removeTrack: jest.fn(),
      toggleMute: jest.fn(),
      toggleSolo: jest.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [ArrangementViewComponent],
      providers: [{ provide: MusicManagerService, useValue: mockMusicManager }],
    }).compileComponents();

    fixture = TestBed.createComponent(ArrangementViewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should call musicManager.ensureTrack when adding a track', () => {
    component.addTrack();
    expect(mockMusicManager.ensureTrack).toHaveBeenCalledWith('Piano');
  });

  it('should calculate trackCount from musicManager.tracks', () => {
    mockMusicManager.tracks.set([{ id: 1, name: 'Test', clips: [] }]);
    fixture.detectChanges();
    expect(component.trackCount()).toBe(1);
  });
});
