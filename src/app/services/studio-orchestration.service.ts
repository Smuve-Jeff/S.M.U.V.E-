import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { ProjectService } from './project.service';
import { MusicManagerService } from './music-manager.service';
import { CollaborationService, ProjectConflict } from './collaboration.service';
import { SessionHistoryService } from './session-history.service';
import { SocialNetworkingService } from './social-networking.service';
import { AiProduceService } from './ai-produce.service';
import { AiMixAssistantService } from '../studio/effects/ai-mix-assistant.service';
import {
  CommandPaletteAction,
  CommandPaletteService,
} from './command-palette.service';
import {
  AsyncCollaborationPacket,
  RemixLineageNode,
  RemixLineageRecord,
  StudioActionResult,
  StudioActionTarget,
  StudioApproval,
  StudioCollaborationPermission,
  StudioComment,
  StudioConflictDecision,
  StudioPaletteAction,
  StudioSessionSyncState,
} from '../types/studio-orchestration.types';

function mergeById<T extends { id: string }>(
  existing: T[],
  incoming: T[]
): T[] {
  const byId = new Map<string, T>();
  for (const item of existing) byId.set(item.id, item);
  for (const item of incoming) byId.set(item.id, item);
  return Array.from(byId.values()).sort((a, b) => {
    const aTs = (a as any).updatedAt ?? (a as any).createdAt ?? 0;
    const bTs = (b as any).updatedAt ?? (b as any).createdAt ?? 0;
    return bTs - aTs;
  });
}

/** Delivery state of a packet this artist sent, before/after the server echo. */
export type PacketDeliveryState = 'queued' | 'delivered';

/**
 * Receipt for a packet this artist sent. `ackedAt` stays null until the server
 * echoes the packet back, so a queued row can never read as delivered.
 */
export interface OutboundPacketReceipt {
  sentAt: number;
  handoffId?: string;
  ackedAt: number | null;
}

@Injectable({ providedIn: 'root' })
export class StudioOrchestrationService {
  private auth = inject(AuthService);
  private projects = inject(ProjectService);
  private music = inject(MusicManagerService);
  private collaboration = inject(CollaborationService);
  private history = inject(SessionHistoryService);
  private social = inject(SocialNetworkingService);
  private aiProduce = inject(AiProduceService);
  private aiMix = inject(AiMixAssistantService);
  private palette = inject(CommandPaletteService);

  activeStudioView = signal<string>('arrangement');
  comments = signal<StudioComment[]>([]);
  approvals = signal<StudioApproval[]>([]);
  asyncPackets = signal<AsyncCollaborationPacket[]>([]);
  remixLineage = signal<RemixLineageRecord[]>([]);
  lastPreviewedActionId = signal<string | null>(null);
  lastExportedAction = signal<StudioActionResult | null>(null);
  /** Outbound packets awaiting a server acknowledgement, keyed by local id. */
  private outboundReceipts = signal<Record<string, OutboundPacketReceipt>>({});

  currentProjectId = computed(() => {
    const currentProject = this.projects.currentProject();
    const currentSession = this.collaboration.currentSession();
    return currentProject?.id ?? currentSession?.projectId ?? null;
  });

  currentTarget = computed<StudioActionTarget>(() => {
    const projectId = this.currentProjectId();
    const branchId = projectId ? this.history.activeBranch(projectId) : null;
    const checkpointId =
      projectId && branchId
        ? (this.history.checkpoints(projectId, branchId).at(-1)?.id ?? null)
        : null;
    return {
      projectId,
      sessionId: this.collaboration.currentSession()?.sessionId ?? null,
      activeView: this.activeStudioView(),
      selectedTrackId: this.music.selectedTrackId(),
      branchId,
      checkpointId,
    };
  });

  currentAuthority = computed(() => ({
    role: this.collaboration.currentRole(),
    permissions: this.collaboration.currentPermissions(),
  }));

  actionableResults = computed<StudioActionResult[]>(() => {
    const target = this.currentTarget();
    return [
      ...this.aiProduce.buildStudioActionResults(target),
      ...this.aiMix.buildStudioActionResults(target),
      ...this.buildConflictActions(target),
    ];
  });

  primaryAction = computed<StudioActionResult | null>(
    () =>
      this.actionableResults().find((result) => result.status === 'pending') ??
      null
  );

  pendingAsyncPackets = computed(() =>
    this.asyncPackets().filter((packet) => packet.status === 'pending')
  );

  /** Packets belonging to the session this artist is actually in. */
  sessionAsyncPackets = computed<AsyncCollaborationPacket[]>(() => {
    const sessionId = this.collaboration.currentSession()?.sessionId;
    if (!sessionId) return [];
    return this.asyncPackets()
      .filter((packet) => packet.sessionId === sessionId)
      .sort((a, b) => b.createdAt - a.createdAt);
  });

  /**
   * Delivery state of a packet row.
   *
   * Anything that arrived from a peer is real by definition, so it reads as
   * delivered. A packet this artist sent reads as delivered only once the
   * server echo acknowledged it — until then the row says queued, never sent.
   */
  packetDelivery(packet: AsyncCollaborationPacket): PacketDeliveryState {
    const receipt = this.outboundReceipts()[packet.id];
    if (!receipt) return 'delivered';
    return receipt.ackedAt !== null ? 'delivered' : 'queued';
  }

  /**
   * Reconcile locally-queued sends against the packets the server echoed back.
   *
   * The echo normally carries the same id, and `mergeById` then overwrites the
   * optimistic row. When the server assigns its own id, the packet is matched
   * on `payload.handoffId` instead: the optimistic row is dropped so the list
   * shows the acknowledged copy once, and the receipt is stamped. Anything not
   * matched stays queued.
   */
  reconcilePacketAcks(incoming: AsyncCollaborationPacket[]): void {
    if (!incoming.length) return;

    const receipts = this.outboundReceipts();
    const next: Record<string, OutboundPacketReceipt> = { ...receipts };
    const replacedLocally = new Set<string>();

    if (Object.keys(receipts).length > 0) {
      const ackedAt = Date.now();
      for (const packet of incoming) {
        const direct = next[packet.id];
        if (direct) {
          if (direct.ackedAt === null) next[packet.id] = { ...direct, ackedAt };
          continue;
        }
        const payload = (packet.payload ?? {}) as Record<string, unknown>;
        const handoffId = payload['handoffId'];
        if (
          payload['kind'] !== 'creator_brief' ||
          typeof handoffId !== 'string'
        ) {
          continue;
        }
        for (const [localId, receipt] of Object.entries(next)) {
          if (receipt.ackedAt === null && receipt.handoffId === handoffId) {
            next[localId] = { ...receipt, ackedAt };
            replacedLocally.add(localId);
          }
        }
      }
    }

    this.asyncPackets.update((records) => {
      const kept = replacedLocally.size
        ? records.filter((record) => !replacedLocally.has(record.id))
        : records;
      // The echo is the authoritative copy: merge it in the same pass so a
      // matched optimistic row is replaced instead of duplicated.
      return mergeById(kept, incoming);
    });
    this.outboundReceipts.set(next);
  }

  /**
   * A creator brief can be sent when a finished AI Produce run exists inside a
   * live session this artist is allowed to share from.
   */
  canSendCreatorHandoff = computed(
    () =>
      !!this.aiProduce.creatorHandoff() &&
      !!this.collaboration.currentSession()?.sessionId &&
      this.can('share')
  );

  pendingApprovals = computed(() =>
    this.approvals().filter((approval) => approval.overallStatus === 'pending')
  );

  paletteActions = computed<StudioPaletteAction[]>(() => {
    const target = this.currentTarget();
    const primary = this.primaryAction();
    const conflicts = this.collaboration.pendingConflicts();
    const selectedTrack = this.music.selectedTrack();
    const actions: StudioPaletteAction[] = [];

    if (primary) {
      actions.push({
        id: 'studio-preview-ai',
        label: `Preview ${primary.title}`,
        description: `Preview the current ${primary.kind} for ${target.activeView}.`,
        category: 'Studio AI',
        keywords: [primary.kind, target.activeView, 'preview', 'ai'],
        context: ['studio'],
        run: () => {
          this.previewAction(primary.id);
        },
      });
      actions.push({
        id: 'studio-apply-ai',
        label: `Apply ${primary.title}`,
        description: `Apply the current ${primary.kind} to the active studio target.`,
        category: 'Studio AI',
        keywords: [primary.kind, 'apply', 'fix', 'ai'],
        context: ['studio'],
        run: () => {
          void this.applyAction(primary.id);
        },
      });
    }

    if (target.sessionId && this.can('review')) {
      actions.push({
        id: 'studio-request-review',
        label: 'Request Review',
        description: 'Ask reviewers to approve the active checkpoint.',
        category: 'Collaboration',
        keywords: ['review', 'approval', 'checkpoint'],
        context: ['studio'],
        run: () => {
          void this.requestReview();
        },
      });
    }

    if (conflicts.length > 0) {
      actions.push({
        id: 'studio-resolve-conflicts',
        label: `Resolve ${conflicts.length} Conflict${conflicts.length === 1 ? '' : 's'}`,
        description: 'Apply a decision-level conflict resolution flow.',
        category: 'Collaboration',
        keywords: ['conflict', 'branch', 'revision'],
        context: ['studio'],
        run: () => {
          void this.resolveConflictDecision(
            conflicts[0].trackId,
            conflicts[0].fieldKey,
            'keep-mine'
          );
        },
      });
    }

    if (this.currentProjectId()) {
      actions.push({
        id: 'studio-branch-session',
        label: 'Branch Session Timeline',
        description:
          'Create a new timeline branch from the current checkpoint.',
        category: 'Timeline',
        keywords: ['branch', 'timeline', 'checkpoint'],
        context: ['studio'],
        run: () => {
          void this.branchSession();
        },
      });
    }

    if (primary || selectedTrack) {
      actions.push({
        id: 'studio-export-artifact',
        label: `Export ${selectedTrack?.name ?? primary?.title ?? 'Artifact'}`,
        description: 'Export the active AI artifact or selected track context.',
        category: 'Export',
        keywords: ['export', 'artifact', 'track'],
        context: ['studio'],
        run: () => {
          void this.exportArtifact(primary?.id);
        },
      });
    }

    if (target.sessionId && this.can('remix')) {
      actions.push({
        id: 'studio-remix-session',
        label: 'Remix This Session',
        description: 'Create remix lineage and queue a remix-ready branch.',
        category: 'Remix',
        keywords: ['remix', 'session', 'lineage'],
        context: ['studio'],
        run: () => {
          void this.requestRemix();
        },
      });
    }

    return actions;
  });

  constructor() {
    // Publish Studio-only actions through the palette's extension registry.
    // The shell can then keep its palette graph lightweight while every action
    // appears as soon as the Studio services are available.
    effect(() => {
      const actions: CommandPaletteAction[] = this.paletteActions().map(
        (action) => ({
          ...action,
          context: action.context as CommandPaletteAction['context'],
        })
      );
      this.palette.setExtensionActions('studio-orchestration', actions);
    });

    effect(() => {
      const sync = this.social.sessionSyncState();
      if (!sync?.session) return;
      const activeSessionId = this.collaboration.currentSession()?.sessionId;
      if (!activeSessionId || sync.session.id !== activeSessionId) return;
      this.applyServerSync(sync);
    });

    effect(() => {
      const projectId = this.currentProjectId();
      if (!projectId) return;
      this.emitTimelineReviewState(projectId);
    });
  }

  setActiveStudioView(view: string): void {
    this.activeStudioView.set(view);
  }

  can(permission: StudioCollaborationPermission): boolean {
    return this.collaboration.can(permission);
  }

  previewAction(resultId?: string | null): StudioActionResult | null {
    const result = this.findAction(resultId);
    if (!result) return null;
    this.lastPreviewedActionId.set(result.id);
    if (result.source === 'ai-mix') {
      const suggestionId = String(result.payload?.['suggestionId'] ?? '');
      if (suggestionId) this.aiMix.previewSuggestion(suggestionId);
    }
    return result;
  }

  async applyAction(
    resultId?: string | null
  ): Promise<StudioActionResult | null> {
    const result = this.findAction(resultId);
    if (!result) return null;

    if (result.source === 'ai-produce') {
      this.aiProduce.applyToProject();
      return result;
    }

    if (result.source === 'ai-mix') {
      const suggestionId = String(result.payload?.['suggestionId'] ?? '');
      if (suggestionId) {
        this.aiMix.applySuggestion(suggestionId);
      }
      return result;
    }

    if (result.kind === 'conflict-resolution') {
      const trackId = String(result.payload?.['trackId'] ?? '');
      const fieldKey = String(result.payload?.['fieldKey'] ?? '');
      if (trackId && fieldKey) {
        await this.resolveConflictDecision(trackId, fieldKey, 'keep-mine');
      }
    }
    return result;
  }

  async requestReview(approverIds?: string[]): Promise<boolean> {
    const sessionId = this.collaboration.currentSession()?.sessionId;
    const projectId = this.currentProjectId();
    if (!sessionId || !projectId || !this.can('review')) return false;

    const currentUserId = this.auth.currentUser()?.id;
    const resolvedApprovers =
      approverIds?.filter(Boolean) ??
      this.collaboration
        .sessionMembers()
        .filter(
          (member) =>
            member.status !== 'revoked' &&
            member.userId !== currentUserId &&
            (member.role === 'host' || member.role === 'reviewer')
        )
        .map((member) => member.userId);

    if (resolvedApprovers.length === 0) return false;

    const target = this.currentTarget();
    const approval: StudioApproval = {
      id: `approval_${Date.now().toString(36)}`,
      sessionId,
      projectId,
      branchId: target.branchId,
      checkpointId: target.checkpointId,
      requestedBy: currentUserId ?? 'anonymous',
      approverIds: resolvedApprovers,
      overallStatus: 'pending',
      decisions: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.approvals.update((records) => mergeById(records, [approval]));
    this.emitTimelineReviewState(projectId);
    this.social.createApprovalRequest({
      id: approval.id,
      sessionId,
      projectId,
      branchId: target.branchId,
      checkpointId: target.checkpointId,
      approverIds: resolvedApprovers,
    });
    return true;
  }

  async addTimelineComment(
    content: string,
    overrides: Partial<StudioComment> = {}
  ): Promise<StudioComment | null> {
    const trimmed = content.trim();
    const sessionId = this.collaboration.currentSession()?.sessionId;
    const projectId = this.currentProjectId();
    if (!trimmed || !sessionId || !projectId || !this.can('comment'))
      return null;

    const target = this.currentTarget();
    const comment: StudioComment = {
      id: overrides.id ?? `comment_${Date.now().toString(36)}`,
      sessionId,
      projectId,
      branchId: overrides.branchId ?? target.branchId,
      checkpointId: overrides.checkpointId ?? target.checkpointId,
      trackId: overrides.trackId ?? target.selectedTrackId,
      clipId: overrides.clipId ?? null,
      userId: overrides.userId ?? this.auth.currentUser()?.id ?? 'anonymous',
      content: trimmed,
      resolved: overrides.resolved ?? false,
      createdAt: overrides.createdAt ?? Date.now(),
      updatedAt: overrides.updatedAt ?? Date.now(),
    };
    this.comments.update((records) => mergeById(records, [comment]));
    this.emitTimelineReviewState(projectId);
    this.social.addStudioComment({
      id: comment.id,
      sessionId,
      projectId,
      branchId: comment.branchId,
      checkpointId: comment.checkpointId,
      trackId: comment.trackId,
      clipId: comment.clipId,
      content: comment.content,
    });
    return comment;
  }

  markCommentResolved(commentId: string): void {
    const comment = this.comments().find((entry) => entry.id === commentId);
    if (!comment) return;
    this.comments.update((records) =>
      records.map((entry) =>
        entry.id === commentId
          ? { ...entry, resolved: true, updatedAt: Date.now() }
          : entry
      )
    );
    this.emitTimelineReviewState(comment.projectId);
    this.social.resolveStudioComment({
      sessionId: comment.sessionId,
      commentId,
    });
  }

  async resolveConflictDecision(
    trackId: string,
    fieldKey: string,
    decision: StudioConflictDecision
  ): Promise<boolean> {
    const conflict = this.collaboration
      .pendingConflicts()
      .find(
        (entry) => entry.trackId === trackId && entry.fieldKey === fieldKey
      );
    if (!conflict) return false;

    if (decision === 'branch') {
      await this.branchSession(`conflict-${fieldKey}`);
    }

    if (decision === 'request-revision') {
      const sessionId = this.collaboration.currentSession()?.sessionId;
      if (sessionId && this.can('review')) {
        this.social.sendAsyncCollaborationPacket({
          sessionId,
          toUserId: conflict.remoteUserId,
          packetType: 'revision_request',
          payload: {
            trackId,
            fieldKey,
            target: this.currentTarget(),
            localValue: conflict.localValue,
            remoteValue: conflict.remoteValue,
          },
        });
      }
    }

    this.collaboration.resolveConflict(
      trackId,
      fieldKey,
      decision === 'accept-theirs' ? 'theirs' : 'mine'
    );
    return true;
  }

  async branchSession(name?: string): Promise<string | null> {
    const projectId = this.currentProjectId();
    if (!projectId) return null;
    const branchId = this.history.activeBranch(projectId);
    const headCheckpointId = branchId
      ? (this.history.checkpoints(projectId, branchId).at(-1)?.id ?? null)
      : null;
    const branch = await this.history.createBranch(
      projectId,
      name || `${this.activeStudioView()} branch`,
      headCheckpointId
    );
    return branch.id;
  }

  async exportArtifact(
    resultId?: string | null
  ): Promise<StudioActionResult | null> {
    const result = this.findAction(resultId) ?? this.syntheticExportResult();
    if (!result) return null;

    if (result.source === 'ai-mix') {
      const suggestionId = String(result.payload?.['suggestionId'] ?? '');
      if (suggestionId) {
        this.aiMix.exportSuggestion(suggestionId);
      }
    }

    this.lastExportedAction.set({
      ...result,
      status: 'exported',
      updatedAt: Date.now(),
    });
    return this.lastExportedAction();
  }

  /**
   * Send the AI Produce creator brief as an async collaboration packet.
   *
   * The brief, sections, chords, hook and mix notes travel as a
   * `review_request` packet tagged `payload.kind === 'creator_brief'`, so a
   * collaborator who was never in the session can still act on the run.
   * `toUserId` targets one collaborator; omitting it addresses the session.
   *
   * The packet is recorded on `asyncPackets` before the socket echo, which is
   * what makes delivery visible to the sender: the row appears in the session
   * list immediately, the server echo merges into the same id via
   * `mergeById`, and the recipient sees the packet through session sync.
   * Returns null when nothing was sent — no artifacts, no live session, no
   * share permission — so callers never report a phantom send.
   */
  sendCreatorHandoff(toUserId?: string): AsyncCollaborationPacket | null {
    const handoff = this.aiProduce.creatorHandoff();
    const sessionId = this.collaboration.currentSession()?.sessionId;
    const fromUserId = this.auth.currentUser()?.id;
    if (!handoff || !sessionId || !fromUserId || !this.can('share')) return null;

    const recipient = (toUserId ?? '').trim();
    const now = Date.now();
    const packet: AsyncCollaborationPacket = {
      id: `packet_creator_${now.toString(36)}`,
      sessionId,
      fromUserId,
      toUserId: recipient,
      packetType: 'review_request',
      status: 'pending',
      payload: {
        kind: 'creator_brief',
        handoffId: handoff.id,
        title: handoff.title,
        genre: handoff.genre,
        mood: handoff.mood,
        bpm: handoff.bpm,
        key: handoff.key,
        sections: handoff.sections,
        chords: handoff.chords,
        hookLines: handoff.hookLines,
        mixNotes: handoff.mixNotes,
        brief: handoff.brief,
        generatedAt: handoff.generatedAt,
      },
      createdAt: now,
      appliedAt: null,
    };

    this.outboundReceipts.update((map) => ({
      ...map,
      [packet.id]: { sentAt: now, handoffId: handoff.id, ackedAt: null },
    }));
    this.asyncPackets.update((records) => mergeById(records, [packet]));
    this.social.sendAsyncCollaborationPacket({
      sessionId,
      toUserId: recipient,
      packetType: packet.packetType,
      payload: packet.payload,
    });
    return packet;
  }

  async requestRemix(toUserId?: string): Promise<boolean> {
    const projectId = this.currentProjectId();
    const sessionId = this.collaboration.currentSession()?.sessionId ?? null;
    const currentUserId = this.auth.currentUser()?.id;
    if (!projectId || !currentUserId || !this.can('remix')) return false;

    const lineageNode: RemixLineageNode = {
      projectId,
      sourceProjectId: projectId,
      sessionId,
      remixerId: currentUserId,
      timestamp: Date.now(),
      attribution: this.auth.currentUser()?.artistName,
    };

    const lineage: RemixLineageRecord = {
      id: `lineage_${Date.now().toString(36)}`,
      remixProjectId: projectId,
      sourceProjectId: projectId,
      remixerId: currentUserId,
      lineage: [lineageNode],
      depth: 1,
      createdAt: Date.now(),
      acceptedAt: null,
    };

    this.remixLineage.update((records) => mergeById(records, [lineage]));
    this.social.createRemixLineage({
      id: lineage.id,
      sourceProjectId: projectId,
      remixProjectId: projectId,
      lineageChain: lineage.lineage,
    });

    if (toUserId && sessionId) {
      this.social.sendAsyncCollaborationPacket({
        sessionId,
        toUserId,
        packetType: 'remix_request',
        payload: {
          projectId,
          sessionId,
          lineageId: lineage.id,
          activeView: this.activeStudioView(),
        },
      });
    }
    return true;
  }

  private applyServerSync(sync: StudioSessionSyncState): void {
    this.comments.update((records) => mergeById(records, sync.comments ?? []));
    this.approvals.update((records) =>
      mergeById(records, sync.approvals ?? [])
    );
    this.reconcilePacketAcks(sync.asyncPackets ?? []);
    this.remixLineage.update((records) =>
      mergeById(records, sync.remixLineage ?? [])
    );

    if (sync.session?.projectId) {
      this.emitTimelineReviewState(sync.session.projectId);
    }
  }

  private emitTimelineReviewState(projectId: string): void {
    this.history.setTimelineReviewState(
      projectId,
      this.comments().filter((comment) => comment.projectId === projectId),
      this.approvals().filter((approval) => approval.projectId === projectId)
    );
  }

  private buildConflictActions(
    target: StudioActionTarget
  ): StudioActionResult[] {
    return this.collaboration
      .pendingConflicts()
      .map((conflict) => this.conflictToAction(conflict, target));
  }

  private conflictToAction(
    conflict: ProjectConflict,
    target: StudioActionTarget
  ): StudioActionResult {
    return {
      id: `conflict_${conflict.trackId}_${conflict.fieldKey}`,
      source: 'collaboration',
      kind: 'conflict-resolution',
      title: `Resolve ${conflict.fieldKey}`,
      description: `Choose how to resolve ${conflict.fieldKey} for ${conflict.trackId}.`,
      reason: conflict.remoteUserName
        ? `${conflict.remoteUserName} edited the same field in this session.`
        : 'A collaborator edited the same field in this session.',
      preview: JSON.stringify(
        {
          localValue: conflict.localValue,
          remoteValue: conflict.remoteValue,
        },
        null,
        2
      ),
      status: 'pending',
      target,
      payload: {
        trackId: conflict.trackId,
        fieldKey: conflict.fieldKey,
        remoteUserId: conflict.remoteUserId,
      },
      outcomes: {
        apply: 'Keep your local version.',
        replace: 'Accept the remote version.',
        transition: 'Branch before resolving.',
        reject: 'Request a revision packet from your collaborator.',
      },
      createdAt: conflict.remoteAtMs,
      updatedAt: Date.now(),
    };
  }

  private findAction(resultId?: string | null): StudioActionResult | null {
    if (!resultId) return this.primaryAction();
    return (
      this.actionableResults().find((result) => result.id === resultId) ?? null
    );
  }

  private syntheticExportResult(): StudioActionResult | null {
    const target = this.currentTarget();
    if (!target.projectId) return null;
    return {
      id: `export_${target.projectId}`,
      source: 'timeline',
      kind: 'export-artifact',
      title: 'Studio Snapshot',
      description: 'Export the active studio context for downstream delivery.',
      status: 'pending',
      target,
      payload: {
        projectId: target.projectId,
        trackId: target.selectedTrackId,
        sessionId: target.sessionId,
      },
      outcomes: {
        export: 'Snapshot prepared for export.',
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }
}
