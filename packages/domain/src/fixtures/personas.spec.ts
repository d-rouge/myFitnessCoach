import { describe, expect, it } from "vitest";
import { assessSafety } from "../rules/safety";
import { BaselineSchema } from "../schemas/baseline";
import { beginnerPersona, intermediatePersona, kneePainPersona } from "./personas";

describe("Personas fixtures and domain validation", () => {
  it("validates beginner persona against BaselineSchema", () => {
    const parsed = BaselineSchema.safeParse(beginnerPersona);
    expect(parsed.success).toBe(true);

    const safety = assessSafety({ anamnesis: beginnerPersona.anamnesis });
    expect(safety.severity).toBe("ok");
    expect(safety.reasons).toHaveLength(0);
  });

  it("validates intermediate persona against BaselineSchema", () => {
    const parsed = BaselineSchema.safeParse(intermediatePersona);
    expect(parsed.success).toBe(true);

    // Resolved injury with 0 pain level should be ok
    const safety = assessSafety({ anamnesis: intermediatePersona.anamnesis });
    expect(safety.severity).toBe("ok");
  });

  it("validates knee pain persona and flags safety caution for active 5/10 injury", () => {
    const parsed = BaselineSchema.safeParse(kneePainPersona);
    expect(parsed.success).toBe(true);

    // Pain level 5 in recovering injury must trigger caution
    const safety = assessSafety({ anamnesis: kneePainPersona.anamnesis });
    expect(safety.severity).toBe("caution");
    expect(safety.reasons.some((r) => r.includes("right_knee"))).toBe(true);
  });
});
