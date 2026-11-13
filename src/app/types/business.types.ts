import type { LifecyclePhaseId } from './artist-lifecycle.types';

/**
 * The lifecycle phases the Business Suite and every business pipeline report
 * on. Shared so the hub and a pipeline detail can never quote different
 * business evidence for the same record.
 */
export const BUSINESS_SPINE_PHASES: LifecyclePhaseId[] = [
  'rights',
  'business',
  'money',
];

/**
 * Every pathway the engine can build, as a runtime list so the hub can be
 * checked for coverage instead of quietly offering a subset.
 */
export const BUSINESS_PIPELINE_TYPES = [
  'Merch',
  'Record Label',
  'Website',
  'PRO',
  'Legal',
  'Film & TV',
  'Publishing',
  'Brand Deals',
  'Podcasting',
  'Live Experiences',
  'Sync Licensing',
] as const;

export type BusinessPipelineType = (typeof BUSINESS_PIPELINE_TYPES)[number];

export type BusinessStageStatus =
  | 'Locked'
  | 'Pending'
  | 'In Progress'
  | 'Completed';

export interface BusinessStep {
  id: string;
  title: string;
  description: string;
  status: BusinessStageStatus;
  aiGuidance: string; // S.M.U.V.E. advice for this specific step
  actionType?: 'Design' | 'Form' | 'Upload' | 'External' | 'Template';
  actionData?: any;
}

export interface BusinessStage {
  id: string;
  name: string;
  status: BusinessStageStatus;
  steps: BusinessStep[];
}

export interface BusinessPipeline {
  id: string;
  type: BusinessPipelineType;
  name: string;
  status: 'Draft' | 'Active' | 'Completed' | 'Archived';
  currentStageIndex: number;
  stages: BusinessStage[];
  createdAt: number;
  updatedAt: number;
  metadata?: any; // For storing specific data like Merch designs or Label names
}

export interface ProData {
  ipiNumber?: string;
  workIds: { title: string; id: string; status: string }[];
  affiliations: {
    name: string;
    type: 'Writer' | 'Publisher';
    status: string;
  }[];
}

export interface LegalDocumentTemplate {
  id: string;
  name: string;
  description: string;
  category: 'Contract' | 'Agreement' | 'License' | 'Form';
  fields: { name: string; label: string; type: string; value?: string }[];
}
