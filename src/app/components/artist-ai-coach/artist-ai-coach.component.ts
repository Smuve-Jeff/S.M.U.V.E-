import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ArtistAiCoachService } from '../../services/artist-ai-coach.service';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-artist-ai-coach',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <section class="coach-container">
      <div class="header">
        <h1>S.M.U.V.E. Artist Coach</h1>
        <p>Personalized guidance based on your profile, genre, and stage</p>
        <a [routerLink]="['/adaptive-profile']" class="link-button">View Adaptive Profile</a>
      </div>

      <div class="layout">
        <div class="card release-strategy">
          <h2>Next Release Strategy</h2>
          <div class="strategy-block">
            <div class="row"><strong>Type:</strong><span>{{ coach().personalized.releaseStrategy.nextRelease.type }}</span></div>
            <div class="row"><strong>Target Date:</strong><span>{{ coach().personalized.releaseStrategy.nextRelease.targetDate }}</span></div>
            <div class="row"><strong>Formats:</strong><span>{{ coach().personalized.releaseStrategy.nextRelease.format.join(', ') }}</span></div>
            <div class="row full"><strong>Strategy:</strong><p>{{ coach().personalized.releaseStrategy.nextRelease.strategy }}</p></div>
          </div>
        </div>

        <div class="card actions-card">
          <h2>Next Actions (Prioritized)</h2>
          <div class="action-list">
            @for (action of coach().personalized.prioritizedActions; track action) {
              <div class="action-item">{{ action }}</div>
            }
          </div>
        </div>

        <div class="coach-prompts">
          @for (prompt of coach().personalized.coachPrompts; track prompt.role) {
            <div class="card prompt-card">
              <div class="prompt-header">
                <h3>{{ prompt.title }}</h3>
                <span class="urgency" [attr.data-urgency]="prompt.urgency">{{ prompt.urgency }}</span>
              </div>
              <p class="context">{{ prompt.context }}</p>
              <pre class="prompt-text">{{ prompt.prompt }}</pre>
              <div class="action-items">
                <strong>Action Items:</strong>
                <ul>
                  @for (item of prompt.actionItems; track item) {
                    <li>{{ item }}</li>
                  }
                </ul>
              </div>
            </div>
          }
        </div>

        @if (coach().personalized.missedOpportunities.length > 0) {
          <div class="card opportunities-card">
            <h2>💡 Missed Opportunities</h2>
            <div class="opportunity-list">
              @for (opp of coach().personalized.missedOpportunities; track opp) {
                <div class="opportunity-item">{{ opp }}</div>
              }
            </div>
          </div>
        }

        @if (coach().personalized.warnings.length > 0) {
          <div class="card warnings-card">
            <h2>⚠️ Warnings</h2>
            <div class="warning-list">
              @for (warning of coach().personalized.warnings; track warning) {
                <div class="warning-item">{{ warning }}</div>
              }
            </div>
          </div>
        }
      </div>
    </section>
  `,
  styles: [`
    .coach-container { padding: 2rem; display: grid; gap: 2rem; }
    .header { text-align: center; margin-bottom: 1rem; }
    .link-button { display: inline-block; margin-top: 1rem; padding: 0.5rem 1rem; background: #6ee7b7; color: #000; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 0.9rem; }
    .layout { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 1.5rem; }
    .card { border: 1px solid #2a2a2a; border-radius: 12px; padding: 1.5rem; background: rgba(255,255,255,0.02); backdrop-filter: blur(8px); }
    h2 { margin: 0 0 1rem 0; font-size: 1.1rem; font-weight: 600; }
    h3 { margin: 0; font-size: 1rem; }
    .release-strategy { grid-column: 1 / -1; }
    .strategy-block { display: grid; gap: 0.75rem; }
    .row { display: flex; gap: 1rem; align-items: flex-start; }
    .row strong { min-width: 120px; opacity: 0.7; }
    .row.full { flex-direction: column; }
    .row.full p { margin: 0.5rem 0 0 0; opacity: 0.8; line-height: 1.5; }
    .actions-card { grid-column: 1 / -1; }
    .action-list { display: grid; gap: 0.75rem; }
    .action-item { padding: 0.75rem; background: rgba(110, 231, 183, 0.1); border-left: 3px solid #6ee7b7; border-radius: 4px; font-size: 0.9rem; }
    .coach-prompts { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 1.5rem; }
    .prompt-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }
    .urgency { padding: 0.25rem 0.75rem; border-radius: 12px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; }
    .urgency[data-urgency="immediate"] { background: #ef4444; color: #fff; }
    .urgency[data-urgency="high"] { background: #f59e0b; color: #000; }
    .urgency[data-urgency="medium"] { background: #3b82f6; color: #fff; }
    .urgency[data-urgency="low"] { background: #6b7280; color: #fff; }
    .context { font-size: 0.85rem; opacity: 0.7; margin: 0 0 0.75rem 0; font-style: italic; }
    .prompt-text { background: rgba(0,0,0,0.3); padding: 1rem; border-radius: 6px; font-size: 0.8rem; line-height: 1.5; margin: 0.75rem 0; overflow-x: auto; }
    .action-items { margin-top: 1rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.1); }
    .action-items strong { display: block; margin-bottom: 0.5rem; opacity: 0.8; font-size: 0.9rem; }
    .action-items ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.5rem; }
    .action-items li { font-size: 0.85rem; opacity: 0.8; padding-left: 1.5rem; position: relative; }
    .action-items li:before { content: '✓'; position: absolute; left: 0; color: #6ee7b7; }
    .opportunities-card { border-color: #f59e0b; border-width: 2px; }
    .opportunity-list { display: grid; gap: 0.75rem; }
    .opportunity-item { padding: 0.75rem; background: rgba(245, 158, 11, 0.1); border-left: 3px solid #f59e0b; border-radius: 4px; font-size: 0.9rem; }
    .warnings-card { border-color: #ef4444; border-width: 2px; }
    .warning-list { display: grid; gap: 0.75rem; }
    .warning-item { padding: 0.75rem; background: rgba(239,68,68,0.1); border-left: 3px solid #ef4444; border-radius: 4px; font-size: 0.9rem; }
  `]
})
export class ArtistAiCoachComponent {
  private readonly coachService = inject(ArtistAiCoachService);
  readonly coach = computed(() => this.coachService.coachState());
}
