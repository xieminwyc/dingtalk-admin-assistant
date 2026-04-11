const OAUTH2_REDIRECT_ATTEMPTED_KEY = "dt-oauth2-redirect-attempted";
const CACHED_USER_ID_KEY = "dt-cached-user-id";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export type ResolvedDingTalkSenderIdentity = {
  senderStaffId?: string;
  source: "query" | "oauth2-redirect" | "cache" | "unavailable";
  diagnostics?: {
    clientIdProvided: boolean;
    queryHasSenderStaffId: boolean;
    isDingTalkUa: boolean;
    oauth2CodeFromUrl: boolean;
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

/**
 * Resolve the current DingTalk user's staff ID (userId).
 *
 * ## Flow
 *
 * 1. **Query string** — if `senderStaffId` (or an alias) is already in the
 *    URL, return it immediately. The DingTalk Stream webhook path injects
 *    this when it opens the web UI.
 *
 * 2. **OAuth2 redirect code** — if the URL contains `authCode` or `code`
 *    (returned by `login.dingtalk.com/oauth2/auth`), exchange it for a
 *    userId via the backend V2 flow:
 *    `oauth2/userAccessToken → contact/users/me → topapi/user/getbyunionid`.
 *
 * 3. **Initiate OAuth2 redirect** — if neither of the above matched and a
 *    `clientId` is provided, redirect to DingTalk's OAuth2 authorization
 *    page. A `sessionStorage` guard prevents infinite redirect loops.
 *
 * ## Why not JSAPI?
 *
 * DingTalk's JSAPI `dd.runtime.permission.requestAuthCode` returns
 * temporary auth codes that are rejected by `topapi/v2/user/getuserinfo`
 * with errcode 40078 ("nonexistent temp auth code"). This was verified
 * experimentally — the JSAPI fires and returns a code, but the server-side
 * exchange always fails. The OAuth2 redirect flow is the only working path.
 *
 * ## Prerequisites
 *
 * - The app's **重定向URL（回调域名）** in the DingTalk developer console
 *   (安全设置) must include the deployment origin (e.g.
 *   `https://your-app.vercel.app`).
 * - The app must be published after updating security settings.
 */
export async function resolveDingTalkSenderIdentity(
  win: Window,
  options?: {
    clientId?: string;
    resolveUserIdFromAuthCode?: (
      authCode: string,
    ) => Promise<string | undefined>;
  },
): Promise<ResolvedDingTalkSenderIdentity> {
  const senderStaffIdFromQuery = readSenderStaffIdFromQuery(
    win.location.search,
  );
  const urlParams = new URLSearchParams(win.location.search);
  const oauth2Code =
    normalizeSenderStaffId(urlParams.get("authCode")) ||
    normalizeSenderStaffId(urlParams.get("code"));

  const diagnostics = {
    clientIdProvided: Boolean(options?.clientId),
    queryHasSenderStaffId: Boolean(senderStaffIdFromQuery),
    isDingTalkUa: /dingtalk/i.test(win.navigator?.userAgent ?? ""),
    oauth2CodeFromUrl: Boolean(oauth2Code),
    authCodeResolved: false,
  };

  // 1. Explicit staff ID in query string (injected by Stream webhook).
  if (senderStaffIdFromQuery) {
    // Cache the ID for future use
    try {
      win.localStorage?.setItem(CACHED_USER_ID_KEY, JSON.stringify({
        userId: senderStaffIdFromQuery,
        timestamp: Date.now(),
      }));
    } catch {
      // Ignore localStorage errors
    }
    return {
      senderStaffId: senderStaffIdFromQuery,
      source: "query",
      diagnostics,
    };
  }

  // 2. OAuth2 authorization code from redirect callback.
  if (oauth2Code && options?.resolveUserIdFromAuthCode) {
    // Clean the code from URL to prevent re-use on refresh.
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
      // Clear redirect guard and cache the user ID
      try {
        win.sessionStorage?.removeItem(OAUTH2_REDIRECT_ATTEMPTED_KEY);
        win.localStorage?.setItem(CACHED_USER_ID_KEY, JSON.stringify({
          userId: senderStaffId,
          timestamp: Date.now(),
        }));
      } catch {
        // Ignore storage errors
      }
      return {
        senderStaffId,
        source: "oauth2-redirect",
        diagnostics,
      };
    }
  }

  // 2.5. Check cached user ID from previous successful auth
  try {
    const cached = win.localStorage?.getItem(CACHED_USER_ID_KEY);
    if (cached) {
      const { userId, timestamp } = JSON.parse(cached) as { userId: string; timestamp: number };
      const age = Date.now() - timestamp;
      if (userId && age < CACHE_TTL_MS) {
        return {
          senderStaffId: userId,
          source: "cache",
          diagnostics: { ...diagnostics, authCodeResolved: true },
        };
      }
      // Cache expired, remove it
      win.localStorage?.removeItem(CACHED_USER_ID_KEY);
    }
  } catch {
    // Ignore localStorage errors
  }

  // 3. Initiate OAuth2 redirect to get a proper authorization code.
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
    authUrl.searchParams.set("prompt", "auto");

    win.location.href = authUrl.toString();

    return {
      senderStaffId: undefined,
      source: "unavailable",
      diagnostics,
    };
  }

  return {
    senderStaffId: undefined,
    source: "unavailable",
    diagnostics,
  };
}
