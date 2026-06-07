import { Component, EventEmitter, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

interface Guide {
  id: string;
  title: string;
  icon: string;
  content: string[];
}

@Component({
  selector: 'app-how-to-overlay',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="fixed inset-0 z-[12000] flex items-center justify-center p-4 md:p-8 animate-fade-in">
      <!-- Backdrop -->
      <div class="absolute inset-0 bg-background/80 backdrop-blur-md" (click)="close.emit()"></div>

      <!-- Content -->
      <div class="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col md:flex-row h-[85vh] border border-gray-100 text-gray-900">
        <!-- Sidebar -->
        <div class="w-full md:w-64 bg-gray-50 border-r border-gray-100 p-6 flex flex-col gap-2">
          <div class="mb-6">
            <h2 class="text-xl font-black text-gray-900 uppercase tracking-tight">Help_Center</h2>
            <p class="text-[9px] text-gray-500 font-bold uppercase tracking-widest mt-1">System Documentation</p>
          </div>

          <button
            *ngFor="let guide of guides"
            (click)="selectedGuideId.set(guide.id); updateCurrentGuide()"
            [class.bg-white]="selectedGuideId() === guide.id"
            [class.shadow-sm]="selectedGuideId() === guide.id"
            [class.text-brand-primary]="selectedGuideId() === guide.id"
            class="flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold text-gray-600 hover:bg-white hover:shadow-sm transition-all text-left"
          >
            <span class="text-lg">{{ guide.icon }}</span>
            {{ guide.title }}
          </button>

          <div class="mt-auto pt-6 border-t border-gray-200">
            <button
              (click)="startWalkthrough()"
              class="w-full px-4 py-3 bg-brand-primary text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-all shadow-md"
            >
              Start Walkthrough
            </button>
          </div>
        </div>

        <!-- Main Content -->
        <div class="flex-1 flex flex-col overflow-hidden bg-white">
          <div class="p-8 border-b border-gray-50 flex justify-between items-center">
            <div>
              <h3 class="text-2xl font-black text-gray-900 uppercase tracking-tight">
                {{ currentGuide()?.title }}
              </h3>
              <p class="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">
                Step-by-Step Instructions
              </p>
            </div>
            <button (click)="close.emit()" class="text-gray-400 hover:text-gray-900 transition-colors">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>

          <div class="flex-1 overflow-y-auto p-8 custom-scrollbar">
            <div class="flex flex-col gap-8">
              <div *ngFor="let step of currentGuide()?.content; let i = index" class="flex gap-6">
                <div class="flex-shrink-0 w-8 h-8 rounded-full bg-gray-900 text-white flex items-center justify-center text-xs font-black">
                  {{ i + 1 }}
                </div>
                <div class="pt-1">
                  <p class="text-sm text-gray-700 leading-relaxed font-medium">
                    {{ step }}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Interactive Walkthrough Overlay (Simple Mock) -->
       <div *ngIf="walkthroughActive()" class="fixed inset-0 z-[13000] pointer-events-none">
          <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 p-6 bg-white rounded-2xl shadow-2xl border-4 border-brand-primary pointer-events-auto animate-bounce-in text-gray-900">
             <h4 class="text-sm font-black text-gray-900 uppercase mb-2">Walkthrough Active</h4>
             <p class="text-xs text-gray-600 mb-4">Click through the app to see how things work. (Simulated)</p>
             <button (click)="walkthroughActive.set(false)" class="w-full py-2 bg-gray-900 text-white rounded-lg text-[10px] font-black uppercase tracking-widest">End Tour</button>
          </div>
       </div>
    </div>
  `,
  styles: [`
    .animate-fade-in { animation: fadeIn 0.3s ease-out; }
    .animate-bounce-in { animation: bounceIn 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55); }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes bounceIn {
      0% { transform: translate(-50%, -50%) scale(0.3); opacity: 0; }
      50% { transform: translate(-50%, -50%) scale(1.05); opacity: 1; }
      70% { transform: translate(-50%, -50%) scale(0.9); }
      100% { transform: translate(-50%, -50%) scale(1); }
    }
  `]
})
export class HowToOverlayComponent {
  @Output() close = new EventEmitter<void>();

  selectedGuideId = signal('studio');
  walkthroughActive = signal(false);

  guides: Guide[] = [
    {
      id: 'studio',
      title: 'Studio Pro',
      icon: '🎙️',
      content: [
        'Open the Studio component from the main navigation.',
        'Use the Channel Rack to program drum patterns or melodic sequences.',
        'Adjust individual track parameters like Volume, Pan, and FX in the Mixer.',
        'Utilize the Master Controls to apply global saturation and limiting for a polished sound.',
        'Export your final creation using the Render button in high-fidelity WAV format.'
      ]
    },
    {
      id: 'dj',
      title: 'DJ Deck Matrix',
      icon: '💿',
      content: [
        'Load tracks into Deck A and Deck B from your catalog.',
        'Use the Crossfader to transition between tracks smoothly.',
        'Apply real-time filters and EQ adjustments to shape the transition.',
        'Enable Vinyl Mode for realistic scratching and platter physics.',
        'Use Hot Cues to jump to specific points in your tracks instantly.'
      ]
    },
    {
      id: 'ai',
      title: 'AI Intelligence',
      icon: '🤖',
      content: [
        'Access the S.M.U.V.E. Intelligence section to see Strategic Decrees.',
        'Use the Chatbot to ask questions about your career or production techniques.',
        'Enable AI Mimicry to have the system learn and adapt to your unique style.',
        'Set the AI Persona intensity to match your preferred level of feedback.',
        'Review Market Intel to identify trending genres and marketing opportunities.'
      ]
    },
    {
      id: 'career',
      title: 'Career Hub',
      icon: '📈',
      content: [
        'Monitor your Reputation XP and Strategic Health Score.',
        'Manage your Catalog and track the status of your releases.',
        'Review Financials to see revenue projections and pending payouts.',
        'Set long-term Career Goals to receive tailored recommendations.',
        'Analyze Market Readiness signals to optimize your release schedule.'
      ]
    }
  ];

  currentGuide = signal<Guide | undefined>(this.guides[0]);

  updateCurrentGuide() {
    this.currentGuide.set(this.guides.find(g => g.id === this.selectedGuideId()));
  }

  startWalkthrough() {
    this.walkthroughActive.set(true);
  }
}
