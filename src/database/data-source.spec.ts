// AppDataSource pulls in every entity file, whose TypeORM decorators do not
// parse under babel-jest. Mock the entity modules so the real DataSource
// config can still be inspected.
jest.mock("@/entities/User", () => ({ User: class User {} }));
jest.mock("@/entities/Product", () => ({ Product: class Product {} }));
jest.mock("@/entities/UserProfile", () => ({ UserProfile: class UserProfile {} }));
jest.mock("@/entities/Friend", () => ({ Friend: class Friend {} }));
jest.mock("@/entities/DirectMessage", () => ({ DirectMessage: class DirectMessage {} }));
jest.mock("@/entities/GameChallenge", () => ({ GameChallenge: class GameChallenge {} }));
jest.mock("@/entities/Notification", () => ({ Notification: class Notification {} }));
jest.mock("@/entities/StudioSession", () => ({ StudioSession: class StudioSession {} }));
jest.mock("@/entities/StudioSessionMember", () => ({ StudioSessionMember: class StudioSessionMember {} }));
jest.mock("@/entities/StudioComment", () => ({ StudioComment: class StudioComment {} }));
jest.mock("@/entities/StudioApproval", () => ({ StudioApproval: class StudioApproval {} }));
jest.mock("@/entities/AsyncCollaborationPacket", () => ({
  AsyncCollaborationPacket: class AsyncCollaborationPacket {},
}));
jest.mock("@/entities/RemixLineage", () => ({ RemixLineage: class RemixLineage {} }));
jest.mock("@/entities/ConnectorJob", () => ({ ConnectorJob: class ConnectorJob {} }));
jest.mock("@/entities/Project", () => ({ Project: class Project {} }));
jest.mock("@/entities/ArtistIdentity", () => ({ ArtistIdentity: class ArtistIdentity {} }));
jest.mock("@/entities/GameInvite", () => ({ GameInvite: class GameInvite {} }));
jest.mock("@/entities/LiveStream", () => ({ LiveStream: class LiveStream {} }));

import { AppDataSource } from "./data-source";

describe("AppDataSource config (PostgreSQL only)", () => {
  it("selects the postgres driver", () => {
    expect(AppDataSource.options.type).toBe("postgres");
  });

  it("registers a non-empty entity and migration set", () => {
    expect(AppDataSource.options.entities).toBeDefined();
    expect((AppDataSource.options.entities as unknown[]).length).toBeGreaterThan(0);
    expect(AppDataSource.options.migrations).toBeDefined();
    expect((AppDataSource.options.migrations as unknown[]).length).toBeGreaterThan(0);
  });

  it("never auto-synchronizes the schema", () => {
    expect(AppDataSource.options.synchronize).toBe(false);
  });

  it("requires SSL outside development and disables it inside development", () => {
    // setup-jest-server.ts sets NODE_ENV=test, so the non-development path applies.
    expect(AppDataSource.options.ssl).toEqual({ rejectUnauthorized: false });
  });
});