import { Injectable, signal, inject } from '@angular/core';
import {
  CareerCharter,
  DistributionMetadata,
  OutreachPacket,
  RevenueForecast,
} from '../types/career.types';
import { ReleaseProject } from '../types/release.types';
import { MarketingService } from './marketing.service';
import { LoggingService } from './logging.service';
import { NotificationService } from './notification.service';

/**
 * Sprint B4 — Career Pipeline in-DAW.
 *
 * Orchestrates the post-master deliverables for a release: draft DSP-ready
 * distribution metadata, build a 3-tier revenue forecast from genre
 * momentum, and produce an outreach packet (subject + body + CTA) ready to
 * paste to label curators and playlist owners.
 *
 * Charter drafts live in service signals — nothing writes to the user
 * profile until the user explicitly commits. This is by design: the user
 * must review/edit before B4 mutates persisted state.
 */
@Injectable({ providedIn: 'root' })
export class CareerPipelineService {
  private marketing = inject(MarketingService);
  private logger = inject(LoggingService);
  private notify = inject(NotificationService);

  // ── Public signals ────────────────────────────────────────────────
  /** Most recent charter drafted in the session (per releaseId keyed). */
  readonly chartersByReleaseId = signal<Record<string, CareerCharter>>({});
  readonly isGenerating = signal(false);
  readonly lastError = signal<string | null>(null);

  /** Convenience: latest charter globally, regardless of release. */
  readonly latestCharter = signal<CareerCharter | null>(null);

  // ── Public API ───────────────────────────────────────────────────

  /**
   * Build a full CareerCharter for a release. Deterministic given the
   * release + genre inputs — safe to re-run after edits and diff against
   * the previous draft.
   */
  async buildCharter(
    release: ReleaseProject,
    genre: string,
    mood: string,
    artistName: string
  ): Promise<CareerCharter> {
    this.isGenerating.set(true);
    this.lastError.set(null);
    try {
      const metadataDraft = this.prepareDistributionMetadata(release, genre);
      const forecast = this.estimateRevenueForecast(release, genre);
      const outreach = this.draftOutreachPacket(release, genre, mood, artistName);
      const charter: CareerCharter = {
        id: `chr-${release.id}-${Date.now()}`,
        releaseId: release.id,
        createdAt: Date.now(),
        status: 'draft',
        metadataDraft,
        forecast,
        outreach,
        genreTags: [genre, mood].filter(Boolean),
      };
      this.chartersByReleaseId.update((map) => ({
        ...map,
        [release.id]: charter,
      }));
      this.latestCharter.set(charter);
      this.logger.info(
        'Sprint B4: Career charter generated — ' +
          `release ${release.id} · ${genre} · tier ${forecast.marketTier}`
      );
      return charter;
    } catch (e: any) {
      const msg = (e && e.message) || 'Charter generation failed';
      this.lastError.set(msg);
      this.logger.error('Sprint B4: buildCharter failed', e);
      throw e;
    } finally {
      this.isGenerating.set(false);
    }
  }

  /**
   * Stage 1 (B4 internal) — DSP-ready DistributionMetadata. Defers UPC +
   * ISRC to the user since those come from distributor accounts in real
   * life; we still prep the slots so the UI can prompt for them.
   */
  prepareDistributionMetadata(
    release: ReleaseProject,
    genre: string
  ): DistributionMetadata {
    return {
      title: release.name,
      type: release.type,
      artistName:
        release.credits?.artistName || (release as any).artistName || 'Artist',
      primaryGenre: genre,
      releaseDate: new Date(
        (release as any).createdAt || Date.now()
      ).toISOString(),
      language: 'en',
      explicit: false,
      copyright: `© ${new Date().getFullYear()} ${
        release.credits?.artistName || 'Artist'
      }`,
      territories: ['Worldwide'],
      platforms: [
        'Spotify',
        'Apple Music',
        'Tidal',
        'Amazon Music',
        'YouTube Music',
      ],
    };
  }

  /**
   * Stage 2 (B4 internal) — 3-tier revenue forecast. The numbers are
   * deterministic heuristics keyed off genre momentum and a base audience
   * size (sourced from the release's current marketing footprint, if any,
   * else a flat indie baseline). It's a credible first-pass estimate, not
   * a financial guarantee — copy on the UI makes that clear.
   */
  estimateRevenueForecast(
    release: ReleaseProject,
    genre: string
  ): RevenueForecast {
    const tier = this.genreMomentumTier(genre);
    const baseline = this.audienceBaseline(release);
    const mid = Math.round(baseline * tier.streamsMultiplier);
    const low = Math.round(mid * 0.4);
    const high = Math.round(mid * 1.6);

    // Per-stream payout is genre-relative: electronic/lo-fi pays more per
    // stream than trap, which has volume working for it.
    const payoutPerStream = tier.payoutPerStreamUsd;
    const yearlyMid =
      Math.round(((mid * 12) / 1000) * payoutPerStream * 1000) / 1000;

    return {
      monthlyStreamsLow: low,
      monthlyStreamsMid: mid,
      monthlyStreamsHigh: high,
      yearlyRevenueLow: Math.round(low * 12 * payoutPerStream),
      yearlyRevenueMid: yearlyMid,
      yearlyRevenueHigh: Math.round(high * 12 * payoutPerStream),
      genreMomentumScore: tier.momentum,
      marketTier: tier.tier,
      notes: [
        `Genre momentum score ${tier.momentum.toFixed(2)} for ${genre}`,
        `Per-stream payout assumed at $${payoutPerStream.toFixed(
          4
        )} (industry blend)`,
        'Numbers exclude sync, samples, and label advance recovery.',
      ],
    };
  }

  /**
   * Stage 3 (B4 internal) — Outreach packet. Renders a paragraph-rich
   * markdown body the user can copy with one tap. Subject + CTA short, body
   * substantive. The target list size is a heuristic on genre tier.
   */
  draftOutreachPacket(
    release: ReleaseProject,
    genre: string,
    mood: string,
    artistName: string
  ): OutreachPacket {
    const hook = this.outreachHookFor(genre, mood);
    const callToAction = this.outreachCtaFor(genre);
    const subject = `${artistName} · ${release.name} (${genre}) for ${callToAction}`;
    const body = [
      `Hi {{curator_name}},`,
      '',
      `${hook}`,
      '',
      `My new ${genre.toLowerCase()} release **${release.name}** drops ${release.type.toLowerCase()}. The track leans ${mood.toLowerCase()} — I've packaged a private stream link below.`,
      '',
      `Could I land it on one of your flagship playlists or features this quarter? I'm happy to share stems, one-pagers, or chat timing.`,
      '',
      `**Stream:** {{secure_link}}`,
      `**Buzz moment:** ${hook}`,
      '',
      `Thanks for the time,`,
      artistName,
    ].join('\n');
    const tier = this.genreMomentumTier(genre);
    return {
      subject,
      body,
      callToAction,
      generatedAt: Date.now(),
      targetListSize: tier.tier === 'mainstream' ? 60 : tier.tier === 'mid' ? 30 : 15,
      renderAsMarkdown: true,
    };
  }

  /**
   * Commit a charter. Promotes status to 'committed' and triggers the
   * lightweight marketing kickoff (no live DSP push — that comes from
   * ReleasePipelineService.updateStatus('Released') in C2).
   */
  async commitCharter(charterId: string): Promise<void> {
    const map = this.chartersByReleaseId();
    const found = Object.values(map).find((c) => c.id === charterId);
    if (!found) {
      this.lastError.set('Charter not found for commit.');
      return;
    }
    const committed: CareerCharter = { ...found, status: 'committed' };
    this.chartersByReleaseId.update((m) => ({ ...m, [found.releaseId]: committed }));
    this.latestCharter.set(committed);
    // Mirror the existing release-pipeline marketing pattern so C2 can
    // upgrade the campaign with real distribution without re-wiring.
    // Campaign literal unions are narrower than DistributionMetadata's
    // platform list, so we intersect with the marketing enum before
    // assigning.
    const allowedPlatforms = new Set([
      'Spotify',
      'Instagram',
      'TikTok',
      'Facebook',
      'YouTube',
    ] as const);
    const platforms = committed.metadataDraft.platforms.filter((p) =>
      (allowedPlatforms as Set<string>).has(p)
    ) as Array<'Spotify' | 'Instagram' | 'TikTok' | 'Facebook' | 'YouTube'>;
    await this.marketing.createCampaign({
      name: `Charter Push: ${committed.metadataDraft.title}`,
      status: 'Draft',
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      budget: 250,
      targetAudience: this.tierToAudienceLabel(committed.forecast.marketTier),
      goals: ['Streaming Growth', 'Curator Outreach', 'Pre-Save'],
      platforms: platforms.length
        ? platforms
        : ['Spotify'], // sensible default if DSP outlets don't intersect
      strategyLevel: 'Modern Professional',
      metrics: {
        reach: 0,
        impressions: 0,
        engagement: 0,
        conversions: 0,
        spend: 0,
        roi: 0,
        ctr: 0,
        cpc: 0,
      },
    });
    this.notify.show(
      `Career charter committed — outreach draft saved for "${committed.metadataDraft.title}".`,
      'success'
    );
  }

  /** Returns the most recent charter for a given release id (or null). */
  charterFor(releaseId: string): CareerCharter | null {
    return this.chartersByReleaseId()[releaseId] ?? null;
  }

  // ── Internals ─────────────────────────────────────────────────────

  /**
   * Genre → momentum + per-stream payout + audience tier lookup. Source:
   * distilled from current Spotify/Apple Music payout blends (mid-2026
   * values) and a heuristic momentum score per genre.
   */
  private genreMomentumTier(genre: string): {
    momentum: number;
    streamsMultiplier: number;
    payoutPerStreamUsd: number;
    tier: 'indie' | 'mid' | 'mainstream';
  } {
    const g = (genre || '').toLowerCase();
    if (g.includes('trap') || g.includes('drill')) {
      return { momentum: 0.78, streamsMultiplier: 4.5, payoutPerStreamUsd: 0.0042, tier: 'mainstream' };
    }
    if (g.includes('house') || g.includes('electronic')) {
      return { momentum: 0.62, streamsMultiplier: 2.6, payoutPerStreamUsd: 0.0058, tier: 'mid' };
    }
    if (g.includes('lo-fi') || g.includes('lofi')) {
      return { momentum: 0.45, streamsMultiplier: 1.6, payoutPerStreamUsd: 0.0063, tier: 'mid' };
    }
    if (g.includes('r&b') || g.includes('soul')) {
      return { momentum: 0.66, streamsMultiplier: 3.4, payoutPerStreamUsd: 0.0050, tier: 'mid' };
    }
    if (g.includes('jazz')) {
      return { momentum: 0.35, streamsMultiplier: 1.2, payoutPerStreamUsd: 0.0068, tier: 'indie' };
    }
    if (g.includes('rock')) {
      return { momentum: 0.4, streamsMultiplier: 1.8, payoutPerStreamUsd: 0.0052, tier: 'indie' };
    }
    if (g.includes('reggaeton')) {
      return { momentum: 0.7, streamsMultiplier: 3.8, payoutPerStreamUsd: 0.0048, tier: 'mid' };
    }
    if (g.includes('dubstep')) {
      return { momentum: 0.55, streamsMultiplier: 2.2, payoutPerStreamUsd: 0.0054, tier: 'mid' };
    }
    // Default pop bucket — moderate momentum, mainstream tier.
    return { momentum: 0.6, streamsMultiplier: 2.8, payoutPerStreamUsd: 0.0052, tier: 'mid' };
  }

  /**
   * Baseline audience size for the revenue calculation. We default an indie
   *   baseline around 500 monthly listeners for a fresh release; releases
   *   already in 'Released' status get a +25% lift since they have prior
   *   data flowing. C2 will replace this with real DSP analytics.
   */
  private audienceBaseline(release: ReleaseProject): number {
    const isLive = (release as any).status === 'Released';
    return isLive ? 625 : 500;
  }

  private outreachHookFor(genre: string, mood: string): string {
    const g = (genre || '').toLowerCase();
    const m = (mood || '').toLowerCase();
    if (m.includes('dark'))
      return `Built on a ${g} bed with hands-in-the-dirt lyrics — the kind of track that lives at the end of an Uber ride home.`;
    if (m.includes('romantic'))
      return `An honest take on intimacy — slow-build harmonies, lyric-first hook, and a drop that earns the second listen.`;
    if (m.includes('high-energy') || m.includes('turn up'))
      return `Festival-ready ${g} with a 4-bar vocal preamble and a drop engineered for the back of the venue.`;
    if (m.includes('chill') || m.includes('lofi'))
      return `Quiet, intimate, and packed into a 2:40 frame — the kind of ${g} that holds up in a study playlist.`;
    return `A ${g} cut that leans ${m} and rewards the second listen — built clean enough to land on DSP-curated playlists.`;
  }

  private outreachCtaFor(genre: string): string {
    const g = (genre || '').toLowerCase();
    if (g.includes('trap')) return 'flagship Hip-Hop / R&B curation';
    if (g.includes('house') || g.includes('electronic')) return 'electronic flagship programming';
    if (g.includes('lo-fi')) return 'study and lo-fi flagship placement';
    if (g.includes('rock')) return 'rock + indie flagship features';
    if (g.includes('reggaeton')) return 'Latin flagship programming';
    return `${genre} flagship programming`;
  }

  private tierToAudienceLabel(
    tier: 'indie' | 'mid' | 'mainstream'
  ): string {
    if (tier === 'mainstream') return 'Mainstream DSP Audience';
    if (tier === 'mid') return 'Mid-Tier Curated Audience';
    return 'Indie / Grassroots';
  }
}
