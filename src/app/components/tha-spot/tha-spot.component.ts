import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  computed,
  inject,
  effect,
  ViewChild,
  ElementRef,
  AfterViewInit,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Subscription } from 'rxjs';
import {
  GameService,
  canonicalGenreFacet,
  isKnownEmbedBlockedUrl,
} from '../../hub/game.service';
import {
  TRUSTED_EMBED_DOMAINS as CANONICAL_TRUSTED_EMBED_DOMAINS,
  EMBED_BLOCKED_DOMAINS as CANONICAL_EMBED_BLOCKED_DOMAINS,
} from '../../hub/game.service';
import { Game } from '../../hub/game';
import { GameSortMode } from '../../hub/game.service';
import { RecommendationRail, LiveEvent } from '../../hub/game';
import { UserProfileService } from '../../services/user-profile.service';
import { UIService } from '../../services/ui.service';
import { GamepadService } from '../../services/gamepad.service';
import { SecurityService } from '../../services/security.service';
import { APP_SECURITY_CONFIG } from '../../app.security';
import {
  SocialNetworkingService,
  OnlineUser,
  RoomMessage,
  PrivateMessage,
} from '../../services/social-networking.service';
import { ChallengeInboxService } from '../../services/challenge-inbox.service';
import { PeerNetworkingService } from '../../services/peer-networking.service';
import { SnackbarService } from '../../services/snackbar.service';
import {
  MatchmakingService,
  CoOpLobby,
  SpectatorReaction,
  LobbyChatMessage,
} from '../../hub/matchmaking.service';
import { ActivatedRoute, Router } from '@angular/router';
import {
  DailyMissionsService,
  DailyMission,
} from '../../services/daily-missions.service';
import {
  GameRatingsService,
  Rating,
  PlayResult,
} from '../../services/game-ratings.service';
import { StudioOrchestrationService } from '../../services/studio-orchestration.service';
import {
  ShareableInviteService,
  InviteMode,
} from '../../services/shareable-invite.service';
import {
  LiveStreamService,
  LiveStreamPlatform,
  LIVE_STREAM_PLATFORMS,
} from '../../services/live-stream.service';
import { SplitScreenPanelComponent } from '../split-screen-panel/split-screen-panel.component';
import { FormatTimePipe } from './format-time.pipe';

const LIVE_CLOCK_INTERVAL_MS = 60000;
const FEED_REFRESH_INTERVAL_MS = 300000;

@Component({
  selector: 'app-tha-spot',
  standalone: true,
  imports: [CommonModule, FormsModule, SplitScreenPanelComponent, FormatTimePipe],
  templateUrl: './tha-spot.component.html',
  styleUrls: ['./tha-spot.component.css'],
  styles: [
    `
      .challenge-banner {
        position: fixed;
        top: calc(72px + env(safe-area-inset-top, 0px));
        left: 50%;
        transform: translateX(-50%);
        z-index: 110;
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: 0.75rem 1.25rem;
        border-radius: 12px;
        background: linear-gradient(
          135deg,
          rgba(225, 29, 72, 0.2) 0%,
          rgba(139, 92, 246, 0.2) 100%
        );
        border: 1px solid rgba(225, 29, 72, 0.4);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
        animation: slideDown 0.4s ease-out;
      }
      .challenge-banner .challenge-info {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #fff;
      }
      .challenge-banner .challenge-actions {
        display: flex;
        gap: 0.5rem;
      }
      .challenge-banner .action-btn {
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: #fff;
        padding: 0.4rem 0.8rem;
        border-radius: 8px;
        font-size: 0.75rem;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      .challenge-banner .action-btn:hover {
        background: rgba(255, 255, 255, 0.2);
      }
      .challenge-banner .action-btn.danger {
        background: rgba(225, 29, 72, 0.3);
        border-color: rgba(225, 29, 72, 0.5);
      }
      .challenge-banner .action-btn.danger:hover {
        background: rgba(225, 29, 72, 0.5);
      }
      @keyframes slideDown {
        from {
          opacity: 0;
          transform: translateX(-50%) translateY(-20px);
        }
        to {
          opacity: 1;
          transform: translateX(-50%) translateY(0);
        }
      }
      .icon-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
      /* ============================================================
         THA SPOT — Responsive / accessibility polish (D4 follow-up).
         Inline here so it travels with the component and complements
         the existing stylesheet. Purely additive; no above-the-fold
         rule changes.
         ============================================================ */
      .spot-main-content {
        overflow-y: auto;
        overscroll-behavior: contain;
        -webkit-overflow-scrolling: touch;
      }
      @media (max-width: 768px) {
        .spot-main-content {
          padding-bottom: calc(72px + env(safe-area-inset-bottom, 0px));
        }
      }
      /* Catalog header / filters: wrap on tablet, horiz-scroll on mobile. */
      @media (max-width: 1024px) {
        .catalog-header,
        .spot-header {
          flex-wrap: wrap;
          row-gap: 0.5rem;
          column-gap: 0.5rem;
        }
        .catalog-filters,
        .filters-rail {
          overflow-x: auto;
          flex-wrap: nowrap;
          scrollbar-width: thin;
        }
        .catalog-filters::-webkit-scrollbar,
        .filters-rail::-webkit-scrollbar { height: 4px; }
        .catalog-filters::-webkit-scrollbar-thumb,
        .filters-rail::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.15);
          border-radius: 2px;
        }
      }
      @media (max-width: 768px) {
        .catalog-filters { scroll-snap-type: x proximity; }
        .catalog-filters .filter-chip { scroll-snap-align: start; }
        /* Recommendation rails: snap-scroll on mobile, hidden bars. */
        .recommendation-rail .rail-cards,
        .recommendation-rails .rail-cards {
          overflow-x: auto;
          flex-wrap: nowrap;
          scroll-snap-type: x mandatory;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
        }
        .recommendation-rail .rail-cards::-webkit-scrollbar,
        .recommendation-rails .rail-cards::-webkit-scrollbar { display: none; }
        .recommendation-rail .game-card,
        .recommendation-rails .game-card {
          scroll-snap-align: start;
          flex: 0 0 82%;
        }
        .spot-main-content { margin-left: 0 !important; width: 100%; }
        /* Challenge banner: safe-area aware, never overlap header. */
        .challenge-banner {
          top: auto;
          bottom: calc(80px + env(safe-area-inset-bottom, 0px));
          left: 12px;
          right: 12px;
          transform: none;
          width: auto;
          flex-direction: column;
          align-items: stretch;
          text-align: center;
          gap: 0.5rem;
          padding: 0.75rem;
        }
        .challenge-banner .challenge-actions { justify-content: center; }
        /* Overlays: full-bleed sheet feel on mobile. */
        .immersive-overlay,
        .matchmaking-overlay,
        .launch-mission-page,
        .mission-overlay {
          width: 100% !important;
          max-width: none !important;
          height: 100dvh;
          border-radius: 0;
          padding: 1rem 1rem calc(1rem + env(safe-area-inset-bottom, 0px));
        }
        .matchmaking-overlay .overlay-card,
        .mission-overlay .overlay-card { padding: 1rem; }
        /* Game console: full-bleed with safe-area aware footer. */
        .game-console-window,
        .console-window {
          border-radius: 0;
          width: 100%;
          height: 100dvh;
          padding-bottom: env(safe-area-inset-bottom, 0px);
        }
        .console-header { padding: 0.5rem 0.75rem; }
        .console-footer {
          padding: 0.5rem 0.75rem calc(0.5rem + env(safe-area-inset-bottom, 0px));
        }
        /* Touch targets: keep primary controls thumb-friendly without
           inflating dense card/lobby internals. */
        .header-btn,
        .mode-btn,
        .hero-btn-primary,
        .hero-btn-secondary,
        .action-btn,
        .filter-chip,
        .tab-button,
        .clear-btn {
          min-height: 44px;
        }
        .game-card { padding: 0.75rem; }
      }
      /* Focus rings for keyboard users; respects reduced-motion. */
      :focus-visible {
        outline: 2px solid #6ee7b7;
        outline-offset: 2px;
        border-radius: 6px;
      }
      @media (prefers-reduced-motion: reduce) {
        *,
        *::before,
        *::after {
          animation-duration: 0.01ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: 0.01ms !important;
          scroll-behavior: auto !important;
        }
        .challenge-banner { animation: none !important; }
      }
      /* ============================================================
         THA SPOT — DEEP RESPONSIVE REFINEMENT
         (landscape / portrait / desktop)

         Fixes the earlier audit's dead selectors:
         - drawers toggle with class "active" (real class "rival-hub"),
           never "is-open"/"rival-hub-sidebar";
         - "executive-sidebar" must stay fixed (off-canvas
           drawer), so the <=1024px sticky override is corrected;
         - mobile drawers are full-screen sheets revealed via
           opacity (composes with base right transition).
         Also: "mobile-search-bar" gets real rules (hidden on
         desktop, flex on mobile), plus compact landscape-phone
         layouts so every component stays reachable.
         ============================================================ */

      /* ── Drawer corrections (overrides audit's sticky/wrong rules) ── */
      .executive-sidebar,
      .rival-hub {
        position: fixed;
        top: 64px;
        bottom: 0;
        z-index: 120;
        transform: none;
      }
      .executive-sidebar {
        left: auto;
        right: -380px;
        width: 350px;
        pointer-events: none;
        visibility: hidden;
      }
      .executive-sidebar.active {
        right: 0;
        pointer-events: auto;
        visibility: visible;
      }
      .intel-toggle {
        position: fixed;
        top: calc(50% + 28px);
        right: 0;
        z-index: 130;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.35rem;
        min-width: 40px;
        min-height: 44px;
        padding: 0.65rem 0.45rem;
        border: 1px solid rgba(var(--neon-cyan-rgb), 0.35);
        border-right: 0;
        border-radius: 10px 0 0 10px;
        background: rgba(5, 8, 15, 0.94);
        color: var(--neon-cyan);
        box-shadow: -6px 0 20px rgba(0, 0, 0, 0.35);
        cursor: pointer;
        transform: translateY(-50%);
        transition: right 0.35s ease, background 0.2s ease, color 0.2s ease;
      }
      .intel-toggle.panel-open {
        right: 350px;
        border-right: 1px solid rgba(var(--neon-cyan-rgb), 0.35);
        border-left: 0;
        border-radius: 0 10px 10px 0;
      }
      .intel-toggle:hover,
      .intel-toggle:focus-visible {
        background: rgba(var(--neon-cyan-rgb), 0.16);
        color: #fff;
      }
      .intel-toggle-label {
        font-size: 0.58rem;
        font-weight: 800;
        letter-spacing: 0.08em;
        writing-mode: vertical-rl;
        text-orientation: mixed;
      }
      /* Keep the chat drawer inert while collapsed; otherwise the
         responsive correction above leaves it covering the catalog. */
      .rival-hub {
        left: auto;
        right: -400px;
        width: 380px;
        pointer-events: none;
        visibility: hidden;
      }
      .rival-hub.active {
        right: 0;
        pointer-events: auto;
        visibility: visible;
      }

      .rival-hub-toggle {
        position: fixed;
        top: 50%;
        right: 0;
        z-index: 130;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.35rem;
        min-width: 40px;
        min-height: 44px;
        padding: 0.65rem 0.45rem;
        border: 1px solid rgba(var(--neon-cyan-rgb), 0.35);
        border-right: 0;
        border-radius: 10px 0 0 10px;
        background: rgba(5, 8, 15, 0.94);
        color: var(--neon-cyan);
        box-shadow: -6px 0 20px rgba(0, 0, 0, 0.35);
        cursor: pointer;
        transform: translateY(-50%);
        transition: right 0.35s ease, background 0.2s ease, color 0.2s ease;
      }
      .rival-hub-toggle.panel-open {
        right: 380px;
        border-right: 1px solid rgba(var(--neon-cyan-rgb), 0.35);
        border-left: 0;
        border-radius: 0 10px 10px 0;
      }
      .rival-hub-toggle:hover,
      .rival-hub-toggle:focus-visible {
        background: rgba(var(--neon-cyan-rgb), 0.16);
        color: #fff;
      }
      .rival-hub-toggle-label {
        font-size: 0.58rem;
        font-weight: 800;
        letter-spacing: 0.08em;
        writing-mode: vertical-rl;
        text-orientation: mixed;
      }

      /* ── Mobile search bar: real rules (desktop hidden, mobile flex) ── */
      .mobile-search-bar {
        display: none;
      }

      /* ── Portrait / tablet: drawers become full-screen sheets ── */
      @media (max-width: 768px) {
        .mobile-search-bar {
          display: flex;
          position: sticky;
          top: 0;
          z-index: 6;
          min-height: 48px;
          padding: 0.5rem 0.75rem;
          background: rgba(5, 8, 15, 0.94);
          border-bottom: 1px solid var(--glass-border);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
        }

        .mobile-search-bar input {
          min-width: 0;
          flex: 1;
          font-size: 16px;
        }

        .executive-sidebar,
        .rival-hub {
          position: fixed;
          inset: calc(64px + env(safe-area-inset-top, 0px)) 0 0 0;
          width: 100%;
          max-width: none;
          height: auto;
          max-height: none;
          border-radius: 0;
          border-left: 0;
          transform: none;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.25s ease;
        }
        .executive-sidebar.active,
        .rival-hub.active {
          opacity: 1;
          pointer-events: auto;
        }
        .rival-hub-toggle,
        .rival-hub-toggle.panel-open,
        .intel-toggle,
        .intel-toggle.panel-open {
          top: calc(64px + env(safe-area-inset-top, 0px) + 0.5rem);
          right: 0;
          transform: none;
          border-right: 0;
          border-left: 1px solid rgba(var(--neon-cyan-rgb), 0.35);
          border-radius: 10px 0 0 10px;
        }
        .rival-hub-toggle-label,
        .intel-toggle-label {
          display: none;
        }
        .sidebar-content {
          min-height: 0;
          overflow-y: auto;
          overscroll-behavior: contain;
          -webkit-overflow-scrolling: touch;
          padding-bottom: calc(1.25rem + env(safe-area-inset-bottom, 0px));
        }
        .hub-tabs {
          overflow-x: auto;
          flex-wrap: nowrap;
          -webkit-overflow-scrolling: touch;
        }
        .mission-content.fit-screen,
        .console-body {
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
        }
      }

      /* ── Landscape phones / short viewports (≤ 520px tall) ── */
      @media (orientation: landscape) and (max-height: 520px) {
        .spot-header {
          height: 52px;
          padding: 0 0.75rem;
        }
        .executive-sidebar,
        .rival-hub {
          top: 52px;
          inset: 52px 0 0 0;
          width: min(420px, 100%);
        }
        .content-section {
          padding: 1.25rem 0.75rem;
        }
        .catalog-grid {
          grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
          gap: 0.6rem;
          padding: 0 0.75rem 1.5rem;
        }
        .rail-content .game-card {
          flex: 0 0 150px;
        }
        .recommendation-rails,
        .live-lobbies-rail {
          padding: 1rem 0.75rem;
        }
        .hero-content {
          padding: 1.25rem 1rem;
        }
        .cinematic-hero {
          min-height: 200px;
        }
        .hero-stats-bar {
          flex-wrap: wrap;
          gap: 0.75rem;
        }
        .back-to-top-btn {
          bottom: 12px;
          right: 12px;
        }
        .mobile-search-bar {
          display: flex;
        }
        .immersive-overlay,
        .matchmaking-overlay,
        .launch-mission-page,
        .mission-overlay {
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
        }
        .console-body {
          min-height: 0;
          overflow-y: auto;
        }
        .mission-content.fit-screen {
          height: auto;
          min-height: 0;
          overflow-y: auto;
        }
        .challenge-banner {
          bottom: calc(60px + env(safe-area-inset-bottom, 0px));
        }
      }

      /* ── Portrait phones (≤ 480px): keep every control reachable ── */
      @media (max-width: 480px) {
        .catalog-grid {
          grid-template-columns: repeat(2, 1fr);
          gap: 0.5rem;
          padding: 0 0.75rem 2rem;
        }
        .rail-content .game-card {
          flex: 0 0 150px;
        }
        .hero-title {
          font-size: 1.6rem;
        }
        .back-to-top-btn {
          bottom: 14px;
          right: 14px;
          width: 42px;
          height: 42px;
        }
      }

      /* ── Desktop (≥ 1024px): generous spacing, no mobile-only regressions ── */
      @media (min-width: 1024px) {
        .content-section {
          padding: 2.5rem 3rem;
        }
        .catalog-grid {
          grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
          gap: 1.25rem;
          padding: 0 3rem 3rem;
        }
        .rail-content .game-card {
          flex: 0 0 240px;
        }
        .recommendation-rails,
        .live-lobbies-rail {
          padding: 2rem 3rem;
        }
        .mobile-search-bar {
          display: none;
        }
      }

      /* ── Stream quality tiers + AV toggles (upgrade) ── */
      .stream-quality-row {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
        margin-bottom: 0.75rem;
      }
      .quality-btn {
        flex: 1 1 auto;
        min-height: 34px;
        padding: 0.35rem 0.6rem;
        border-radius: 8px;
        border: 1px solid rgba(0, 229, 255, 0.25);
        background: rgba(0, 229, 255, 0.06);
        color: rgba(255, 255, 255, 0.65);
        font-size: 0.58rem;
        font-weight: 800;
        letter-spacing: 0.06em;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      .quality-btn:hover {
        border-color: rgba(0, 229, 255, 0.5);
        background: rgba(0, 229, 255, 0.12);
        color: #fff;
      }
      .quality-btn.active {
        border-color: #00e5ff;
        background: linear-gradient(135deg, rgba(0, 229, 255, 0.35), rgba(139, 92, 246, 0.4));
        color: #fff;
        box-shadow: 0 0 14px rgba(0, 229, 255, 0.35);
      }
      .stream-av-controls {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin: 0.5rem 0;
      }
      .av-btn {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        min-height: 34px;
        padding: 0.35rem 0.75rem;
        border-radius: 8px;
        border: 1px solid rgba(16, 185, 129, 0.3);
        background: rgba(16, 185, 129, 0.08);
        color: #10b981;
        font-size: 0.58rem;
        font-weight: 800;
        letter-spacing: 0.06em;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      .av-btn:hover {
        background: rgba(16, 185, 129, 0.18);
        border-color: rgba(16, 185, 129, 0.6);
      }
      .av-btn .material-symbols-outlined {
        font-size: 0.85rem;
      }
      .quality-readout {
        margin-left: auto;
        font-size: 0.58rem;
        font-weight: 800;
        letter-spacing: 0.08em;
        color: rgba(0, 229, 255, 0.85);
        text-transform: uppercase;
      }
      .stream-local-preview {
        width: 100%;
        aspect-ratio: 16 / 9;
        object-fit: cover;
        border-radius: 10px;
        border: 1px solid rgba(0, 229, 255, 0.3);
        margin-bottom: 0.5rem;
        background: #000;
      }
      /* ── Live socket.io connection indicator ── */
      .socket-status-badge {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.25rem 0.6rem;
        border-radius: 999px;
        border: 1px solid rgba(239, 68, 68, 0.35);
        background: rgba(239, 68, 68, 0.08);
        font-size: 0.55rem;
        font-weight: 800;
        letter-spacing: 0.08em;
        color: rgba(248, 113, 113, 0.9);
        text-transform: uppercase;
        white-space: nowrap;
        transition: all 0.25s ease;
      }
      .socket-status-badge.is-live {
        border-color: rgba(16, 185, 129, 0.4);
        background: rgba(16, 185, 129, 0.1);
        color: #10b981;
      }
      .socket-status-badge .status-indicator {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #ef4444;
        box-shadow: 0 0 6px rgba(239, 68, 68, 0.8);
      }
      .socket-status-badge.is-live .status-indicator {
        background: #10b981;
        box-shadow: 0 0 8px rgba(16, 185, 129, 0.9);
        animation: socket-pulse 1.6s ease-in-out infinite;
      }
      @keyframes socket-pulse {
        0%,
        100% {
          opacity: 1;
          transform: scale(1);
        }
        50% {
          opacity: 0.55;
          transform: scale(0.8);
        }
      }
      @media (max-width: 768px) {
        .socket-status-badge .status-text {
          display: none;
        }
        .socket-status-badge {
          padding: 0.3rem;
        }
      }

      /* ============================================================
         THA SPOT — shareable invite + split-screen surfaces
         (share-link tray modal, inbound invite modal, share-row in
         launch preview, split-screen-overlay container)
         ============================================================ */
      .inbound-invite-modal,
      .share-tray-modal {
        position: fixed;
        inset: 0;
        z-index: 220;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1rem;
        animation: fade-in 0.25s ease;
      }
      .inbound-invite-backdrop,
      .share-tray-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
      }
      .inbound-invite-card,
      .share-tray-card {
        position: relative;
        max-width: 460px;
        width: 100%;
        padding: 1.25rem;
        border-radius: 16px;
        border: 1px solid rgba(0, 229, 255, 0.35);
        background: rgba(15, 12, 36, 0.92);
        box-shadow: 0 22px 48px rgba(0, 0, 0, 0.55);
      }
      .inbound-invite-header,
      .share-tray-header {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-weight: 900;
        font-size: 0.85rem;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: #00e5ff;
        margin-bottom: 0.85rem;
      }
      .share-tray-header h3,
      .inbound-invite-header h3 {
        margin: 0;
      }
      .share-tray-close {
        margin-left: auto;
        background: none;
        border: none;
        color: rgba(255, 255, 255, 0.4);
        cursor: pointer;
        padding: 0.25rem;
        border-radius: 6px;
        transition: background 0.2s ease;
      }
      .share-tray-close:hover {
        background: rgba(255, 255, 255, 0.06);
        color: #fff;
      }
      .inbound-invite-body,
      .share-tray-body {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        margin-bottom: 1rem;
      }
      .inbound-invite-game {
        font-size: 1.1rem;
        font-weight: 900;
        margin: 0;
      }
      .inbound-invite-mode,
      .inbound-invite-from {
        font-size: 0.75rem;
        opacity: 0.85;
        margin: 0;
      }
      .inbound-invite-help {
        font-size: 0.7rem;
        opacity: 0.6;
        line-height: 1.4;
        margin: 0;
      }
      .inbound-invite-actions {
        display: flex;
        gap: 0.5rem;
      }
      .share-tray-label {
        font-size: 0.7rem;
        opacity: 0.7;
        margin: 0;
        line-height: 1.4;
      }
      .share-tray-input {
        flex: 1;
        background: rgba(0, 0, 0, 0.5);
        border: 1px solid rgba(0, 229, 255, 0.4);
        border-radius: 8px;
        padding: 0.55rem 0.75rem;
        color: #f1f5f9;
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.75rem;
        outline: none;
      }

      /* Launch preview share-row (sits inside the existing preview card) */
      .share-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.6rem 0.75rem;
        border-radius: 10px;
        background: rgba(0, 229, 255, 0.06);
        border: 1px solid rgba(0, 229, 255, 0.2);
        flex-wrap: wrap;
        margin: 0.5rem 0 0.75rem;
      }
      .share-row-label {
        font-weight: 800;
        font-size: 0.6rem;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: rgba(0, 229, 255, 0.85);
        margin-right: 0.25rem;
      }
      .share-row-actions {
        display: flex;
        gap: 0.35rem;
        flex-wrap: wrap;
      }
      .share-row-btn {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        padding: 0.35rem 0.6rem;
        border-radius: 7px;
        border: 1px solid rgba(0, 229, 255, 0.25);
        background: rgba(0, 229, 255, 0.06);
        color: #f1f5f9;
        font-weight: 800;
        font-size: 0.6rem;
        letter-spacing: 0.05em;
        cursor: pointer;
        transition: all 0.18s ease;
        text-transform: uppercase;
      }
      .share-row-btn:hover {
        background: rgba(0, 229, 255, 0.18);
        border-color: rgba(0, 229, 255, 0.5);
      }
      .share-row-btn.accent {
        background: linear-gradient(
          135deg,
          rgba(139, 92, 246, 0.25),
          rgba(0, 229, 255, 0.2)
        );
        border-color: rgba(139, 92, 246, 0.6);
        color: #f0abfc;
      }
      .share-row-btn.accent:hover {
        background: linear-gradient(
          135deg,
          rgba(139, 92, 246, 0.4),
          rgba(0, 229, 255, 0.32)
        );
      }
      .share-row-btn .material-symbols-outlined {
        font-size: 0.85rem;
        color: inherit;
      }

      /* Split-screen-overlay container around app-split-screen-panel */
      .split-screen-overlay {
        position: fixed;
        inset: 0;
        z-index: 240;
        background: rgba(2, 4, 10, 0.95);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        padding: 1rem;
        overflow-y: auto;
      }
      .split-screen-close {
        position: fixed;
        top: calc(14px + env(safe-area-inset-top, 0px));
        right: calc(14px + env(safe-area-inset-right, 0px));
        z-index: 241;
        width: 38px;
        height: 38px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.18);
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: background 0.2s ease;
      }
      .split-screen-close:hover {
        background: rgba(239, 68, 68, 0.3);
        border-color: rgba(239, 68, 68, 0.6);
      }

      /* ============================================================
         THA SPOT — Go-Live / Live-stream surfaces
         (per-cabinet GO LIVE CTA, live pill, platform picker, join-live
         overlay). All scoped so they compose with the existing palette
         without bleeding into the share-row / launch-preview surfaces.
         ============================================================ */
      .go-live-btn {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        padding: 0.4rem 0.75rem;
        border-radius: 8px;
        border: 1px solid rgba(239, 68, 68, 0.55);
        background: linear-gradient(
          135deg,
          rgba(239, 68, 68, 0.4) 0%,
          rgba(124, 58, 237, 0.4) 100%
        );
        color: #fff;
        font-weight: 900;
        font-size: 0.6rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        cursor: pointer;
        transition: all 0.2s ease;
        box-shadow: 0 0 12px rgba(239, 68, 68, 0.35);
      }
      .go-live-btn:hover {
        background: linear-gradient(
          135deg,
          rgba(239, 68, 68, 0.6) 0%,
          rgba(124, 58, 237, 0.6) 100%
        );
        transform: translateY(-1px);
        box-shadow: 0 4px 18px rgba(239, 68, 68, 0.55);
      }
      .go-live-btn.active {
        background: linear-gradient(
          135deg,
          rgba(16, 185, 129, 0.4),
          rgba(124, 58, 237, 0.4)
        );
        border-color: rgba(16, 185, 129, 0.6);
        box-shadow: 0 0 12px rgba(16, 185, 129, 0.5);
      }
      .go-live-btn[disabled],
      .go-live-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .live-pill {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        padding: 0.3rem 0.65rem;
        border-radius: 999px;
        background: rgba(239, 68, 68, 0.9);
        color: #fff;
        font-size: 0.55rem;
        font-weight: 900;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .live-pill .live-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #fff;
        animation: live-pulse 1.4s ease-in-out infinite;
      }
      .live-pill-bar {
        position: fixed;
        top: calc(72px + env(safe-area-inset-top, 0px));
        right: calc(16px + env(safe-area-inset-right, 0px));
        z-index: 130;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem;
        border-radius: 12px;
        background: rgba(15, 12, 36, 0.94);
        border: 1px solid rgba(239, 68, 68, 0.5);
        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.45);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        flex-wrap: wrap;
        max-width: 460px;
      }
      .live-pill-bar .share-tray-input {
        max-width: 280px;
        font-size: 0.65rem;
      }
      @media (max-width: 768px) {
        .live-pill-bar {
          top: calc(60px + env(safe-area-inset-top, 0px));
          left: 12px;
          right: 12px;
          max-width: none;
        }
        .live-pill-bar .share-tray-input { display: none; }
      }
      .platform-picker {
        display: flex;
        gap: 0.4rem;
      }
      .picker-chip {
        flex: 1 1 auto;
        min-height: 40px;
        padding: 0.4rem 0.5rem;
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.18);
        background: rgba(255, 255, 255, 0.04);
        color: rgba(255, 255, 255, 0.85);
        font-size: 0.55rem;
        font-weight: 800;
        letter-spacing: 0.06em;
        cursor: pointer;
        transition: all 0.18s ease;
        text-transform: uppercase;
      }
      .picker-chip:hover {
        background: rgba(255, 255, 255, 0.1);
      }
      .picker-chip.selected {
        border-color: #ef4444;
        background: rgba(239, 68, 68, 0.2);
        color: #fff;
        box-shadow: 0 0 10px rgba(239, 68, 68, 0.4);
      }
      .go-live-panel-actions {
        display: flex;
        gap: 0.4rem;
        margin-top: 0.4rem;
      }
      .go-live-panel-actions button {
        flex: 1 1 auto;
        min-height: 40px;
      }
      .stop-live-btn {
        background: linear-gradient(
          135deg,
          rgba(16, 185, 129, 0.4),
          rgba(56, 189, 248, 0.4)
        );
        border: 1px solid rgba(16, 185, 129, 0.6);
        color: #fff;
        border-radius: 8px;
        font-weight: 800;
        font-size: 0.6rem;
        letter-spacing: 0.08em;
        cursor: pointer;
        padding: 0.5rem 0.85rem;
        text-transform: uppercase;
        transition: all 0.18s ease;
      }
      .stop-live-btn:hover {
        background: linear-gradient(
          135deg,
          rgba(16, 185, 129, 0.6),
          rgba(56, 189, 248, 0.55)
        );
      }
      .join-live-overlay {
        position: fixed;
        inset: 0;
        z-index: 235;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1rem;
        background: rgba(2, 4, 10, 0.85);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        animation: fade-in 0.25s ease;
      }
      .join-live-card {
        max-width: 460px;
        width: 100%;
        padding: 1.5rem;
        border-radius: 16px;
        border: 1px solid rgba(239, 68, 68, 0.45);
        background: rgba(15, 12, 36, 0.94);
        box-shadow: 0 18px 40px rgba(0, 0, 0, 0.6);
      }
      .join-live-card .live-platform {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.25rem 0.6rem;
        border-radius: 999px;
        background: rgba(239, 68, 68, 0.18);
        color: #ef4444;
        font-size: 0.6rem;
        font-weight: 900;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        margin-bottom: 0.6rem;
      }
      .join-live-card h2 {
        margin: 0 0 0.5rem;
        font-size: 1.25rem;
      }
      .join-live-card .host {
        margin: 0 0 0.35rem;
        font-size: 0.85rem;
        opacity: 0.85;
      }
      .join-live-card .actions {
        display: flex;
        gap: 0.5rem;
        margin-top: 1.1rem;
      }
      @keyframes live-pulse {
        0%, 100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(0.55); opacity: 0.55; }
      }
      @keyframes fade-in {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @media (prefers-reduced-motion: reduce) {
        .live-pill .live-dot,
        .go-live-btn.active::before,
        .join-live-overlay { animation: none !important; }
      }

      /* ── Live "typing" indicator for DMs ── */
      .typing-indicator {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.35rem 0.6rem;
        font-size: 0.58rem;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: rgba(0, 229, 255, 0.85);
      }
      .typing-dots {
        display: inline-flex;
        gap: 3px;
        align-items: center;
      }
      .typing-dots span {
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background: #00e5ff;
        animation: typing-bounce 1.2s ease-in-out infinite;
      }
      .typing-dots span:nth-child(2) {
        animation-delay: 0.15s;
      }
      .typing-dots span:nth-child(3) {
        animation-delay: 0.3s;
      }
      @keyframes typing-bounce {
        0%,
        60%,
        100% {
          transform: translateY(0);
          opacity: 0.4;
        }
        30% {
          transform: translateY(-4px);
          opacity: 1;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .typing-dots span {
          animation: none;
          opacity: 0.6;
        }
      }
    `,
  ],
})
/* S.M.U.V.E. v4.2 Enhanced Catalog Access */
export class ThaSpotComponent implements OnInit, OnDestroy, AfterViewInit {
  private gameService = inject(GameService);
  private readonly catalogImageFallback = 'assets/hub/home-backdrop-command.png';

  /** Return usable catalog art and avoid stale local image paths in old feed rows. */
  getGameImage(game: Game | null | undefined): string {
    const image = game?.image?.trim();
    if (!image) return this.catalogImageFallback;
    const isAssetPath =
      image.startsWith('/assets/games/') || image.startsWith('assets/games/');
    // Local SVG banners are shipped as catalog artwork and render directly.
    // Other local /assets/games/ paths are stale screenshots from old feed
    // rows and fall back to the themed backdrop.
    if (isAssetPath && !image.toLowerCase().endsWith('.svg')) {
      return this.catalogImageFallback;
    }
    return image;
  }

  /**
   * True when a catalog row carries a usable remote or verified local asset.
   * The shared backdrop remains a themed tile so it does not repeat across
   * every card, while the premium catalog's SVG artwork is shown directly.
   */
  hasRealGameArt(game: Game | null | undefined): boolean {
    const image = game?.image?.trim();
    if (!image || image === this.catalogImageFallback) return false;
    return image.startsWith('http') ||
      image.startsWith('/assets/') ||
      image.startsWith('assets/');
  }

  onGameImageError(event: Event): void {
    const image = event.target as HTMLImageElement | null;
    if (!image || image.dataset['catalogFallbackApplied'] === 'true') return;
    image.dataset['catalogFallbackApplied'] = 'true';
    image.src = this.catalogImageFallback;
  }
  public profileService = inject(UserProfileService);
  private uiService = inject(UIService);
  private sanitizer = inject(DomSanitizer);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private gamepadService = inject(GamepadService);
  private securityService = inject(SecurityService);
  public socialService = inject(SocialNetworkingService);
  public inboxService = inject(ChallengeInboxService);
  public peerService = inject(PeerNetworkingService);
  public matchmaking = inject(MatchmakingService);
  private snackbarService = inject(SnackbarService);
  public dailyMissions = inject(DailyMissionsService);
  public gameRatings = inject(GameRatingsService);
  private orchestration = inject(StudioOrchestrationService);
  private shareable = inject(ShareableInviteService);
  public liveStream = inject(LiveStreamService);

  // Signals
  displayMode = signal<'gaming' | 'pluto'>('gaming');
  games = signal<Game[]>([]);
  gamingRooms = signal<any[]>([]);
  badges = signal<any[]>([]);
  liveEvents = signal<LiveEvent[]>([]);
  socialPresence = signal<any[]>([]);
  promotions = signal<any[]>([]);
  recommendationRails = signal<RecommendationRail[]>([]);
  activeGenre = signal<string>('all');
  activePlatform = signal<string>('all');

  allPlatforms = computed(() => {
    const platforms = new Set<string>();
    const knownPlatforms = [
      'PS1',
      'PS2',
      'N64',
      'Xbox',
      'Dreamcast',
      'SNES',
      'NES',
      'Arcade',
      'DOS',
      'Web',
      'PC',
      'Genesis',
      'GBA',
      'Game Boy',
      'Game Boy Color',
      'Neo Geo',
      'TurboGrafx',
      'Saturn',
      'Master System',
      'Neo-Geo',
    ];
    this.games().forEach((g) => {
      const tags = (g.tags || []).map((t) => t.toUpperCase());
      knownPlatforms.forEach((p) => {
        if (tags.includes(p.toUpperCase())) platforms.add(p);
      });
    });
    // First-party WASM cabinets (self-hosted /assets/games/* entries) get an
    // 'Internal' facet so players can isolate the library we own and serve.
    if (this.games().some((g) => (g.url || '').startsWith('/assets/'))) {
      platforms.add('Internal');
    }
    return Array.from(platforms).sort();
  });

  activeRoom = signal<string>('all');
  searchQuery = signal<string>('');
  showFavoritesOnly = signal<boolean>(false);
  sortMode = signal<GameSortMode>('Popular');
  quickFilters = signal<string[]>([]);
  favorites = signal<string[]>([]);

  // Selection & UI Signals
  selectedGame = signal<Game | null>(null);
  currentGame = signal<Game | null>(null);
  isBrowseView = signal<boolean>(true);
  showIntelPanel = signal<boolean>(false);
  readonly showRivalHub = signal<boolean>(false);
  readonly isIncognito = this.socialService.isIncognito;
  now = signal<number>(Date.now());
  isMatchmaking = signal<boolean>(false);
  matchmakingStatus = signal<string>('');
  matchmakingProgress = signal<number>(0);
  matchmakingElapsed = signal<number>(0);
  showBotOption = signal<boolean>(false);
  isWasmLoading = signal<boolean>(false);
  gameLoadStage = signal<string>('idle');
  gameLoadError = signal<boolean>(false);
  showBackToTop = signal<boolean>(false);
  showExternalConfirm = signal<boolean>(false);
  externalTargetUrl = signal<string>('');
  externalTargetDomain = signal<string>('');
  isFullscreen = signal<boolean>(false);
  recentGames = signal<Game[]>([]);

  // ── Shareable invite overlay state ──────────────────
  readonly inboundInvite = signal<{
    gameId: string;
    mode: InviteMode;
    inviteToken: string | null;
    fromUserId: string | null;
    lobbyId: string | null;
  } | null>(null);
  readonly showShareLinkTray = signal(false);
  readonly shareLinkTrayUrl = signal<string>('');
  readonly splitScreenModeActive = signal(false);

  // ── Go-Live / live-stream overlay state ─────────────
  /** Local picker key: which platform the host wants to broadcast on. */
  readonly selectedGoLivePlatform = signal<LiveStreamPlatform>('twitch');
  readonly showGoLivePicker = signal(false);
  /**
   * Tap-to-join inbound preview from `?live=...`. Rendered as an overlay
   * so the viewer can see what they're about to join before redeeming.
   */
  readonly inboundLivePreview = this.liveStream.inboundPreview;
  /** True while the platform OAuth popup is open; flips the button to PENDING. */
  readonly pendingGolive = this.liveStream.pendingGolive;
  readonly livePlatforms = LIVE_STREAM_PLATFORMS;

  // ── Hub navigation (rival hub sidebar tabs) ──────────
  // 'rooms' | 'online' | 'rivals' | 'ops'
  hubTab = signal<'rooms' | 'online' | 'rivals' | 'ops'>('rooms');
  readonly rivalHubOpen = signal<boolean>(false);
  isLoading = signal<boolean>(true);
  private currentMatchmakingId: number | null = null;
  private matchmakingTimerId: any = null;
  private latestSearchQuery: string = '';
  private pendingGameId: string | null = null;
  private pendingRoomId: string | null = null;
  private readonly RECENT_GAMES_KEY = 'tha_spot_recent_games';

  // Social & Streaming Signals
  activeHubTab = signal<'room' | 'dm' | 'stream' | 'friends' | 'party' | 'ai'>(
    'room'
  );
  dmTargetUserId = signal<string | null>(null);
  chatInput = signal<string>('');
  /** Dedicated composer for in-lobby chat so it never bleeds into the
   *  shared hub footer input (room/DM/party) and vice-versa. */
  lobbyChatInput = signal<string>('');

  @ViewChild('gameIframe') gameIframe?: ElementRef<HTMLIFrameElement>;
  @ViewChild('scrollContainer') scrollContainer?: ElementRef<HTMLDivElement>;
  @ViewChild('contentViewport') contentViewport?: ElementRef<HTMLDivElement>;
  @ViewChild('remoteAudio') remoteAudio?: ElementRef<HTMLAudioElement>;

  private feedSubscription?: Subscription;
  private routeParamSubscription?: Subscription;
  private queryParamSubscription?: Subscription;
  private clockId?: any;
  private feedRefreshId?: any;
  private readonly messageHandler = (event: MessageEvent) =>
    this.onMessage(event);
  private particleInterval?: any;
  private cardObserver?: IntersectionObserver;
  private heroBgInterval?: any;
  private heroBgIndex = 0;
  private gameLoadWatchdogId: number | null = null;
  private gameReloadTimerId: number | null = null;
  private guardedGameFrame: HTMLIFrameElement | null = null;
  private readonly gameFrameLoadHandler = () => this.handleGameIframeLoad();
  private readonly gameFrameErrorHandler = () => this.handleGameIframeError();
  private readonly legacyLaunchCompatibility = (() => {
    this.onGameIframeLoad = () => this.handleGameIframeLoad();
    this.onGameIframeError = () => this.handleGameIframeError();
    this.isEmbedBlockedUrl = (url: string) => isKnownEmbedBlockedUrl(url);
    const confirmExternalLaunch = this.confirmExternalLaunch.bind(this);
    this.confirmExternalLaunch = () => {
      confirmExternalLaunch();
      if (this.currentGame()) this.closeGame();
    };
    const closeGame = this.closeGame.bind(this);
    this.closeGame = () => {
      this.clearGameLoadWatchdog();
      this.clearGameReloadTimer();
      this.removeGameFrameGuards();
      this.gameFrameReady.set(false);
      closeGame();
    };
    const ngOnDestroy = this.ngOnDestroy.bind(this);
    this.ngOnDestroy = () => {
      this.clearGameLoadWatchdog();
      this.clearGameReloadTimer();
      this.removeGameFrameGuards();
      ngOnDestroy();
    };
    return true;
  })();
  private gameFrameReady = signal(false);
  private readonly GAME_LOAD_WATCHDOG_MS = 15000;
  private gameLoadLifecycle = effect((onCleanup) => {
    const activeGame = this.currentGame();
    const hasLoadError = this.gameLoadError();
    if (activeGame && !hasLoadError && !this.gameFrameReady()) {
      this.startGameLoadWatchdog();
      window.setTimeout(() => this.installGameFrameGuards(), 0);
    }
    onCleanup(() => {
      this.clearGameLoadWatchdog();
    });
  });

  private blockedLaunchPolicy = effect(() => {
    const game = this.selectedGame();
    const target = game?.launchConfig?.approvedEmbedUrl || game?.url;
    if (!game || !target || !isKnownEmbedBlockedUrl(target)) return;
    if (game.launchConfig?.embedMode === 'external-only') return;

    this.selectedGame.update((current) => {
      if (!current || current.id !== game.id) return current;
      const launchConfig = { ...(current.launchConfig || {}) };
      launchConfig.embedMode = 'external-only';
      launchConfig.approvedExternalUrl =
        launchConfig.approvedExternalUrl || target;
      delete launchConfig.approvedEmbedUrl;
      return { ...current, launchConfig };
    });
  });

  private installGameFrameGuards(): void {
    const iframe = this.gameIframe?.nativeElement;
    if (!iframe || iframe === this.guardedGameFrame) return;
    this.removeGameFrameGuards();
    this.guardedGameFrame = iframe;
    iframe.setAttribute('allow', this.getIframeAllowAttr(this.currentGame()));
    // Angular 21 (NG0910) forbids template-binding the sandbox attribute
    // on iframes — apply it imperatively alongside the allow attribute.
    iframe.setAttribute('sandbox', this.getSandboxAttr(this.currentGame()));
    iframe.addEventListener('load', this.gameFrameLoadHandler);
    iframe.addEventListener('error', this.gameFrameErrorHandler);
  }

  private removeGameFrameGuards(): void {
    if (!this.guardedGameFrame) return;
    this.guardedGameFrame.removeEventListener('load', this.gameFrameLoadHandler);
    this.guardedGameFrame.removeEventListener('error', this.gameFrameErrorHandler);
    this.guardedGameFrame = null;
  }

  private clearGameLoadWatchdog(): void {
    if (this.gameLoadWatchdogId !== null) {
      window.clearTimeout(this.gameLoadWatchdogId);
      this.gameLoadWatchdogId = null;
    }
  }

  private clearGameReloadTimer(): void {
    if (this.gameReloadTimerId !== null) {
      window.clearTimeout(this.gameReloadTimerId);
      this.gameReloadTimerId = null;
    }
  }

  private startGameLoadWatchdog(): void {
    this.clearGameLoadWatchdog();
    this.clearGameReloadTimer();
    this.gameFrameReady.set(false);
    this.gameLoadWatchdogId = window.setTimeout(() => {
      this.gameLoadWatchdogId = null;
      if (
        !this.currentGame() ||
        this.gameFrameReady()
      ) return;
      // A delayed iframe load is not proof that the cabinet exited. Keep the
      // cabinet mounted so Android/WebView and slower emulator hosts can
      // finish booting; expose recovery without destroying the game state.
      this.gameLoadStage.set('connecting');
      this.snackbarService.info(
        'CABINET IS TAKING LONGER THAN USUAL. KEEPING THE SESSION OPEN.'
      );
    }, this.GAME_LOAD_WATCHDOG_MS);
  }

  handleGameIframeLoad(): void {
    const iframe = this.gameIframe?.nativeElement;
    if (iframe?.src === 'about:blank') return;
    this.gameFrameReady.set(true);
    this.clearGameLoadWatchdog();
    this.gameLoadStage.set('ready');
    this.gameLoadError.set(false);
    if (iframe) {
      iframe.setAttribute('allow', this.getIframeAllowAttr(this.currentGame()));
      // Angular 21 (NG0910) forbids template-binding the sandbox attribute
      // on iframes — apply it imperatively alongside the allow attribute.
      iframe.setAttribute('sandbox', this.getSandboxAttr(this.currentGame()));
    }
  }

  handleGameIframeError(): void {
    this.clearGameLoadWatchdog();
    this.gameFrameReady.set(false);
    // Only a real iframe error should show the fallback. A timeout is handled
    // non-destructively by the watchdog above.
    this.gameLoadError.set(true);
    this.gameLoadStage.set('idle');
  }

  retryGameLoad(): void {
    if (!this.currentGame()) return;
    this.clearGameLoadWatchdog();
    this.clearGameReloadTimer();
    this.gameFrameReady.set(false);
    this.gameLoadStage.set('loading');
    this.gameLoadError.set(true);
    this.gameReloadTimerId = window.setTimeout(() => {
      this.gameReloadTimerId = null;
      if (!this.currentGame()) return;
      this.gameLoadError.set(false);
      this.startGameLoadWatchdog();
    }, 0);
  }

  confirmExternalGameLaunch(): void {
    this.confirmExternalLaunch();
    if (this.currentGame()) this.closeGame();
  }

  // ── Upgrade Signals ──────────────────────────────────
  aiRecommendations = signal<Game[]>([]);
  gameSessionElapsed = signal(0);
  gameSessionScore = signal(0);
  private sessionTimerId: any = null;
  private sessionStartTime = 0;

  // ── Achievement System ───────────────────────────────
  achievements = signal<Achievement[]>([
    {
      id: 'first-launch',
      title: 'FIRST UPLINK',
      description: 'Launch your first game',
      icon: 'rocket_launch',
      unlocked: false,
      progress: 0,
      maxProgress: 1,
    },
    {
      id: 'play-5',
      title: 'CABINET EXPLORER',
      description: 'Play 5 different games',
      icon: 'explore',
      unlocked: false,
      progress: 0,
      maxProgress: 5,
    },
    {
      id: 'play-25',
      title: 'ARCADE VETERAN',
      description: 'Play 25 games total',
      icon: 'military_tech',
      unlocked: false,
      progress: 0,
      maxProgress: 25,
    },
    {
      id: 'favorites-3',
      title: 'CURATED COLLECTION',
      description: 'Save 3 favorite games',
      icon: 'star',
      unlocked: false,
      progress: 0,
      maxProgress: 3,
    },
    {
      id: 'multiplayer-1',
      title: 'RIVAL ENCOUNTER',
      description: 'Complete a multiplayer match',
      icon: 'swords',
      unlocked: false,
      progress: 0,
      maxProgress: 1,
    },
    {
      id: 'challenge-5',
      title: 'CHALLENGE SEASON',
      description: 'Send 5 challenges',
      icon: 'sports_kabaddi',
      unlocked: false,
      progress: 0,
      maxProgress: 5,
    },
    {
      id: 'session-10min',
      title: 'ENDURANCE RUN',
      description: 'Play for 10 minutes straight',
      icon: 'timer',
      unlocked: false,
      progress: 0,
      maxProgress: 600,
    },
  ]);
  lastUnlockedAchievement = signal<Achievement | null>(null);
  showAchievementPopup = signal(false);
  private playedGameIds = signal<Set<string>>(new Set());
  private challengeCount = signal(0);
  private readonly ACHIEVEMENTS_KEY = 'tha_spot_achievements';

  // ── AI Companion ─────────────────────────────────────
  aiCompanionMessages = signal<{ role: 'ai' | 'user'; text: string }[]>([
    {
      role: 'ai',
      text: 'S.M.U.V.E Neural Uplink active. Awaiting your command.',
    },
  ]);
  aiCompanionInput = signal('');
  aiCompanionThinking = signal(false);

  // ── Sound Effects ────────────────────────────────────
  private audioCtx: AudioContext | null = null;

  // ── Spectate Mode ────────────────────────────────────
  spectateTarget = signal<OnlineUser | null>(null);
  showSpectateOverlay = signal(false);

  // Computed signals
  filteredGames = computed(() => {
    if (this.displayMode() === 'pluto') return [];
    let games = this.games();

    const currentRoomId = this.activeRoom();
    if (currentRoomId !== 'all') {
      const room = this.gamingRooms().find((r) => r.id === currentRoomId);
      if (room) {
        games = games.filter((g) => this.gameService.matchesRoom(g, room));
      }
    }

    if (this.showFavoritesOnly()) {
      games = games.filter((g) => this.favorites().includes(g.id));
    }

    return this.gameService.filterAndSortGames(
      games,
      {
        genre: this.activeGenre(),
        query: this.searchQuery(),
        platform: this.activePlatform(),
        quickFilters: this.quickFilters(),
      },
      this.sortMode()
    );
  });

  availableGenres = computed(() => {
    const genres = new Set<string>();
    this.games().forEach((g) => {
      // Project primary genres through the synonym map so split facets
      // (e.g. Shooting / FPS / Shooter) collapse to a single dropdown entry
      // without mutating the underlying catalog genres.
      const facet = canonicalGenreFacet(g.genre);
      if (facet) genres.add(facet);
      // Open World is a cross-genre catalog facet in the feed and is stored
      // as a tag so Action/Racing primary genres remain accurate.
      if (g.tags?.some((tag) => tag.trim().toLowerCase() === 'open world')) {
        genres.add('Open World');
      }
    });
    return Array.from(genres).sort();
  });

  matchingRecommendationRails = computed(() => {
    const profile = this.profileService.profile();
    return this.recommendationRails().filter((rail) =>
      this.matchesRecommendationAudience(rail, profile)
    );
  });

  activeEvents = computed(() => {
    const time = this.now();
    return this.liveEvents().map((event) =>
      this.resolveEventStatus(event, time)
    );
  });

  currentSafeUrl = computed(() => {
    const game = this.currentGame();
    return game ? this.getSafeUrl(game) : null;
  });

  launchWarning = computed(() => {
    const game = this.selectedGame();
    return game ? this.resolveLaunchWarning(game) : '';
  });

  neuralSyncScore = computed(() => 85);
  gamingDirectives = computed(() => [
    'Execute daily challenge',
    'Maintain rank',
    'Complete session objective',
    'Climb the leaderboard',
  ]);

  onlineUsers = this.socialService.onlineUsers;
  featuredUsers = signal<OnlineUser[]>([]);
  globalSearchResults = signal<OnlineUser[]>([]);
  playerSearchQuery = signal('');
  filteredOnlineUsers = computed(() => {
    const query = this.playerSearchQuery().toLowerCase();
    const merged = [
      ...this.onlineUsers(),
      ...this.globalSearchResults(),
    ].filter(
      (u, i, self) => self.findIndex((t) => t.userId === u.userId) === i
    );
    return merged.filter((u) => {
      const status = u.inGame
        ? 'playing'
        : u.online !== false
          ? 'online'
          : 'offline';
      return (
        u.artistName?.toLowerCase().includes(query) ||
        u.primaryGenre?.toLowerCase().includes(query) ||
        status.includes(query)
      );
    });
  });
  selectedDmUser = computed(() =>
    [
      ...this.onlineUsers(),
      ...this.globalSearchResults(),
      ...this.featuredUsers(),
    ].find((u) => u.userId === this.dmTargetUserId())
  );
  canInteract = computed(() => true);
  isKnocking = this.peerService.isKnocking;
  knockFromUserId = this.peerService.knockFromUserId;
  messages = this.socialService.messages;
  roomMessages = this.socialService.roomMessages;
  challenges = this.inboxService.challenges;
  filteredMessages = computed(() => {
    const targetId = this.dmTargetUserId();
    const myId = this.profileService.profile().id;
    if (!targetId || !myId) return [];
    return this.messages().filter(
      (m) =>
        (m.fromUserId === targetId && m.toUserId === myId) ||
        (m.fromUserId === myId && m.toUserId === targetId)
    );
  });
  /** Live "is typing" indicator for the currently selected DM target. */
  dmTyping = computed(() => {
    const targetId = this.dmTargetUserId();
    return !!targetId && !!this.socialService.typingUsers()[targetId];
  });
  isCallActive = this.peerService.isCallActive;
  inGame = signal(false);
  gameIdToInvite = signal<string | null>(null);
  incomingChallenge = signal<{
    id?: number;
    fromUserId: string;
    fromUserName?: string;
    gameId: string;
    timestamp: number;
  } | null>(null);
  /** Live challenge socket handle + handler (binds in ngOnInit). */
  private challengeSocket?: {
    on: (event: string, handler: (data: unknown) => void) => void;
    off: (event: string, handler: (data: unknown) => void) => void;
  };
  private handleLiveIncomingChallenge = (raw: unknown): void => {
    const sc = (raw || {}) as {
      id?: number;
      fromUserId?: string;
      fromUserName?: string;
      gameId?: string;
      timestamp?: number;
    };
    if (!sc.gameId) return;
    this.incomingChallenge.set({
      id: typeof sc.id === 'number' ? sc.id : undefined,
      fromUserId: sc.fromUserId || '',
      fromUserName: sc.fromUserName || sc.fromUserId || 'A RIVAL',
      gameId: sc.gameId,
      timestamp: sc.timestamp || Date.now(),
    });
  };

  statusEffect = effect(() => {
    const inGame = this.inGame();
    this.socialService.updateStatus({ inGame });
  });

  /**
   * Challenge accept loop-closer: when the remote player ACCEPTS, both
   * sides must land in the same cabinet. The recipient launches directly
   * from acceptIncomingChallenge(); the challenger arrives here via the
   * challenge_response socket event (matchmaking.acceptedChallenge).
   */
  readonly challengeLaunchEffect = effect(() => {
    const accepted = this.matchmaking.acceptedChallenge();
    if (!accepted) return;
    this.matchmaking.clearAcceptedChallenge();
    const game = this.games().find((g) => g.id === accepted.gameId);
    if (!game) return;
    this.selectedGame.set(game);
    // Already-resolved match: confirmLaunch must skip the fresh queue scan
    // or the accept would dead-end in a 15s NO RIVALS FOUND wait.
    this.matchmaking.markResolvedLaunch();
    void this.confirmLaunch();
  });

  /**
   * Party-launch loop-closer: when the ready-check countdown expires or a
   * member receives party_launch_game, EVERY member opens the same cabinet.
   * Previously the countdown ended with a toast only, so co-op games never
   * actually launched for anyone.
   */
  readonly partyLaunchEffect = effect(() => {
    const launch = this.matchmaking.partyLaunch();
    if (!launch) return;
    this.matchmaking.clearPartyLaunch();
    const game = this.games().find((g) => g.id === launch.gameId);
    if (!game) return;
    this.selectedGame.set(game);
    this.matchmaking.markResolvedLaunch();
    void this.confirmLaunch();
  });

  constructor() {
    effect(() => {
      this.activeHubTab.set(this.socialService.activeHubTab());
    });
    const savedFavs = localStorage.getItem('tha_spot_favorites');
    if (savedFavs) this.favorites.set(JSON.parse(savedFavs));
    this.loadRecentGames();
    this.loadAchievements();

    effect(() => {
      const gp = this.gamepadService.connectedGamepad();
      if (gp) {
        if (this.isBrowseView()) {
          const dx = this.gamepadService.dpadX();
          const dy = this.gamepadService.dpadY();
          if (dx !== 0 || dy !== 0) {
            if (this.contentViewport?.nativeElement) {
              this.contentViewport.nativeElement.scrollBy({
                top: dy * 100,
                left: dx * 100,
                behavior: 'smooth',
              });
            }
          }
        }

        if (gp.buttons[0]) {
          if (this.selectedGame()) {
            this.confirmLaunch();
          }
        }
        if (gp.buttons[1]) {
          this.closePreview();
          this.closeGame();
        }
      }
    });

    effect(() => {
      this.roomMessages();
      this.messages();
      this.socialService.simulatedLiveChat();
      setTimeout(() => this.scrollToBottom(), 100);
    });

    // Wire up srcObject on the audio element when remote stream arrives
    // (Angular can't bind srcObject via template — it's a DOM property, not an HTML attribute)
    effect(() => {
      const stream = this.peerService.remoteStream();
      const audioEl = this.remoteAudio?.nativeElement;
      if (audioEl && stream) {
        (audioEl as any).srcObject = stream;
        audioEl.play().catch(() => {});
      }
    });
  }

  ngOnInit() {
    this.socialService.loadFriends();
    this.securityService.getCSRFToken();
    this.loadFeed();
    this.loadFeaturedUsers();
    this.startLiveClock();
    this.startFeedRefresh();
    window.addEventListener('message', this.messageHandler);
    // Real-time challenges from other users surface on the in-hub
    // ACCEPT/DECLINE banner, not just the inbox toast.
    this.challengeSocket = this.socialService.getSocket?.();
    this.challengeSocket?.on('incoming_challenge', this.handleLiveIncomingChallenge);
    this.initParticleSystem();
    this.initCardObserver();
    this.startHeroBgRotation();

    // Handle path deep links as well as the existing query-based share links.
    // Nested Tha Spot routes are intentionally flat in the router, so the
    // component always receives the params for the URL that was requested.
    this.routeParamSubscription = this.route.paramMap?.subscribe((params) => {
      const routePath = this.route.routeConfig?.path || '';
      const pathId = params.get('id');
      if (
        routePath === 'browse' ||
        routePath.endsWith('/browse') ||
        routePath === 'tha-spot'
      ) {
        this.isBrowseView.set(true);
        this.pendingRoomId = null;
      } else if (
        (routePath === 'room/:id' || routePath.endsWith('/room/:id')) &&
        pathId
      ) {
        this.isBrowseView.set(false);
        this.pendingRoomId = pathId;
        // Apply the room immediately so in-app navigation between room pages
        // switches the active filter; previously the room only applied once
        // at initial load, leaving SPA room navigation stuck on the old room.
        this.setActiveRoom(pathId);
      } else if (
        (routePath === 'game/:id' || routePath.endsWith('/game/:id')) &&
        pathId
      ) {
        this.isBrowseView.set(true);
        this.pendingGameId = pathId;
        this.applyPendingGameSelection();
      }
    });

    // Handle Deep Links
    this.queryParamSubscription = this.route.queryParamMap.subscribe((params) => {
      const gameId = params.get('gameId');
      const partyId = params.get('partyId');
      const mission = params.get('mission');
      if (mission) this.snackbarService.info(`MISSION ASSIGNMENT: ${mission}`);

      // Filter-state deep links: ?room=…&genre=…&platform=…&q=… keep the
      // browse filters reactive to the URL so back/forward, refresh, and
      // shared links restore the exact filtered view. Room/:id paths own the
      // room via their path param, so they are left untouched here.
      const routePathForFilters = this.route.routeConfig?.path || '';
      const isRoomPath =
        routePathForFilters === 'room/:id' ||
        routePathForFilters.endsWith('/room/:id');
      if (!isRoomPath) {
        const targetRoom = params.get('room') || 'all';
        if (targetRoom !== this.activeRoom()) this.setActiveRoom(targetRoom);
      }
      this.activeGenre.set(params.get('genre') || 'all');
      this.activePlatform.set(params.get('platform') || 'all');
      this.searchQuery.set(params.get('q') || '');

      if (partyId) {
        this.socialService.joinParty(partyId);
        this.setHubTab('party');
        if (!this.showRivalHub()) this.toggleRivalHub();
      }

      if (gameId) {
        this.pendingGameId = gameId;
        this.applyPendingGameSelection();
      }

      // Handle challenge deep links: ?challenge=true&gameId=...&from=...
      const challenge = params.get('challenge');
      if (challenge === 'true') {
        const fromUserId = params.get('from') || '';
        const fromUserName = params.get('fromName') || 'Unknown';
        const challengeGameId = params.get('gameId') || '';
        if (challengeGameId) {
          this.incomingChallenge.set({
            fromUserId,
            fromUserName,
            gameId: challengeGameId,
            timestamp: Date.now(),
          });
          this.pendingGameId = challengeGameId;
          this.applyPendingGameSelection();
        }
      }

      // Handle shareable invite deep links: ?game=halo&mode=split-screen&invite=tok
      // Game-entry links resolve without auth; restricted invites pop the
      // join modal so the recipient sees what they're being asked into.
      const inbound = this.shareable.parseFromCurrentUrl();
      if (inbound.gameId) {
        this.pendingGameId = inbound.gameId;
        this.applyPendingGameSelection();
        if (inbound.inviteToken || inbound.mode) {
          this.openInboundInviteModal({
            gameId: inbound.gameId,
            mode: inbound.mode ?? 'online',
            inviteToken: inbound.inviteToken,
            fromUserId: inbound.fromUserId,
            lobbyId: inbound.lobbyId,
          });
        }
      }
      // Live-stream tap-to-join link: ?live=<shareToken>&game=…&from=…
      // Anyone with the share URL gets the join overlay; redeem is
      // wired to a single tap so the host sees a viewer-count bump
      // immediately. The `from` param surfaces the inviter's id on
      // the overlay so the viewer knows whose session they're joining.
      // Co-op lobby invite links (?game=&mode=co-op&partyId=) join the
      // lobby directly so invite links actually CONNECT the recipient
      // to the sender's live lobby.
      const linkedPartyId = params.get('partyId');
      if (linkedPartyId && inbound.gameId) {
        this.matchmaking.joinLobby(linkedPartyId);
      }
      const liveToken = params.get('live');
      if (liveToken) {
        const lobbyId = params.get('lobby');
        const gameId = params.get('game') || params.get('gameId');
        const fromUserId = params.get('from');
        if (gameId) {
          this.pendingGameId = gameId;
          this.applyPendingGameSelection();
        }
        // Defer until the stream row loads — the preview needs the host
        // name + platform so the overlay reads sensibly. The host row
        // (row.hostId / row.hostDisplayName) is what the overlay shows
        // so the viewer knows whose session they're joining; we don't
        // surface the from= param separately.
        void this.liveStream.peekViewerToken(liveToken).then((row) => {
          if (row && lobbyId) {
            // Shared live link: connect the viewer to the host co-op session.
            // joinLobby queues the join if the socket is still reconnecting.
            this.matchmaking.joinLobby(lobbyId);
          }
        });
      }
    });

    // Default to the full catalog (room 'all'). The old 'co-op-link'
    // fallback silently filtered the grid to 16 co-op games on every visit.
    const initialRoom =
      this.pendingRoomId ||
      this.route.snapshot.queryParamMap.get('room') ||
      'all';
    this.setActiveRoom(initialRoom);
  }

  ngAfterViewInit() {
    this.scrollToBottom();
  }

  ngOnDestroy() {
    this.clearGameLoadWatchdog();
    this.clearGameReloadTimer();
    this.removeGameFrameGuards();
    this.feedSubscription?.unsubscribe();
    this.routeParamSubscription?.unsubscribe();
    this.queryParamSubscription?.unsubscribe();
    if (this.clockId) clearInterval(this.clockId);
    if (this.feedRefreshId) clearInterval(this.feedRefreshId);
    if (this.particleInterval) clearInterval(this.particleInterval);
    if (this.heroBgInterval) clearInterval(this.heroBgInterval);
    this.cardObserver?.disconnect();
    window.removeEventListener('message', this.messageHandler);
    this.challengeSocket?.off('incoming_challenge', this.handleLiveIncomingChallenge);
  }

  setMode(mode: 'gaming' | 'pluto'): void {
    this.displayMode.set(mode);
    // The intel drawer is a utility surface, never part of a game or Pluto
    // session. Close it before switching contexts so it cannot sit above the
    // active experience or retain focusable controls off-canvas.
    this.showIntelPanel.set(false);
    if (mode === 'pluto') this.closeGame();
  }

  logPlutoLaunch(): void {
    this.socialService.updateStatus({ activity: 'launched Pluto TV' });
  }

  setActiveRoom(id: string) {
    this.activeRoom.set(id);
    this.socialService.joinRoom(id);
  }

  /** User-facing room pick: applies the room and mirrors it into the URL. */
  selectRoom(id: string) {
    if (id === this.activeRoom()) return;
    this.setActiveRoom(id);
    this.syncFiltersToUrl();
  }

  onGenreChange(genre: string) {
    this.activeGenre.set(genre);
    this.syncFiltersToUrl();
  }

  onPlatformChange(platform: string) {
    this.activePlatform.set(platform);
    this.syncFiltersToUrl();
  }

  /**
   * Mirror the active browse filters into query params (?room=&genre=&platform=&q=)
   * so a filtered view is navigable, shareable, and survives refresh/back-forward.
   */
  private syncFiltersToUrl(replace = false) {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        room: this.activeRoom() !== 'all' ? this.activeRoom() : null,
        genre: this.activeGenre() !== 'all' ? this.activeGenre() : null,
        platform:
          this.activePlatform() !== 'all' ? this.activePlatform() : null,
        q: this.searchQuery().trim() ? this.searchQuery().trim() : null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: replace,
    });
  }

  clearFilters() {
    this.activeGenre.set('all');
    this.activePlatform.set('all');
    this.searchQuery.set('');
    this.showFavoritesOnly.set(false);
    this.quickFilters.set([]);
    this.syncFiltersToUrl(true);
  }

  onChatInput(val: string) {
    this.chatInput.set(val);
    if (this.activeHubTab() === 'dm' && this.dmTargetUserId()) {
      this.socialService.sendTypingStatus(
        this.dmTargetUserId()!,
        val.length > 0
      );
    }
  }

  onSearchChange(val: string) {
    this.searchQuery.set(val);
    // replaceUrl keeps per-keystroke search out of browser history.
    this.syncFiltersToUrl(true);
  }

  onGameClick(game: Game) {
    // Selecting a cabinet hands the screen to the preview flow; do not leave
    // the strategic drawer covering the preview or its launch controls.
    this.showIntelPanel.set(false);
    this.selectedGame.set(game);
    this.gameIdToInvite.set(game.id);
    this.playSoundEffect('select');
  }

  onGameCardKeydown(game: Game, event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.onGameClick(game);
    }
  }

  closePreview() {
    this.selectedGame.set(null);
  }

  /** Explicitly leave the cabinet without navigating away from Tha Spot. */
  exitGame(): void {
    this.closeGame();
    this.closePreview();
  }

  closeGame() {
    // Check session duration achievement before resetting
    if (this.sessionStartTime > 0) {
      const elapsed = Math.floor((Date.now() - this.sessionStartTime) / 1000);
      this.achievements.update((a) =>
        a.map((ach) =>
          ach.id === 'session-10min'
            ? {
                ...ach,
                progress: Math.min(ach.maxProgress, ach.progress + elapsed),
              }
            : ach
        )
      );
      this.checkAchievements();
      this.playSoundEffect('close');
    }
    this.inGame.set(false);
    this.currentGame.set(null);
    this.gameLoadError.set(false);
    this.gameLoadStage.set('idle');
    this.gameFrameReady.set(false);
    this.isFullscreen.set(false);
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    if (this.sessionTimerId) {
      clearInterval(this.sessionTimerId);
      this.sessionTimerId = null;
    }
    this.gameSessionElapsed.set(0);
    // Resolved challenge/matchmaking matches end with the cabinet: leave the
    // provisioned lobby so the server tears the room down and notifies the
    // opponent. Regular co-op lobbies are untouched (players can return).
    this.matchmaking.endCurrentMatch();
  }

  toggleIntel() {
    this.showIntelPanel.update((v) => !v);
  }

  toggleBrowse() {
    this.isBrowseView.update((v) => !v);
  }

  cancelMatchmaking() {
    const game = this.selectedGame();
    if (game) this.matchmaking.cancelMatchQueue(game.id);
    // Wipe stale match state so a future queue never resolves instantly
    // against the previous match's signals.
    this.socialService.matchmakingStatus.set('idle');
    this.matchmaking.clearMatchState();
    this.isMatchmaking.set(false);
    this.currentMatchmakingId = null;
  }

  // ── Shareable invite helpers ─────────────────────────

  /**
   * Resolve an inbound share link into one of:
   *   - a lobby join (partyId-ish payload in the token payload)
   *   - a challenge (if mode === 'challenge', pre-fill the inbox banner)
   *   - a quick-match queue
   *   - a split-screen session (host starts here)
   *   - a plain game entry (open the launch preview)
   */
  private applyInboundMode(mode: InviteMode, lobbyId?: string | null): void {
    switch (mode) {
      case 'split-screen': {
        const game = this.selectedGame();
        if (lobbyId) {
          // Guest path: pair with the host's live lobby. The game id comes
          // from the invite link — split-screen session ids never exist in
          // the party registry, so without it the guest session would
          // resolve to an 'unknown' cabinet.
          this.matchmaking.joinSplitScreenLobby(lobbyId, {
            gameId: game?.id,
            gameName: game?.name,
          });
          this.splitScreenModeActive.set(true);
        } else if (game) {
          // No lobby shared — host a fresh session.
          this.matchmaking.startSplitScreenLobby(game.id);
          this.splitScreenModeActive.set(true);
        }
        break;
      }
      case 'quick-match': {
        const game = this.selectedGame();
        if (game && this.matchmaking) {
          this.matchmaking.queueForMatch(game.id);
        }
        break;
      }
      case 'challenge': {
        const game = this.selectedGame();
        if (game) {
          this.incomingChallenge.set({
            fromUserId: '',
            fromUserName: 'A RIVAL',
            gameId: game.id,
            timestamp: Date.now(),
          });
        }
        break;
      }
      case 'co-op':
      case 'online':
      case 'offline':
      default:
        // Surface the game preview so the user clicks PLAY themselves.
        // Destructive join auto-actions live behind user confirmation.
        break;
    }
  }

  /** Modal flow that surfaces a per-invite preview before redemption. */
  openInboundInviteModal(inbound: {
    gameId: string;
    mode: InviteMode;
    inviteToken: string | null;
    fromUserId: string | null;
    lobbyId: string | null;
  }): void {
    this.inboundInvite.set({
      gameId: inbound.gameId,
      mode: inbound.mode,
      inviteToken: inbound.inviteToken,
      fromUserId: inbound.fromUserId,
      lobbyId: inbound.lobbyId,
    });
  }

  async acceptInboundInvite(): Promise<void> {
    const inv = this.inboundInvite();
    if (!inv) return;
    try {
      if (inv.inviteToken) {
        await this.shareable.redeemServerInvite(inv.inviteToken);
      }
      this.applyInboundMode(inv.mode, inv.lobbyId);
    } finally {
      this.inboundInvite.set(null);
    }
  }

  declineInboundInvite(): void {
    this.inboundInvite.set(null);
    this.snackbarService.info('INVITE DECLINED');
  }

  /** Build + copy a share URL for the selected game using `InviteMode`. */
  async shareSelectedGame(mode: InviteMode = 'online'): Promise<void> {
    const game = this.selectedGame();
    if (!game) {
      this.snackbarService.info('SELECT A GAME TO SHARE FIRST');
      return;
    }
    // Split-screen invites MUST reference a live session — if the host
    // hasn't started one yet, spin it up so the shared link actually joins
    // a room instead of silently making the recipient the host of a new one.
    if (
      mode === 'split-screen' &&
      !this.matchmaking.activeSplitLobby() &&
      !this.matchmaking.myLobby()
    ) {
      this.matchmaking.startSplitScreenLobby(game.id);
    }
    const intent = this.shareable.buildShareIntent({
      gameId: game.id,
      gameName: game.name,
      mode,
      fromName: this.profileService.profile().artistName,
      // Split-screen invites must reference the host's live lobby or the
      // recipient would start a brand-new session instead of joining.
      lobbyId:
        mode === 'split-screen' || mode === 'co-op'
          ? this.matchmaking.activeSplitLobby()?.id ??
            this.matchmaking.myLobby()?.id
          : undefined,
    });
    const result = await this.shareable.share(intent);
    this.shareLinkTrayUrl.set(result.url);
    this.showShareLinkTray.set(true);
  }

  copySavedShareLink(): void {
    const url = this.shareLinkTrayUrl();
    if (!url) return;
    this.shareable.copy({
      url,
      title: 'S.M.U.V.E. invite link',
      text: url,
      mode: 'online',
      gameId: '',
    });
  }

  closeShareLinkTray(): void {
    this.showShareLinkTray.set(false);
  }

  /** Open the Split-Screen panel for the currently selected game. */
  enterSplitScreen(): void {
    const game = this.selectedGame();
    if (!game) {
      this.snackbarService.info('SELECT A GAME FIRST');
      return;
    }
    this.matchmaking.startSplitScreenLobby(game.id);
    this.splitScreenModeActive.set(true);
  }

  exitSplitScreen(): void {
    this.matchmaking.exitSplitScreen();
    this.splitScreenModeActive.set(false);
  }

  // ── Go-Live handlers ─────────────────────────────────

  /**
   * Single CTA that toggles between GO LIVE (when offline) and STOP
   * LIVE (when the OAuth popup already produced a stream row). The
   * STOP path clears local state without re-opening the popup so the
   * viewer-count telemetry always converges.
   */
  async onGoLiveClick(event?: Event): Promise<void> {
    event?.stopPropagation();
    const cur = this.liveStream.currentStream();
    if (cur) {
      const ok = await this.liveStream.endStream();
      if (ok) {
        this.showGoLivePicker.set(false);
      }
      return;
    }
    if (!this.selectedGame()) {
      this.snackbarService.info('SELECT A CABINET TO GO LIVE FROM');
      return;
    }
    this.showGoLivePicker.set(true);
  }

  /** Confirm platform pick: issue stream row + open OAuth popup. */
  async confirmGoLive(platform: LiveStreamPlatform): Promise<void> {
    this.selectedGoLivePlatform.set(platform);
    const game = this.selectedGame();
    // Only carry a lobby id when the host actually has one. A faceless
    // broadcast (no game selected) ships lobbyId: null so the share URL
    // never includes a bogus `lobby=undefined` fragment.
    const lobbyId: string | undefined = this.matchmaking.activeSplitLobby()?.id;
    const payload =
      game && this.splitScreenModeActive()
        ? {
            gameId: game.id,
            level: 'open-lobby',
            mode: 'split-screen',
            hostId: this.profileService.profile().id,
          }
        : game
          ? { gameId: game.id }
          : null;
    const issued = await this.liveStream.golive({
      platform,
      gameId: game?.id,
      lobbyId,
      payload,
    });
    if (issued) {
      this.showGoLivePicker.set(false);
    }
  }

  cancelGoLivePicker(): void {
    this.showGoLivePicker.set(false);
  }

  /** Copy the platform share URL into the clipboard. */
  async copyLiveShareUrl(): Promise<void> {
    await this.liveStream.copyShareUrl();
  }

  /**
   * Viewer taps "Join Live" — record the redeem (server bumps
   * `viewerJoins`) and dismiss the overlay. The host-side socket
   * bridges the viewer into the lobby automatically (server emits
   * `live_stream_viewer_joined` to the host's
   * stream.lobbyId room), so we don't race against the local lobby
   * state here.
   */
  async redeemInboundLiveToken(): Promise<void> {
    const preview = this.inboundLivePreview();
    if (!preview) return;
    const result = await this.liveStream.redeemViewerToken(preview.shareToken);
    if (result) {
      this.liveStream.clearInbound();
    }
  }

  declineInboundLiveToken(): void {
    this.liveStream.clearInbound();
  }

  /**
   * Main game launch entry point. Handles:
   *  - External-only games: shows domain confirmation before opening
   *  - Inline games: URL validation → multiplayer matchmaking → multi-stage loading → iframe
   */
  async confirmLaunch() {
    const game = this.selectedGame();
    if (!game) return;

    const launchMode = this.resolveLaunchMode(game);

    // --- External / blocked games: open in a new tab with confirmation ---
    if (launchMode === 'external') {
      const url =
        game.launchConfig?.approvedExternalUrl ||
        game.launchConfig?.approvedEmbedUrl ||
        game.url;
      // Only offer to open web URLs in a new tab; refuse anything else.
      if (!this.isSafeExternalUrl(url)) {
        console.warn(`[ThaSpot] Refusing to launch non-web URL for "${game.id}".`);
        return;
      }
      try {
        const domain = new URL(url, window.location.origin).hostname;
        this.externalTargetDomain.set(domain);
      } catch {
        this.externalTargetDomain.set(url);
      }
      this.externalTargetUrl.set(url);
      this.showExternalConfirm.set(true);
      return;
    }

    // --- Inline games ---

    // Security: Pre-validate the embed URL before doing anything else
    const safeUrl = this.getSafeUrl(game);
    if (!safeUrl) {
      this.gameLoadError.set(true);
      this.snackbarService.error(
        'SECURITY: This game source is not on the trusted allowlist.'
      );
      return;
    }

    // Multiplayer matchmaking. Skipped entirely when this launch is for an
    // already-resolved match (accepted challenge / party launch / queue
    // pair): the shared lobby already exists and re-scanning would strand
    // both players in a 15s wait instead of opening the game. Solo-capable
    // cabinets (modes include 'solo') stream inline right away too: opening
    // one from the floor is a request to play it, not to queue — the rival
    // scan (and bot fallback) is only meaningful for purely versus-oriented
    // titles. Organized versus for solo-capable games stays reachable through
    // lobbies / quick match, which take the resolved-launch path above.
    if (
      this.isMultiplayerGame(game) &&
      !this.hasSoloMode(game) &&
      !this.matchmaking.consumeResolvedLaunch() &&
      !this.matchmaking.myLobby()
    ) {
      this.currentMatchmakingId = Date.now();
      const requestId = this.currentMatchmakingId;
      this.isMatchmaking.set(true);
      this.matchmakingStatus.set('SCANNING FOR RIVALS...');
      this.matchmakingProgress.set(0);
      this.matchmakingElapsed.set(0);
      this.showBotOption.set(false);
      this.matchmaking.queueForMatch(game.id);

      // Visual progress timer
      const startTime = Date.now();
      this.matchmakingTimerId = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        this.matchmakingElapsed.set(elapsed);
        this.matchmakingProgress.set(Math.min(95, elapsed * 6.3));
      }, 1000);

      const matchPromise = new Promise<boolean>((resolve) => {
        const checkMatch = setInterval(() => {
          if (this.socialService.matchmakingStatus() === 'matched') {
            clearInterval(checkMatch);
            resolve(true);
          }
        }, 500);
        setTimeout(() => {
          clearInterval(checkMatch);
          resolve(false);
        }, 15000);
      });

      const matched = await matchPromise;
      clearInterval(this.matchmakingTimerId);

      if (this.currentMatchmakingId !== requestId) return;

      if (!matched) {
        // Show visual bot option instead of browser confirm()
        this.matchmakingStatus.set('NO RIVALS FOUND');
        this.matchmakingProgress.set(100);
        // Clear stale match state so the next queue starts clean.
        this.socialService.matchmakingStatus.set('idle');
        this.matchmaking.clearMatchState();
        this.showBotOption.set(true);
        this.isMatchmaking.set(false);
        this.currentMatchmakingId = null;
        return;
      }

      this.isMatchmaking.set(false);
      this.socialService.matchmakingStatus.set('idle');
      this.currentMatchmakingId = null;
    }

    // Multi-stage loading indicator
    this.gameLoadStage.set('initializing');
    this.gameLoadError.set(false);
    await new Promise((r) => setTimeout(r, 300));
    this.gameLoadStage.set('connecting');
    await new Promise((r) => setTimeout(r, 300));
    this.gameLoadStage.set('loading');
    await new Promise((r) => setTimeout(r, 400));
    this.gameLoadStage.set('ready');

    this.profileService.recordGameLaunch(
      game.id,
      this.buildSessionContext(game)
    );
    this.inGame.set(true);
    this.currentGame.set(game);
    this.addRecentGame(game);
    this.closePreview();

    // Start session timer
    this.gameSessionScore.set(0);
    this.gameSessionElapsed.set(0);
    this.sessionStartTime = Date.now();
    this.sessionTimerId = setInterval(() => {
      this.gameSessionElapsed.set(
        Math.floor((Date.now() - this.sessionStartTime) / 1000)
      );
    }, 1000);

    // Play launch sound
    this.playSoundEffect('launch');

    // Track achievement
    this.playedGameIds.update((s) => {
      s.add(game.id);
      return s;
    });
    this.checkAchievements();

    // Generate AI recommendation
    this.generateAiRecommendations();
  }

  /**
   * User confirms they want to visit the external game URL.
   */
  confirmExternalLaunch() {
    const url = this.externalTargetUrl();
    if (url) {
      if (this.isSafeExternalUrl(url)) {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    }
    this.showExternalConfirm.set(false);
    this.closePreview();
  }

  /**
   * Only http(s) URLs may be opened from the external-launch confirm dialog.
   * Guards against any catalog entry carrying a non-web scheme (e.g. a
   * javascript: URL) from executing in a new tab.
   */
  private isSafeExternalUrl(url: string): boolean {
    if (!url) return false;
    try {
      const protocol = new URL(url, window.location.origin).protocol;
      return protocol === 'https:' || protocol === 'http:';
    } catch {
      return false;
    }
  }

  cancelExternalLaunch() {
    this.showExternalConfirm.set(false);
  }

  /**
   * After matchmaking fails, user can choose to engage an AI bot.
   */
  engageAiBot() {
    const game = this.selectedGame();
    if (game) this.matchmaking.cancelMatchQueue(game.id);
    // Reset match state before solo launch so a later multiplayer queue
    // never resolves instantly against the stale match_found payload.
    this.socialService.matchmakingStatus.set('idle');
    this.matchmaking.clearMatchState();
    this.showBotOption.set(false);
    this.isMatchmaking.set(false);
    // Proceed to launch the game in solo mode
    this.gameLoadStage.set('initializing');
    this.gameLoadError.set(false);
    setTimeout(() => this.gameLoadStage.set('connecting'), 300);
    setTimeout(() => this.gameLoadStage.set('loading'), 600);
    setTimeout(() => {
      this.gameLoadStage.set('ready');
      if (game) {
        this.profileService.recordGameLaunch(
          game.id,
          this.buildSessionContext(game)
        );
        this.inGame.set(true);
        this.currentGame.set(game);
        this.closePreview();
      }
    }, 1000);
  }

  /**
   * Iframe load success handler.
   */
  onGameIframeLoad() {
    this.gameLoadStage.set('ready');
    this.gameLoadError.set(false);
    // After load, force-apply sandbox policy in case the upstream resource requested
    // a permissions upgrade via feature policy (defense-in-depth).
    const iframe = this.gameIframe?.nativeElement;
    if (iframe) {
      try {
        iframe.setAttribute('sandbox', this.getSandboxAttr(this.currentGame()));
      } catch {}
      try {
        iframe.setAttribute(
          'allow',
          this.getIframeAllowAttr(this.currentGame())
        );
      } catch {}
    }
  }

  /**
   * Iframe error handler — shows retry UI.
   */
  onGameIframeError() {
    this.gameLoadError.set(true);
    this.gameLoadStage.set('idle');
  }

  /**
   * Escape hatch for a cabinet that refuses inline framing: offer the game's
   * external target in a new tab instead of leaving the player at retry.
   */
  openCurrentGameExternally() {
    const game = this.currentGame();
    if (!game) return;
    const url =
      game.launchConfig?.approvedExternalUrl ||
      game.launchConfig?.approvedEmbedUrl ||
      game.url;
    if (!url) return;
    try {
      const domain = new URL(url, window.location.origin).hostname;
      this.externalTargetDomain.set(domain);
    } catch {
      this.externalTargetDomain.set(url);
    }
    this.externalTargetUrl.set(url);
    this.showExternalConfirm.set(true);
  }

  /**
   * Strong iframe sandbox policy driven by GameService.buildIframeSandbox.
   * 'internal' cabinets (our own WASM files) keep allow-same-origin for boot.
   * External trusted partners get a strict sandbox without same-origin so the
   * iframe cannot read our cookies/storage.
   */
  getSandboxAttr(game: Game | null): string {
    return this.gameService.buildIframeSandbox(game || undefined);
  }

  /**
   * Permissions Policy attribute aligned with the selected cabinet's tags.
   * Multiplayer cabinets unlock microphone/camera; everything else stays strict.
   */
  getIframeAllowAttr(game: Game | null): string {
    return this.gameService.buildIframeAllowAttr(game || undefined);
  }

  reloadGame() {
    // Defer to the state-driven retry: *ngIf removes the iframe on error,
    // so mutating this detached node would reload nothing.
    this.retryGameLoad();
  }

  getActiveRoomName(): string {
    return (
      this.gamingRooms().find((r) => r.id === this.activeRoom())?.name ||
      'All Games'
    );
  }

  async loadFeaturedUsers() {
    const users = await this.socialService.getFeaturedUsers();
    this.featuredUsers.set(users);
  }

  async onPlayerSearchChange(query: string) {
    this.playerSearchQuery.set(query);
    this.latestSearchQuery = query;
    if (query.length > 2) {
      const results = await this.socialService.searchUsers(query);
      if (this.latestSearchQuery === query) {
        this.globalSearchResults.set(results);
      }
    } else {
      this.globalSearchResults.set([]);
    }
  }

  private loadFeed(forceRefresh = false) {
    this.isLoading.set(true);
    this.feedSubscription?.unsubscribe();
    this.feedSubscription = this.gameService
      .getThaSpotFeed(forceRefresh)
      .subscribe((feed) => {
        this.games.set(feed.games);
        this.gamingRooms.set(feed.rooms);
        this.badges.set(feed.badges);
        this.liveEvents.set(feed.liveEvents);
        this.socialPresence.set(feed.socialPresence);
        this.promotions.set(feed.promotions);
        this.recommendationRails.set(feed.recommendationRails);
        this.isLoading.set(false);
        this.applyPendingGameSelection();
        this.refreshCardObserver();
      });
  }

  private applyPendingGameSelection(): void {
    const gameId = this.pendingGameId;
    if (!gameId) return;

    const game = this.games().find((candidate) => candidate.id === gameId);
    if (game) {
      this.selectedGame.set(game);
      this.pendingGameId = null;
    }
  }

  private startLiveClock(): void {
    this.clockId = window.setInterval(
      () => this.now.set(Date.now()),
      LIVE_CLOCK_INTERVAL_MS
    );
  }

  private startFeedRefresh(): void {
    this.feedRefreshId = window.setInterval(
      () => this.loadFeed(true),
      FEED_REFRESH_INTERVAL_MS
    );
  }

  /**
   * Create floating particles in the cosmic background.
   */
  private initParticleSystem(): void {
    const container = document.querySelector('.cosmic-bg');
    if (!container) return;
    for (let i = 0; i < 30; i++) {
      const particle = document.createElement('div');
      particle.className = 'particle';
      const size = 1 + Math.random() * 2;
      particle.style.width = size + 'px';
      particle.style.height = size + 'px';
      particle.style.left = Math.random() * 100 + '%';
      particle.style.top = 100 + Math.random() * 20 + '%';
      particle.style.animationDuration = 15 + Math.random() * 25 + 's';
      particle.style.animationDelay = Math.random() * 20 + 's';
      const colors = [
        'var(--neon-cyan)',
        'var(--neon-purple)',
        'var(--neon-pink)',
      ];
      particle.style.background =
        colors[Math.floor(Math.random() * colors.length)];
      container.appendChild(particle);
    }
  }

  /**
   * Intersection Observer for staggered card reveal animations.
   */
  private initCardObserver(): void {
    if (typeof IntersectionObserver === 'undefined') return;
    this.cardObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in-view');
            this.cardObserver?.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
    );

    // Observe game cards after feed loads
    setTimeout(() => {
      document
        .querySelectorAll('.game-card:not(.skeleton-card)')
        .forEach((card) => {
          this.cardObserver?.observe(card);
        });
    }, 500);
  }

  /**
   * Rotate the hero background through featured games.
   */
  private startHeroBgRotation(): void {
    this.heroBgInterval = setInterval(() => {
      const games = this.games();
      if (games.length === 0) return;
      this.heroBgIndex = (this.heroBgIndex + 1) % Math.min(games.length, 5);
      const bgEl = document.querySelector('.hero-bg-image') as HTMLElement;
      if (bgEl && games[this.heroBgIndex]?.image) {
        bgEl.style.backgroundImage = `url(${games[this.heroBgIndex].image})`;
        bgEl.style.opacity = '0';
        setTimeout(() => {
          bgEl.style.opacity = '0.25';
        }, 50);
      }
    }, 8000);
  }

  /**
   * Re-initialize card observer when feed reloads.
   */
  private refreshCardObserver(): void {
    this.cardObserver?.disconnect();
    setTimeout(() => {
      document
        .querySelectorAll('.game-card:not(.skeleton-card)')
        .forEach((card) => {
          this.cardObserver?.observe(card);
        });
    }, 300);
  }

  /**
   * Trusted embed domains — only these hosts are allowed in the game iframe.
   * Internal /assets/ paths are always allowed (same-origin).
   */
  /**
   * Trusted embed domains — only these hosts are allowed in the game iframe.
   * Internal /assets/ paths are always allowed (same-origin).
   * Subdomains are matched automatically.
   */
  private static readonly TRUSTED_EMBED_DOMAINS: readonly string[] =
    CANONICAL_TRUSTED_EMBED_DOMAINS;

  /**
   * Domains known to block iframe embedding via X-Frame-Options / CSP.
   * These games are launched externally instead of in an iframe.
   */
  private static readonly EMBED_BLOCKED_DOMAINS: readonly string[] =
    CANONICAL_EMBED_BLOCKED_DOMAINS;

  /**
   * Validate that a game URL points to a trusted embed host.
   * Returns true for internal /assets/ paths (same-origin).
   * Returns true for relative paths.
   */
  private isTrustedEmbedUrl(url: string): boolean {
    if (!url) return false;
    // Internal asset paths are always safe (same origin)
    if (
      url.startsWith('/') ||
      url.startsWith('assets/') ||
      url.startsWith('./')
    ) {
      return !url.startsWith('//'); // Block protocol-relative URLs
    }
    try {
      const parsed = new URL(url);
      // Only allow https and http
      if (!['https:', 'http:'].includes(parsed.protocol)) return false;
      const hostname = parsed.hostname.toLowerCase();
      return ThaSpotComponent.TRUSTED_EMBED_DOMAINS.some(
        (d) => hostname === d || hostname.endsWith('.' + d)
      );
    } catch {
      return false;
    }
  }

  /**
   * Check whether a URL is known to block iframe embedding.
   * These hosts send X-Frame-Options / CSP headers that prevent inline play.
   */
  private isEmbedBlockedUrl(url: string): boolean {
    if (!url) return true;
    if (
      url.startsWith('/') ||
      url.startsWith('assets/') ||
      url.startsWith('./')
    ) {
      return false;
    }
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.toLowerCase();
      return ThaSpotComponent.EMBED_BLOCKED_DOMAINS.some(
        (d) => hostname === d || hostname.endsWith('.' + d)
      );
    } catch {
      return true;
    }
  }

  /**
   * Determine the effective launch mode for a game.
   * - 'external-only' from config always opens in a new tab.
   * - Known X-Frame/CSP blocking domains fall back to external.
   * - Hosts outside the trusted embed allowlist fall back to external (they
   *   can't be rendered in the sandboxed iframe anyway).
   * - Everything else attempts inline iframe launch.
   */
  resolveLaunchMode(game: Game): 'inline' | 'external' {
    if (game.launchConfig?.embedMode === 'external-only') return 'external';
    const url = game.launchConfig?.approvedEmbedUrl || game.url;
    if (this.isEmbedBlockedUrl(url)) return 'external';
    // Anything outside the trusted embed allowlist cannot be rendered in the
    // iframe (getSafeUrl would reject it), so route it to an external tab
    // instead of surfacing a hard launch error.
    if (!this.isTrustedEmbedUrl(url)) return 'external';
    return 'inline';
  }

  getSafeUrl(game: Game): SafeResourceUrl | null {
    let url = game.launchConfig?.approvedEmbedUrl || game.url;
    if (!url || url === '/' || url === '/hub' || url === 'hub') return null;

    if (url.startsWith('assets/')) {
      url = '/' + url;
    }

    // Security: Validate URL against trusted domain allowlist
    if (!this.isTrustedEmbedUrl(url)) {
      return null;
    }

    // Security: auth_salt is NOT appended to iframe URLs — it was a security
    // exposure. Games don't need the server auth salt; the iframe sandbox
    // isolates them. If game authentication is needed in the future, use a
    // postMessage handshake after the iframe loads.

    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  /**
   * Public helper used by the template to decide whether a selected game
   * will launch inline or externally.
   */
  getLaunchMode(game: Game): 'inline' | 'external' {
    return this.resolveLaunchMode(game);
  }

  private isTrustedMessageOrigin(origin: string): boolean {
    if (!origin) return false;
    const normalizedOrigin = origin.toLowerCase();
    const localOrigin = window.location.origin.toLowerCase();
    if (normalizedOrigin === localOrigin) return true;

    const active = this.currentGame();
    const candidateUrls = [
      active?.launchConfig?.approvedEmbedUrl,
      active?.launchConfig?.approvedExternalUrl,
      active?.url,
    ].filter((value): value is string => !!value);

    const activeHosts = new Set<string>();
    for (const entry of candidateUrls) {
      try {
        const parsed = new URL(entry, window.location.origin);
        if (parsed.origin.toLowerCase() === normalizedOrigin) {
          return true;
        }
        const hostname = parsed.hostname.toLowerCase();
        if (hostname) activeHosts.add(hostname);
      } catch {
        // ignore malformed URLs; callers are still gated by the source window.
      }
    }

    try {
      const originHost = new URL(origin).hostname.toLowerCase();
      if ([...activeHosts].some((host) => host === originHost || host.endsWith(`.${originHost}`) || originHost.endsWith(`.${host}`))) {
        return true;
      }
      return ThaSpotComponent.TRUSTED_EMBED_DOMAINS.some(
        (domain) =>
          originHost === domain ||
          originHost.endsWith(`.${domain}`)
      );
    } catch {
      return false;
    }
  }

  private onMessage(event: MessageEvent): void {
    const active = this.currentGame();
    const iframeWindow = this.gameIframe?.nativeElement?.contentWindow;
    if (
      !this.isTrustedMessageOrigin(event.origin) ||
      !active ||
      !iframeWindow ||
      event.source !== iframeWindow
    )
      return;

    // ── Game State Sync: forward state from iframe to lobby ──
    if (event.data?.type === 'GAME_STATE_UPDATE') {
      this.matchmaking.broadcastGameState({
        score: event.data.data?.score,
        progress: event.data.data?.progress,
        level: event.data.data?.level,
        alive: event.data.data?.alive,
        position: event.data.data?.position,
        custom: event.data.data?.custom,
      });
      // Also record as replay snapshot
      this.matchmaking.recordGameSnapshot(
        event.data.data || {},
        event.data.data?.label
      );
      return;
    }

    // ── Legacy: GAME_OVER event ──
    if (event.data?.type === 'GAME_OVER') {
      this.profileService.recordGameResult(active.id, {
        ...this.buildSessionContext(active),
        score: event.data.data?.score,
      });
      // Final snapshot before closing
      this.matchmaking.recordGameSnapshot(
        { ...event.data.data, event: 'GAME_OVER' },
        'Game Over'
      );
      this.closeGame();
    }
  }

  private resolveEventStatus(event: LiveEvent, now: number): LiveEvent {
    if (!event.schedule?.startAt) return event;
    const start = new Date(event.schedule.startAt).getTime();
    const end = event.schedule.endAt
      ? new Date(event.schedule.endAt).getTime()
      : null;
    let status: LiveEvent['status'] = event.status;
    if (now < start) status = 'upcoming';
    else if (end && now > end) status = 'ending-soon';
    else status = 'live';
    return { ...event, status };
  }

  private resolveLaunchWarning(game: Game): string {
    return game.launchConfig?.embedMode === 'external-only'
      ? 'External governance required.'
      : 'Verified.';
  }

  isRetroOrArcade(game: Game): boolean {
    const tags = (game.tags || []).map((t) => t.toLowerCase());
    return (
      tags.includes('retro') ||
      tags.includes('arcade') ||
      game.badgeIds?.includes('elite') === true
    );
  }

  private isMultiplayerGame(game: Game): boolean {
    return !!game.multiplayerType && game.multiplayerType !== 'None';
  }

  /**
   * A cabinet advertises solo play when its mode list includes 'solo'.
   * Such games stream inline on a direct launch instead of being gated
   * behind the rival-scan queue; duel/team-only titles still scan.
   */
  private hasSoloMode(game: Game): boolean {
    return game.modes?.includes('solo') === true;
  }

  private buildSessionContext(game: Game) {
    const event = this.activeEvents().find((e) => e.featuredGameId === game.id);
    return {
      roomId: this.activeRoom(),
      eventId: event?.id,
      reward: event?.reward,
    };
  }

  launchActionLabel(game: Game): string {
    return game.launchConfig?.embedMode === 'external-only'
      ? 'LAUNCH MISSION'
      : 'PLAY NOW';
  }

  getGamesForRail(rail: RecommendationRail): Game[] {
    const allGames = this.games();
    if (rail.gameIds?.length) {
      // Build a stable first-wins map to guard against duplicate game IDs
      const gameMap = new Map<string, Game>();
      for (const g of allGames) {
        if (!gameMap.has(g.id)) {
          gameMap.set(g.id, g);
        }
      }
      const ordered = rail.gameIds
        .map((id) => gameMap.get(id))
        .filter((g): g is Game => g !== undefined);
      return rail.maxItems != null ? ordered.slice(0, rail.maxItems) : ordered;
    }
    if (rail.audience?.primaryGenres?.length)
      return allGames.filter((g) =>
        rail.audience!.primaryGenres!.includes(g.genre || '')
      );
    if (rail.badgeId)
      return allGames.filter((g) => g.badgeIds?.includes(rail.badgeId!));
    return allGames.slice(0, rail.maxItems || 4);
  }

  private matchesRecommendationAudience(
    rail: RecommendationRail,
    profile: any
  ): boolean {
    return true;
  }

  toggleRivalHub() {
    this.showRivalHub.update((v) => !v);
    if (!this.showRivalHub()) {
      this.spectateTarget.set(null);
      this.showSpectateOverlay.set(false);
    }
  }

  sendChallenge(userId: string, gameId: string) {
    if (!gameId || gameId === 'all') {
      this.snackbarService.info('SELECT A GAME CABINET FIRST');
      return;
    }
    this.inboxService.challengePlayer(userId, gameId);
    this.snackbarService.success('CHALLENGE DISPATCHED');
    this.challengeCount.update((c) => c + 1);
    this.checkAchievements();
    this.playSoundEffect('challenge');
  }

  async sendRemixRequest(userId: string): Promise<void> {
    const sent = await this.orchestration.requestRemix(userId);
    if (sent) {
      this.snackbarService.success('REMIX REQUEST DISPATCHED');
      this.playSoundEffect('challenge');
    } else {
      this.snackbarService.info('OPEN A COLLAB SESSION TO REQUEST A REMIX');
    }
  }

  async requestSessionReview(): Promise<void> {
    const requested = await this.orchestration.requestReview();
    if (requested) {
      this.snackbarService.success('REVIEW REQUEST DISPATCHED');
    } else {
      this.snackbarService.info('NO REVIEWERS AVAILABLE FOR THIS SESSION');
    }
  }

  buildRemixSessionLink(toUserId?: string): string {
    const target = this.orchestration.currentTarget();
    const baseUrl = window.location.origin + '/remix-arena';
    const params = new URLSearchParams();
    if (target.sessionId) params.set('sessionId', target.sessionId);
    if (target.projectId) params.set('projectId', target.projectId);
    if (toUserId) params.set('to', toUserId);
    return `${baseUrl}?${params.toString()}`;
  }

  async shareRemixSessionLink(toUserId?: string): Promise<void> {
    const link = this.buildRemixSessionLink(toUserId);
    const text = `🎛️ Remix this S.M.U.V.E. session with me: ${link}`;
    try {
      await navigator.clipboard.writeText(text);
      this.snackbarService.success('REMIX LINK COPIED');
    } catch {
      this.snackbarService.error('FAILED TO COPY REMIX LINK');
    }
  }

  buildChallengeLink(gameId: string, toUserId?: string): string {
    const baseUrl = window.location.origin + '/tha-spot';
    const params = new URLSearchParams();
    params.set('challenge', 'true');
    params.set('gameId', gameId);
    params.set('from', this.profileService.profile().id);
    params.set('fromName', this.profileService.profile().artistName || 'Rival');
    if (toUserId) params.set('to', toUserId);
    return `${baseUrl}?${params.toString()}`;
  }

  async shareChallengeLink(gameId: string, toUserId?: string) {
    if (!gameId || gameId === 'all') {
      this.snackbarService.info('SELECT A GAME CABINET FIRST');
      return;
    }
    const game =
      this.games().find((g) => g.id === gameId) || this.selectedGame();
    const gameName = game?.name || gameId;
    const link = this.buildChallengeLink(gameId, toUserId);
    const text = `🎮 Challenge me to ${gameName} on S.M.U.V.E.! ${link}`;

    // Use Web Share API when available (mobile native share sheet)
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'S.M.U.V.E. Challenge',
          text,
          url: link,
        });
        return;
      } catch (_err) {
        // Fall through to clipboard / sms
      }
    }

    // Copy to clipboard as fallback
    try {
      await navigator.clipboard.writeText(text);
      this.snackbarService.success('CHALLENGE LINK COPIED');
    } catch (_err) {
      this.snackbarService.error('FAILED TO COPY LINK');
    }
  }

  shareChallengeViaSms(gameId: string, toUserId?: string) {
    if (!gameId || gameId === 'all') {
      this.snackbarService.info('SELECT A GAME CABINET FIRST');
      return;
    }
    const game =
      this.games().find((g) => g.id === gameId) || this.selectedGame();
    const gameName = game?.name || gameId;
    const link = this.buildChallengeLink(gameId, toUserId);
    const body = encodeURIComponent(
      `🎮 Challenge me to ${gameName} on S.M.U.V.E.! ${link}`
    );
    window.location.href = `sms:?body=${body}`;
  }

  acceptIncomingChallenge() {
    const challenge = this.incomingChallenge();
    const game = this.games().find((g) => g.id === challenge?.gameId);
    if (game) {
      this.selectedGame.set(game);
    }
    this.respondToIncomingChallenge('accepted');
    this.snackbarService.success('CHALLENGE ACCEPTED — INITIALIZING');
    this.playSoundEffect('challenge');
    // The acceptedChallenge effect fires after the REST accept round-trip
    // and drives the cabinet launch — calling confirmLaunch here too
    // would open the cabinet twice.
  }

  declineIncomingChallenge() {
    this.respondToIncomingChallenge('declined');
    this.snackbarService.info('CHALLENGE DECLINED');
  }

  /**
   * Persist the banner response via the inbox REST endpoint when a server
   * record exists (socket-delivered challenges). Deep-link-only challenges
   * have no record, so local dismissal is all there is to do — the sender
   * never created a server challenge for those.
   */
  private respondToIncomingChallenge(status: 'accepted' | 'declined'): void {
    const challenge = this.incomingChallenge();
    if (!challenge) return;
    this.incomingChallenge.set(null);
    if (challenge.id !== undefined) {
      this.inboxService.respondToChallenge(challenge.id, status);
      return;
    }
    const record = this.inboxService
      .challenges()
      .find(
        (c) =>
          c.status === 'pending' &&
          c.toUserId === this.profileService.profile().id &&
          c.gameId === challenge.gameId &&
          (!challenge.fromUserId || c.fromUserId === challenge.fromUserId)
      );
    if (record) {
      this.inboxService.respondToChallenge(record.id, status);
    }
  }

  startVoiceChat(userId: string) {
    this.peerService.startCall(userId);
  }

  endVoiceChat() {
    this.peerService.endCall();
  }

  copyShareLink() {
    const game = this.currentGame() || this.selectedGame();
    const gameId = game?.id;
    const gameName = game?.name;
    const partyId = this.socialService.currentPartyId();
    const baseUrl = window.location.origin + '/tha-spot';

    const params = new URLSearchParams();
    if (gameId) params.set('gameId', gameId);
    if (gameName) params.set('mission', gameName);
    if (partyId) params.set('partyId', partyId);

    const queryString = params.toString();
    const url = queryString ? `${baseUrl}?${queryString}` : baseUrl;

    navigator.clipboard.writeText(url).then(() => {
      this.snackbarService.success('MISSION LINK COPIED TO CLIPBOARD');
    });
  }

  setHubTab(tab: 'room' | 'dm' | 'stream' | 'friends' | 'party' | 'ai') {
    this.activeHubTab.set(tab);
    if (
      tab === 'dm' &&
      !this.dmTargetUserId() &&
      this.onlineUsers().length > 0
    ) {
      this.dmTargetUserId.set(this.onlineUsers()[0].userId);
    }
    setTimeout(() => this.scrollToBottom(), 50);
  }

  /** Accept a pending squad invite and jump into the party tab. */
  acceptPartyInvite(partyId: string): void {
    this.socialService.acceptPartyInvite(partyId);
    this.setHubTab('party');
    if (!this.showRivalHub()) this.toggleRivalHub();
    this.playSoundEffect('select');
  }

  /** Decline a pending squad invite. */
  declinePartyInvite(): void {
    this.socialService.declinePartyInvite();
    this.snackbarService.info('SQUAD INVITE DECLINED');
  }

  /** Accept an incoming neural-sync request. */
  acceptNeuralSync(fromUserId: string): void {
    this.socialService.acceptNeuralSyncRequest(fromUserId);
    this.snackbarService.success('NEURAL SYNC APPROVED — EXCHANGING DATA');
  }

  /** Decline an incoming neural-sync request. */
  declineNeuralSync(): void {
    this.socialService.declineNeuralSyncRequest();
    this.snackbarService.info('NEURAL SYNC REQUEST DECLINED');
  }

  setDmTarget(userId: string) {
    this.dmTargetUserId.set(userId);
    this.socialService.loadMessageHistory(userId);
    setTimeout(() => this.scrollToBottom(), 50);
  }

  handleChatSubmit() {
    const msg = this.chatInput().trim();
    if (!msg) return;

    if (this.activeHubTab() === 'room') {
      this.socialService.sendRoomMessage(this.activeRoom(), msg);
    } else if (this.activeHubTab() === 'dm' && this.dmTargetUserId()) {
      this.socialService.sendMessage(this.dmTargetUserId()!, msg);
      // Kill the live typing indicator — otherwise the peer sees us
      // "typing" forever after the message lands.
      this.socialService.sendTypingStatus(this.dmTargetUserId()!, false);
    } else if (this.activeHubTab() === 'party') {
      if (!this.socialService.currentPartyId()) {
        // No squad yet — the old code silently dropped the message.
        this.snackbarService.info('JOIN OR CREATE A SQUAD BEFORE CHATTING');
        this.chatInput.set('');
        return;
      }
      this.socialService.sendPartyMessage(msg);
    }

    this.chatInput.set('');
  }

  onContentScroll(event: Event) {
    const target = event.target as HTMLElement;
    this.showBackToTop.set(target.scrollTop > 400);
  }

  scrollToTop() {
    if (this.contentViewport?.nativeElement) {
      this.contentViewport.nativeElement.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
    }
  }

  /**
   * Launch selected game on Enter key press (when a game is selected and not already launching).
   */
  @HostListener('document:keydown.enter', ['$event'])
  onEnterKey(event: KeyboardEvent): void {
    if (this.selectedGame() && !this.currentGame() && !this.isMatchmaking()) {
      // Ensure we're not typing in an input
      const tag = (event.target as HTMLElement)?.tagName;
      if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
        event.preventDefault();
        this.confirmLaunch();
      }
    }
  }

  /**
   * Escape key closes preview or game.
   */
  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event: KeyboardEvent): void {
    if (this.currentGame()) {
      event.preventDefault();
      this.closeGame();
    } else if (this.selectedGame()) {
      event.preventDefault();
      this.closePreview();
    }
  }

  /**
   * Toggle fullscreen mode for the game console.
   */
  toggleFullscreen(): void {
    this.isFullscreen.update((v) => !v);
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  /**
   * Recent games tracking — persist last 8 played games in localStorage.
   */
  private loadRecentGames(): void {
    try {
      const raw = localStorage.getItem(this.RECENT_GAMES_KEY);
      if (raw) this.recentGames.set(JSON.parse(raw));
    } catch {
      /* ignore corrupt data */
    }
  }

  private addRecentGame(game: Game): void {
    const current = this.recentGames().filter((g) => g.id !== game.id);
    current.unshift(game);
    if (current.length > 8) current.length = 8;
    this.recentGames.set(current);
    try {
      localStorage.setItem(this.RECENT_GAMES_KEY, JSON.stringify(current));
    } catch {
      /* storage full — silently ignore */
    }
  }

  clearRecentGames(): void {
    this.recentGames.set([]);
    try {
      localStorage.removeItem(this.RECENT_GAMES_KEY);
    } catch {
      /* ignore */
    }
  }

  addEmoji(emoji: string) {
    this.chatInput.update((v) => v + emoji);
  }

  scrollToBottom() {
    if (this.scrollContainer?.nativeElement) {
      this.scrollContainer.nativeElement.scrollTop =
        this.scrollContainer.nativeElement.scrollHeight;
    }
  }

  goLive(platform: string) {
    this.socialService.startStream(platform);
    this.activeHubTab.set('stream');
  }

  endStream() {
    this.socialService.stopStream();
  }

  // ── Achievement System ──────────────────────────────
  private loadAchievements(): void {
    try {
      const saved = localStorage.getItem(this.ACHIEVEMENTS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Achievement[];
        const updated = this.achievements().map((a) => {
          const found = parsed.find((p) => p.id === a.id);
          return found
            ? { ...a, unlocked: found.unlocked, progress: found.progress }
            : a;
        });
        this.achievements.set(updated);
      }
    } catch {
      /* ignore */
    }
  }

  private saveAchievements(): void {
    try {
      localStorage.setItem(
        this.ACHIEVEMENTS_KEY,
        JSON.stringify(this.achievements())
      );
    } catch {
      /* ignore */
    }
  }

  private checkAchievements(): void {
    let newUnlock: Achievement | null = null;

    this.achievements.update((a) =>
      a.map((ach) => {
        if (ach.unlocked) return ach;

        let progress = ach.progress;
        switch (ach.id) {
          case 'first-launch':
            progress = Math.min(1, progress + 1);
            break;
          case 'play-5':
            progress = Math.min(5, this.playedGameIds().size);
            break;
          case 'play-25':
            progress = Math.min(
              25,
              this.recentGames().length + this.playedGameIds().size
            );
            break;
          case 'favorites-3':
            progress = Math.min(3, this.favorites().length);
            break;
          case 'multiplayer-1':
            progress = Math.min(1, progress + 1);
            break;
          case 'challenge-5':
            progress = Math.min(5, this.challengeCount());
            break;
          case 'session-10min':
            // Progress tracked in closeGame()
            break;
        }

        if (progress >= ach.maxProgress && !ach.unlocked) {
          newUnlock = { ...ach, unlocked: true, progress: ach.maxProgress };
          return { ...ach, unlocked: true, progress: ach.maxProgress };
        }
        return { ...ach, progress };
      })
    );

    this.saveAchievements();

    if (newUnlock) {
      this.lastUnlockedAchievement.set(newUnlock);
      this.showAchievementPopup.set(true);
      this.snackbarService.success(
        `🏆 ACHIEVEMENT UNLOCKED: ${newUnlock.title}`
      );
      this.playSoundEffect('achievement');
      setTimeout(() => this.showAchievementPopup.set(false), 4000);
    }
  }

  // ── AI Game Recommendations ─────────────────────────
  private generateAiRecommendations(): void {
    const profile = this.profileService.profile();
    const profileGenres = [profile.primaryGenre].filter(Boolean);
    const allGames = this.games();
    const played = this.playedGameIds();

    const matching = allGames
      .filter(
        (g) =>
          !played.has(g.id) &&
          g.genre &&
          profileGenres.some(
            (pg) =>
              g.genre!.toLowerCase().includes(pg.toLowerCase()) ||
              pg.toLowerCase().includes(g.genre!.toLowerCase())
          )
      )
      .slice(0, 4);

    if (matching.length === 0) {
      // Fallback: recommend top-rated unplayed games
      const fallback = allGames
        .filter((g) => !played.has(g.id))
        .sort((a, b) => (b.rating || 0) - (a.rating || 0))
        .slice(0, 4);
      this.aiRecommendations.set(fallback);
    } else {
      this.aiRecommendations.set(matching);
    }
  }

  // ── AI Companion Chat ───────────────────────────────
  async sendAiCompanionMessage(): Promise<void> {
    const text = this.aiCompanionInput().trim();
    if (!text) return;

    this.aiCompanionMessages.update((msgs) => [
      ...msgs,
      { role: 'user', text },
    ]);
    this.aiCompanionInput.set('');
    this.aiCompanionThinking.set(true);

    // Simulate AI thinking delay
    await new Promise((r) => setTimeout(r, 800 + Math.random() * 1200));

    const aiResponses: Record<string, string[]> = {
      default: [
        'AFFIRMATIVE. Scanning game library for optimal missions.',
        'Your S.M.U.V.E neural sync is strong. Ready for deployment.',
        'I recommend calibrating your reflexes with a quick round.',
        'Enemy patterns detected. Adjust your strategy accordingly.',
        'Elite operators always maintain situational awareness.',
        'The Arcade floor awaits your command.',
        'Rival activity detected in your sector. Stay sharp.',
        'Your track record suggests high-performance potential.',
      ],
      recommend: [
        'Based on your profile, I recommend the Fighting Pit for competitive edge.',
        'Your genre affinity suggests RPG deep runs would yield high session value.',
        'Shooting Range cabinets show optimal match with your play style.',
      ],
      help: [
        'Available commands: recommend, status, squad, leaderboard',
        'I can assist with game recommendations, matchmaking status, and squad coordination.',
      ],
      status: [
        `Systems nominal. ${this.onlineUsers().length} operatives online. Neural sync at ${this.neuralSyncScore()}%.`,
      ],
    };

    const lower = text.toLowerCase();
    let pool = aiResponses.default;
    if (lower.includes('recommend') || lower.includes('suggest'))
      pool = aiResponses.recommend;
    else if (lower.includes('help') || lower.includes('what'))
      pool = aiResponses.help;
    else if (lower.includes('status') || lower.includes('systems'))
      pool = aiResponses.status;

    const response = pool[Math.floor(Math.random() * pool.length)];

    this.aiCompanionMessages.update((msgs) => [
      ...msgs,
      { role: 'ai', text: response },
    ]);
    this.aiCompanionThinking.set(false);
    setTimeout(() => this.scrollToBottom(), 100);
  }

  // ── Spectate Mode ───────────────────────────────────
  startSpectate(user: OnlineUser): void {
    this.spectateTarget.set(user);
    this.showSpectateOverlay.set(true);
    this.snackbarService.info(`SPECTATING: ${user.artistName || 'RIVAL'}`);
    this.playSoundEffect('select');
  }

  stopSpectate(): void {
    this.spectateTarget.set(null);
    this.showSpectateOverlay.set(false);
  }

  // ── Favorites ───────────────────────────────────────
  toggleFavorite(gameId: string): void {
    const current = this.favorites();
    const updated = current.includes(gameId)
      ? current.filter((id) => id !== gameId)
      : [...current, gameId];
    this.favorites.set(updated);
    this.checkAchievements();
    try {
      localStorage.setItem('tha_spot_favorites', JSON.stringify(updated));
    } catch {
      /* ignore */
    }
  }

  isFavorite(gameId: string): boolean {
    return this.favorites().includes(gameId);
  }

  // ── Quick-Lobby (one-click from game card) ───────────
  /** Creates a co-op lobby directly from a game card without opening preview. */
  quickCreateLobby(gameId: string, event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
    }
    if (!gameId || gameId === 'all') {
      this.snackbarService.info('SELECT A MULTIPLAYER GAME FIRST');
      return;
    }
    const lobby = this.matchmaking.createLobby(gameId);
    this.snackbarService.success(
      `LOBBY CREATED: ${lobby.gameName.toUpperCase()}`
    );
    this.playSoundEffect('select');
    // Switch to party tab to show the lobby
    this.setHubTab('party');
    if (!this.showRivalHub()) this.toggleRivalHub();
  }

  // ── Is multiplayer helper for template ───────────────
  isMultiplayer(game: Game): boolean {
    return this.isMultiplayerGame(game);
  }

  // ── Ready-Up ──────────────────────────────────────────
  toggleReady(): void {
    this.matchmaking.toggleReady();
    this.playSoundEffect('select');
  }

  startLobbyCountdown(): void {
    this.matchmaking.startCountdown();
  }

  cancelLobbyCountdown(): void {
    this.matchmaking.cancelCountdown();
  }

  // ── Lobby Voice Chat ───────────────────────────────────
  toggleLobbyMute(): void {
    this.peerService.toggleMute();
  }

  startLobbyVoiceCall(playerId: string): void {
    this.peerService.startCall(playerId);
  }

  /** Whether the current user is actively speaking (for voice activity indicator) */
  get isVoiceActive(): boolean {
    return this.peerService.voiceActivityLevel() > 15;
  }

  /** Voice activity level 0-100 for CSS variable binding */
  get voiceActivityPct(): number {
    return this.peerService.voiceActivityLevel();
  }

  // ── Persistent Lobby Chat ──────────────────────────────

  sendLobbyChat(text: string): void {
    this.matchmaking.sendLobbyChatMessage(text);
  }

  // ── Spectator Mode ─────────────────────────────────────
  startSpectateLobby(lobbyId: string): void {
    this.matchmaking.startSpectateLobby(lobbyId);
  }

  stopSpectateLobby(): void {
    this.matchmaking.stopSpectateLobby();
  }

  // ── Replay Viewer ──────────────────────────────────────
  startReplayViewer(): void {
    const lobby = this.matchmaking.myLobby();
    if (lobby) {
      this.matchmaking.startReplay(lobby.id);
    }
  }

  stopReplayViewer(): void {
    this.matchmaking.stopReplay();
  }

  // ── Lobby Invite ──────────────────────────────────────
  copyLobbyInviteLink(): void {
    this.matchmaking.copyLobbyInviteLink();
    this.playSoundEffect('select');
  }

  async shareLobbyInvite(): Promise<void> {
    await this.matchmaking.shareLobbyInvite();
  }

  // ── Sound Effects ───────────────────────────────────
  private playSoundEffect(
    type: 'select' | 'launch' | 'close' | 'challenge' | 'achievement'
  ): void {
    try {
      if (!this.audioCtx) {
        this.audioCtx = new (
          window.AudioContext || (window as any).webkitAudioContext
        )();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      switch (type) {
        case 'select':
          osc.frequency.setValueAtTime(800, this.audioCtx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(
            1200,
            this.audioCtx.currentTime + 0.1
          );
          gain.gain.setValueAtTime(0.08, this.audioCtx.currentTime);
          gain.gain.exponentialRampToValueAtTime(
            0.001,
            this.audioCtx.currentTime + 0.15
          );
          osc.start(this.audioCtx.currentTime);
          osc.stop(this.audioCtx.currentTime + 0.15);
          break;
        case 'launch':
          osc.type = 'square';
          osc.frequency.setValueAtTime(200, this.audioCtx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(
            800,
            this.audioCtx.currentTime + 0.3
          );
          gain.gain.setValueAtTime(0.1, this.audioCtx.currentTime);
          gain.gain.exponentialRampToValueAtTime(
            0.001,
            this.audioCtx.currentTime + 0.4
          );
          osc.start(this.audioCtx.currentTime);
          osc.stop(this.audioCtx.currentTime + 0.4);
          break;
        case 'close':
          osc.frequency.setValueAtTime(600, this.audioCtx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(
            200,
            this.audioCtx.currentTime + 0.15
          );
          gain.gain.setValueAtTime(0.06, this.audioCtx.currentTime);
          gain.gain.exponentialRampToValueAtTime(
            0.001,
            this.audioCtx.currentTime + 0.2
          );
          osc.start(this.audioCtx.currentTime);
          osc.stop(this.audioCtx.currentTime + 0.2);
          break;
        case 'challenge':
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(300, this.audioCtx.currentTime);
          osc.frequency.setValueAtTime(500, this.audioCtx.currentTime + 0.1);
          osc.frequency.setValueAtTime(700, this.audioCtx.currentTime + 0.2);
          gain.gain.setValueAtTime(0.08, this.audioCtx.currentTime);
          gain.gain.exponentialRampToValueAtTime(
            0.001,
            this.audioCtx.currentTime + 0.35
          );
          osc.start(this.audioCtx.currentTime);
          osc.stop(this.audioCtx.currentTime + 0.35);
          break;
        case 'achievement':
          osc.type = 'sine';
          osc.frequency.setValueAtTime(523, this.audioCtx.currentTime);
          osc.frequency.setValueAtTime(659, this.audioCtx.currentTime + 0.15);
          osc.frequency.setValueAtTime(784, this.audioCtx.currentTime + 0.3);
          osc.frequency.setValueAtTime(1047, this.audioCtx.currentTime + 0.45);
          gain.gain.setValueAtTime(0.1, this.audioCtx.currentTime);
          gain.gain.exponentialRampToValueAtTime(
            0.001,
            this.audioCtx.currentTime + 0.6
          );
          osc.start(this.audioCtx.currentTime);
          osc.stop(this.audioCtx.currentTime + 0.6);
          break;
      }
    } catch {
      /* Audio not available — silent */
    }
  }
}

// ── Achievement Interface ─────────────────────────────
export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlocked: boolean;
  progress: number;
  maxProgress: number;
}
