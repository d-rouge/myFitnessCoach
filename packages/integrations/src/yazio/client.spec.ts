import { describe, expect, it, vi } from "vitest";
import { RateLimitedError } from "../errors";
import { YazioClient } from "./client";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const tokenResponse = () =>
  jsonResponse({
    access_token: "yazio-token",
    expires_in: 172_800,
    refresh_token: "yazio-refresh",
    token_type: "bearer",
  });

const summaryResponse = () => jsonResponse({ steps: 9000, water_intake: 1500 });

describe("YazioClient", () => {
  it("logs in and fetches the daily summary", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(summaryResponse());

    const client = new YazioClient({
      credentials: { email: "user@example.com", password: "secret" },
      fetchImpl: fetchMock,
    });

    await expect(client.getDailySummary("2026-10-25")).resolves.toEqual({
      steps: 9000,
      water_intake: 1500,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const tokenCall = fetchMock.mock.calls[0];
    if (!tokenCall?.[0] || !tokenCall[1]) throw new Error("missing token call");
    expect(tokenCall[0]).toBe("https://yzapi.yazio.com/v15/oauth/token");
    expect(String(tokenCall[1].body)).toContain("grant_type=password");
    expect(String(tokenCall[1].body)).toContain("username=user%40example.com");

    const summaryCall = fetchMock.mock.calls[1];
    if (!summaryCall?.[0] || !summaryCall[1]) throw new Error("missing summary call");
    expect(summaryCall[0]).toContain("/v15/user/widgets/daily-summary?date=2026-10-25");
    expect((summaryCall[1].headers as Record<string, string>).Authorization).toBe(
      "Bearer yazio-token",
    );
  });

  it("falls back to v20 when v15 is unavailable", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("not found", { status: 404 }))
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(summaryResponse());

    const client = new YazioClient({
      credentials: { email: "user@example.com", password: "secret" },
      fetchImpl: fetchMock,
    });

    await client.getDailySummary("2026-10-25");

    expect(client.getBaseUrl()).toBe("https://yzapi.yazio.com/v20");
    const summaryCall = fetchMock.mock.calls[2];
    expect(summaryCall?.[0]).toContain("https://yzapi.yazio.com/v20/user/widgets/daily-summary");
  });

  it("refreshes on 401", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response("unauthorized", { status: 401 }))
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(summaryResponse());

    const client = new YazioClient({
      credentials: { email: "user@example.com", password: "secret" },
      fetchImpl: fetchMock,
    });

    await expect(client.getDailySummary("2026-10-25")).resolves.toEqual({
      steps: 9000,
      water_intake: 1500,
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("maps 429 to RateLimitedError", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        new Response("too many requests", {
          status: 429,
          headers: { "retry-after": "60" },
        }),
      );

    const client = new YazioClient({
      credentials: { email: "user@example.com", password: "secret" },
      fetchImpl: fetchMock,
    });

    await expect(client.getDailySummary("2026-10-25")).rejects.toBeInstanceOf(RateLimitedError);
  });

  it("reports health without leaking credentials", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(jsonResponse({ email: "user@example.com" }));

    const client = new YazioClient({
      credentials: { email: "user@example.com", password: "secret" },
      fetchImpl: fetchMock,
    });

    const health = await client.healthCheck();

    expect(health.ok).toBe(true);
    expect(health.baseUrl).toContain("yazio.com");
    expect(JSON.stringify(health)).not.toContain("secret");
  });
});
