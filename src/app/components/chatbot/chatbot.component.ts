import { Component, signal, inject, ViewChild, ElementRef, AfterViewChecked, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AiService } from '../../services/ai.service';
import { UserProfileService } from '../../services/user-profile.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { MusicManagerService } from '../../services/music-manager.service';
import { FileLoaderService } from '../../services/file-loader.service';

interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

@Component({
  selector: 'app-chatbot',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chatbot.component.html',
  styleUrls: ['./chatbot.component.css']
})
export class ChatbotComponent implements AfterViewChecked {
  @ViewChild('scrollContainer') private scrollContainer!: ElementRef;

  public aiService = inject(AiService);
  private profileService = inject(UserProfileService);
  private audioEngine = inject(AudioEngineService);
  private musicManager = inject(MusicManagerService);
  private fileLoader = inject(FileLoaderService);

  messages = signal<ChatMessage[]>([
    { role: 'model', content: 'S.M.U.V.E. 4.0 Online. Strategic matrices optimized. State your objective, Executive.' }
  ]);
  userInput = '';
  isLoading = signal(false);

  ngAfterViewChecked() {
    this.scrollToBottom();
  }

  private scrollToBottom(): void {
    try {
      this.scrollContainer.nativeElement.scrollTop = this.scrollContainer.nativeElement.scrollHeight;
    } catch (err) {}
  }

  async sendMessage() {
    if (!this.userInput.trim() || this.isLoading()) return;

    const userText = this.userInput;
    this.messages.update(m => [...m, { role: 'user', content: userText }]);
    this.userInput = '';
    this.isLoading.set(true);

    try {
      const response = await this.aiService.chatInstance().sendMessage(userText);
      this.messages.update(m => [...m, { role: 'model', content: response.text }]);
    } catch (err) {
      this.messages.update(m => [...m, { role: 'model', content: 'Neural link disrupted. Re-initializing...' }]);
    } finally {
      this.isLoading.set(false);
    }
  }

  onClose() {
  }

  async transcribeAudio(buffer: AudioBuffer) {
    return await this.aiService.transcribeAudio(buffer);
  }
}
