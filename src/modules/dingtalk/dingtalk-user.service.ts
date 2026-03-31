// 懒加载策略：用户首次对话时，用 senderId 拉取钉钉用户详情并写入 DB。
// 后续对话直接读 DB，不重复调 API。
// 这样既不需要全量通讯录权限，也不依赖用户主动注册。

export type DingTalkUserRecord = {
  userId: string;
  nick: string | null;
  name: string | null;
  mobile: string | null;
  avatar: string | null;
  email: string | null;
  deptIds: string | null;
};

export type DingTalkUserApiResult = {
  result?: {
    userid?: string;
    name?: string;
    nickname?: string;
    mobile?: string;
    avatar?: string;
    email?: string;
    dept_id_list?: number[];
  };
  errcode?: number;
  errmsg?: string;
};

// DB 操作的最小接口，方便测试时注入 mock。
type UserStore = {
  findUser(userId: string): Promise<DingTalkUserRecord | null>;
  upsertUser(record: DingTalkUserRecord): Promise<void>;
};

// 钉钉 API 的最小接口，方便测试时注入 mock。
type DingTalkApiPort = {
  getAccessToken(clientId: string, clientSecret: string): Promise<string>;
  getUserDetail(
    accessToken: string,
    userId: string,
  ): Promise<DingTalkUserApiResult>;
};

export type DingTalkUserServiceInput = {
  clientId: string;
  clientSecret: string;
  store: UserStore;
  api?: DingTalkApiPort;
};

// 默认的钉钉 API 实现，调真实接口。
export function createDingTalkApi(
  fetchImpl: typeof fetch = fetch,
): DingTalkApiPort {
  return {
    async getAccessToken(clientId, clientSecret) {
      const response = await fetchImpl(
        "https://api.dingtalk.com/v1.0/oauth2/accessToken",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            appKey: clientId,
            appSecret: clientSecret,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`getAccessToken failed: ${response.status}`);
      }

      const data = (await response.json()) as { accessToken?: string };
      if (!data.accessToken) {
        throw new Error("getAccessToken: missing accessToken in response");
      }

      return data.accessToken;
    },

    async getUserDetail(accessToken, userId) {
      const url = `https://oapi.dingtalk.com/topapi/v2/user/get?access_token=${encodeURIComponent(accessToken)}`;
      const response = await fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userid: userId }),
      });

      if (!response.ok) {
        throw new Error(`getUserDetail failed: ${response.status}`);
      }

      return (await response.json()) as DingTalkUserApiResult;
    },
  };
}

export function createDingTalkUserService(input: DingTalkUserServiceInput) {
  const api = input.api ?? createDingTalkApi();

  // 核心方法：确保用户已缓存。
  // 传入 nick（来自消息 payload）作为兜底，即使 API 拉取失败也能保存基本信息。
  async function ensureUser(
    userId: string,
    nick?: string,
  ): Promise<DingTalkUserRecord> {
    const existing = await input.store.findUser(userId);
    if (existing) {
      return existing;
    }

    // DB 里没有，尝试调 API 拉详情。
    let record: DingTalkUserRecord = {
      userId,
      nick: nick ?? null,
      name: null,
      mobile: null,
      avatar: null,
      email: null,
      deptIds: null,
    };

    try {
      const token = await api.getAccessToken(
        input.clientId,
        input.clientSecret,
      );
      const detail = await api.getUserDetail(token, userId);

      if (detail.result) {
        const r = detail.result;
        record = {
          userId,
          nick: r.nickname ?? nick ?? null,
          name: r.name ?? null,
          mobile: r.mobile ?? null,
          avatar: r.avatar ?? null,
          email: r.email ?? null,
          deptIds: r.dept_id_list ? JSON.stringify(r.dept_id_list) : null,
        };
      }
    } catch {
      // API 拉取失败时降级：用 payload 里的 nick 先存一条基础记录。
      // 下次对话时 DB 已有记录，不会再重试 API。若需强制刷新，可另做刷新接口。
    }

    await input.store.upsertUser(record);
    return record;
  }

  return { ensureUser };
}
