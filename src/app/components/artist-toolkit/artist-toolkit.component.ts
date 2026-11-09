import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ArtistToolkitService } from '../../services/artist-toolkit.service';
import { UIService } from '../../services/ui.service';
import {
  ContributorRole,
  ReleaseType,
  RoyaltyLine,
  ToolkitTab,
} from '../../types/artist-toolkit.types';

interface ToolkitTabConfig {
  id: ToolkitTab;
  label: string;
  icon: string;
  hint: string;
}

@Component({
  selector: 'app-artist-toolkit',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './artist-toolkit.component.html',
  styleUrls: ['./artist-toolkit.component.css'],
})
export class ArtistToolkitComponent implements OnInit {
  readonly toolkit = inject(ArtistToolkitService);
  private readonly uiService = inject(UIService);
  private readonly route = inject(ActivatedRoute);

  readonly activeTab = signal<ToolkitTab>('blueprint');
  readonly copyState = signal<'idle' | 'copied' | 'failed'>('idle');

  readonly tabs: ToolkitTabConfig[] = [
    {
      id: 'blueprint',
      label: 'Release blueprint',
      icon: 'rocket_launch',
      hint: 'Work backwards from release day.',
    },
    {
      id: 'splits',
      label: 'Split sheet',
      icon: 'handshake',
      hint: 'Agree shares before the money arrives.',
    },
    {
      id: 'royalties',
      label: 'Royalty estimator',
      icon: 'calculate',
      hint: 'Turn streams and rates into a payout picture.',
    },
    {
      id: 'rights',
      label: 'Rights & career guide',
      icon: 'menu_book',
      hint: 'The registrations and moves that protect the work.',
    },
  ];

  readonly royaltyTotals = computed(() => this.toolkit.royaltyEstimate());

  ngOnInit(): void {
    this.uiService.setActiveViewFromRoute('toolkit');
    const requestedTab = this.route.snapshot.queryParamMap.get('tab');
    if (this.isToolkitTab(requestedTab)) this.activeTab.set(requestedTab);
  }

  private isToolkitTab(value: string | null): value is ToolkitTab {
    return (
      value === 'blueprint' ||
      value === 'splits' ||
      value === 'royalties' ||
      value === 'rights'
    );
  }

  setTab(tab: ToolkitTab): void {
    this.activeTab.set(tab);
    this.copyState.set('idle');
  }

  setReleaseType(value: string): void {
    this.toolkit.setReleaseMeta({ releaseType: value as ReleaseType });
  }

  setContributorRole(id: string, value: string): void {
    this.toolkit.updateContributor(id, { role: value as ContributorRole });
  }

  setShare(id: string, value: unknown): void {
    this.toolkit.updateContributor(id, { share: Number(value) });
  }

  setStreams(id: string, value: unknown): void {
    this.toolkit.updateRoyaltyLine(id, { streams: Number(value) });
  }

  setRate(id: string, value: unknown): void {
    this.toolkit.updateRoyaltyLine(id, { ratePerStream: Number(value) });
  }

  setFee(value: unknown): void {
    this.toolkit.setDistributorFee(Number(value));
  }

  formatDay(isoDay: string): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDay || '');
    if (!match) return isoDay || '—';
    const date = new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3])
    );
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  money(value: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2,
    }).format(Number.isFinite(value) ? value : 0);
  }

  lineGross(line: RoyaltyLine): number {
    const streams = Number.isFinite(line.streams) ? Math.max(0, line.streams) : 0;
    const rate = Number.isFinite(line.ratePerStream)
      ? Math.max(0, line.ratePerStream)
      : 0;
    return streams * rate;
  }

  totalShareHint(): string {
    const total = this.toolkit.splitTotal();
    if (total === 100) return 'This sheet is ready to sign.';
    return total > 100
      ? `${Math.round((total - 100) * 100) / 100}% over. Reduce a share before signing.`
      : `${Math.round((100 - total) * 100) / 100}% unassigned.`;
  }

  async copySplitSheet(): Promise<void> {
    const text = this.toolkit.splitSheetText();
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
      this.copyState.set('copied');
    } catch {
      this.copyState.set('failed');
    }
  }

  downloadSplitSheet(): void {
    const title =
      this.toolkit.splitSheet().title.trim() || this.toolkit.blueprint().title.trim();
    const filename = `${(title || 'split-sheet').replace(/[^A-Za-z0-9._-]+/g, '-')}.txt`;
    const blob = new Blob([this.toolkit.splitSheetText()], {
      type: 'text/plain;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  resetCopyState(): void {
    this.copyState.set('idle');
  }
}
