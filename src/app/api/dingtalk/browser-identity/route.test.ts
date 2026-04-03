import { afterEach, describe, expect, it, vi } from "vitest";

async function importFreshRoute() {
  vi.resetModules();
  const routeModule = await import("./route");
  return routeModule.POST;
}

describe("POST /api/dingtalk/browser-identity", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("@/modules/dingtalk/dingtalk-identity.service");
    vi.resetModules();
    delete process.env.DINGTALK_CLIENT_ID;
    delete process.env.DINGTALK_CLIENT_SECRET;
  });

  it("resolves senderStaffId from authCode", async () => {
    process.env.DINGTALK_CLIENT_ID = "ding-app-key";
    process.env.DINGTALK_CLIENT_SECRET = "ding-app-secret";

    const resolveUserIdFromAuthCode = vi.fn().mockResolvedValue(
      "0215084121561138029",
    );

    vi.doMock("@/modules/dingtalk/dingtalk-identity.service", () => ({
      createDingTalkIdentityService: () => ({
        resolveUserIdFromAuthCode,
      }),
    }));

    const post = await importFreshRoute();
    const response = await post(
      new Request("http://localhost/api/dingtalk/browser-identity", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          authCode: "auth-code-1",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      senderStaffId: "0215084121561138029",
    });
    expect(resolveUserIdFromAuthCode).toHaveBeenCalledWith("auth-code-1");
  });
});
