import { NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { BaselineController } from "./baseline.controller.js";
import type { BaselineService } from "./baseline.service.js";

const user = { id: "user_1" };

describe("BaselineController", () => {
  it("returns an explicit 404 when no baseline exists", async () => {
    const controller = new BaselineController({
      getCurrent: async () => null,
    } as unknown as BaselineService);

    await expect(controller.getCurrent(user)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("returns the active baseline when present", async () => {
    const baseline = { id: "baseline_1", userId: user.id, version: 3 };
    const controller = new BaselineController({
      getCurrent: async () => baseline,
    } as unknown as BaselineService);

    await expect(controller.getCurrent(user)).resolves.toBe(baseline);
  });
});
