import { authSchemas, productSchemas, userSchemas } from "./index";

describe("authSchemas", () => {
  it("accepts a valid registration payload", () => {
    const result = authSchemas.register.safeParse({
      name: "Jeff Presents",
      email: "JEFF@EXAMPLE.COM",
      password: "Sup3rSecret!",
    });
    expect(result.success).toBe(true);
    // email is trimmed + lowercased by the transform
    expect(result.success && result.data.email).toBe("jeff@example.com");
  });

  it("rejects a short password", () => {
    const result = authSchemas.register.safeParse({
      name: "Jeff",
      email: "jeff@example.com",
      password: "short",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const result = authSchemas.login.safeParse({
      email: "not-an-email",
      password: "password",
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown extra fields (strict)", () => {
    const result = authSchemas.register.safeParse({
      name: "Jeff",
      email: "jeff@example.com",
      password: "Sup3rSecret!",
      role: "admin",
    });
    expect(result.success).toBe(false);
  });
});

describe("userSchemas.update", () => {
  it("rejects an empty update", () => {
    const result = userSchemas.update.safeParse({});
    expect(result.success).toBe(false);
  });

  it("accepts a partial update", () => {
    const result = userSchemas.update.safeParse({ name: "New Name" });
    expect(result.success).toBe(true);
  });
});

describe("productSchemas.create", () => {
  it("coerces string price/stock to numbers", () => {
    const result = productSchemas.create.safeParse({
      name: "Stage Plugin",
      price: "49.99",
      stock: "10",
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.price).toBe(49.99);
    expect(result.success && result.data.stock).toBe(10);
  });

  it("rejects non-positive price", () => {
    const result = productSchemas.create.safeParse({
      name: "Freebie",
      price: 0,
    });
    expect(result.success).toBe(false);
  });
});
