import { describe, it, expect } from "vitest";
import { ApiError } from "@/api/client";

describe("ApiError", () => {
  it("has the right name, message and status", () => {
    const err = new ApiError(404, "Not Found");
    expect(err.name).toBe("ApiError");
    expect(err.message).toBe("Not Found");
    expect(err.status).toBe(404);
    expect(err instanceof Error).toBe(true);
    expect(err instanceof ApiError).toBe(true);
  });
});
