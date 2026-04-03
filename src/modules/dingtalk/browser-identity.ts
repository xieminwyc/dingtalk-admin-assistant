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

const OAUTH2_REDIRECT_ATTEMPTED_KEY = "dt-oauth2-redirect-attempted";

let bridgeScriptPromise: Promise<void> | null = null;

export type ResolvedDingTalkSenderIdentity = {
  senderStaffId?: string;
  source:
    | "query"
    | "dd.biz.user.get"
    | "DingTalkPC.biz.user.get"
    | "dd.runtime.permission.requestAuthCode"
    | "DingTalkPC.runtime.permission.requestAuthCode"
    | "oauth2-redirect"
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
    hasDdTopLevelRequestAuthCode: boolean;
    hasPcTopLevelRequestAuthCode: boolean;
    clientIdProvided: boolean;
    scriptLoadAttempted: boolean;
    scriptLoadSucceeded: boolean;
    authCodeAttempted: boolean;
    authCodeResolved: boolean;
    oauth2CodeFromUrl: boolean;
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
    hasDdTopLevelRequestAuthCode: Boolean(win.dd?.requestAuthCode),
    hasPcTopLevelRequestAuthCode: Boolean(win.DingTalkPC?.requestAuthCode),
    clientIdProvided: false,
    scriptLoadAttempted: false,
    scriptLoadSucceeded: false,
    authCodeAttempted: false,
    authCodeResolved: false,
    oauth2CodeFromUrl: false,
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

function requestAuthCodeFromBridge(
  requestCode: DingTalkBridge["requestAuthCode"],
  options: { corpId: string; clientId?: string },
) {
  return new Promise<string | undefined>((resolve) => {
    if (!requestCode) {
      resolve(undefined);
      return;
    }

    try {
      requestCode({
        corpId: options.corpId,
        clientId: options.clientId,
        onSuccess(payload) {
          resolve(
            normalizeSenderStaffId(payload.authCode) ||
              normalizeSenderStaffId(payload.code),
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

async function requestAuthCode(input: {
  bridge: DingTalkBridge;
  corpId: string;
  clientId?: string;
}): Promise<string | undefined> {
  // 1. Try top-level dd.requestAuthCode with clientId first.
  //    This is the JSAPI 3.x OAuth2 path that returns an OAuth2 authorization_code
  //    compatible with the v1.0/oauth2/userAccessToken endpoint.
  if (input.bridge.requestAuthCode && input.clientId) {
    const code = await requestAuthCodeFromBridge(
      input.bridge.requestAuthCode,
      { corpId: input.corpId, clientId: input.clientId },
    );

    if (code) {
      return code;
    }
  }

  // 2. Fallback to legacy dd.runtime.permission.requestAuthCode (no clientId).
  //    Returns old免登授权码 for topapi/v2/user/getuserinfo.
  return requestAuthCodeFromBridge(
    input.bridge.runtime?.permission?.requestAuthCode,
    { corpId: input.corpId },
  );
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
  const urlParams = new URLSearchParams(win.location.search);
  const oauth2Code =
    normalizeSenderStaffId(urlParams.get("authCode")) ||
    normalizeSenderStaffId(urlParams.get("code"));
  let diagnostics = collectBridgeDiagnostics(win, {
    corpIdProvided: Boolean(options?.corpId),
    clientIdProvided: Boolean(options?.clientId),
    queryHasSenderStaffId: Boolean(senderStaffIdFromQuery),
    oauth2CodeFromUrl: Boolean(oauth2Code),
  });

  if (senderStaffIdFromQuery) {
    return {
      senderStaffId: senderStaffIdFromQuery,
      source: "query",
      diagnostics,
    };
  }

  // Check for OAuth2 redirect code in URL (from DingTalk OAuth2 redirect flow)
  if (oauth2Code && options?.resolveUserIdFromAuthCode) {
    // Clean the code from URL to prevent re-use on refresh
    const cleanUrl = new URL(win.location.href);
    cleanUrl.searchParams.delete("authCode");
    cleanUrl.searchParams.delete("code");
    cleanUrl.searchParams.delete("state");
    win.history.replaceState(null, "", cleanUrl.toString());

    const senderStaffId = await options
      .resolveUserIdFromAuthCode(oauth2Code)
      .catch(() => undefined);

    if (senderStaffId) {
      diagnostics.authCodeResolved = true;
      // Clear the redirect guard so future sessions can redirect again if needed.
      win.sessionStorage?.removeItem(OAUTH2_REDIRECT_ATTEMPTED_KEY);
      return {
        senderStaffId,
        source: "oauth2-redirect",
        diagnostics,
      };
    }
  }

  // If we're in DingTalk, have a clientId, and no OAuth2 code was in the URL,
  // redirect to DingTalk OAuth2 immediately — skip JSAPI entirely because
  // dd.runtime.permission.requestAuthCode returns codes that neither API accepts.
  if (
    options?.clientId &&
    !oauth2Code &&
    !win.sessionStorage?.getItem(OAUTH2_REDIRECT_ATTEMPTED_KEY)
  ) {
    win.sessionStorage?.setItem(OAUTH2_REDIRECT_ATTEMPTED_KEY, "1");

    const redirectUri = win.location.origin + win.location.pathname;
    const authUrl = new URL("https://login.dingtalk.com/oauth2/auth");
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", options.clientId);
    authUrl.searchParams.set("scope", "openid corpid");
    authUrl.searchParams.set("prompt", "consent");

    win.location.href = authUrl.toString();

    return {
      senderStaffId: undefined,
      source: "unavailable",
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

  // Last resort: initiate OAuth2 redirect to get a proper authorization code.
  // Guard with sessionStorage to prevent infinite redirect loops.
  if (
    options?.clientId &&
    !win.sessionStorage?.getItem(OAUTH2_REDIRECT_ATTEMPTED_KEY)
  ) {
    win.sessionStorage?.setItem(OAUTH2_REDIRECT_ATTEMPTED_KEY, "1");

    const redirectUri = win.location.origin + win.location.pathname;
    const authUrl = new URL("https://login.dingtalk.com/oauth2/auth");
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", options.clientId);
    authUrl.searchParams.set("scope", "openid corpid");
    authUrl.searchParams.set("prompt", "consent");

    win.location.href = authUrl.toString();
  }

  return {
    senderStaffId: undefined,
    source: "unavailable",
    diagnostics,
  };
}
