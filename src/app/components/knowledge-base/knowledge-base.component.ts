import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UserProfileService } from '../../services/user-profile.service';

@Component({
  selector: 'app-knowledge-base',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="knowledge-base-container glass-card p-6 animate__animated animate__fadeIn"
    >
      <header class="mb-8 border-b border-emerald-500/30 pb-4">
        <h1 class="text-3xl font-bold text-emerald-400">
          NEURAL KNOWLEDGE VAULT
          <span class="text-xs text-emerald-500/50">[SECURE ACCESS]</span>
        </h1>
        <p class="text-emerald-500/70">
          ARCHIVED STRATEGIC INTELLIGENCE AND PRODUCTION SECRETS
        </p>
      </header>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
        <section
          class="vault-section glass-card p-4 border-l-2 border-purple-500"
        >
          <h2 class="text-xl font-bold text-purple-400 mb-4 flex items-center">
            <span class="material-symbols-outlined mr-2">psychology</span>
            LEARNED STYLES
          </h2>
          <div
            *ngIf="profile().knowledgeBase.learnedStyles.length === 0"
            class="text-slate-500 italic mb-4"
          >
            No stylistic patterns analyzed. Dominate more sessions to extract
            neural signatures.
          </div>
          <div class="space-y-3">
            @for (
              style of profile().knowledgeBase.learnedStyles;
              track style.id
            ) {
              <div
                class="p-3 bg-slate-900/50 rounded border border-purple-500/20"
              >
                <div class="font-bold text-purple-300">{{ style.name }}</div>
                <p class="text-sm text-slate-400">{{ style.description }}</p>
              </div>
            }
          </div>
        </section>

        <section
          class="vault-section glass-card p-4 border-l-2 border-emerald-500"
        >
          <h2 class="text-xl font-bold text-emerald-400 mb-4 flex items-center">
            <span class="material-symbols-outlined mr-2">security</span>
            PRODUCTION SECRETS
          </h2>
          <div
            *ngIf="profile().knowledgeBase.productionSecrets.length === 0"
            class="text-slate-500 italic mb-4"
          >
            Proprietary secrets locked. Access all proprietary secrets
            immediately.
          </div>
          <div class="space-y-3">
            @for (
              secret of profile().knowledgeBase.productionSecrets;
              track secret.id
            ) {
              <div
                class="p-3 bg-slate-900/50 rounded border border-emerald-500/20"
              >
                <div class="font-bold text-emerald-300">{{ secret.title }}</div>
                <p class="text-sm text-slate-400">{{ secret.content }}</p>
              </div>
            }
          </div>
        </section>

        <section
          class="vault-section glass-card p-4 border-l-2 border-orange-500 md:col-span-2"
        >
          <h2 class="text-xl font-bold text-orange-400 mb-4 flex items-center">
            <span class="material-symbols-outlined mr-2">trending_up</span> CORE
            MARKET TRENDS
          </h2>
          <div
            *ngIf="profile().knowledgeBase.coreTrends.length === 0"
            class="text-slate-500 italic mb-4"
          >
            Market telemetry offline. Syncing with global intelligence nodes...
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            @for (trend of profile().knowledgeBase.coreTrends; track trend.id) {
              <div
                class="p-3 bg-slate-900/50 rounded border border-orange-500/20"
              >
                <div class="font-bold text-orange-300">{{ trend.trend }}</div>
                <p class="text-sm text-slate-400">
                  {{ trend.actionableInsight }}
                </p>
              </div>
            }
          </div>
        </section>
      </div>
    </div>
  `,
  styles: [
    `
      .knowledge-base-container {
        background: rgba(2, 6, 23, 0.8);
        backdrop-filter: blur(10px);
        min-height: 80vh;
      }
      .vault-section {
        background: rgba(15, 23, 42, 0.4);
        transition: all 0.3s ease;
      }
      .vault-section:hover {
        background: rgba(15, 23, 42, 0.6);
        transform: translateY(-2px);
      }
    `,
  ],
})
export class KnowledgeBaseComponent {
  private userProfileService = inject(UserProfileService);
  profile = this.userProfileService.profile;
}
