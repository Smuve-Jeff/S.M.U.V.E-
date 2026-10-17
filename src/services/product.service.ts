import { AppDataSource } from "@/database/data-source";
import { Product } from "@/entities/Product";
import { AppError } from "@/lib";

const repo = () => AppDataSource.getRepository(Product);

export interface ProductOutput {
  id: number;
  name: string;
  description: string | null;
  price: number;
  stock: number;
  isActive: boolean;
  userId: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Postgres `decimal` columns come back as strings — normalize to number. */
const toOutput = (product: Product): ProductOutput => ({
  id: product.id,
  name: product.name,
  description: product.description ?? null,
  price: Number(product.price),
  stock: product.stock,
  isActive: product.isActive,
  userId: product.userId,
  createdAt: product.createdAt,
  updatedAt: product.updatedAt,
});

export interface ProductInput {
  name: string;
  description?: string;
  price: number;
  stock?: number;
  isActive?: boolean;
}

export const listProducts = async (
  opts: { onlyActive?: boolean } = {},
): Promise<ProductOutput[]> => {
  const products = await repo().find({
    where: opts.onlyActive ? { isActive: true } : undefined,
    order: { createdAt: "DESC" },
  });
  return products.map(toOutput);
};

export const createProduct = async (
  userId: number,
  input: ProductInput,
): Promise<ProductOutput> => {
  const product = await repo().save(repo().create({ ...input, userId }));
  return toOutput(product);
};

export const getProductById = async (id: number): Promise<ProductOutput> => {
  const product = await repo().findOneBy({ id });
  if (!product) throw new AppError(404, "Product not found");
  return toOutput(product);
};

const assertOwnerOrAdmin = (
  product: Product,
  actor: { userId: number; role: string },
) => {
  if (product.userId !== actor.userId && actor.role !== "admin") {
    throw new AppError(403, "You do not have permission to modify this product");
  }
};

export const updateProduct = async (
  id: number,
  actor: { userId: number; role: string },
  patch: Partial<ProductInput>,
): Promise<ProductOutput> => {
  const product = await repo().findOneBy({ id });
  if (!product) throw new AppError(404, "Product not found");
  assertOwnerOrAdmin(product, actor);

  Object.assign(product, patch);
  const updated = await repo().save(product);
  return toOutput(updated);
};

export const deleteProduct = async (
  id: number,
  actor: { userId: number; role: string },
): Promise<void> => {
  const product = await repo().findOneBy({ id });
  if (!product) throw new AppError(404, "Product not found");
  assertOwnerOrAdmin(product, actor);

  await repo().delete({ id });
};
