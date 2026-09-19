import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SmuveTvComponent } from './smuve-tv.component';
import { SmuveTvService } from '../../services/smuve-tv.service';

describe('SmuveTvComponent', () => {
  let fixture: ComponentFixture<SmuveTvComponent>;
  let component: SmuveTvComponent;
  let service: SmuveTvService;

  const template = readFileSync(
    join(__dirname, 'smuve-tv.component.html'),
    'utf8'
  );
  const styles = readFileSync(join(__dirname, 'smuve-tv.component.css'), 'utf8');

  beforeEach(async () => {
    // Station favourites persist, so a test that writes them would otherwise
    // seed the next test's component at construction time.
    localStorage.removeItem('smuve_tv_stations');

    await TestBed.configureTestingModule({
      imports: [SmuveTvComponent],
    }).compileComponents();

    service = TestBed.inject(SmuveTvService);
    fixture = TestBed.createComponent(SmuveTvComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('opens on the first station of the line-up, already on air', () => {
    expect(component.activeChannel().number).toBe(service.channels[0].number);
    expect(component.onAir().onAir).toBe(true);
    expect(component.progressPercent()).toBeGreaterThanOrEqual(0);
    expect(component.progressPercent()).toBeLessThanOrEqual(100);
    expect(component.guide()).toHaveLength(6);
  });

  it('shows every station in channel order on the rail', () => {
    const numbers = component.rail().map((entry) => entry.channel.number);

    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
    expect(component.rail().length).toBe(service.channels.length);
    expect(component.rail().every((entry) => entry.slot.onAir)).toBe(true);
  });

  it('tunes by channel number typed into the pad', () => {
    component.channelEntry.set('107');
    component.goToChannel();

    expect(component.activeChannel().number).toBe(107);
    expect(component.channelEntry()).toBe('');
  });

  it('ignores a number that is not on the line-up', () => {
    const before = component.activeChannelId();

    component.channelEntry.set('999');
    component.goToChannel();

    expect(component.activeChannelId()).toBe(before);
    expect(component.channelEntry()).toBe('');
  });

  it('drops a hiding filter when the number pad tunes off the shown line-up', () => {
    component.selectCategory('music');
    const target = service.channels.find((c) => c.number === 109)!;
    expect(component.visibleChannels().some((c) => c.id === target.id)).toBe(false);

    component.channelEntry.set('109');
    component.goToChannel();

    expect(component.activeCategory()).toBe('all');
    expect(component.visibleChannels().some((c) => c.id === target.id)).toBe(true);
  });

  it('zaps through the whole line-up and wraps in both directions', () => {
    const first = component.activeChannel();

    component.stepChannel(-1);
    expect(component.activeChannel().number).toBe(
      service.channels[service.channels.length - 1].number
    );

    component.stepChannel(1);
    expect(component.activeChannel().id).toBe(first.id);
  });

  it('filters the rail by category and clears the search', () => {
    component.searchQuery.set('vinyl');
    expect(component.visibleChannels().length).toBeLessThan(service.channels.length);

    component.selectCategory('cinema');

    expect(component.searchQuery()).toBe('');
    expect(
      component.visibleChannels().every((channel) => channel.category === 'cinema')
    ).toBe(true);
  });

  it('reports an empty rail when nothing matches', () => {
    component.searchQuery.set('zzzz-no-such-station');

    expect(component.rail()).toEqual([]);
  });

  describe('favourites persistence', () => {
    const STORE_KEY = 'smuve_tv_stations';

    /** A second instance, so the constructor's read path runs again. */
    const reloaded = () => {
      const extra = TestBed.createComponent(SmuveTvComponent);
      extra.detectChanges();
      return extra;
    };

    it('writes MY STATIONS through so they survive a reload', () => {
      component.favorites.set([]);
      const id = component.activeChannelId();

      component.toggleFavorite();

      expect(JSON.parse(localStorage.getItem(STORE_KEY) ?? '[]')).toEqual([id]);

      const next = reloaded();
      try {
        expect(next.componentInstance.favorites()).toEqual([id]);
      } finally {
        next.destroy();
      }
    });

    it('treats a corrupted store as empty instead of throwing', () => {
      localStorage.setItem(STORE_KEY, '{not json');

      const next = reloaded();
      try {
        expect(next.componentInstance.favorites()).toEqual([]);
      } finally {
        next.destroy();
      }
    });

    it('drops station ids that are no longer on the line-up', () => {
      // Otherwise a retired station lingers in MY STATIONS as a phantom the
      // viewer can never clear.
      localStorage.setItem(
        STORE_KEY,
        JSON.stringify(['midnight-vinyl', 'retired-station', 42])
      );

      const next = reloaded();
      try {
        expect(next.componentInstance.favorites()).toEqual(['midnight-vinyl']);
      } finally {
        next.destroy();
      }
    });
  });

  describe('favourites', () => {
    it('adds and removes the tuned station', () => {
      const id = component.activeChannelId();

      component.toggleFavorite();
      expect(component.favorites()).toContain(id);

      component.toggleFavorite();
      expect(component.favorites()).not.toContain(id);
    });

    it('narrows the rail to my stations and can be switched back off', () => {
      const target = service.channels[2];
      component.favorites.set([target.id]);

      component.toggleFavoritesOnly();
      expect(component.visibleChannels().map((c) => c.id)).toEqual([target.id]);

      component.toggleFavoritesOnly();
      expect(component.visibleChannels().length).toBe(service.channels.length);
    });
  });

  describe('transport', () => {
    it('pauses and resumes the station', () => {
      expect(component.isPlaying()).toBe(true);

      component.togglePlayback();
      expect(component.isPlaying()).toBe(false);

      component.togglePlayback();
      expect(component.isPlaying()).toBe(true);
    });

    it('pausing a station also silences it, when a bed is running', () => {
      // "PAUSED" over a still-audible station would be a lie about what the
      // surface is doing. With no bed up (jsdom, or the viewer never enabled
      // it) both calls must still be no-ops rather than throws.
      component.toggleAudio();
      const wasOn = component.audioOn();

      expect(() => component.togglePlayback()).not.toThrow();
      expect(() => component.togglePlayback()).not.toThrow();
      expect(component.isPlaying()).toBe(true);
      expect(component.audioOn()).toBe(wasOn);
    });

    it('keeps the station audio bed strictly opt-in and reversible', () => {
      // A TV that makes noise the moment it opens is hostile: the bed starts
      // off, comes up only on an explicit press, and goes back down again. A
      // browser with no Web Audio must no-op instead of throwing.
      expect(component.audioOn()).toBe(false);

      expect(() => component.toggleAudio()).not.toThrow();
      expect(() => component.toggleAudio()).not.toThrow();

      expect(component.audioOn()).toBe(false);
    });

    it('sets and clears fullscreen without ever throwing', async () => {
      await expect(component.toggleFullscreen()).resolves.toBeUndefined();
    });
  });

  describe('touch and keyboard', () => {
    it('zaps on a committed horizontal swipe only', () => {
      const before = component.activeChannelId();
      const touch = (x: number, y: number) =>
        ({ touches: [{ clientX: x, clientY: y }], changedTouches: [{ clientX: x, clientY: y }] }) as unknown as TouchEvent;

      // Vertical page scroll must never change station.
      component.onSwipeStart(touch(200, 200));
      component.onSwipeEnd(touch(210, 320));
      expect(component.activeChannelId()).toBe(before);

      // A short horizontal drag is a tap, not a swipe.
      component.onSwipeStart(touch(200, 200));
      component.onSwipeEnd(touch(220, 202));
      expect(component.activeChannelId()).toBe(before);

      // Left swipe advances.
      component.onSwipeStart(touch(220, 200));
      component.onSwipeEnd(touch(120, 205));
      expect(component.activeChannelId()).not.toBe(before);
    });

    it('ignores swipes that never started', () => {
      const before = component.activeChannelId();
      const end = {
        changedTouches: [{ clientX: 10, clientY: 10 }],
      } as unknown as TouchEvent;

      component.onSwipeEnd(end);

      expect(component.activeChannelId()).toBe(before);
    });

    it('zaps and pauses from the keyboard', () => {
      const before = component.activeChannelId();

      component.onKeydown(
        new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true })
      );
      expect(component.activeChannelId()).not.toBe(before);

      component.onKeydown(
        new KeyboardEvent('keydown', { key: ' ', cancelable: true })
      );
      expect(component.isPlaying()).toBe(false);
    });

    it('leaves Space and the arrow keys to the control that has focus', () => {
      // A shortcut must never outrank the control the viewer tabbed to: Space
      // activates a focused button, and the arrows belong to a focused listbox.
      const button = document.createElement('button');
      const press = (key: string) => {
        const event = new KeyboardEvent('keydown', { key, cancelable: true });
        Object.defineProperty(event, 'target', { value: button });
        component.onKeydown(event);
        return event;
      };
      const before = component.activeChannelId();

      expect(press(' ').defaultPrevented).toBe(false);
      expect(component.isPlaying()).toBe(true);

      press('ArrowDown');
      expect(component.activeChannelId()).toBe(before);

      // Escape stays global: the surface must be escapable from anywhere in it.
      const emitSpy = jest.spyOn(component.exit, 'emit');
      press('Escape');
      expect(emitSpy).toHaveBeenCalled();
      emitSpy.mockRestore();
    });

    describe('reduced motion', () => {
      /** A 2D context that only counts how often the scene is repainted. */
      const recordingContext = () => {
        let calls = 0;
        const gradient = { addColorStop: () => undefined };
        const ctx: Record<string, unknown> = {
          createRadialGradient: () => gradient,
          createLinearGradient: () => gradient,
        };
        for (const method of [
          'clearRect', 'fillRect', 'save', 'restore', 'beginPath', 'arc',
          'ellipse', 'stroke', 'fill', 'moveTo', 'lineTo', 'strokeRect',
        ]) {
          ctx[method] = () => {
            calls += 1;
          };
        }
        return { ctx: ctx as unknown as CanvasRenderingContext2D, calls: () => calls };
      };

      const setReducedMotion = (matches: boolean) => {
        const original = window.matchMedia;
        Object.defineProperty(window, 'matchMedia', {
          configurable: true,
          writable: true,
          value: (query: string) => ({
            matches: matches && query.includes('prefers-reduced-motion'),
            media: query,
            onchange: null,
            addListener: () => undefined,
            removeListener: () => undefined,
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
            dispatchEvent: () => false,
          }),
        });
        return () =>
          Object.defineProperty(window, 'matchMedia', {
            configurable: true,
            writable: true,
            value: original,
          });
      };

      const frameTick = (timestamp: number) =>
        (component as unknown as { renderFrame: (t: number) => void }).renderFrame(
          timestamp
        );

      it('freezes the scene to one frame per station when motion is reduced', () => {
        const draw = recordingContext();
        const getContext = jest
          .spyOn(HTMLCanvasElement.prototype, 'getContext')
          .mockReturnValue(draw.ctx as never);
        const restoreMedia = setReducedMotion(true);

        try {
          frameTick(16);
          const painted = draw.calls();
          expect(painted).toBeGreaterThan(0);

          // The picture is a still now: repainting it would be pure waste.
          frameTick(32);
          frameTick(48);
          expect(draw.calls()).toBe(painted);
        } finally {
          restoreMedia();
          getContext.mockRestore();
        }
      });

      it('keeps animating the scene when motion is allowed', () => {
        const draw = recordingContext();
        const getContext = jest
          .spyOn(HTMLCanvasElement.prototype, 'getContext')
          .mockReturnValue(draw.ctx as never);
        const restoreMedia = setReducedMotion(false);

        try {
          frameTick(16);
          const painted = draw.calls();

          frameTick(32);
          expect(draw.calls()).toBeGreaterThan(painted);
        } finally {
          restoreMedia();
          getContext.mockRestore();
        }
      });
    });

    it('leaves the surface on Escape', () => {
      // The surface answers Escape itself. It cannot rely on the parent's
      // pseudo-event, and it cannot rely on focus being inside the surface
      // either, so it listens at the document in the capture phase.
      const emitSpy = jest.spyOn(component.exit, 'emit');
      const event = new KeyboardEvent('keydown', {
        key: 'Escape',
        cancelable: true,
      });

      component.onKeydown(event);

      expect(emitSpy).toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(true);
      emitSpy.mockRestore();
    });

    it('leaves typing in the channel pad and search box alone', () => {
      const before = component.activeChannelId();
      const input = document.createElement('input');
      const event = new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        cancelable: true,
      });
      Object.defineProperty(event, 'target', { value: input });

      component.onKeydown(event);

      expect(component.activeChannelId()).toBe(before);
    });

    it('claims the transport keys even when focus never entered the surface', () => {
      /*
       * Measured in Chromium: entering the broadcast left
       * `document.activeElement` on <body>, so a host-bound listener saw no
       * keys at all and Space reached the app's command palette, which started
       * the Studio deck underneath the broadcast.
       */
      const press = (key: string) => {
        const event = new KeyboardEvent('keydown', {
          key,
          bubbles: true,
          cancelable: true,
        });
        document.body.dispatchEvent(event);
        return event;
      };

      const before = component.activeChannelId();
      press('ArrowDown');
      expect(component.activeChannelId()).not.toBe(before);

      expect(component.isPlaying()).toBe(true);
      const event = press(' ');
      expect(component.isPlaying()).toBe(false);
      // Claimed, or the palette would toggle the Studio deck on the same key.
      expect(event.defaultPrevented).toBe(true);

      const emitSpy = jest.spyOn(component.exit, 'emit');
      press('Escape');
      expect(emitSpy).toHaveBeenCalled();
      emitSpy.mockRestore();
    });

    it('takes the keyboard on entry and gives it back on destroy', () => {
      // A full-screen takeover owns the tab order while it is up.
      const surface = fixture.nativeElement.querySelector('.smuve-tv');
      expect(surface).toBeTruthy();
      expect(document.activeElement).toBe(surface);

      const before = component.activeChannelId();
      fixture.destroy();
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'ArrowDown',
          bubbles: true,
          cancelable: true,
        })
      );

      // The listener is gone with the surface, so the app keeps its keys back.
      expect(component.activeChannelId()).toBe(before);
    });
  });

  it('offers its own labelled way out of the immersive surface', () => {
    // The surface owns the viewport, so the exit control has to be real, named,
    // and at the top of the DOM — not something reachable only by scrolling.
    const button = fixture.nativeElement.querySelector(
      '.tv-exit'
    ) as HTMLButtonElement | null;
    const emitSpy = jest.spyOn(component.exit, 'emit');

    expect(button).toBeTruthy();
    expect(button?.textContent ?? '').toContain('EXIT');
    expect(template).toContain('(click)="exit.emit()"');

    button?.click();
    expect(emitSpy).toHaveBeenCalled();
    emitSpy.mockRestore();
  });

  describe('template contract', () => {
    it('renders the broadcast natively, with no embed of any kind', () => {
      expect(template).not.toContain('<iframe');
      expect(template).not.toContain('pluto');
      expect(template).not.toContain('srcdoc');
      expect(template).toContain('<canvas #bed');
    });

    it('binds the touch handlers the swipe-to-zap gestures rely on', () => {
      expect(template).toContain('(touchstart)="onSwipeStart($event)"');
      expect(template).toContain('(touchend)="onSwipeEnd($event)"');
    });

    it('carries a guide, a station rail, and a transport', () => {
      expect(template).toContain('class="tv-rail"');
      expect(template).toContain('class="tv-guide"');
      expect(template).toContain('class="tv-controls"');
      expect(template).toContain('class="tv-station-list"');
      expect(template).toContain('class="tv-lower-third"');
    });

    it('labels every icon-only control for assistive tech', () => {
      const controlButtons = template.match(/class="tv-control[^"]*"/g) ?? [];
      expect(controlButtons.length).toBeGreaterThanOrEqual(6);
      expect((template.match(/aria-label=/g) ?? []).length).toBeGreaterThanOrEqual(
        10
      );
    });

    it('keeps touch targets at or above the 44px floor and scrolls on phones', () => {
      expect(styles).toContain('min-height: 44px');
      expect(styles).toContain('height: 48px');
      expect(styles).toContain('touch-action: manipulation');
      expect(styles).toContain('overscroll-behavior: contain');
      expect(styles).toContain('@media (max-width: 900px)');
      expect(styles).toContain('@media (max-width: 420px)');
    });

    it('pins the stage rows so the player cannot be squeezed to nothing', () => {
      // Measured in Chromium at 412x915: as a shrunken flex child of the mobile
      // column, the player collapsed to zero height and its canvas backing
      // store came out 742x1 — a black rectangle where the picture belongs.
      expect(styles).toContain('.tv-stage > * {');
      expect(styles).toContain('flex: 0 0 auto');
    });

    it('owns the viewport as a flex column so nothing is pushed off-screen', () => {
      expect(styles).toContain('position: fixed');
      expect(styles).toContain('flex-direction: column');
      expect(styles).toContain('flex: 1 1 auto');
      expect(styles).toContain('min-height: 0');
      // The rail must never be reachable only by scrolling the whole page.
      expect(styles).toContain('.tv-rail');
      expect(styles).toContain('overflow-y: auto');
    });
  });
});
