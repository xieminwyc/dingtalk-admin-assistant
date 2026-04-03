import type { ContactDirectoryItem } from "./contact-directory.types";

export const sampleContactDirectory: ContactDirectoryItem[] = [
  {
    id: "contact-finance-expense",
    title: "财务报销与发票问题",
    keywords: ["报销", "费用", "发票", "借款", "付款"],
    contactName: "财务同学",
    team: "财务",
    description: "负责报销退回、发票要求、付款进度等财务问题。",
    actionHint: "联系前建议准备单号、报销金额和退回原因。",
  },
  {
    id: "contact-admin-service",
    title: "行政服务支持",
    keywords: ["行政", "会议室", "办公用品", "访客", "工位"],
    contactName: "行政同学",
    team: "行政服务",
    description: "负责会议室预订、办公用品申领、访客接待等行政支持事项。",
    actionHint: "联系前建议准备申请时间、地点和具体诉求。",
  },
  {
    id: "contact-oa",
    title: "OA 与流程系统支持",
    keywords: ["OA", "流程", "审批", "慧管家", "系统"],
    contactName: "流程系统支持同学",
    team: "信息化支持",
    description: "负责 OA、慧管家和流程系统入口相关问题。",
    actionHint: "优先提供系统名称、截图和报错时间。",
  },
];
