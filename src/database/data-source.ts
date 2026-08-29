import "reflect-metadata";
import { DataSource } from "typeorm";
import { DATABASE_DRIVER, DATABASE_URL, NODE_ENV } from "@/config/env";
import { User } from "@/entities/User";
import { Product } from "@/entities/Product";
import { UserProfile } from "@/entities/UserProfile";
import { Friend } from "@/entities/Friend";
import { DirectMessage } from "@/entities/DirectMessage";
import { GameChallenge } from "@/entities/GameChallenge";
import { Notification } from "@/entities/Notification";
import { StudioSession } from "@/entities/StudioSession";
import { StudioSessionMember } from "@/entities/StudioSessionMember";
import { StudioComment } from "@/entities/StudioComment";
import { StudioApproval } from "@/entities/StudioApproval";
import { AsyncCollaborationPacket } from "@/entities/AsyncCollaborationPacket";
import { RemixLineage } from "@/entities/RemixLineage";
import { ConnectorJob } from "@/entities/ConnectorJob";
import { Project } from "@/entities/Project";
import { ArtistIdentity } from "@/entities/ArtistIdentity";
import { GameInvite } from "@/entities/GameInvite";
import { LiveStream } from "@/entities/LiveStream";

const isDevelopment = NODE_ENV === "development";
const isProduction = NODE_ENV === "production";

const isPlanetScale = DATABASE_DRIVER === "mysql";

export const AppDataSource = new DataSource({
  type: isPlanetScale ? "mysql" : "postgres",
  url: DATABASE_URL,
  ...(isPlanetScale
    ? { charset: "utf8mb4", ssl: isDevelopment ? false : { rejectUnauthorized: true } }
    : { ssl: isDevelopment ? false : { rejectUnauthorized: false } }),
  synchronize: false,
  logging: isDevelopment ? ["query", "error"] : false,
  entities: [
    User,
    Product,
    UserProfile,
    Friend,
    DirectMessage,
    GameChallenge,
    Notification,
    StudioSession,
    StudioSessionMember,
    StudioComment,
    StudioApproval,
    AsyncCollaborationPacket,
    RemixLineage,
    ConnectorJob,
    Project,
    ArtistIdentity,
    GameInvite,
    LiveStream,
  ],
  migrations: isDevelopment
    ? [__dirname + "/migrations/*.ts"]
    : [__dirname + "/migrations/*.js"],
  migrationsRun: isDevelopment,
  extra: {
    max: isProduction ? 10 : 20,
    ...(isPlanetScale ? { enableKeepAlive: true } : {}),
  },
});
