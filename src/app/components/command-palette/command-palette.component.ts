import {
  Component,
  ElementRef,
  ViewChild,
  effect,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  CommandPaletteAction,
  CommandPaletteService,
} from '../../services/command-palette.service';

@Component({
  selector: 'app-command-palette',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      *ngIf="palette.isOpen()"
      class="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-sm flex items-start justify-center pt-20 px-4"
      (click)="palette.closePalette()"
    >
      <div
        class="w-full max-w-2xl rounded-2xl border border-border bg-surface/95 shadow-v42-xl overflow-hidden"
        (click)="$event.stopPropagation()"
      >
        <div class="px-6 py-4 border-b border-border flex items-center gap-4">
          <div class="flex-1">
            <span
              class="text-[10px] font-bold text-text-dim uppercase tracking-[0.3em]"
              >Command Palette</span
            >
            <div
              class="text-xs text-text-main font-semibold tracking-wide mt-1"
            >
              Rapid interactive control across S.M.U.V.E 4.2
            </div>
          </div>
          <button
            class="px-3 py-1 rounded-full text-[10px] uppercase tracking-[0.2em] border border-border text-text-dim hover:text-text-main hover:border-brand-primary transition-all"
            (click)="palette.toggleGuide()"
          >
            {{ palette.showGuide() ? 'Actions' : 'Guide' }}
          </button>
        </div>

        <div class="px-6 py-4 border-b border-border">
          <input
            #searchInput
            type="text"
            class="w-full bg-transparent text-sm text-text-main placeholder:text-text-dim outline-none"
            placeholder="Search commands, modules, or actions..."
            [value]="palette.query()"
            (input)="onQueryChange($event)"
          />
        </div>

        <div
          *ngIf="palette.showGuide()"
          class="px-6 py-5 space-y-4 max-h-[50vh] overflow-y-auto"
        >
          <div
            *ngFor="let tip of palette.activeTips()"
            class="rounded-xl border border-border bg-background-alt/60 px-4 py-3"
          >
            <div
              class="text-xs font-bold uppercase tracking-[0.2em] text-text-dim"
            >
              {{ tip.title }}
            </div>
            <div class="text-sm text-text-main mt-2 leading-relaxed">
              {{ tip.description }}
            </div>
          </div>
        </div>

        <div
          *ngIf="!palette.showGuide()"
          class="px-4 py-2 max-h-[50vh] overflow-y-auto"
        >
          <div
            *ngFor="let action of palette.filteredActions(); let i = index"
            class="flex items-center gap-4 px-4 py-3 rounded-xl cursor-pointer transition-all border"
            [class.bg-brand-primary/10]="palette.activeIndex() === i"
            [class.border-brand-primary/20]="palette.activeIndex() === i"
            [class.border-transparent]="palette.activeIndex() !== i"
            [class.text-brand-primary]="palette.activeIndex() === i"
            [class.text-text-main]="palette.activeIndex() !== i"
            (mouseenter)="palette.setActiveIndex(i)"
            (click)="executeAction(action)"
          >
            <div class="flex-1">
              <div class="text-xs font-bold uppercase tracking-[0.2em]">
                {{ action.label }}
              </div>
              <div class="text-[11px] text-text-dim mt-1">
                {{ action.description }}
              </div>
            </div>
            <div class="flex items-center gap-2">
              <span
                *ngIf="action.shortcut"
                class="px-2 py-1 rounded-lg border border-border text-[9px] text-text-dim uppercase tracking-[0.2em]"
              >
                {{ action.shortcut }}
              </span>
              <span
                class="px-2 py-1 rounded-lg border border-border text-[9px] text-text-dim uppercase tracking-[0.2em]"
              >
                {{ action.category }}
              </span>
            </div>
          </div>

          <div
            *ngIf="!palette.filteredActions().length"
            class="text-center text-xs text-text-dim py-8"
          >
            No commands found. Refine your search parameters.
          </div>
        </div>

        <div
          class="px-6 py-3 border-t border-border text-[10px] text-text-dim uppercase tracking-[0.2em] flex justify-between"
        >
          <span>Enter to execute · Esc to close</span>
          <span>? for guide</span>
        </div>
      </div>
    </div>
  `,
})
export class CommandPaletteComponent {
  palette = inject(CommandPaletteService);

  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;

  constructor() {
    effect(() => {
      if (this.palette.isOpen()) {
        queueMicrotask(() => this.searchInput?.nativeElement?.focus());
      }
    });
  }

  onQueryChange(event: Event) {
    const target = event.target as HTMLInputElement;
    this.palette.updateQuery(target.value);
  }

  executeAction(action: CommandPaletteAction) {
    this.palette.runAction(action);
  }
}
