import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HubComponent } from './hub.component';

import { DatabaseService } from '../services/database.service';
import { GameService } from './game.service';
import { UserProfileService } from '../services/user-profile.service';
import { of } from 'rxjs';

describe('HubComponent', () => {
  let component: HubComponent;
  let fixture: ComponentFixture<HubComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HubComponent],
      providers: [
        { provide: DatabaseService, useValue: {} },
        {
          provide: GameService,
          useValue: {
            listGames: () => of([]),
          },
        },
        {
          provide: UserProfileService,
          useValue: {
            profile: () => ({
              showcases: [],
            }),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HubComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
