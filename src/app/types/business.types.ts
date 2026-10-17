export type BusinessPipelineType =
  | 'Merch'
  | 'Record Label'
  | 'Website'
  | 'PRO'
  | 'Legal';

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
  status: 'Draft' | 'Active' | 'Completed';
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
