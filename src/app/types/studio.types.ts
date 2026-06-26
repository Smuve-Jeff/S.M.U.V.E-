export type TrackType = 'midi' | 'audio' | 'vocal' | 'drum' | 'bus';

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
  automation?: StudioAutomationLane[];
}

export interface StudioAutomationPoint {
  time: number;
  value: number;
  curve?: number; // 0 = linear, -1 to 1 = bezier tension
}

export interface StudioAutomationLane {
  id: string;
  param: string;
  points: StudioAutomationPoint[];
  enabled: boolean;
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
  parentId?: string; // For grouping/folders
  busId?: string;    // Target bus ID (default 'master')
  sendA?: number;
  sendB?: number;
  collapsed?: boolean;
  eqData?: {
    low: number;
    mid: number;
    high: number;
  };
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  artistName?: string;
  genre?: string;
  bpm: number;
  key?: string;
  scale?: string; // e.g. 'major', 'minor'
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
  markers?: StudioMarker[];
}

export interface StudioMarker {
  id: string;
  name: string;
  time: number;
  color?: string;
}

export type StudioProject = Project;
