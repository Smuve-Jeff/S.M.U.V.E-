import { ComponentFixture, TestBed } from '@angular/core/testing';
import { VocalSuiteComponent } from './vocal-suite.component';
import { UIService } from '../../services/ui.service';
import { Router } from '@angular/router';
import { signal } from '@angular/core';

describe('VocalSuiteComponent', () => {
  let component: VocalSuiteComponent;
  let fixture: ComponentFixture<VocalSuiteComponent>;
  let mockUIService: any;
  let mockRouter: any;

  beforeEach(async () => {
    mockUIService = {
      activeTheme: signal({ name: 'test', primary: 'purple' }),
      navigateToView: jest.fn(),
    };
    mockRouter = {
      navigate: jest.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [VocalSuiteComponent],
      providers: [
        { provide: UIService, useValue: mockUIService },
        { provide: Router, useValue: mockRouter },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(VocalSuiteComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should change activeSubView', () => {
    component.setSubView('ai-pitch');
    expect(component.activeSubView()).toBe('ai-pitch');
  });

  it('should toggle bypass', () => {
    const initialBypass = component.isBypassed();
    component.toggleBypass();
    expect(component.isBypassed()).toBe(!initialBypass);
  });

  it('should update correctionSpeed', () => {
    component.correctionSpeed.set(50);
    expect(component.correctionSpeed()).toBe(50);
  });
});
