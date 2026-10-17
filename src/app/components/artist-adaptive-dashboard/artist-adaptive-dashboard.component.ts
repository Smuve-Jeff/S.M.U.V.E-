import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ArtistAdaptiveEngineService } from '../../services/artist-adaptive-engine.service';
import { MusicalDnaService } from '../../services/musical-dna.service';

@Component({
  selector: 'app-artist-adaptive-dashboard',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="adaptive-dashboard">
      <div class="header">
        <h1>S.M.U.V.E. Adaptive Profile</h1>
        <p>How S.M.U.V.E. understands and adapts to your music</p>
      </div>

      <div class="container">
        <div class="card dna-card">
          <h2>Musical DNA Fingerprint</h2>
          <div class="dna-signature">{{ dnaSignature() }}</div>
          <p class="fidelity">Fidelity: {{ dnaReading().fidelity }}/100</p>
          <div class="dimensions">
            @for (dim of dnaReading().dimensions; track dim.id) {
              <div class="dimension">
                <span class="label">{{ dim.label }}</span>
                <div class="posture" [attr.data-posture]="dim.posture">{{ dim.posture }}</div>
                <small>{{ dim.confidence }}/100 confidence</small>
              </div>
            }
          </div>
        </div>

        <div class="card genre-card">
          <h2>{{ adaptation().genreProfile.label }} Profile</h2>
          <div class="section">
            <h3>Production Defaults</h3>
            <ul>
              <li>DAW: {{ adaptation().genreProfile.productionDefaults.recommendedDaw.join(', ') }}</li>
              <li>BPM: {{ adaptation().genreProfile.productionDefaults.typicalBpmRange[0] }}-{{ adaptation().genreProfile.productionDefaults.typicalBpmRange[1] }}</li>
              <li>Mix focus: {{ adaptation().genreProfile.productionDefaults.mixPriorities[0] }}</li>
            </ul>
          </div>

          <div class="section">
            <h3>Business Playbook</h3>
            <ul>
              <li>Release strategy: {{ adaptation().genreProfile.businessPlaybook.releaseStrategy }}</li>
              <li>Typical velocity: {{ adaptation().genreProfile.businessPlaybook.typicalVelocity }}</li>
              <li>Income priority: {{ adaptation().genreProfile.businessPlaybook.incomeStreamPriority[0] }}</li>
            </ul>
          </div>
        </div>

        <div class="card directive-card">
          <h2>Production Directive</h2>
          <pre>{{ adaptation().productionDirective }}</pre>
        </div>

        <div class="card strategy-card">
          <h2>Business Strategy</h2>
          <pre>{{ adaptation().businessStrategy }}</pre>
        </div>

        <div class="card readiness-card">
          <h2>Live Readiness</h2>
          <div class="score">{{ adaptation().liveReadiness.score }}%</div>
          @if (adaptation().liveReadiness.gaps.length > 0) {
            <div class="gaps">
              @for (gap of adaptation().liveReadiness.gaps; track gap) {
                <div class="gap">{{ gap }}</div>
              }
            </div>
          }
          <p class="next-move">{{ adaptation().liveReadiness.nextMove }}</p>
        </div>

        <div class="card sync-card">
          <h2>Sync & Licensing Readiness</h2>
          <div class="score">{{ adaptation().syncReadiness.score }}%</div>
          <p class="model">Clearance: {{ adaptation().syncReadiness.clearanceModel }}</p>
          @if (adaptation().syncReadiness.missingAssets.length > 0) {
            <div class="assets">
              <strong>Missing Assets:</strong>
              @for (asset of adaptation().syncReadiness.missingAssets; track asset) {
                <div class="asset">{{ asset }}</div>
              }
            </div>
          }
        </div>

        @if (adaptation().warningsAndProtections.length > 0) {
          <div class="card warnings-card">
            <h2>⚠️ Warnings & Protections</h2>
            @for (warning of adaptation().warningsAndProtections; track warning) {
              <div class="warning">{{ warning }}</div>
            }
          </div>
        }

        <div class="card action-card">
          <h2>Next Prioritized Action</h2>
          <p class="action">{{ adaptation().nextPrioritizedAction }}</p>
        </div>
      </div>
    </section>
  `,
  styles: [`
    .adaptive-dashboard { padding: 2rem; display: grid; gap: 2rem; }
    .header { text-align: center; margin-bottom: 1rem; }
    .container { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.5rem; }
    .card { border: 1px solid #2a2a2a; border-radius: 12px; padding: 1.5rem; background: rgba(255,255,255,0.02); backdrop-filter: blur(8px); }
    h2 { margin: 0 0 1rem 0; font-size: 1.1rem; }
    h3 { margin: 0.75rem 0 0.5rem 0; font-size: 0.9rem; opacity: 0.8; }
    .dna-signature { font-size: 0.95rem; opacity: 0.9; margin-bottom: 0.75rem; }
    .fidelity { font-size: 0.85rem; opacity: 0.7; margin-bottom: 1rem; }
    .dimensions { display: grid; gap: 0.5rem; }
    .dimension { display: flex; gap: 0.5rem; align-items: center; font-size: 0.85rem; padding: 0.5rem; background: rgba(255,255,255,0.05); border-radius: 6px; }
    .posture { padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600; }
    .posture[data-posture="aligned"] { background: #22c55e; color: #000; }
    .posture[data-posture="instinct-led"] { background: #f59e0b; color: #000; }
    .posture[data-posture="vision-led"] { background: #3b82f6; color: #fff; }
    .posture[data-posture="unread"] { background: #6b7280; color: #fff; }
    .section { margin-bottom: 1rem; }
    ul { list-style: none; padding: 0; margin: 0.5rem 0 0 0; }
    li { font-size: 0.85rem; opacity: 0.8; padding: 0.25rem 0; }
    pre { background: rgba(0,0,0,0.3); padding: 1rem; border-radius: 6px; overflow-x: auto; font-size: 0.8rem; line-height: 1.4; margin: 0; }
    .score { font-size: 2rem; font-weight: bold; color: #6ee7b7; margin-bottom: 0.5rem; }
    .gaps { display: grid; gap: 0.5rem; margin: 0.75rem 0; }
    .gap { font-size: 0.85rem; opacity: 0.8; padding: 0.5rem; background: rgba(239,68,68,0.1); border-left: 3px solid #ef4444; border-radius: 4px; }
    .next-move { font-size: 0.85rem; margin: 0.75rem 0 0 0; opacity: 0.8; }
    .assets { margin-top: 0.75rem; }
    .asset { font-size: 0.85rem; opacity: 0.8; padding: 0.25rem 0; }
    .warnings-card { border-color: #ef4444; border-width: 2px; }
    .warning { font-size: 0.85rem; padding: 0.5rem 0; opacity: 0.9; }
    .action { font-size: 0.95rem; margin: 0; }
  `]
})
export class ArtistAdaptiveDashboardComponent {
  private readonly adaptiveEngine = inject(ArtistAdaptiveEngineService);
  private readonly dnaService = inject(MusicalDnaService);
  readonly adaptation = computed(() => this.adaptiveEngine.adaptationState());
  readonly dnaReading = computed(() => this.dnaService.reading());
  dnaSignature(): string { return this.dnaService.signature() || 'Fingerprint still forming.'; }
}
