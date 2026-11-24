import { TestBed } from '@angular/core/testing';

import { EffectPresetService } from '../studio/effects/effect-preset.service';
import { WasmInsertPresetService } from '../studio/effects/wasm-insert-preset.service';
import { StudioTelemetryService } from '../studio/studio-telemetry.service';
import { DailyMissionsService } from './daily-missions.service';
import { DeskTelemetryService } from './desk-telemetry.service';
import { GameRatingsService } from './game-ratings.service';

/**
 * One guarded store and the smallest public gesture that would write it.
 *
 * The individual specs already cover the story each store tells; this matrix
 * exists so a NEW store is a row instead of a copy-pasted test, and so every
 * store is fed the same corruption diet: unparseable JSON, JSON `null`, and a
 * payload that parses but has the wrong shape. The wrong-shape case is the one
 * that looks like an empty store and is therefore the most dangerous.
 */
interface GuardedStoreCase {
  name: string;
  storage: 'localStorage' | 'sessionStorage';
  keys: string[];
  /** Payload that does not parse at all. */
  corrupt: string;
  /** Payload that parses but cannot be this store's data. */
  shape: string;
  /** Built AFTER the seed is in place, like a real app boot. */
  create: () => { mutate: () => void; inSession: () => boolean };
}

const effectPresets = (): GuardedStoreCase => {
  const key = 'smuve_fx_insert_presets_v1';
  return {
    name: 'effect presets',
    storage: 'localStorage',
    keys: [key],
    corrupt: '{not json',
    shape: '{"presets":[]}',
    create: () => {
      const service = new EffectPresetService();
      return {
        mutate: () => void service.save('Wide Hall', 'Reverb', { wet: 50 }),
        inSession: () => service.presets().length === 1,
      };
    },
  };
};

const wasmPresets = (): GuardedStoreCase => {
  const key = 'smuve_wasm_insert_presets_v1';
  return {
    name: 'plugin insert presets',
    storage: 'localStorage',
    keys: [key],
    corrupt: '{not json',
    shape: '{"presets":[]}',
    create: () => {
      const service = new WasmInsertPresetService();
      return {
        mutate: () =>
          void service.save('Tight Room', 'smuve.reverb.v2', { wet: 0.4 }),
        inSession: () => service.presets().length === 1,
      };
    },
  };
};

const gameRatings = (): GuardedStoreCase => {
  const key = 'smuve_game_ratings_v1';
  return {
    name: 'game ratings',
    storage: 'localStorage',
    keys: [key],
    corrupt: '{not json',
    shape: '[1,2,3]',
    create: () => {
      const service = new GameRatingsService();
      return {
        mutate: () =>
          void service.recordPlay('game-1', { result: 'win', score: 10 }),
        inSession: () => (service.allStats()['game-1']?.plays ?? 0) === 1,
      };
    },
  };
};

const dailyMissions = (): GuardedStoreCase => {
  const stateKey = 'smuve_daily_missions_v1';
  const streakKey = 'smuve_daily_mission_streak_v1';
  return {
    name: 'daily missions',
    storage: 'localStorage',
    keys: [stateKey, streakKey],
    corrupt: '{not json',
    shape: '[1,2,3]',
    create: () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const service = TestBed.inject(DailyMissionsService);
      return {
        mutate: () => {
          const first = service.missions()[0];
          service.recordProgress(first.type, 1);
        },
        inSession: () => service.missions().some((m) => m.progress > 0),
      };
    },
  };
};

const deskTelemetry = (): GuardedStoreCase => {
  const key = 'smuve.desk.telemetry.v1';
  return {
    name: 'desk telemetry',
    storage: 'sessionStorage',
    keys: [key],
    corrupt: '{not json',
    shape: '42',
    create: () => {
      const service = new DeskTelemetryService();
      return {
        mutate: () => service.record('ar', 'opened'),
        inSession: () => service.snapshot().ar?.opened === 1,
      };
    },
  };
};

const studioTelemetry = (): GuardedStoreCase => {
  const eventsKey = 'smuve_studio_telemetry_events_v1';
  const dismissedKey = 'smuve_studio_coach_dismissed_v1';
  return {
    name: 'studio telemetry',
    storage: 'localStorage',
    keys: [eventsKey, dismissedKey],
    corrupt: '{not-json',
    shape: '{"events":[]}',
    create: () => {
      const service = new StudioTelemetryService();
      return {
        mutate: () => {
          service.beginSession();
          service.dismissCoachAction('promote_project' as never, false);
        },
        inSession: () => typeof service.activeSession() === 'string',
      };
    },
  };
};

const CASE_BUILDERS: (() => GuardedStoreCase)[] = [
  effectPresets,
  wasmPresets,
  gameRatings,
  dailyMissions,
  deskTelemetry,
  studioTelemetry,
];

describe('storage integrity matrix', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    TestBed.resetTestingModule();
  });

  for (const build of CASE_BUILDERS) {
    describe(build().name, () => {
      for (const seedKind of ['corrupt', 'null', 'shape'] as const) {
        it(`keeps a ${seedKind} record out of the next write`, () => {
          const storeCase = build();
          const seed =
            seedKind === 'null' ? 'null' : storeCase[seedKind as 'corrupt' | 'shape'];
          const storage = (window as any)[storeCase.storage] as Storage;
          for (const key of storeCase.keys) storage.setItem(key, seed);

          const { mutate, inSession } = storeCase.create();
          const setItem = jest.spyOn(Storage.prototype, 'setItem');
          try {
            mutate();
            // The session keeps working with its own view...
            expect(inSession()).toBe(true);
            // ...but no unreadable record is overwritten by it.
            for (const key of storeCase.keys) {
              expect(setItem).not.toHaveBeenCalledWith(key, expect.any(String));
            }
          } finally {
            setItem.mockRestore();
          }

          for (const key of storeCase.keys) {
            expect(storage.getItem(key)).toBe(seed);
          }
        });
      }
    });
  }
});
