import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { AppDataSource } from "@/database/data-source";

// Mock TypeORM-dependent modules so decorators never parse under babel-jest.
jest.mock("@/database/data-source", () => ({
  AppDataSource: { getRepository: jest.fn() },
}));
jest.mock("@/entities/User", () => ({
  User: class User {},
}));

const mockRepo = {
  findOneBy: jest.fn(),
  createQueryBuilder: jest.fn(() => ({
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
  })),
  create: jest.fn((v: unknown) => v),
  save: jest.fn((v: unknown) => Promise.resolve(v)),
  find: jest.fn(),
  delete: jest.fn(),
};

(AppDataSource.getRepository as jest.Mock).mockReturnValue(mockRepo);

import {
  deleteUser,
  getUserById,
  listUsers,
  loginUser,
  registerUser,
  updateUser,
} from "./user.service";

describe("registerUser", () => {
  beforeEach(() => jest.clearAllMocks());

  it("hashes the password, saves the user, returns a JWT + public user", async () => {
    mockRepo.findOneBy.mockResolvedValue(null);
    mockRepo.save.mockResolvedValue({
      id: 1,
      name: "Jeff",
      email: "jeff@example.com",
      role: "user",
      password: "hashed",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await registerUser({
      name: "Jeff",
      email: "jeff@example.com",
      password: "Sup3rSecret!",
    });

    const saved = mockRepo.save.mock.calls[0][0] as { password?: string };
    // bcrypt round-trips the input; never stores the plaintext.
    expect(saved.password).not.toBe("Sup3rSecret!");
    expect(saved.password).toMatch(/^\$2[aby]\$/);
    expect(result.user.email).toBe("jeff@example.com");
    expect(result.user.password).toBeUndefined();
    const decoded = jwt.verify(result.token, process.env.JWT_SECRET!) as {
      userId: number;
    };
    expect(decoded.userId).toBe(1);
  });

  it("throws 409 when the email is taken", async () => {
    mockRepo.findOneBy.mockResolvedValue({ id: 9 });
    await expect(
      registerUser({ name: "Jeff", email: "jeff@example.com", password: "Sup3rSecret!" }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe("loginUser", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns a token for valid credentials", async () => {
    const hash = await bcrypt.hash("Sup3rSecret!", 4);
    mockRepo.createQueryBuilder().getOne.mockResolvedValue({
      id: 2,
      name: "Jeff",
      email: "jeff@example.com",
      role: "user",
      password: hash,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await loginUser({ email: "jeff@example.com", password: "Sup3rSecret!" });
    expect(result.user.id).toBe(2);
  });

  it("throws 401 for a bad password", async () => {
    const hash = await bcrypt.hash("Sup3rSecret!", 4);
    mockRepo.createQueryBuilder().getOne.mockResolvedValue({
      id: 2,
      email: "jeff@example.com",
      password: hash,
      role: "user",
    });
    await expect(
      loginUser({ email: "jeff@example.com", password: "wrong" }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe("user CRUD", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 404 for missing user", async () => {
    mockRepo.findOneBy.mockResolvedValue(null);
    await expect(getUserById(99)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("updates allowed fields", async () => {
    const user = {
      id: 3,
      name: "Old",
      email: "a@example.com",
      role: "user",
      password: "hash",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockRepo.findOneBy.mockResolvedValue(user);
    mockRepo.save.mockResolvedValue({ ...user, name: "New" });

    const updated = await updateUser(3, { name: "New" });
    expect(updated.name).toBe("New");
  });

  it("deletes a user", async () => {
    mockRepo.delete.mockResolvedValue({ affected: 1 });
    await expect(deleteUser(3)).resolves.toBeUndefined();
  });

  it("returns 404 when deleting a missing user", async () => {
    mockRepo.delete.mockResolvedValue({ affected: 0 });
    await expect(deleteUser(99)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("lists users", async () => {
    mockRepo.find.mockResolvedValue([
      { id: 1, name: "A", email: "a@example.com", role: "user", createdAt: new Date(), updatedAt: new Date() },
    ]);
    const users = await listUsers();
    expect(users[0]).toMatchObject({ id: 1, name: "A" });
  });
});
