import { AppDataSource } from "@/database/data-source";

jest.mock("@/entities", () => ({
  StudioSession: class StudioSession {},
  StudioSessionMember: class StudioSessionMember {},
  StudioComment: class StudioComment {},
  StudioApproval: class StudioApproval {},
  AsyncCollaborationPacket: class AsyncCollaborationPacket {},
  RemixLineage: class RemixLineage {},
}));

jest.mock("@/database/data-source", () => ({
  AppDataSource: {
    getRepository: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
      getMany: jest.fn().mockResolvedValue([]),
    })),
  },
}));

const makeRepo = () => ({
  findOneBy: jest.fn(),
  find: jest.fn().mockResolvedValue([]),
  create: jest.fn((v: unknown) => v),
  save: jest.fn((v: unknown) => Promise.resolve(v)),
  createQueryBuilder: jest.fn(() => ({
    leftJoin: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue([]),
    getMany: jest.fn().mockResolvedValue([]),
  })),
});

(AppDataSource.getRepository as jest.Mock).mockReturnValue(makeRepo());

import {
  hasStudioPermission,
  resolveStudioPermissions,
  STUDIO_ROLE_PERMISSIONS,
} from "./studio-collab.service";

describe("studio role permissions", () => {
  it("hosts can do everything", () => {
    const perms = resolveStudioPermissions("host");
    expect(perms.edit).toBe(true);
    expect(perms.transport).toBe(true);
    expect(perms.invite).toBe(true);
  });

  it("viewers are read-only", () => {
    const perms = resolveStudioPermissions("viewer");
    expect(perms.edit).toBe(false);
    expect(perms.comment).toBe(false);
    expect(perms.share).toBe(true);
  });

  it("unknown roles fall back to viewer", () => {
    const perms = resolveStudioPermissions("ghost");
    expect(perms).toEqual(STUDIO_ROLE_PERMISSIONS.viewer);
  });

  it("overrides merge onto the role base", () => {
    const perms = resolveStudioPermissions("viewer", { edit: true });
    expect(perms.edit).toBe(true);
    expect(perms.share).toBe(true);
  });
});

describe("hasStudioPermission", () => {
  beforeEach(() => jest.clearAllMocks());

  it("denies when the member is not active", async () => {
    const memberRepo = (AppDataSource.getRepository as jest.Mock)();
    memberRepo.findOneBy.mockResolvedValue({ status: "invited", role: "host" });
    await expect(hasStudioPermission("s1", "u1", "edit")).resolves.toBe(false);
  });

  it("grants active members with the permission", async () => {
    const memberRepo = (AppDataSource.getRepository as jest.Mock)();
    memberRepo.findOneBy.mockResolvedValue({
      status: "active",
      role: "editor",
      permissions: {},
    });
    await expect(hasStudioPermission("s1", "u1", "edit")).resolves.toBe(true);
    await expect(hasStudioPermission("s1", "u1", "invite")).resolves.toBe(false);
  });
});
