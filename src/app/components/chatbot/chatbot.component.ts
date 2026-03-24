import {
  Component,
  signal,
  inject,
  output,
  ElementRef,
  ViewChild,
  AfterViewChecked,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AiService } from '../../services/ai.service';
import { UserProfileService } from '../../services/user-profile.service';
import {
  UserContextService,
  MainViewMode,
} from '../../services/user-context.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { SpeechSynthesisService } from '../../services/speech-synthesis.service';
import { LoggingService } from '../../services/logging.service';

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
}

@Component({
  selector: 'app-chatbot',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chatbot.component.html',
  styleUrls: ['./chatbot.component.css'],
})
export class ChatbotComponent implements OnInit, AfterViewChecked {
  public aiService = inject(AiService);
  public userProfileService = inject(UserProfileService);
  private userContext = inject(UserContextService);
  private audioEngineService = inject(AudioEngineService);
  private speechSynthesisService = inject(SpeechSynthesisService);
  private logger = inject(LoggingService);

  @ViewChild('messageViewport') private scrollContainer!: ElementRef;

  close = output<void>();
  messages = signal<ChatMessage[]>([]);
  userInput = '';
  isTyping = signal(false);
  profile = this.userProfileService.profile;

  ngOnInit() {
    this.messages.set([
      {
        role: 'assistant',
        text: 'S.M.U.V.E 4.2 Online. Strategic intelligence protocols initialized. How shall we dominate the industry today?',
        timestamp: Date.now(),
      },
    ]);
  }

  ngAfterViewChecked() {
    this.scrollToBottom();
  }

  async sendMessage() {
    const text = this.userInput.trim();
    if (!text || this.isTyping()) return;

    this.messages.update((m) => [
      ...m,
      { role: 'user', text, timestamp: Date.now() },
    ]);
    this.userInput = '';
    this.isTyping.set(true);

    try {
      const response = await this.aiService.processCommand(text);
      const content =
        response || 'Protocol error. Re-initializing neural link.';
      this.messages.update((m) => [
        ...m,
        { role: 'assistant', text: content, timestamp: Date.now() },
      ]);
      this.speechSynthesisService.speak(content);
    } catch (e) {
      this.handleError(e, 'message generation');
    }
    this.isTyping.set(false);
  }

  toggleKbWriteAccess() {
    const p = this.profile();
    this.userProfileService.updateProfile({
      ...p,
      settings: {
        ...p.settings,
        ai: { ...p.settings.ai, kbWriteAccess: !p.settings.ai.kbWriteAccess },
      },
    });
  }

  private scrollToBottom(): void {
    try {
      this.scrollContainer.nativeElement.scrollTop =
        this.scrollContainer.nativeElement.scrollHeight;
    } catch (err) {}
  }

  private handleError(e: unknown, context: string) {
    const message = `Error with ${context}: ${e instanceof Error ? e.message : String(e)}`;
    this.logger.error(message, e);
    this.messages.update((msgs) => [
      ...msgs,
      {
        role: 'assistant',
        text: `A problem occurred with ${context}. Please check the console for details.`,
        timestamp: Date.now(),
      },
    ]);
  }
}
