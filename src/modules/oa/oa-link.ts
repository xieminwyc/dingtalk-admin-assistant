// 生成钉钉审批发起页的链接。
// 使用 aflow.dingtalk.com 网页地址 + hash 路由 (#/custom?processCode=xxx) 直接打开指定审批表单。
// 钉钉客户端内通过 dingtalk:// deeplink 包裹（app_id=-4 = OA审批应用），
// 确保在工作台容器中打开而非外部浏览器。
//
// processCode 获取方式：
//   钉钉 OA 审批后台 → 审批模板 → 打开对应模板编辑页 → URL 中的 processCode 参数

export type OaLinkInput = {
  processCode: string;
  corpId: string;
};

// aflow 内页 URL（hash 路由指定具体审批模板）。
function buildAflowFormUrl(input: OaLinkInput): string {
  const query = new URLSearchParams({
    backcontrol: "false",
    corpid: input.corpId,
    dd_progress: "false",
    dd_share: "false",
    ddtab: "true",
    showmenu: "false",
  });

  return `https://aflow.dingtalk.com/dingtalk/mobile/homepage.htm?${query.toString()}#/custom?pcredirect=self&processCode=${encodeURIComponent(input.processCode)}`;
}

// 生成指定审批模板的 dingtalk:// deeplink，在钉钉客户端中直接打开审批表单。
export function buildOaApprovalLink(input: OaLinkInput): string {
  const aflowUrl = buildAflowFormUrl(input);

  const params = new URLSearchParams({
    app_id: "-4",
    container_type: "work_platform",
    corpid: input.corpId,
    ddtab: "true",
    redirect_type: "jump",
    redirect_url: aflowUrl,
  });

  return `dingtalk://dingtalkclient/action/openapp?${params.toString()}`;
}

// 审批首页（无指定模板时的兜底）。
export function buildOaHomeLink(corpId: string): string {
  const params = new URLSearchParams({ corpid: corpId });
  return `https://aflow.dingtalk.com/dingtalk/mobile/homepage.htm?${params.toString()}`;
}

// 当 corpId 未配置时返回 null，调用方降级为显示 fallbackContact 提示。
export function tryBuildOaApprovalLink(input: {
  processCode?: string;
  corpId?: string;
}): string | null {
  if (!input.corpId) {
    return null;
  }

  if (input.processCode) {
    return buildOaApprovalLink({
      processCode: input.processCode,
      corpId: input.corpId,
    });
  }

  return buildOaHomeLink(input.corpId);
}
