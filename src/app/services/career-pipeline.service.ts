import { Injectable, signal, inject } from '@angular/core';
import {
  CareerCharter,
  DistributionMetadata,
  OutreachPacket,
} from '../types/career.types';
import { ReleaseProject } from '../types/release.types';
import { MarketingService } from './marketing.service';
import { LoggingService } from './logging.service';
import { NotificationService } from './notification.service';

/**
 * Sprint B4 — Career Pipeline in-DAW.
 *
 * Orchestrates the post-master deliverables for a release: draft DSP-ready
 * distribution metadata and an outreach packet (subject + body + CTA) ready
 * to paste to curators.
 *
 * It deliberately produces no revenue or audience forecast. S.M.U.V.E. has no
 * distributor, DSP, or analytics feed, and a flat listener baseline plus a
 * genre table would be an invented number the artist could spend against.
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
   * Build a full CareerCharter for a release. Draft content is deterministic
   * given the release + genre inputs — safe to re-run after edits and diff
   * against the previous draft.
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
      const outreach = this.draftOutreachPacket(release, genre, mood, artistName);
      const charter: CareerCharter = {
        id: `chr-${release.id}-${Date.now()}`,
        releaseId: release.id,
        createdAt: Date.now(),
        status: 'draft',
        metadataDraft,
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
          `release ${release.id} · ${genre}`
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
   *
   * The release date is left blank: a project row's created-at timestamp is
   * when the workspace entry was made, not a release date.
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
      releaseDate: '',
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
   * Stage 3 (B4 internal) — Outreach packet. Renders a paragraph-rich
   * markdown body the user can copy with one tap. Subject + CTA short, body
   * substantive. No target count is claimed: S.M.U.V.E. has no curator list.
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

    return {
      subject,
      body,
      callToAction,
      generatedAt: Date.now(),
      renderAsMarkdown: true,
    };
  }

  /**
   * Commit a charter. Promotes status to 'committed' and opens a draft campaign
   * seeded from the charter's own metadata. The draft carries no budget, goal,
   * or end date because the charter states none of them, and marking a release
   * live creates no campaign at all.
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
    // A draft campaign seeded only from the committed charter. No budget, end
    // date, goal, or audience tier is written: the charter contains none of
    // them, and a plausible figure would be a claim the artist never made.
    await this.marketing.createCampaign({
      name: `Charter Push: ${committed.metadataDraft.title}`,
      status: 'Draft',
      startDate: new Date().toISOString(),
      targetAudience: 'Audience not yet evidenced — define from reported listeners',
      goals: [],
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
}
