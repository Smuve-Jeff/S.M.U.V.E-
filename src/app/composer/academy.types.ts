/** S.M.U.V.E. Music Academy — lesson and progress model. */

export type AcademyLevel = 'Foundation' | 'Intermediate' | 'Advanced';

export type AcademyFamily =
  | 'keys'
  | 'guitar'
  | 'bass'
  | 'drums'
  | 'strings'
  | 'woodwind'
  | 'brass'
  | 'electronic'
  | 'world'
  | 'voice';

export interface AcademyLesson {
  id: string;
  title: string;
  focus: string;
  drill: string;
  criteria: string;
  minutes: number;
  tempo?: number;
  studioStep: string;
}

export interface AcademyStage {
  id: string;
  label: string;
  level: AcademyLevel;
  summary: string;
  lessons: AcademyLesson[];
}

export interface InstrumentProgram {
  id: string;
  label: string;
  emoji: string;
  family: AcademyFamily;
  familyLabel: string;
  tuning: string;
  rig: string;
  summary: string;
  technique: string;
  skills: string[];
  faults: string[];
  repertoire: string[];
  studioInstrumentId: string;
  studioView: string;
  stages: AcademyStage[];
}

export interface VocalChainStep {
  pluginName: string;
  setting: string;
  why: string;
}

export interface VocalPreset {
  id: string;
  label: string;
  goal: string;
  autotune: string;
  /** Built-in DSP plugin ids applied to the vocal track, in chain order. */
  pluginIds: string[];
  chain: VocalChainStep[];
}

export interface AcademyProgress {
  /** lesson id → completion timestamp */
  completed: Record<string, number>;
}

export interface ProgramProgress {
  programId: string;
  completed: number;
  total: number;
  percent: number;
  nextLesson: AcademyLesson | null;
  stagesComplete: number;
}
