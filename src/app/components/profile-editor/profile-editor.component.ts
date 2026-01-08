import { Component, ChangeDetectionStrategy, inject, signal, input, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppTheme } from '../../services/user-context.service';
import { UserProfileService, UserProfile } from '../../services/user-profile.service';
import { AuthService, AuthCredentials } from '../../services/auth.service';

@Component({
  selector: 'app-profile-editor',
  standalone: true,
  templateUrl: './profile-editor.component.html',
  styleUrls: ['./profile-editor.component.css'],
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileEditorComponent {
  theme = input.required<AppTheme>();
  private userProfileService = inject(UserProfileService);
  private authService = inject(AuthService);
  
  // Auth state
  isAuthenticated = this.authService.isAuthenticated;
  currentUser = this.authService.currentUser;
  profileCompleteness = this.authService.profileCompleteness;
  
  // UI state
  authMode = signal<'login' | 'register'>('login');
  authLoading = signal(false);
  authError = signal<string | null>(null);
  authSuccess = signal<string | null>(null);
  
  // Auth form data
  loginEmail = signal('');
  loginPassword = signal('');
  registerEmail = signal('');
  registerPassword = signal('');
  registerConfirmPassword = signal('');
  registerArtistName = signal('');
  
  // Profile editing
  editableProfile = signal<UserProfile>({ ...this.userProfileService.profile() });
  saveStatus = signal<'idle' | 'saving' | 'saved'>('idle');
  activeSection = signal<string>('basic');
  
  // Voice input state
  isRecording = signal(false);
  recordingField = signal<string | null>(null);
  voiceSupported = signal(false);
  private recognition: any = null;
  
  constructor() {
    // Check if speech recognition is supported
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.voiceSupported.set(true);
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.interimResults = false;
      this.recognition.lang = 'en-US';
      
      this.recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        this.handleVoiceInput(transcript);
      };
      
      this.recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        this.isRecording.set(false);
        this.recordingField.set(null);
      };
      
      this.recognition.onend = () => {
        this.isRecording.set(false);
        this.recordingField.set(null);
      };
    }
    
    // Update editable profile when user profile changes
    effect(() => {
      if (this.isAuthenticated()) {
        this.editableProfile.set({ ...this.userProfileService.profile() });
      }
    });
  }
  
  // Predefined options for various fields
  readonly ALL_SKILLS = [
    'Vocalist', 'Producer', 'Songwriter', 'DJ', 'Rapper', 'Singer',
    'Guitarist', 'Bassist', 'Drummer', 'Keyboardist', 'Sound Designer',
    'Audio Engineer', 'Mixing Engineer', 'Mastering Engineer', 'Beat Maker',
    'Composer', 'Arranger', 'Session Musician', 'Music Director'
  ];
  
  readonly ALL_GENRES = [
    'Hip Hop', 'R&B', 'Pop', 'Rock', 'EDM', 'House', 'Techno', 'Trap',
    'Drill', 'Afrobeat', 'Reggae', 'Dancehall', 'Jazz', 'Soul', 'Funk',
    'Country', 'Latin', 'Gospel', 'Alternative', 'Indie', 'Metal', 'Punk'
  ];
  
  readonly ALL_GOALS = [
    'Get Signed to Label', 'Grow Fanbase', 'License Music for Film/TV',
    'Tour Nationally', 'Tour Internationally', 'Collaborate with Major Artists',
    'Improve Production Skills', 'Build Home Studio', 'Release an Album',
    'Win Awards', 'Perform at Major Festivals', 'Start Own Label',
    'Build Passive Income', 'Teach/Mentor Others', 'Go Viral on Social Media'
  ];
  
  readonly CONTENT_TYPES = [
    'Singles', 'EPs', 'Albums', 'Mixtapes', 'Freestyles', 'Covers',
    'Remixes', 'Live Performances', 'Music Videos', 'Behind the Scenes',
    'Tutorials', 'Vlogs', 'Podcasts'
  ];
  
  readonly PROMOTION_CHANNELS = [
    'Instagram', 'TikTok', 'YouTube', 'Twitter/X', 'Facebook', 'Spotify Playlists',
    'Apple Music', 'SoundCloud', 'Radio', 'Music Blogs', 'PR Services',
    'Influencer Marketing', 'Live Shows', 'Street Teams', 'Email Marketing'
  ];
  
  readonly REVENUE_STREAMS = [
    'Streaming Revenue', 'Digital Downloads', 'Physical Sales', 'Live Shows',
    'Merchandise', 'Sync Licensing', 'Teaching/Lessons', 'Production for Others',
    'Sponsorships', 'Patreon/Subscriptions', 'YouTube Ad Revenue', 'NFTs'
  ];
  
  readonly DAW_OPTIONS = [
    'FL Studio', 'Ableton Live', 'Logic Pro', 'Pro Tools', 'Cubase',
    'Studio One', 'Reaper', 'GarageBand', 'Reason', 'Bitwig'
  ];
  
  readonly EQUIPMENT_OPTIONS = [
    'Microphone (Condenser)', 'Microphone (Dynamic)', 'Audio Interface',
    'Studio Monitors', 'Headphones', 'MIDI Keyboard', 'Drum Machine',
    'Synthesizer', 'Guitar', 'Bass', 'Acoustic Treatment', 'Mixer'
  ];
  
  readonly COLLABORATION_TYPES = [
    'Featured Artist', 'Production Collaboration', 'Co-writing',
    'Remix Exchange', 'Music Video Collaboration', 'Live Performance',
    'Producer/Artist Partnership', 'Engineer Collaboration'
  ];
  
  readonly LOOKING_FOR = [
    'Producers', 'Vocalists', 'Rappers', 'Singers', 'Mixing Engineers',
    'Mastering Engineers', 'Managers', 'Booking Agents', 'A&R',
    'Publicists', 'Photographers', 'Videographers', 'Graphic Designers'
  ];
  
  readonly VENUE_TYPES = [
    'Clubs/Bars', 'Concert Halls', 'Festivals', 'Arenas/Stadiums',
    'House Shows', 'Street Performances', 'Virtual/Online', 'Churches',
    'Universities', 'Corporate Events', 'Private Events'
  ];
  
  readonly AREAS_TO_IMPROVE = [
    'Songwriting', 'Production Quality', 'Mixing', 'Mastering', 'Lyrics',
    'Melody Writing', 'Performance Skills', 'Stage Presence', 'Marketing',
    'Social Media', 'Networking', 'Business Management', 'Music Theory',
    'Vocal Technique', 'Beat Making', 'Sound Design'
  ];
  
  readonly socialPlatforms = ['X', 'Instagram', 'TikTok', 'Facebook', 'YouTube', 'Twitch', 'Discord', 'Reddit', 'Snapchat'];
  readonly musicPlatforms = ['Spotify for Artists', 'Apple Music for Artists', 'SoundCloud', 'Bandcamp', 'Tidal for Artists', 'Amazon Music for Artists', 'YouTube Official Artist Channel', 'iHeartRadio for Artists'];
  readonly proPlatforms = ['ASCAP', 'BMI', 'SESAC', 'DistroKid', 'TuneCore', 'CD Baby', 'Vydia'];

  sections = [
    { id: 'basic', label: 'Basic Info', icon: 'fa-user' },
    { id: 'musical', label: 'Musical Identity', icon: 'fa-music' },
    { id: 'expertise', label: 'Experience & Skills', icon: 'fa-star' },
    { id: 'career', label: 'Career & Goals', icon: 'fa-bullseye' },
    { id: 'audience', label: 'Audience & Market', icon: 'fa-users' },
    { id: 'content', label: 'Content & Output', icon: 'fa-compact-disc' },
    { id: 'marketing', label: 'Marketing & Promo', icon: 'fa-bullhorn' },
    { id: 'business', label: 'Business & Revenue', icon: 'fa-dollar-sign' },
    { id: 'equipment', label: 'Equipment & Setup', icon: 'fa-headphones' },
    { id: 'collaboration', label: 'Collaboration', icon: 'fa-handshake' },
    { id: 'performance', label: 'Live Performance', icon: 'fa-microphone' },
    { id: 'social', label: 'Social & Links', icon: 'fa-link' },
    { id: 'learning', label: 'Learning & Growth', icon: 'fa-graduation-cap' },
    { id: 'mindset', label: 'Mindset & Mental', icon: 'fa-brain' },
  ];

  saveProfile(): void {
    this.saveStatus.set('saving');
    this.userProfileService.updateProfile(this.editableProfile());
    setTimeout(() => {
        this.saveStatus.set('saved');
        setTimeout(() => this.saveStatus.set('idle'), 2000);
    }, 500);
  }
  
  updateField(fieldName: keyof UserProfile, event: Event): void {
      const target = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
      const value = target.type === 'number' ? parseFloat(target.value) : target.value;
      this.editableProfile.update(p => ({ ...p, [fieldName]: value }));
  }

  updateArrayField(fieldName: keyof UserProfile, item: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.editableProfile.update(p => {
      const currentArray = (p[fieldName] as string[]) || [];
      const updatedArray = checked 
        ? [...currentArray, item]
        : currentArray.filter(i => i !== item);
      return { ...p, [fieldName]: updatedArray };
    });
  }

  updateExpertiseLevel(skill: keyof UserProfile['expertiseLevels'], event: Event): void {
    const value = parseInt((event.target as HTMLInputElement).value);
    this.editableProfile.update(p => ({
      ...p,
      expertiseLevels: { ...p.expertiseLevels, [skill]: value }
    }));
  }
  
  updateLinkField(platform: string, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.editableProfile.update(p => ({
      ...p,
      links: {
        ...p.links,
        [platform]: value
      }
    }));
  }

  updateBooleanField(fieldName: keyof UserProfile, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.editableProfile.update(p => ({ ...p, [fieldName]: checked }));
  }

  isArrayFieldChecked(fieldName: keyof UserProfile, item: string): boolean {
    const array = this.editableProfile()[fieldName] as string[] | undefined;
    return array?.includes(item) || false;
  }
  
  // ============ AUTH METHODS ============
  
  async handleLogin(): Promise<void> {
    this.authError.set(null);
    this.authSuccess.set(null);
    
    if (!this.loginEmail() || !this.loginPassword()) {
      this.authError.set('Email and password are required.');
      return;
    }
    
    this.authLoading.set(true);
    
    const credentials: AuthCredentials = {
      email: this.loginEmail(),
      password: this.loginPassword()
    };
    
    const result = await this.authService.login(credentials);
    
    this.authLoading.set(false);
    
    if (result.success) {
      this.authSuccess.set(result.message);
      this.loginPassword.set('');
    } else {
      this.authError.set(result.message);
    }
  }
  
  async handleRegister(): Promise<void> {
    this.authError.set(null);
    this.authSuccess.set(null);
    
    if (!this.registerEmail() || !this.registerPassword() || !this.registerArtistName()) {
      this.authError.set('All fields are required.');
      return;
    }
    
    if (this.registerPassword() !== this.registerConfirmPassword()) {
      this.authError.set('Passwords do not match.');
      return;
    }
    
    if (this.registerPassword().length < 6) {
      this.authError.set('Password must be at least 6 characters.');
      return;
    }
    
    this.authLoading.set(true);
    
    const credentials: AuthCredentials = {
      email: this.registerEmail(),
      password: this.registerPassword()
    };
    
    const result = await this.authService.register(credentials, this.registerArtistName());
    
    this.authLoading.set(false);
    
    if (result.success) {
      this.authSuccess.set(result.message);
      this.registerPassword.set('');
      this.registerConfirmPassword.set('');
    } else {
      this.authError.set(result.message);
    }
  }
  
  handleLogout(): void {
    this.authService.logout();
    this.loginEmail.set('');
    this.loginPassword.set('');
  }
  
  // ============ VOICE INPUT METHODS ============
  
  startVoiceInput(fieldName: string): void {
    if (!this.voiceSupported() || !this.recognition) {
      alert('Voice input is not supported in your browser.');
      return;
    }
    
    this.recordingField.set(fieldName);
    this.isRecording.set(true);
    this.recognition.start();
  }
  
  stopVoiceInput(): void {
    if (this.recognition) {
      this.recognition.stop();
    }
    this.isRecording.set(false);
    this.recordingField.set(null);
  }
  
  private handleVoiceInput(transcript: string): void {
    const fieldName = this.recordingField();
    if (!fieldName) return;
    
    const currentProfile = this.editableProfile();
    
    if (fieldName === 'bio' || fieldName === 'uniqueSound' || fieldName === 'musicalInfluences' || 
        fieldName === 'currentFocus' || fieldName === 'biggestChallenge' || fieldName === 'targetAudience' ||
        fieldName === 'upcomingProjects' || fieldName === 'contentStrategy' || fieldName === 'networkingGoals') {
      const currentValue = currentProfile[fieldName as keyof UserProfile] as string;
      const newValue = currentValue && currentValue !== 'Describe your musical journey...' 
        ? currentValue + ' ' + transcript 
        : transcript;
      this.editableProfile.update(p => ({ ...p, [fieldName]: newValue }));
    } else if (fieldName === 'artistName' || fieldName === 'stageName' || fieldName === 'location' ||
               fieldName === 'primaryGenre' || fieldName === 'formalTraining') {
      this.editableProfile.update(p => ({ ...p, [fieldName]: transcript }));
    }
    
    this.isRecording.set(false);
    this.recordingField.set(null);
  }
}