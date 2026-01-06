import { bootstrapApplication } from '@angular/platform-browser';
import { provideZoneChangeDetection } from '@angular/core';
import { AppComponent } from './video-editor/app.component';
import { provideAiService, API_KEY_TOKEN } from './services/ai.service';

bootstrapApplication(AppComponent, {
  providers: [
    provideZoneChangeDetection(),
    provideAiService(),
    { provide: API_KEY_TOKEN, useValue: process.env.GEMINI_API_KEY },
  ],
}).catch(err => console.error(err));
