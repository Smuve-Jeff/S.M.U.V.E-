import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Creates `users` and `products`.
 *
 * Dialect-aware so it runs on both PostgreSQL (local dev + Render) and
 * MySQL/Vitess (PlanetScale). PostgreSQL keeps `SERIAL`, `character
 * varying`, double-quoted identifiers and the FKs; MySQL/PlanetScale uses
 * `AUTO_INCREMENT`, `varchar`, bare identifiers and drops foreign keys
 * (Vitess does not support FK constraints).
 */
export class CreateUsersAndProducts1786243200000 implements MigrationInterface {
  name = "CreateUsersAndProducts1786243200000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isMysql = queryRunner.connection.options.type === "mysql";

    if (isMysql) {
      await queryRunner.query(`
        CREATE TABLE users (
          id int AUTO_INCREMENT PRIMARY KEY,
          name varchar(100) NOT NULL,
          email varchar(100) NOT NULL,
          password varchar(255) NOT NULL,
          role varchar(20) NOT NULL DEFAULT 'user',
          createdAt TIMESTAMP NOT NULL DEFAULT now(),
          updatedAt TIMESTAMP NOT NULL DEFAULT now(),
          CONSTRAINT UQ_users_email UNIQUE (email)
        )
      `);

      await queryRunner.query(`
        CREATE TABLE products (
          id int AUTO_INCREMENT PRIMARY KEY,
          name varchar(200) NOT NULL,
          description text,
          price numeric(10,2) NOT NULL,
          stock integer NOT NULL DEFAULT 0,
          isActive boolean NOT NULL DEFAULT true,
          userId int NOT NULL,
          createdAt TIMESTAMP NOT NULL DEFAULT now(),
          updatedAt TIMESTAMP NOT NULL DEFAULT now()
        )
      `);

      await queryRunner.query(
        `CREATE INDEX IDX_products_userId ON products (userId)`,
      );
    } else {
      await queryRunner.query(`
        CREATE TABLE "users" (
          "id" SERIAL PRIMARY KEY,
          "name" character varying(100) NOT NULL,
          "email" character varying(100) NOT NULL,
          "password" character varying NOT NULL,
          "role" character varying(20) NOT NULL DEFAULT 'user',
          "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
          "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
          CONSTRAINT "UQ_users_email" UNIQUE ("email")
        )
      `);

      await queryRunner.query(`
        CREATE TABLE "products" (
          "id" SERIAL PRIMARY KEY,
          "name" character varying(200) NOT NULL,
          "description" text,
          "price" numeric(10,2) NOT NULL,
          "stock" integer NOT NULL DEFAULT 0,
          "isActive" boolean NOT NULL DEFAULT true,
          "userId" integer NOT NULL,
          "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
          "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
          CONSTRAINT "FK_products_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
        )
      `);

      await queryRunner.query(
        `CREATE INDEX "IDX_products_userId" ON "products" ("userId")`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "products"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
  }
}