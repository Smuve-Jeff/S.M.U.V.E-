export type TrackType = 'midi' | 'audio' | 'vocal' | 'drum';

export interface Task {
  id: number;
  description: string;
  completed: boolean;
}

export interface StudioTake {
  id: string;
  name: string;
  blobUrl?: string;
  audioBuffer?: any;
  recordedAt: number;
  duration: number;
}

export interface StudioCompRegion {
  takeId: string;
  start: number;
  end: number;
  fade?: number;
}

export interface StudioClip {
  id: string;
  name: string;
  start: number;
  length: number;
  type: 'midi' | 'audio';
  color?: string;
  loop?: boolean;
  takes?: StudioTake[];
  activeTakeId?: string;
  isComp?: boolean;
  compRegions?: StudioCompRegion[];
  notes?: any[];
}

export interface StudioTrack {
  id: string;
  name: string;
  type: TrackType;
  instrumentId: string;
  muted: boolean;
  soloed: boolean;
  volume: number;
  pan: number;
  clips: StudioClip[];
  effects: any[];
  color?: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  artistName?: string;
  genre?: string;
  bpm: number;
  key?: string;
  timeSignature: [number, number];
  status: 'Draft' | 'In Progress' | 'Mixing' | 'Mastering' | 'Completed' | 'Pending';
  createdAt: number;
  updatedAt: number;
  tracks: StudioTrack[];
  masterChain: any[];
  tasks: Task[];
  deadline?: Date;
  history?: {
    past: any[];
    future: any[];
  };
}

export type StudioProject = Project;
