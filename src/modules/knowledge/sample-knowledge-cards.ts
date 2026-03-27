import type { KnowledgeCard } from "./knowledge-card.types";

export const sampleKnowledgeCards: KnowledgeCard[] = [
  {
    id: "card-hr-annual-leave",
    title: "年假规则",
    content: "年假天数按司龄计算，试用期不单独享有年假，具体以 HR 制度公告为准。",
    department: "HR",
    keywords: ["年假", "休假", "司龄", "请假"],
    scope: "适用于正式员工年假政策查询"
  },
  {
    id: "card-admin-meeting-room",
    title: "会议室预订",
    content: "进入行政服务台提交会议室预订申请，填写时间、人数和设备需求后等待确认。",
    department: "行政",
    keywords: ["会议室", "预订", "预约", "开会"],
    scope: "适用于办公室会议室使用申请"
  },
  {
    id: "card-it-access",
    title: "权限申请说明",
    content: "通过 IT 服务门户提交权限申请，注明系统名称、角色和使用原因，由系统负责人审批。",
    department: "IT",
    keywords: ["权限", "申请", "开通", "系统"],
    scope: "适用于办公系统权限开通与变更"
  }
];
