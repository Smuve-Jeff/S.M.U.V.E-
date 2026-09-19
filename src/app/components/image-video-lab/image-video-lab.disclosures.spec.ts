import { TestBed } from '@angular/core/testing';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ImageVideoLabComponent } from './image-video-lab.component';

/**
 * The stacked-layout section disclosures.
 *
 * A phone renders the module ~4.1k px tall, with the side-panel stack as the
 * bottom ~2.1k of it. Folding the groups behind their own headings is what makes
 * every tool reachable without scrolling past the ones above it — and the one
 * thing that must never happen is a section folded on a phone hiding content on
 * a wide screen that no longer has a toggle to unfold it.
 *
 * The component's template is stubbed in the behaviour tests below, so the
 * template and stylesheet contracts are asserted against the real files.
 */
describe('ImageVideoLabComponent section disclosures', () => {
  const template = readFileSync(
    join(__dirname, 'image-video-lab.component.html'),
    'utf8'
  );
  const styles = readFileSync(
    join(__dirname, 'image-video-lab.component.css'),
    'utf8'
  ).replace(/\/\*[\s\S]*?\*\//g, '');
  const source = readFileSync(
    join(__dirname, 'image-video-lab.component.ts'),
    'utf8'
  );

  const SECTION_IDS = [
    'blueprint',
    'projects',
    'directives',
    'director',
    'assets',
    'fx',
  ];

  /** Groups that start folded: everything except the live-work panel. */
  const FOLDED_BY_DEFAULT = ['blueprint', 'directives', 'director', 'assets', 'fx'];

  /** Declaration bodies of every rule whose selector list mentions `sel`. */
  const blocksFor = (sel: string): string[] =>
    [...styles.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter((rule) => rule[1].includes(sel))
      .map((rule) => rule[2]);

  describe('markup contract', () => {
    it('folds every stacked-layout group behind its own disclosure', () => {
      for (const id of SECTION_IDS) {
        expect(template).toContain(
          `[class.section-collapsed]="isSectionCollapsed('${id}')"`
        );
        expect(template).toContain(`toggleSection('${id}')`);
      }

      // One heading survives each fold, and it carries the toggle that reopens
      // the group — a folded panel is never a dead end.
      expect(template.match(/data-section-head/g)).toHaveLength(
        SECTION_IDS.length
      );
      expect(template.match(/class="section-toggle"/g)).toHaveLength(
        SECTION_IDS.length
      );
      expect(
        template.match(/\[attr\.aria-expanded\]="!isSectionCollapsed\(/g)
      ).toHaveLength(SECTION_IDS.length);

      // Every toggle is rendered only where the layout is stacked, so a wide
      // screen has neither a fold nor a control to undo one.
      expect(template.match(/@if \(isStackedLayout\(\)\)/g)).toHaveLength(
        SECTION_IDS.length
      );
    });

    it('keeps the folded groups labelled for assistive tech', () => {
      // Each toggle names the group it opens, in both states.
      for (const label of [
        'Show the production setup',
        'Hide the production setup',
        'Expand Projects',
        'Collapse Projects',
        'Expand mode directives',
        'Collapse mode directives',
        'Expand the director console',
        'Collapse the director console',
        'Expand neural assets',
        'Collapse neural assets',
        'Expand the FX matrix',
        'Collapse the FX matrix',
      ]) {
        expect(template).toContain(`'${label}'`);
      }
    });
  });

  describe('stylesheet contract', () => {
    it('scopes the fold to the stacked breakpoint', () => {
      // Base rule: not rendered above the stacked breakpoint …
      const base = blocksFor('.section-toggle');
      expect(base.some((block) => block.includes('display: none'))).toBe(true);

      // … and both the control and the fold itself are declared inside that
      // media query, so the stylesheet never folds a side-by-side layout.
      const stackedAt = styles.indexOf('(max-width: 1023.98px');
      expect(stackedAt).toBeGreaterThan(-1);
      expect(
        styles.indexOf('.section-collapsed > :not([data-section-head])')
      ).toBeGreaterThan(stackedAt);
      expect(styles.lastIndexOf('display: inline-flex')).toBeGreaterThan(
        stackedAt
      );
    });

    it('marks the surviving heading with an attribute, not a class', () => {
      // A marker class would drag its own styling onto headings that already
      // have some (the console headings are flex rows of their own).
      expect(styles).not.toContain('.section-head {');
      expect(styles).toContain('.section-head-row');
      expect(styles).toContain('.section-head-actions');
      // The chevron points the way the toggle says it does.
      expect(styles).toContain(
        ".section-toggle[aria-expanded='false'] .material-symbols-outlined"
      );
    });

    it('keeps the toggle at the thumb floor', () => {
      const toggle = blocksFor('.section-toggle').join(' ');
      expect(toggle).toContain('min-height: 2.75rem');
      expect(toggle).toContain('min-width: 2.75rem');
    });
  });

  describe('fold state', () => {
    const createComponent = () => {
      TestBed.configureTestingModule({
        imports: [ImageVideoLabComponent],
      }).overrideComponent(ImageVideoLabComponent, {
        set: { template: '<canvas #previewCanvas></canvas>' },
      });
      return TestBed.createComponent(ImageVideoLabComponent).componentInstance;
    };

    afterEach(() => TestBed.resetTestingModule());

    it('opens the secondary groups with Projects left open', () => {
      const component = createComponent();
      component.isStackedLayout.set(true);

      // Projects holds live work, so it is the one group that starts unfolded.
      expect(component.isSectionCollapsed('projects')).toBe(false);
      for (const id of FOLDED_BY_DEFAULT) {
        expect(component.isSectionCollapsed(id)).toBe(true);
      }
    });

    it('reports nothing folded while the layout is side by side', () => {
      const component = createComponent();

      // Whatever the operator folded on a phone, a wide screen renders it all:
      // the guard is the same one the template binds, so the class cannot
      // outlive the toggle that created it.
      component.isStackedLayout.set(false);
      component.toggleSection('director'); // folded by default → opened
      component.toggleSection('projects'); // open by default → folded
      component.toggleSection('fx'); // folded by default → opened

      for (const id of SECTION_IDS) {
        expect(component.isSectionCollapsed(id)).toBe(false);
      }

      // … and the folds are still remembered for the next stacked layout
      // instead of being silently dropped.
      component.isStackedLayout.set(true);
      expect(component.isSectionCollapsed('projects')).toBe(true);
      expect(component.isSectionCollapsed('director')).toBe(false);
      expect(component.isSectionCollapsed('assets')).toBe(true);
    });

    it('folds one section without disturbing another', () => {
      const component = createComponent();
      component.isStackedLayout.set(true);

      component.toggleSection('assets');
      expect(component.isSectionCollapsed('assets')).toBe(false);
      // The neighbours are untouched by it.
      expect(component.isSectionCollapsed('fx')).toBe(true);
      expect(component.isSectionCollapsed('projects')).toBe(false);

      component.toggleSection('assets');
      expect(component.isSectionCollapsed('assets')).toBe(true);
    });

    it('gates the fold on the stacked layout in the component itself', () => {
      // The stylesheet's copy of the gate also matches a short viewport, where
      // the module keeps its side-by-side column; this guard is what keeps a
      // phone fold from applying there.
      expect(source).toContain('this.isStackedLayout() &&');
      expect(source).toContain('(max-width: 1023.98px)');
    });
  });
});
