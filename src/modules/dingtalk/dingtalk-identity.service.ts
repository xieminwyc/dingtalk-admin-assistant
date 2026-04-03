type DingTalkOldAccessTokenResponse = {
  access_token?: string;
  errcode?: number;
  errmsg?: string;
};

type DingTalkOAuth2TokenResponse = {
  accessToken?: string;
  refreshToken?: string;
  expireIn?: number;
};

type DingTalkUserMeResponse = {
  nick?: string;
  unionId?: string;
  openId?: string;
};

type DingTalkGetByUnionIdResponse = {
  result?: {
    userid?: string;
  };
  errcode?: number;
  errmsg?: string;
};

type DingTalkIdentityApiPort = {
  getAccessToken(appKey: string, appSecret: string): Promise<string>;
  getUserAccessTokenV2(
    clientId: string,
    clientSecret: string,
    code: string,
  ): Promise<string | undefined>;
  getUserUnionIdV2(userAccessToken: string): Promise<string | undefined>;
  getUserIdByUnionId(
    accessToken: string,
    unionId: string,
  ): Promise<string | undefined>;
};

export function createDingTalkIdentityApi(
  fetchImpl: typeof fetch = fetch,
): DingTalkIdentityApiPort {
  return {
    async getAccessToken(appKey, appSecret) {
      // The old oapi.dingtalk.com/gettoken endpoint returns an access_token
      // required by topapi/user/getbyunionid (the last step of the V2 flow).
      const url = new URL("https://oapi.dingtalk.com/gettoken");
      url.searchParams.set("appkey", appKey);
      url.searchParams.set("appsecret", appSecret);

      const response = await fetchImpl(url.toString(), { method: "GET" });

      if (!response.ok) {
        throw new Error(`getAccessToken failed: ${response.status}`);
      }

      const data = (await response.json()) as DingTalkOldAccessTokenResponse;

      if (data.errcode && data.errcode !== 0) {
        throw new Error(
          `getAccessToken business error: errcode=${data.errcode}, errmsg=${data.errmsg ?? "unknown"}`,
        );
      }

      if (!data.access_token) {
        throw new Error("getAccessToken: missing access_token in response");
      }

      return data.access_token;
    },

    async getUserAccessTokenV2(clientId, clientSecret, code) {
      console.info("[identity-api] getUserAccessTokenV2", {
        codeLength: code.length,
        codePrefix: code.slice(0, 8),
      });

      const response = await fetchImpl(
        "https://api.dingtalk.com/v1.0/oauth2/userAccessToken",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId,
            clientSecret,
            code,
            grantType: "authorization_code",
          }),
        },
      );

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        console.warn(
          "[identity-api] getUserAccessTokenV2 http failed:",
          response.status,
          errorBody,
        );
        return undefined;
      }

      const data = (await response.json()) as DingTalkOAuth2TokenResponse;

      if (!data.accessToken) {
        console.warn(
          "[identity-api] getUserAccessTokenV2: missing accessToken",
        );
        return undefined;
      }

      return data.accessToken;
    },

    async getUserUnionIdV2(userAccessToken) {
      const response = await fetchImpl(
        "https://api.dingtalk.com/v1.0/contact/users/me",
        {
          method: "GET",
          headers: { "x-acs-dingtalk-access-token": userAccessToken },
        },
      );

      if (!response.ok) {
        console.warn(
          "[identity-api] getUserUnionIdV2 http failed:",
          response.status,
        );
        return undefined;
      }

      const data = (await response.json()) as DingTalkUserMeResponse;

      console.info("[identity-api] getUserUnionIdV2", {
        hasUnionId: Boolean(data.unionId),
      });

      return data.unionId;
    },

    async getUserIdByUnionId(accessToken, unionId) {
      const response = await fetchImpl(
        `https://oapi.dingtalk.com/topapi/user/getbyunionid?access_token=${encodeURIComponent(accessToken)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ unionid: unionId }),
        },
      );

      if (!response.ok) {
        console.warn(
          "[identity-api] getUserIdByUnionId http failed:",
          response.status,
        );
        return undefined;
      }

      const data = (await response.json()) as DingTalkGetByUnionIdResponse;

      console.info("[identity-api] getUserIdByUnionId", {
        errcode: data.errcode,
        hasUserid: Boolean(data.result?.userid),
      });

      if (data.errcode && data.errcode !== 0) {
        return undefined;
      }

      return data.result?.userid;
    },
  };
}

/**
 * Resolves a DingTalk userId from an OAuth2 authorization code.
 *
 * Flow: code → userAccessToken → unionId → userId
 *
 * 1. Exchange the OAuth2 `code` (from `login.dingtalk.com/oauth2/auth`
 *    redirect) for a user-level access token via
 *    `api.dingtalk.com/v1.0/oauth2/userAccessToken`.
 * 2. Fetch the user's unionId via `api.dingtalk.com/v1.0/contact/users/me`.
 * 3. Resolve the unionId to a corp-scoped userId via
 *    `oapi.dingtalk.com/topapi/user/getbyunionid` (requires the app's
 *    old-style access_token from `oapi.dingtalk.com/gettoken`).
 */
export function createDingTalkIdentityService(input: {
  clientId: string;
  clientSecret: string;
  api?: DingTalkIdentityApiPort;
}) {
  const api = input.api ?? createDingTalkIdentityApi();

  return {
    async resolveUserIdFromAuthCode(authCode: string) {
      const userAccessToken = await api.getUserAccessTokenV2(
        input.clientId,
        input.clientSecret,
        authCode,
      );

      if (!userAccessToken) {
        return undefined;
      }

      const unionId = await api.getUserUnionIdV2(userAccessToken);

      if (!unionId) {
        return undefined;
      }

      const accessToken = await api.getAccessToken(
        input.clientId,
        input.clientSecret,
      );

      return api.getUserIdByUnionId(accessToken, unionId);
    },
  };
}
