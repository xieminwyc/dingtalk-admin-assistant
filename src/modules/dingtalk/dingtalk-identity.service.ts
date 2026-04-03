type DingTalkAccessTokenResponse = {
  accessToken?: string;
};

type DingTalkAuthCodeResponse = {
  result?: {
    userid?: string;
  };
  errcode?: number;
  errmsg?: string;
};

type DingTalkIdentityApiPort = {
  getAccessToken(clientId: string, clientSecret: string): Promise<string>;
  getUserIdByAuthCode(
    accessToken: string,
    authCode: string,
  ): Promise<string | undefined>;
};

export function createDingTalkIdentityApi(
  fetchImpl: typeof fetch = fetch,
): DingTalkIdentityApiPort {
  return {
    async getAccessToken(clientId, clientSecret) {
      const response = await fetchImpl(
        "https://api.dingtalk.com/v1.0/oauth2/accessToken",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            appKey: clientId,
            appSecret: clientSecret,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`getAccessToken failed: ${response.status}`);
      }

      const data = (await response.json()) as DingTalkAccessTokenResponse;

      if (!data.accessToken) {
        throw new Error("getAccessToken: missing accessToken in response");
      }

      return data.accessToken;
    },

    async getUserIdByAuthCode(accessToken, authCode) {
      console.info("[identity-api] getUserIdByAuthCode called", {
        authCodeLength: authCode.length,
        authCodePrefix: authCode.slice(0, 8),
      });

      const response = await fetchImpl(
        `https://oapi.dingtalk.com/topapi/v2/user/getuserinfo?access_token=${encodeURIComponent(
          accessToken,
        )}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            code: authCode,
          }),
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

      return api.getUserIdByAuthCode(accessToken, authCode);
    },
  };
}
