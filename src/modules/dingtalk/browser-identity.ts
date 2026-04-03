type DingTalkUserProfile = {
  emplId?: string;
  staffId?: string;
  userId?: string;
  userid?: string;
};

type DingTalkUserGetOptions = {
  corpId?: string;
  onSuccess?: (payload: DingTalkUserProfile) => void;
  onFail?: (error: unknown) => void;
};

type DingTalkAuthCodePayload = {
  code?: string;
  authCode?: string;
};

type DingTalkRequestAuthCodeOptions = {
  corpId?: string;
  clientId?: string;
  onSuccess?: (payload: DingTalkAuthCodePayload) => void;
  onFail?: (error: unknown) => void;
};

type DingTalkBridge = {
  ready?: (callback: () => void) => void;
  error?: (callback: (error: unknown) => void) => void;
  requestAuthCode?: (options: DingTalkRequestAuthCodeOptions) => void;
  runtime?: {
    permission?: {
      requestAuthCode?: (options: DingTalkRequestAuthCodeOptions) => void;
    };
  };
  biz?: {
    user?: {
      get?: (options: DingTalkUserGetOptions) => void;
    };
  };
};

type DingTalkBrowserWindow = Window & {
  dd?: DingTalkBridge;
  DingTalkPC?: DingTalkBridge;
};

const DINGTALK_JSAPI_SCRIPT_URL =
  "https://g.alicdn.com/dingding/dingtalk-jsapi/3.0.25/dingtalk.open.js";

let bridgeScriptPromise: Promise<void> | null = null;

export type ResolvedDingTalkSenderIdentity = {
  senderStaffId?: string;
  source:
    | "query"
    | "dd.biz.user.get"
    | "DingTalkPC.biz.user.get"
    | "dd.runtime.permission.requestAuthCode"
    | "DingTalkPC.runtime.permission.requestAuthCode"
    | "unavailable";
  diagnostics?: {
    corpIdProvided: boolean;
    queryHasSenderStaffId: boolean;
    isDingTalkUa: boolean;
    hasDdBridge: boolean;
    hasDingTalkPCBridge: boolean;
    hasDdUserGet: boolean;
    hasPcUserGet: boolean;
    hasDdRequestAuthCode: boolean;
    hasPcRequestAuthCode: boolean;
    scriptLoadAttempted: boolean;
    scriptLoadSucceeded: boolean;
    authCodeAttempted: boolean;
    authCodeResolved: boolean;
  };
};

function normalizeSenderStaffId(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function extractSenderStaffId(profile?: DingTalkUserProfile) {
  return (
    normalizeSenderStaffId(profile?.emplId) ||
    normalizeSenderStaffId(profile?.staffId) ||
    normalizeSenderStaffId(profile?.userId) ||
    normalizeSenderStaffId(profile?.userid)
  );
}

function readSenderStaffIdFromQuery(search: string) {
  const params = new URLSearchParams(search);

  return (
    normalizeSenderStaffId(params.get("senderStaffId")) ||
    normalizeSenderStaffId(params.get("staffId")) ||
    normalizeSenderStaffId(params.get("userId")) ||
    normalizeSenderStaffId(params.get("userid")) ||
    normalizeSenderStaffId(params.get("emplId"))
  );
}

function isDingTalkUserAgent(userAgent: string | undefined) {
  return /dingtalk/i.test(userAgent ?? "");
}

function collectBridgeDiagnostics(
  win: DingTalkBrowserWindow,
  input?: Partial<ResolvedDingTalkSenderIdentity["diagnostics"]>,
) {
  return {
    corpIdProvided: false,
    queryHasSenderStaffId: false,
    isDingTalkUa: isDingTalkUserAgent(win.navigator?.userAgent),
    hasDdBridge: Boolean(win.dd),
    hasDingTalkPCBridge: Boolean(win.DingTalkPC),
    hasDdUserGet: Boolean(win.dd?.biz?.user?.get),
    hasPcUserGet: Boolean(win.DingTalkPC?.biz?.user?.get),
    hasDdRequestAuthCode: Boolean(win.dd?.runtime?.permission?.requestAuthCode),
    hasPcRequestAuthCode: Boolean(
      win.DingTalkPC?.runtime?.permission?.requestAuthCode,
    ),
    scriptLoadAttempted: false,
    scriptLoadSucceeded: false,
    authCodeAttempted: false,
    authCodeResolved: false,
    ...input,
  };
}

function loadBridgeScript(win: DingTalkBrowserWindow) {
  if (bridgeScriptPromise) {
    return bridgeScriptPromise;
  }

  bridgeScriptPromise = new Promise<void>((resolve, reject) => {
    const existingScript = win.document.querySelector<HTMLScriptElement>(
      `script[src="${DINGTALK_JSAPI_SCRIPT_URL}"]`,
    );

    if (existingScript) {
      if (win.dd || win.DingTalkPC) {
        resolve();
        return;
      }

      existingScript.addEventListener("load", () => resolve(), {
        once: true,
      });
      existingScript.addEventListener(
        "error",
        () => reject(new Error("load dingtalk jsapi failed")),
        {
          once: true,
        },
      );
      return;
    }

    const script = win.document.createElement("script");
    script.src = DINGTALK_JSAPI_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("load dingtalk jsapi failed"));
    win.document.head.appendChild(script);
  });

  return bridgeScriptPromise;
}

function waitForBridgeReady(bridge: DingTalkBridge, timeoutMs: number) {
  const ready = bridge.ready;

  if (!ready) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    let settled = false;

    const finish = () => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      resolve();
    };

    const timer = window.setTimeout(finish, timeoutMs);

    try {
      ready(finish);
    } catch {
      finish();
    }

    const onError = bridge.error;

    if (onError) {
      try {
        onError(() => finish());
      } catch {
        finish();
      }
    }
  });
}

function requestSenderStaffId(input: {
  bridge: DingTalkBridge;
  corpId?: string;
}) {
  return new Promise<string | undefined>((resolve) => {
    const getUser = input.bridge.biz?.user?.get;

    if (!getUser) {
      resolve(undefined);
      return;
    }

    try {
      getUser({
        ...(input.corpId ? { corpId: input.corpId } : {}),
        onSuccess(payload) {
          resolve(extractSenderStaffId(payload));
        },
        onFail() {
          resolve(undefined);
        },
      });
    } catch {
      resolve(undefined);
    }
  });
}

function requestAuthCode(input: {
  bridge: DingTalkBridge;
  corpId: string;
  clientId?: string;
}) {
  return new Promise<string | undefined>((resolve) => {
    // Prefer top-level dd.requestAuthCode (JSAPI 3.x, returns OAuth2 code)
    // over dd.runtime.permission.requestAuthCode (legacy, returns old-style code)
    const requestCode =
      input.bridge.requestAuthCode ??
      input.bridge.runtime?.permission?.requestAuthCode;

    if (!requestCode) {
      resolve(undefined);
      return;
    }

    try {
      requestCode({
        corpId: input.corpId,
        ...(input.clientId ? { clientId: input.clientId } : {}),
        onSuccess(payload) {
          resolve(
            normalizeSenderStaffId(payload.code) ||
              normalizeSenderStaffId(payload.authCode),
          );
        },
        onFail() {
          resolve(undefined);
        },
      });
    } catch {
      resolve(undefined);
    }
  });
}

export async function resolveDingTalkSenderIdentity(
  win: DingTalkBrowserWindow,
  options?: {
    corpId?: string;
    clientId?: string;
    readyTimeoutMs?: number;
    loadBridgeScript?: (win: DingTalkBrowserWindow) => Promise<void>;
    resolveUserIdFromAuthCode?: (
      authCode: string,
    ) => Promise<string | undefined>;
  },
): Promise<ResolvedDingTalkSenderIdentity> {
  const senderStaffIdFromQuery = readSenderStaffIdFromQuery(win.location.search);
  let diagnostics = collectBridgeDiagnostics(win, {
    corpIdProvided: Boolean(options?.corpId),
    queryHasSenderStaffId: Boolean(senderStaffIdFromQuery),
  });

  if (senderStaffIdFromQuery) {
    return {
      senderStaffId: senderStaffIdFromQuery,
      source: "query",
      diagnostics,
    };
  }

  if (!win.dd && !win.DingTalkPC && diagnostics.isDingTalkUa) {
    diagnostics = collectBridgeDiagnostics(win, {
      ...diagnostics,
      scriptLoadAttempted: true,
    });

    try {
      const loadScript = options?.loadBridgeScript ?? loadBridgeScript;
      await loadScript(win);
    } catch {
      // Ignore bridge load errors and fall back to diagnostics-driven unavailable result.
    }

    diagnostics = collectBridgeDiagnostics(win, {
      ...diagnostics,
      scriptLoadSucceeded: Boolean(win.dd || win.DingTalkPC),
    });
  }

  const bridges: Array<{
    bridge?: DingTalkBridge;
    source: "dd.biz.user.get" | "DingTalkPC.biz.user.get";
    authSource:
      | "dd.runtime.permission.requestAuthCode"
      | "DingTalkPC.runtime.permission.requestAuthCode";
  }> = [
    {
      bridge: win.dd,
      source: "dd.biz.user.get",
      authSource: "dd.runtime.permission.requestAuthCode",
    },
    {
      bridge: win.DingTalkPC,
      source: "DingTalkPC.biz.user.get",
      authSource: "DingTalkPC.runtime.permission.requestAuthCode",
    },
  ];

  for (const candidate of bridges) {
    if (!candidate.bridge?.biz?.user?.get) {
      continue;
    }

    await waitForBridgeReady(candidate.bridge, options?.readyTimeoutMs ?? 1200);

    const senderStaffId = await requestSenderStaffId({
      bridge: candidate.bridge,
      corpId: options?.corpId,
    });

    if (senderStaffId) {
      return {
        senderStaffId,
        source: candidate.source,
        diagnostics,
      };
    }
  }

  if (options?.corpId && options.resolveUserIdFromAuthCode) {
    for (const candidate of bridges) {
      if (
        !candidate.bridge?.requestAuthCode &&
        !candidate.bridge?.runtime?.permission?.requestAuthCode
      ) {
        continue;
      }

      diagnostics.authCodeAttempted = true;

      await waitForBridgeReady(candidate.bridge, options.readyTimeoutMs ?? 1200);

      const authCode = await requestAuthCode({
        bridge: candidate.bridge,
        corpId: options.corpId,
        clientId: options.clientId,
      });

      if (!authCode) {
        continue;
      }

      const senderStaffId = await options
        .resolveUserIdFromAuthCode(authCode)
        .catch(() => undefined);

      if (senderStaffId) {
        diagnostics.authCodeResolved = true;
        return {
          senderStaffId,
          source: candidate.authSource,
          diagnostics,
        };
      }
    }
  }

  return {
    senderStaffId: undefined,
    source: "unavailable",
    diagnostics,
  };
}
