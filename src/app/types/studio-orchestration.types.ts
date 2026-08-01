export type StudioCollaborationRole = 'host' | 'editor' | 'reviewer' | 'viewer';

export type StudioCollaborationPermission =
  | 'edit'
  | 'transport'
  | 'invite'
  | 'voice'
  | 'approve'
  | 'share'
  | 'remix'
  | 'comment'
  | 'review'
  | 'export';

export interface StudioCollaborationPermissions {
  edit: boolean;
  transport: boolean;
  invite: boolean;
  voice: boolean;
  approve: boolean;
  share: boolean;
  remix: boolean;
  comment: boolean;
  review: boolean;
  export: boolean;
}

export interface StudioSessionMember {
  sessionId: string;
  userId: string;
  artistName?: string;
  role: StudioCollaborationRole;
  status?: 'invited' | 'active' | 'revoked';
  permissions?: Partial<StudioCollaborationPermissions>;
  joinedAt?: number;
}

export interface StudioComment {
  id: string;
  sessionId: string;
  projectId: string;
  branchId?: string | null;
  checkpointId?: string | null;
  trackId?: string | null;
  clipId?: string | null;
  userId: string;
  content: string;
  resolved: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface StudioApprovalDecision {
  status: 'pending' | 'approved' | 'rejected' | 'revision-requested';
  reason?: string;
  timestamp: number;
}

export interface StudioApproval {
  id: string;
  sessionId: string;
  projectId: string;
  branchId?: string | null;
  checkpointId?: string | null;
  requestedBy: string;
  approverIds: string[];
  overallStatus: 'pending' | 'approved' | 'rejected' | 'mixed';
  decisions: Record<string, StudioApprovalDecision>;
  createdAt: number;
  updatedAt: number;
}

export type AsyncCollaborationPacketType =
  | 'track_delta'
  | 'review_request'
  | 'revision_request'
  | 'approval_request'
  | 'remix_request'
  | 'mix_notes'
  | 'render_task'
  | 'stem_exchange';

export interface AsyncCollaborationPacket {
  id: string;
  sessionId: string;
  fromUserId: string;
  toUserId: string;
  packetType: AsyncCollaborationPacketType;
  status: 'pending' | 'received' | 'applied' | 'rejected';
  payload: Record<string, unknown>;
  responsePayload?: Record<string, unknown> | null;
  createdAt: number;
  appliedAt?: number | null;
}

export interface RemixLineageNode {
  projectId: string;
  sourceProjectId?: string | null;
  sessionId?: string | null;
  remixerId: string;
  timestamp: number;
  attribution?: string;
}

export interface RemixLineageRecord {
  id: string;
  remixProjectId: string;
  sourceProjectId?: string | null;
  remixerId: string;
  lineage: RemixLineageNode[];
  depth: number;
  createdAt: number;
  acceptedAt?: number | null;
}

export type StudioConflictDecision =
  | 'keep-mine'
  | 'accept-theirs'
  | 'branch'
  | 'request-revision';

export interface StudioConflictDecisionRecord {
  trackId: string;
  fieldKey: string;
  decision: StudioConflictDecision;
  sessionId?: string | null;
  reason?: string;
  createdAt: number;
}

export type StudioActionOutcome =
  | 'preview'
  | 'apply'
  | 'reject'
  | 'approve'
  | 'replace'
  | 'transition'
  | 'export';

export type StudioActionKind =
  | 'arrangement-completion'
  | 'section-transition'
  | 'hook-variant'
  | 'mix-fix'
  | 'review-request'
  | 'conflict-resolution'
  | 'session-branch'
  | 'export-artifact'
  | 'remix-request';

export type StudioActionStatus =
  | 'pending'
  | 'previewed'
  | 'applied'
  | 'approved'
  | 'rejected'
  | 'replaced'
  | 'exported';

export interface StudioActionTarget {
  projectId: string | null;
  sessionId: string | null;
  activeView: string;
  selectedTrackId: string | null;
  branchId: string | null;
  checkpointId: string | null;
}

export interface StudioActionResult {
  id: string;
  source: 'ai-produce' | 'ai-mix' | 'collaboration' | 'timeline' | 'tha-spot';
  kind: StudioActionKind;
  title: string;
  description: string;
  reason?: string;
  preview?: string;
  status: StudioActionStatus;
  target: StudioActionTarget;
  payload?: Record<string, unknown>;
  outcomes: Partial<Record<StudioActionOutcome, string>>;
  createdAt: number;
  updatedAt: number;
}

export interface StudioPaletteAction {
  id: string;
  label: string;
  description: string;
  category: string;
  keywords?: string[];
  context?: string[];
  run: () => void;
}

export interface StudioSessionSyncState {
  session: {
    id: string;
    projectId: string | null;
    status: string;
    metadata?: Record<string, unknown>;
  } | null;
  members: StudioSessionMember[];
  comments: StudioComment[];
  approvals: StudioApproval[];
  asyncPackets: AsyncCollaborationPacket[];
  remixLineage: RemixLineageRecord[];
}

export interface StudioSessionEventEnvelope<TEvent = unknown> {
  sessionId: string;
  event: TEvent;
}
