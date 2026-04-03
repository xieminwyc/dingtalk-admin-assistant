type DingTalkOldAccessTokenResponse = {
  access_token?: string;
  errcode?: number;
  errmsg?: string;
};

type DingTalkAuthCodeResponse = {
  result?: {
    userid?: string;
  };
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
  getUserIdByAuthCode(
    accessToken: string,
    authCode: string,
  ): Promise<string | undefined>;
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
      // Use the OLD gettoken endpoint — its access_token is required by
      // the old topapi/v2/user/getuserinfo endpoint.
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

    async getUserIdByAuthCode(accessToken, authCode) {
      console.info("[identity-api] getUserIdByAuthCode", {
        authCodeLength: authCode.length,
        authCodePrefix: authCode.slice(0, 8),
      });

      const response = await fetchImpl(
        `https://oapi.dingtalk.com/topapi/v2/user/getuserinfo?access_token=${encodeURIComponent(accessToken)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: authCode }),
        },
      );

      if (!response.ok) {
        throw new Error(`getUserIdByAuthCode failed: ${response.status}`);
      }

      const data = (await response.json()) as DingTalkAuthCodeResponse;

      console.info("[identity-api] getUserIdByAuthCode response", {
        errcode: data.errcode,
        errmsg: data.errmsg,
        hasUserid: Boolean(data.result?.userid),
      });

      if (data.errcode && data.errcode !== 0) {
        throw new Error(
          `getUserIdByAuthCode business error: errcode=${data.errcode}, errmsg=${data.errmsg ?? "unknown"}`,
        );
      }

      return data.result?.userid;
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

export function createDingTalkIdentityService(input: {
  clientId: string;
  clientSecret: string;
  api?: DingTalkIdentityApiPort;
}) {
  const api = input.api ?? createDingTalkIdentityApi();

  return {
    async resolveUserIdFromAuthCode(authCode: string) {
      const accessToken = await api.getAccessToken(
        input.clientId,
        input.clientSecret,
      );

      // 1. Try old endpoint first (topapi/v2/user/getuserinfo).
      try {
        const userId = await api.getUserIdByAuthCode(accessToken, authCode);

        if (userId) {
          return userId;
        }
      } catch (err) {
        console.warn(
          "[identity] old getUserIdByAuthCode failed, trying OAuth2 v2 fallback:",
          err instanceof Error ? err.message : err,
        );
      }

      // 2. Fallback: treat the code as an OAuth2 authorization_code.
      //    Exchange code → userAccessToken → unionId → userId.
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

      return api.getUserIdByUnionId(accessToken, unionId);
    },
  };
}
