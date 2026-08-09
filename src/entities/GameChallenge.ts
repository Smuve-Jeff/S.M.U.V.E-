import { Entity, PrimaryGeneratedColumn } from "typeorm";

/**
 * GameChallenge entity stub.
 * See src/entities/User.ts for the migration rationale.
 */
@Entity("game_challenges")
export class GameChallenge {
  @PrimaryGeneratedColumn()
  id!: number;
}

export default GameChallenge;
