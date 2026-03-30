import type { ContactDirectoryItem } from "./contact-directory.types";

export const sampleContactDirectory: ContactDirectoryItem[] = [
  {
    id: "contact-pms-card",
    title: "PMS 制卡问题",
    keywords: ["PMS", "制卡", "门卡", "房卡"],
    contactName: "门店系统支持同学",
    team: "门店系统支持",
    description: "负责 PMS 制卡、门卡权限和房卡相关问题处理。",
    actionHint: "可以先整理门店名称、房号和报错信息再联系。"
  },
  {
    id: "contact-hr",
    title: "人力资源咨询",
    keywords: ["人力资源", "HR", "入职", "离职", "假勤", "社保"],
    contactName: "HR 同学",
    team: "HR",
    description: "负责入转调离、假勤制度和员工福利等问题。",
    actionHint: "联系前建议先准备员工姓名、工号和具体问题。"
  },
  {
    id: "contact-oa",
    title: "OA 与流程系统问题",
    keywords: ["OA", "流程", "表单", "慧管家", "系统"],
    contactName: "流程系统支持同学",
    team: "信息化支持",
    description: "负责 OA、慧管家和流程系统入口相关问题。",
    actionHint: "优先提供系统名称、截图和报错时间。"
  }
];
