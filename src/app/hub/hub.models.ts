export interface Game {
  id: string;
  title: string;
  description: string;
  icon: string;
}

export interface Challenge {
  id: string;
  title: string;
  description: string;
  prize: string;
}

export interface CommunityPost {
  id: string;
  author: string;
  content: string;
  timestamp: Date;
}
