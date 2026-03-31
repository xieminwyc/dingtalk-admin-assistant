export type ContactDirectoryItem = {
  id: string;
  title: string;
  keywords: string[];
  contactName: string;
  // userId 是钉钉企业内的 staffId，填写后可用于代发消息或 OA 审批指定联系人。
  // 对应 sample 数据暂为 undefined，等替换成真实数据时再填写。
  userId?: string;
  team?: string;
  description: string;
  actionHint?: string;
};

export type ContactDirectoryResolveInput = {
  query: string;
};

export type ContactDirectoryResolution = {
  title: string;
  contactName: string;
  userId?: string;
  team?: string;
  description: string;
  actionHint?: string;
};
