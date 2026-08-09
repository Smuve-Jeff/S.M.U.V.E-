import { Entity, PrimaryGeneratedColumn } from "typeorm";

/**
 * Product entity stub.
 * See src/entities/User.ts for the migration rationale.
 */
@Entity("products")
export class Product {
  @PrimaryGeneratedColumn()
  id!: number;
}

export default Product;
