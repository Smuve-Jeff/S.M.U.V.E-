import { AppDataSource } from "@/database/data-source";

jest.mock("@/database/data-source", () => ({
  AppDataSource: { getRepository: jest.fn() },
}));
jest.mock("@/entities/Product", () => ({
  Product: class Product {},
}));

const mockRepo = {
  find: jest.fn(),
  findOneBy: jest.fn(),
  create: jest.fn((v: unknown) => v),
  save: jest.fn((v: unknown) => Promise.resolve(v)),
  delete: jest.fn(),
};
(AppDataSource.getRepository as jest.Mock).mockReturnValue(mockRepo);

import {
  createProduct,
  deleteProduct,
  getProductById,
  listProducts,
  updateProduct,
} from "./product.service";

const actor = { userId: 1, role: "user" };

describe("product service", () => {
  beforeEach(() => jest.clearAllMocks());

  it("lists active products by default", async () => {
    mockRepo.find.mockResolvedValue([]);
    await listProducts({ onlyActive: true });
    expect(mockRepo.find).toHaveBeenCalledWith({
      where: { isActive: true },
      order: { createdAt: "DESC" },
    });
  });

  it("normalizes decimal price strings to numbers", async () => {
    mockRepo.findOneBy.mockResolvedValue({
      id: 1,
      name: "Plugin",
      description: null,
      price: "49.99",
      stock: 5,
      isActive: true,
      userId: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const product = await getProductById(1);
    expect(product.price).toBe(49.99);
  });

  it("creates a product owned by the caller", async () => {
    mockRepo.save.mockResolvedValue({
      id: 2,
      name: "Kit",
      description: null,
      price: 9.99,
      stock: 0,
      isActive: true,
      userId: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const created = await createProduct(1, { name: "Kit", price: 9.99 });
    expect(created.userId).toBe(1);
  });

  it("throws 404 for missing product", async () => {
    mockRepo.findOneBy.mockResolvedValue(null);
    await expect(getProductById(999)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("blocks non-owners from updating", async () => {
    mockRepo.findOneBy.mockResolvedValue({ id: 1, userId: 2 });
    await expect(
      updateProduct(1, actor, { name: "Hijack" }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("lets owners update", async () => {
    const product = {
      id: 1,
      name: "Old",
      description: null,
      price: 5,
      stock: 0,
      isActive: true,
      userId: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockRepo.findOneBy.mockResolvedValue(product);
    mockRepo.save.mockResolvedValue({ ...product, name: "New" });
    const updated = await updateProduct(1, actor, { name: "New" });
    expect(updated.name).toBe("New");
  });

  it("blocks non-owners from deleting", async () => {
    mockRepo.findOneBy.mockResolvedValue({ id: 1, userId: 2 });
    await expect(deleteProduct(1, actor)).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});
