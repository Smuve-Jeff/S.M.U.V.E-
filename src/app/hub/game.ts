export interface Game {
  id: string;
  name: string;
  url: string; // Play URL or route
  image?: string; // Cover image
  description?: string;
  genre?: string;
  tags?: string[]; // e.g., ['PvP','Shooter','Duel']
  availability?: 'Offline' | 'Online' | 'Hybrid';
  previewVideo?: string; // Short webm/mp4 for hover preview
  rating?: number; // 0..5
  playersOnline?: number;
  modes?: Array<'duel' | 'team' | 'solo'>;
  bannerImage?: string;

  // S.M.U.V.E. Enhancements
  multiplayerType?: 'P2P' | 'Server' | 'None';
  aiSupportLevel?: 'Basic' | 'Advanced' | 'Neural' | 'None';
  aiBriefing?: string;
}
