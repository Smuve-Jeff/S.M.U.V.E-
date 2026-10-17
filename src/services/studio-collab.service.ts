import { randomUUID } from "node:crypto";
import { AppDataSource } from "@/database/data-source";
import {
  StudioSession,
  StudioSessionMember,
  StudioComment,
  StudioApproval,
  AsyncCollaborationPacket,
  RemixLineage,
} from "@/entities";
import { AppError } from "@/lib";

const repo = () => ({
  sessions: AppDataSource.getRepository(StudioSession),
  members: AppDataSource.getRepository(StudioSessionMember),
  comments: AppDataSource.getRepository(StudioComment),
  approvals: AppDataSource.getRepository(StudioApproval),
  packets: AppDataSource.getRepository(AsyncCollaborationPacket),
  lineage: AppDataSource.getRepository(RemixLineage),
});

export const STUDIO_ROLE_PERMISSIONS: Record<
  string,
  Record<string, boolean>
> = {
  host: {
    edit: true,
    transport: true,
    invite: true,
    voice: true,
    approve: true,
    share: true,
    remix: true,
    comment: true,
    review: true,
    export: true,
  },
  editor: {
    edit: true,
    transport: true,
    invite: false,
    voice: true,
    approve: false,
    share: true,
    remix: true,
    comment: true,
    review: true,
    export: true,
  },
  reviewer: {
    edit: false,
    transport: false,
    invite: false,
    voice: false,
    approve: true,
    share: true,
    remix: false,
    comment: true,
    review: true,
    export: false,
  },
  viewer: {
    edit: false,
    transport: false,
    invite: false,
    voice: false,
    approve: false,
    share: true,
    remix: false,
    comment: false,
    review: false,
    export: false,
  },
};

export const resolveStudioPermissions = (
  role: string,
  overrides: Record<string, boolean> | null = null,
): Record<string, boolean> => ({
  ...(STUDIO_ROLE_PERMISSIONS[role] || STUDIO_ROLE_PERMISSIONS.viewer),
  ...(overrides || {}),
});

const coerceJson = (value: unknown, fallback: unknown): unknown => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
};

export const getStudioMember = async (
  sessionId: string,
  memberUserId: string,
): Promise<StudioSessionMember | null> => {
  return repo().members.findOneBy({ sessionId, userId: memberUserId });
};

export const hasStudioPermission = async (
  sessionId: string,
  memberUserId: string,
  permission: string | null,
): Promise<boolean> => {
  const member = await getStudioMember(sessionId, memberUserId);
  if (!member || member.status !== "active") return false;
  if (!permission) return true;
  const perms = resolveStudioPermissions(
    member.role,
    coerceJson(member.permissions, {}) as Record<string, boolean>,
  );
  return !!perms[permission];
};

/** Build the full session_sync payload for a member. */
export const buildSessionSyncPayload = async (
  sessionId: string,
  memberUserId: string,
): Promise<Record<string, unknown>> => {
  const session = await repo().sessions.findOneBy({ id: sessionId });
  const members = await repo().members.createQueryBuilder("m")
    .leftJoin(
      "user_profiles",
      "p",
      "p.user_id = m.user_id",
    )
    .select([
      "m.session_id",
      "m.user_id",
      "m.role",
      "m.status",
      "m.permissions",
      "m.joined_at",
      "p.profile_data->>'artistName' as artist_name",
    ])
    .where("m.session_id = :sessionId", { sessionId })
    .orderBy("m.joined_at", "ASC")
    .getRawMany();
  const comments = await repo().comments.find({
    where: { sessionId },
    order: { updatedAt: "DESC" },
  });
  const approvals = await repo().approvals.find({
    where: { sessionId },
    order: { updatedAt: "DESC" },
  });
  const packets = await repo().packets.find({
    where: [
      { sessionId, toUserId: memberUserId },
      { sessionId, fromUserId: memberUserId },
    ],
    order: { createdAt: "DESC" },
  });
  const sessionObj = session
    ? {
        id: session.id,
        projectId: session.projectId,
        status: session.status,
        metadata: coerceJson(session.metadata, {}),
      }
    : null;

  let lineageRows: RemixLineage[] = [];
  if (session?.projectId) {
    lineageRows = await repo().lineage.find({
      where: [
        { remixProjectId: session.projectId },
        { sourceProjectId: session.projectId },
      ],
      order: { createdAt: "DESC" },
    });
  }

  return {
    session: sessionObj,
    members: members.map((row: Record<string, unknown>) => ({
      sessionId: row.session_id,
      userId: row.user_id,
      artistName: row.artist_name || row.user_id,
      role: row.role,
      status: row.status,
      permissions: coerceJson(row.permissions, {}),
      joinedAt:
        row.joined_at instanceof Date
          ? row.joined_at.getTime()
          : Number(row.joined_at),
    })),
    comments: comments.map((c) => ({
      id: c.id,
      sessionId: c.sessionId,
      projectId: c.projectId,
      branchId: c.branchId,
      checkpointId: c.checkpointId,
      trackId: c.trackId,
      clipId: c.clipId,
      userId: c.userId,
      content: c.content,
      resolved: c.resolved,
      createdAt: c.createdAt.getTime(),
      updatedAt: c.updatedAt.getTime(),
    })),
    approvals: approvals.map((a) => ({
      id: a.id,
      sessionId: a.sessionId,
      projectId: a.projectId,
      branchId: a.branchId,
      checkpointId: a.checkpointId,
      requestedBy: a.createdById,
      approverIds: a.approverIds || [],
      overallStatus: a.overallStatus,
      decisions: coerceJson(a.approvalStatus, {}),
      createdAt: a.createdAt.getTime(),
      updatedAt: a.updatedAt.getTime(),
    })),
    asyncPackets: packets.map((p) => ({
      id: p.id,
      sessionId: p.sessionId,
      fromUserId: p.fromUserId,
      toUserId: p.toUserId,
      packetType: p.packetType,
      status: p.status,
      payload: coerceJson(p.payload, {}),
      responsePayload: coerceJson(p.responsePayload, null),
      createdAt: p.createdAt.getTime(),
      appliedAt: p.appliedAt ? new Date(p.appliedAt).getTime() : null,
    })),
    remixLineage: lineageRows.map((r) => ({
      id: r.id,
      remixProjectId: r.remixProjectId,
      sourceProjectId: r.sourceProjectId,
      remixerId: r.remixerId,
      lineage: coerceJson(r.lineage, []),
      depth: Number(r.depth || 1),
      createdAt: r.createdAt.getTime(),
      acceptedAt: r.acceptedAt ? r.acceptedAt.getTime() : null,
    })),
  };
};

// ─── REST list endpoints (ported from old server spec) ───────────────────────

export interface StudioSessionRow {
  id: string;
  projectId: string | null;
  createdById: string;
  status: string;
  metadata: unknown;
  createdAt: number;
  updatedAt: number;
}

/** GET /api/studio/sessions/:projectId — sessions that touch a project. */
export const listSessionsForProject = async (
  projectId: string,
): Promise<StudioSessionRow[]> => {
  const rows = await repo().sessions.find({
    where: { projectId },
    order: { createdAt: "DESC" },
  });
  return rows.map((s) => ({
    id: s.id,
    projectId: s.projectId,
    createdById: s.createdById,
    status: s.status,
    metadata: coerceJson(s.metadata, {}),
    createdAt: s.createdAt.getTime(),
    updatedAt: s.updatedAt.getTime(),
  }));
};

/** GET /api/remix/lineage/:projectId */
export const listRemixLineageForProject = async (
  projectId: string,
): Promise<Record<string, unknown>[]> => {
  const rows = await repo().lineage.find({
    where: [{ remixProjectId: projectId }, { sourceProjectId: projectId }],
    order: { createdAt: "DESC" },
  });
  return rows.map((r) => ({
    id: r.id,
    remixProjectId: r.remixProjectId,
    sourceProjectId: r.sourceProjectId,
    remixerId: r.remixerId,
    lineage: coerceJson(r.lineage, []),
    depth: Number(r.depth || 1),
    createdAt: r.createdAt.getTime(),
    acceptedAt: r.acceptedAt ? r.acceptedAt.getTime() : null,
  }));
};

export const createStudioSession = async (input: {
  sessionId?: string;
  projectId?: string | null;
  createdById: string;
  sessionName?: string;
}): Promise<StudioSessionRow> => {
  const sessionId = input.sessionId || `sess_${randomUUID()}`;
  const existing = await repo().sessions.findOneBy({ id: sessionId });
  const session =
    existing ||
    repo().sessions.create({
      id: sessionId,
      projectId: input.projectId ?? null,
      createdById: input.createdById,
      metadata: { name: input.sessionName || "Studio Session" },
      status: "active",
    });
  if (existing) {
    existing.projectId = input.projectId ?? existing.projectId;
    existing.metadata = { name: input.sessionName || "Studio Session" };
    existing.status = "active";
  }
  const saved = await repo().sessions.save(session);
  return {
    id: saved.id,
    projectId: saved.projectId,
    createdById: saved.createdById,
    status: saved.status,
    metadata: coerceJson(saved.metadata, {}),
    createdAt: saved.createdAt.getTime(),
    updatedAt: saved.updatedAt.getTime(),
  };
};

export const upsertSessionMember = async (input: {
  sessionId: string;
  userId: string;
  role: string;
  status: "active" | "invited";
}): Promise<void> => {
  const existing = await repo().members.findOneBy({
    sessionId: input.sessionId,
    userId: input.userId,
  });
  if (existing) {
    existing.role = input.role;
    existing.status = input.status;
    existing.permissions = resolveStudioPermissions(input.role);
    await repo().members.save(existing);
    return;
  }
  await repo().members.save(
    repo().members.create({
      sessionId: input.sessionId,
      userId: input.userId,
      role: input.role,
      status: input.status,
      permissions: resolveStudioPermissions(input.role),
    }),
  );
};

export const activateSessionMember = async (
  sessionId: string,
  userId: string,
): Promise<void> => {
  const member = await repo().members.findOneBy({ sessionId, userId });
  if (!member) throw new AppError(404, "Not a member of this session");
  member.status = "active";
  member.joinedAt = new Date();
  await repo().members.save(member);
};
