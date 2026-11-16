import "reflect-metadata";
import { DataSource } from "typeorm";
import { DATABASE_URL, NODE_ENV } from "@/config/env";
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
import { LiveStreamViewerJoin } from "@/entities/LiveStreamViewerJoin";
import { UserBlock } from "@/entities/UserBlock";
import { RoomMessage } from "@/entities/RoomMessage";
import { AccountToken } from "@/entities/AccountToken";
import { CloudProjectSnapshot } from "@/entities/CloudProjectSnapshot";
import { AiUsageLedger } from "@/entities/AiUsageLedger";
import { StreamingAccount } from "@/entities/StreamingAccount";
import { StreamingDestination } from "@/entities/StreamingDestination";
import { BroadcastSession } from "@/entities/BroadcastSession";

const isDevelopment = NODE_ENV === "development";
const isProduction = NODE_ENV === "production";

export const AppDataSource = new DataSource({
  type: "postgres",
  url: DATABASE_URL,
  ssl: isDevelopment ? false : { rejectUnauthorized: false },
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
    LiveStreamViewerJoin,
    UserBlock,
    RoomMessage,
    AccountToken,
    CloudProjectSnapshot,
    AiUsageLedger,
    StreamingAccount,
    StreamingDestination,
    BroadcastSession,
  ],
  migrations: isDevelopment
    ? [__dirname + "/migrations/*.ts"]
    : [__dirname + "/migrations/*.js"],
  migrationsRun: isDevelopment,
  extra: {
    max: isProduction ? 10 : 20,
  },
});
