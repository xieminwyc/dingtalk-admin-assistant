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

  it("normalizes the current user id from dd.biz.user.get", async () => {
    const ready = vi.fn((callback: () => void) => callback());
    const get = vi.fn(
      ({
        onSuccess,
      }: {
        onSuccess?: (payload: { emplId?: string }) => void;
      }) => onSuccess?.({ emplId: "0215084121561138029" }),
    );

    const result = await resolveDingTalkSenderIdentity({
      location: {
        search: "",
      },
      dd: {
        ready,
        biz: {
          user: {
            get,
          },
        },
      },
    } as Window);

    expect(ready).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledTimes(1);
    expect(result).toEqual(
      expect.objectContaining({
      senderStaffId: "0215084121561138029",
      source: "dd.biz.user.get",
      }),
    );
  });

  it("falls back to requestAuthCode when biz.user.get is unavailable", async () => {
    const ready = vi.fn((callback: () => void) => callback());
    const requestAuthCode = vi.fn(
      ({
        onSuccess,
      }: {
        onSuccess?: (payload: { code?: string }) => void;
      }) => onSuccess?.({ code: "auth-code-1" }),
    );
    const resolveUserIdFromAuthCode = vi.fn(async (authCode: string) =>
      authCode === "auth-code-1" ? "0215084121561138029" : undefined,
    );

    const result = await resolveDingTalkSenderIdentity(
      {
        location: {
          search: "",
        },
        dd: {
          ready,
          runtime: {
            permission: {
              requestAuthCode,
            },
          },
        },
      } as Window,
      {
        corpId: "dingcorp-test",
        resolveUserIdFromAuthCode,
      },
    );

    expect(ready).toHaveBeenCalledTimes(1);
    expect(requestAuthCode).toHaveBeenCalledWith(
      expect.objectContaining({
        corpId: "dingcorp-test",
      }),
    );
    expect(resolveUserIdFromAuthCode).toHaveBeenCalledWith("auth-code-1");
    expect(result).toEqual(
      expect.objectContaining({
      senderStaffId: "0215084121561138029",
      source: "dd.runtime.permission.requestAuthCode",
      }),
    );
  });

  it("loads the DingTalk JSAPI bridge before requesting authCode when bridge is absent", async () => {
    const ready = vi.fn((callback: () => void) => callback());
    const requestAuthCode = vi.fn(
      ({
        onSuccess,
      }: {
        onSuccess?: (payload: { code?: string }) => void;
      }) => onSuccess?.({ code: "auth-code-2" }),
    );
    const loadBridgeScript = vi.fn(async (win: Window) => {
      Object.assign(win, {
        dd: {
          ready,
          runtime: {
            permission: {
              requestAuthCode,
            },
          },
        },
      });
    });
    const resolveUserIdFromAuthCode = vi.fn(async () => "0215084121561138030");

    const result = await resolveDingTalkSenderIdentity(
      {
        location: {
          search: "",
        },
        navigator: {
          userAgent: "DingTalk/7.6.10",
        },
      } as Window,
      {
        corpId: "dingcorp-test",
        loadBridgeScript,
        resolveUserIdFromAuthCode,
      },
    );

    expect(loadBridgeScript).toHaveBeenCalledTimes(1);
    expect(requestAuthCode).toHaveBeenCalledTimes(1);
    expect(result).toEqual(
      expect.objectContaining({
        senderStaffId: "0215084121561138030",
        source: "dd.runtime.permission.requestAuthCode",
        diagnostics: expect.objectContaining({
          isDingTalkUa: true,
          scriptLoadAttempted: true,
          scriptLoadSucceeded: true,
        }),
      }),
    );
  });
});
