import { describe, expect, it } from "vitest";
import { uuidv7 } from "./ids";

describe("uuidv7", () => {
  it("generates a RFC 9562 v7 UUID", () => {
    const id = uuidv7(1_700_000_000_000);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("sorts lexicographically by timestamp", () => {
    const first = uuidv7(1_700_000_000_000);
    const second = uuidv7(1_700_000_001_000);
    expect(first < second).toBe(true);
  });
});
