type DingTalkAccessTokenResponse = {
  accessToken?: string;
};

type DingTalkUserTokenResponse = {
  accessToken?: string;
  error?: string;
};

type DingTalkContactUserResponse = {
  userid?: string;
  nick?: string;
  unionId?: string;
};

type DingTalkIdentityApiPort = {
  getAccessToken(clientId: string, clientSecret: string): Promise<string>;
  getUserIdByAuthCode(
    clientId: string,
    clientSecret: string,
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

    async getUserIdByAuthCode(clientId, clientSecret, authCode) {
      // Step 1: Exchange authCode for user access token via OAuth2
      const tokenResponse = await fetchImpl(
        "https://api.dingtalk.com/v1.0/oauth2/userAccessToken",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            clientId,
            clientSecret,
            code: authCode,
            grantType: "authorization_code",
          }),
        },
      );

      if (!tokenResponse.ok) {
        const text = await tokenResponse.text();
        throw new Error(
          `getUserIdByAuthCode userAccessToken failed: ${tokenResponse.status} ${text}`,
        );
      }

      const tokenData =
        (await tokenResponse.json()) as DingTalkUserTokenResponse;

      if (!tokenData.accessToken) {
        throw new Error(
          `getUserIdByAuthCode: missing accessToken in userAccessToken response`,
        );
      }

      // Step 2: Use user access token to get user info
      const userResponse = await fetchImpl(
        "https://api.dingtalk.com/v1.0/contact/users/me",
        {
          method: "GET",
          headers: {
            "x-acs-dingtalk-access-token": tokenData.accessToken,
          },
        },
      );

      if (!userResponse.ok) {
        const text = await userResponse.text();
        throw new Error(
          `getUserIdByAuthCode contact/users/me failed: ${userResponse.status} ${text}`,
        );
      }

      const userData =
        (await userResponse.json()) as DingTalkContactUserResponse;

      return userData.userid;
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
      return api.getUserIdByAuthCode(
        input.clientId,
        input.clientSecret,
        authCode,
      );
    },
  };
}
