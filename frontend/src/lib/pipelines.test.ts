import { describe, expect, it, vi, beforeEach } from "vitest";

import { fetchPipelines, STATIC_PIPELINES } from "@/lib/pipelines";

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
  },
}));

describe("fetchPipelines", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns API pipelines when available", async () => {
    const { api } = await import("@/lib/api");
    vi.mocked(api.get).mockResolvedValue([STATIC_PIPELINES[0]]);

    const result = await fetchPipelines();

    expect(result.source).toBe("api");
    expect(result.pipelines).toHaveLength(1);
    expect(result.error).toBeUndefined();
  });

  it("falls back to static catalog with error on API failure", async () => {
    const { api } = await import("@/lib/api");
    vi.mocked(api.get).mockRejectedValue(new Error("Network down"));

    const result = await fetchPipelines();

    expect(result.source).toBe("static");
    expect(result.pipelines).toEqual(STATIC_PIPELINES);
    expect(result.error).toContain("Network down");
  });
});
