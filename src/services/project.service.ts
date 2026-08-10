import { randomUUID } from "node:crypto";
import { AppDataSource } from "@/database/data-source";
import { Project, ArtistIdentity, ConnectorJob } from "@/entities";
import { AppError } from "@/lib";

const repo = () => ({
  projects: AppDataSource.getRepository(Project),
  identities: AppDataSource.getRepository(ArtistIdentity),
  connectors: AppDataSource.getRepository(ConnectorJob),
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

// ─── Projects ────────────────────────────────────────────────────────────────

export interface ProjectRow {
  projectId: string;
  userId: string;
  title: string;
  projectData: unknown;
  updatedAt: number;
}

const toRow = (p: Project): ProjectRow => ({
  projectId: p.projectId,
  userId: p.userId,
  title: p.title,
  projectData: coerceJson(p.projectData, {}),
  updatedAt: p.updatedAt.getTime(),
});

/** POST /api/projects — upsert a project snapshot. */
export const saveProject = async (input: {
  projectId: string;
  userId: string;
  title?: string;
  projectData?: unknown;
}): Promise<ProjectRow> => {
  if (!input.projectId || !input.userId) {
    throw new AppError(400, "projectId and userId are required");
  }
  const existing = await repo().projects.findOneBy({
    projectId: input.projectId,
    userId: input.userId,
  });
  const project =
    existing ||
    repo().projects.create({
      projectId: input.projectId,
      userId: input.userId,
      title: input.title || "Untitled Project",
      projectData: {},
    });
  if (input.title !== undefined) project.title = input.title;
  if (input.projectData !== undefined) {
    project.projectData = input.projectData as Record<string, unknown>;
  }
  const saved = await repo().projects.save(project);
  return toRow(saved);
};

/** GET /api/projects/:userId/:projectId */
export const loadProject = async (
  userId: string,
  projectId: string,
): Promise<ProjectRow> => {
  const project = await repo().projects.findOneBy({ projectId, userId });
  if (!project) throw new AppError(404, "Project not found");
  return toRow(project);
};

/** GET /api/projects/:userId */
export const listProjects = async (userId: string): Promise<ProjectRow[]> => {
  const rows = await repo().projects.find({
    where: { userId },
    order: { updatedAt: "DESC" },
  });
  return rows.map(toRow);
};

// ─── Artist identity ─────────────────────────────────────────────────────────

/** POST /api/identity — upsert identity + optional profile snapshot. */
export const saveArtistIdentity = async (input: {
  userId: string;
  identity: unknown;
  profileData?: unknown;
}): Promise<{ success: boolean }> => {
  if (!input.userId) throw new AppError(400, "userId is required");
  const existing = await repo().identities.findOneBy({ userId: input.userId });
  const record =
    existing ||
    repo().identities.create({
      userId: input.userId,
      identity: {},
      profileData: null,
    });
  if (input.identity !== undefined) {
    record.identity = input.identity as Record<string, unknown>;
  }
  if (input.profileData !== undefined) {
    record.profileData = input.profileData as Record<string, unknown>;
  }
  await repo().identities.save(record);
  return { success: true };
};

/** GET /api/identity/:userId */
export const loadArtistIdentity = async (
  userId: string,
): Promise<{ identity: unknown }> => {
  const record = await repo().identities.findOneBy({ userId });
  if (!record) throw new AppError(404, "Identity not found");
  return { identity: coerceJson(record.identity, {}) };
};

// ─── Connector jobs ──────────────────────────────────────────────────────────

/** GET /api/identity/:userId/connectors */
export const listConnectorJobs = async (
  userId: string,
): Promise<Array<Record<string, unknown>>> => {
  const rows = await repo().connectors.find({
    where: { userId },
    order: { createdAt: "DESC" },
  });
  return rows.map((c) => ({
    id: c.id,
    status: c.status,
    job: coerceJson(c.job, {}),
    createdAt: c.createdAt.getTime(),
    updatedAt: c.updatedAt.getTime(),
  }));
};

/** POST /api/identity/:userId/connectors — queue a connector job. */
export const createConnectorJob = async (input: {
  userId: string;
  job?: unknown;
}): Promise<Record<string, unknown>> => {
  const saved = await repo().connectors.save(
    repo().connectors.create({
      id: `conn_${randomUUID()}`,
      userId: input.userId,
      job: (input.job ?? {}) as Record<string, unknown>,
      status: "queued",
    }),
  );
  return {
    id: saved.id,
    status: saved.status,
    job: coerceJson(saved.job, {}),
    createdAt: saved.createdAt.getTime(),
    updatedAt: saved.updatedAt.getTime(),
  };
};
