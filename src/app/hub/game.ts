export interface Game {
  id: string;
  name: string;
  url: string; // Play URL or route
  image?: string; // Cover image
  description?: string;
  genre?: string;
  tags?: string[]; // e.g., ['PvP','Shooter','Duel']
  previewVideo?: string; // Short webm/mp4 for hover preview
  rating?: number; // 0..5
  playersOnline?: number;
  modes?: Array<'duel' | 'team' | 'solo'>;
  bannerImage?: string;
}
