import { describe, expect, it, vi } from "vitest";

import { resolveDingTalkSenderIdentity } from "./browser-identity";

describe("resolveDingTalkSenderIdentity", () => {
  it("prefers an explicit sender staff id from the query string", async () => {
    const result = await resolveDingTalkSenderIdentity({
      location: {
        search: "?senderStaffId=0215084121561138029",
      },
    } as Window);

    expect(result).toEqual(
      expect.objectContaining({
        senderStaffId: "0215084121561138029",
        source: "query",
      }),
    );
  });

  it("resolves userId from OAuth2 redirect code in URL", async () => {
    const resolveUserIdFromAuthCode = vi
      .fn()
      .mockResolvedValue("0215084121561138029");

    const win = {
      location: {
        search: "?authCode=oauth2-test-code",
        href: "https://example.com/?authCode=oauth2-test-code",
        origin: "https://example.com",
        pathname: "/",
      },
      history: {
        replaceState: vi.fn(),
      },
      sessionStorage: {
        getItem: vi.fn().mockReturnValue(null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
    } as unknown as Window;

    const result = await resolveDingTalkSenderIdentity(win, {
      clientId: "ding-client-id",
      resolveUserIdFromAuthCode,
    });

    expect(resolveUserIdFromAuthCode).toHaveBeenCalledWith("oauth2-test-code");
    expect(result).toEqual(
      expect.objectContaining({
        senderStaffId: "0215084121561138029",
        source: "oauth2-redirect",
        diagnostics: expect.objectContaining({
          oauth2CodeFromUrl: true,
          authCodeResolved: true,
        }),
      }),
    );
  });

  it("redirects to DingTalk OAuth2 when no code is present and clientId is provided", async () => {
    const win = {
      location: {
        search: "",
        href: "https://example.com/",
        origin: "https://example.com",
        pathname: "/",
      },
      navigator: { userAgent: "DingTalk/7.6.10" },
      sessionStorage: {
        getItem: vi.fn().mockReturnValue(null),
        setItem: vi.fn(),
      },
    } as unknown as Window;

    const result = await resolveDingTalkSenderIdentity(win, {
      clientId: "ding-client-id",
      resolveUserIdFromAuthCode: vi.fn(),
    });

    expect(win.sessionStorage?.setItem).toHaveBeenCalledWith(
      "dt-oauth2-redirect-attempted",
      "1",
    );
    expect(win.location.href).toContain("login.dingtalk.com/oauth2/auth");
    expect(win.location.href).toContain("client_id=ding-client-id");
    expect(result.source).toBe("unavailable");
  });

  it("does not redirect again when sessionStorage guard is set", async () => {
    const win = {
      location: {
        search: "",
        href: "https://example.com/",
        origin: "https://example.com",
        pathname: "/",
      },
      navigator: { userAgent: "DingTalk/7.6.10" },
      sessionStorage: {
        getItem: vi.fn().mockReturnValue("1"),
        setItem: vi.fn(),
      },
    } as unknown as Window;

    const result = await resolveDingTalkSenderIdentity(win, {
      clientId: "ding-client-id",
    });

    expect(win.sessionStorage?.setItem).not.toHaveBeenCalled();
    expect(win.location.href).toBe("https://example.com/");
    expect(result.source).toBe("unavailable");
  });

  it("reuses a cached user id when query and oauth2 code are both absent", async () => {
    const now = 1_700_000_000_000;
    const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(now);
    const win = {
      location: {
        search: "",
        href: "https://example.com/",
        origin: "https://example.com",
        pathname: "/",
      },
      navigator: { userAgent: "Mozilla/5.0" },
      sessionStorage: {
        getItem: vi.fn().mockReturnValue(null),
        setItem: vi.fn(),
      },
      localStorage: {
        getItem: vi.fn().mockReturnValue(
          JSON.stringify({
            userId: "0215084121561138029",
            timestamp: now - 60_000,
          }),
        ),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
    } as unknown as Window;

    const result = await resolveDingTalkSenderIdentity(win, {
      clientId: "ding-client-id",
      resolveUserIdFromAuthCode: vi.fn(),
    });

    expect(result).toEqual(
      expect.objectContaining({
        senderStaffId: "0215084121561138029",
        source: "cache",
        diagnostics: expect.objectContaining({
          authCodeResolved: true,
        }),
      }),
    );
    expect(win.localStorage?.removeItem).not.toHaveBeenCalled();
    dateNowSpy.mockRestore();
  });

  it("drops an expired cached user id before deciding to redirect", async () => {
    const now = 1_700_000_000_000;
    const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(now);
    const win = {
      location: {
        search: "",
        href: "https://example.com/",
        origin: "https://example.com",
        pathname: "/",
      },
      navigator: { userAgent: "DingTalk/7.6.10" },
      sessionStorage: {
        getItem: vi.fn().mockReturnValue(null),
        setItem: vi.fn(),
      },
      localStorage: {
        getItem: vi.fn().mockReturnValue(
          JSON.stringify({
            userId: "0215084121561138029",
            timestamp: now - 24 * 60 * 60 * 1000 - 1,
          }),
        ),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
    } as unknown as Window;

    const result = await resolveDingTalkSenderIdentity(win, {
      clientId: "ding-client-id",
      resolveUserIdFromAuthCode: vi.fn(),
    });

    expect(win.localStorage?.removeItem).toHaveBeenCalledWith(
      "dt-cached-user-id",
    );
    expect(win.sessionStorage?.setItem).toHaveBeenCalledWith(
      "dt-oauth2-redirect-attempted",
      "1",
    );
    expect(result.source).toBe("unavailable");
    dateNowSpy.mockRestore();
  });
});
