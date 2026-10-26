import { describe, expect, it, vi } from "vitest";
import { RateLimitedError } from "../errors";
import { GarminPersonalClient } from "./personal-client";

const makeJwt = (expiresInSec = 3600) => {
  const payload = Buffer.from(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expiresInSec }),
  ).toString("base64url");
  return `header.${payload}.signature`;
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

// The real endpoint returns a raw JWT (text/plain) and rejects Accept: application/json.
const tokenResponse = () =>
  new Response(makeJwt(), {
    status: 200,
    headers: { "content-type": "text/plain" },
  });

describe("GarminPersonalClient", () => {
  it("exchanges the API key for a bearer token and calls an endpoint", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(jsonResponse({ displayName: "Test" }));

    const client = new GarminPersonalClient({
      apiKey: "test-key",
      fetchImpl: fetchMock,
    });

    await expect(client.getProfileSettings()).resolves.toEqual({ displayName: "Test" });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const tokenCall = fetchMock.mock.calls[0];
    if (!tokenCall?.[0] || !tokenCall[1]) throw new Error("missing token call");
    expect(tokenCall[0]).toContain("/personalapitoken-service/personal-api");
    expect((tokenCall[1].headers as Record<string, string>).Authorization).toBe("ApiKey test-key");
    expect((tokenCall[1].headers as Record<string, string>).Accept).toBeUndefined();

    const dataCall = fetchMock.mock.calls[1];
    if (!dataCall?.[0] || !dataCall[1]) throw new Error("missing data call");
    expect(dataCall[0]).toContain("/userprofile-service/userprofile/settings");
    expect((dataCall[1].headers as Record<string, string>).Authorization).toMatch(/^Bearer /);
  });

  it("also accepts a JSON token response", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ access_token: makeJwt(), token_type: "bearer", expires_in: 86_400 }),
      )
      .mockResolvedValueOnce(jsonResponse({ displayName: "Json" }));

    const client = new GarminPersonalClient({
      apiKey: "test-key",
      fetchImpl: fetchMock,
    });

    await expect(client.getProfileSettings()).resolves.toEqual({ displayName: "Json" });
  });

  it("caches the token across calls", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse())
      .mockImplementation(async () => jsonResponse({ ok: true }));

    const client = new GarminPersonalClient({
      apiKey: "test-key",
      fetchImpl: fetchMock,
    });

    await client.getProfileSettings();
    await client.getProfileSettings();

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("refreshes the token once on 401", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(jsonResponse({ error: "expired" }, 401))
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(jsonResponse({ displayName: "Retry" }));

    const client = new GarminPersonalClient({
      apiKey: "test-key",
      fetchImpl: fetchMock,
    });

    await expect(client.getProfileSettings()).resolves.toEqual({ displayName: "Retry" });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("downloads an activity ZIP without an Accept header", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        new Response(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), { status: 200 }),
      );

    const client = new GarminPersonalClient({
      apiKey: "test-key",
      fetchImpl: fetchMock,
    });

    const zip = await client.downloadActivity(123);
    expect(zip.byteLength).toBe(4);

    const downloadCall = fetchMock.mock.calls[1];
    if (!downloadCall?.[0] || !downloadCall[1]) throw new Error("missing download call");
    expect(downloadCall[0]).toContain("/download-service/files/activity/123");
    expect((downloadCall[1].headers as Record<string, string>).Accept).toBeUndefined();
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

    const client = new GarminPersonalClient({
      apiKey: "test-key",
      fetchImpl: fetchMock,
    });

    await expect(client.getProfileSettings()).rejects.toBeInstanceOf(RateLimitedError);
  });

  it("reports a failed health check instead of throwing", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("unauthorized", { status: 401 }));

    const client = new GarminPersonalClient({
      apiKey: "bad-key",
      fetchImpl: fetchMock,
    });

    const health = await client.healthCheck();

    expect(health.ok).toBe(false);
    expect(health.error).toMatch(/authentication/i);
  });
});
