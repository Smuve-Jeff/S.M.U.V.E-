import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UserProfileService } from '../../services/user-profile.service';
import { AiService } from '../../services/ai.service';

interface Submission {
  labelName: string;
  demoUrl: string;
  status: 'Pending' | 'Reviewing' | 'Rejected' | 'Accepted';
  date: string;
}

interface Venue {
  name: string;
  location: string;
  capacity: string;
  bookingStatus: string;
}

interface SplitSheet {
  id: string;
  track: string;
  splits: { name: string; role: string; share: number }[];
  status: 'Draft' | 'Finalized' | 'Submitted';
}

@Component({
  selector: 'app-career-hub',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './career-hub.component.html',
  styleUrls: ['./career-hub.component.css'],
})
export class CareerHubComponent {
  private profileService = inject(UserProfileService);
  private aiService = inject(AiService);
  profile = this.profileService.profile;

  submissions = signal<Submission[]>([
    {
      labelName: 'Universal Music Group',
      demoUrl: 'https://smuve.ai/demo/aurora',
      status: 'Reviewing',
      date: '2024-05-15',
    },
    {
      labelName: 'Atlantic Records',
      demoUrl: 'https://smuve.ai/demo/neon-lights',
      status: 'Pending',
      date: '2024-05-20',
    },
  ]);

  venues = signal<Venue[]>([
    {
      name: 'The Echo',
      location: 'Los Angeles, CA',
      capacity: '350',
      bookingStatus: 'Confirmed',
    },
    {
      name: 'Bowery Ballroom',
      location: 'New York, NY',
      capacity: '575',
      bookingStatus: 'In Discussion',
    },
  ]);

  newLabel = signal('');
  newDemo = signal('');

  auditScore = signal<number | null>(null);
  auditFeedback = signal<string[]>([]);

  splitSheets = signal<SplitSheet[]>([]);

  async runPitchAudit() {
    this.auditScore.set(null); // Show loading
    this.auditFeedback.set([
      'S.M.U.V.E is analyzing your professional profile...',
      'Auditing industry compliance...',
      'Checking marketability...',
    ]);

    try {
      const profile = this.profile();
      const prompt = `Perform an "AI Pitch-Perfect Audit" for the artist: ${
        profile.artistName
      }.
      Current Career Stage: ${profile.careerStage}
      Genre: ${profile.primaryGenre}
      Expertise Levels: ${JSON.stringify(profile.expertiseLevels)}
      Goals: ${profile.careerGoals.join(', ')}

      Analyze their marketability for a major record label. Return your analysis in two parts:
      1. A numeric score from 0-100.
      2. Exactly 4 specific, blunt, and strategic feedback points.

      Format the response EXACTLY like this:
      SCORE: [number]
      FEEDBACK:
      - [point 1]
      - [point 2]
      - [point 3]
      - [point 4]`;

      const response = await this.aiService.generateContent({
        model: AiService.CHAT_MODEL,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });

      const text = response.text;
      const scoreMatch = text.match(/SCORE:\s*(\d+)/i);
      const score = scoreMatch ? parseInt(scoreMatch[1]) : 75;

      const feedbackMatch = text.match(/FEEDBACK:([\s\S]*)/i);
      let feedback = feedbackMatch
        ? feedbackMatch[1]
            .trim()
            .split('\n')
            .map((l) => l.replace(/^-\s*/, '').trim())
            .filter((l) => l)
        : [];

      if (feedback.length === 0) {
        feedback = ['Audit complete. Your baseline compliance is established.'];
      }

      this.auditScore.set(score);
      this.auditFeedback.set(feedback);
      this.aiService.addStrategicDecree(
        `Career Audit Completed for ${profile.artistName}. Score: ${score}. Marketability: ${
          score > 80 ? 'HIGH' : 'EVALUATING'
        }.`
      );
    } catch (error) {
      console.error('Audit failed:', error);
      this.auditScore.set(50);
      this.auditFeedback.set([
        'S.M.U.V.E: Intelligence link disrupted. Preliminary audit suggests caution.',
      ]);
    }
  }

  generateSplitSheet() {
    const sheet: SplitSheet = {
      id: Math.random().toString(36).slice(2, 11),
      track: 'New Track Prototype',
      splits: [
        { name: this.profile().artistName, role: 'Writer/Producer', share: 50 },
        { name: 'Collaborator A', role: 'Writer', share: 50 },
      ],
      status: 'Draft',
    };
    this.splitSheets.update((s) => [...s, sheet]);
  }

  submitToLabel() {
    if (!this.newLabel() || !this.newDemo()) return;
    this.submissions.update((s) => [
      ...s,
      {
        labelName: this.newLabel(),
        demoUrl: this.newDemo(),
        status: 'Pending',
        date: new Date().toISOString().split('T')[0],
      },
    ]);
    this.newLabel.set('');
    this.newDemo.set('');
  }
}
