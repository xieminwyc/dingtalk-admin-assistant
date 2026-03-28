import type { TaskCatalogItem } from "./task-catalog.types";

export const sampleTaskCatalog: TaskCatalogItem[] = [
  {
    taskType: "leave_application",
    title: "请假申请",
    description: "用于发起请假审批，适合年假、病假、事假等场景。",
    keywords: ["请假", "休假", "年假", "病假", "事假"],
    preparations: ["确认请假日期", "准备请假类型", "提前和直属主管沟通"],
    entryUrl: "https://oa.example.com/tasks/leave-application",
    actionType: "url",
    availability: "available",
    fallbackContact: "HR 同学"
  },
  {
    taskType: "expense_application",
    title: "报销申请",
    description: "用于提交差旅、办公和招待等费用报销。",
    keywords: ["报销", "费用", "发票", "差旅"],
    preparations: ["整理发票凭证", "确认报销金额", "准备审批说明"],
    entryUrl: "https://oa.example.com/tasks/expense-application",
    actionType: "url",
    availability: "available",
    fallbackContact: "财务同学"
  },
  {
    taskType: "meeting_room_booking",
    title: "会议室预约",
    description: "用于预订会议室并提前确认时间、人数和设备。",
    keywords: ["会议室", "预订", "预约", "开会"],
    preparations: ["确认会议时间", "确认参会人数", "准备设备需求"],
    entryUrl: "https://oa.example.com/tasks/meeting-room-booking",
    actionType: "url",
    availability: "available",
    fallbackContact: "行政同学"
  },
  {
    taskType: "permission_access",
    title: "权限开通",
    description: "用于申请系统权限、账号访问和角色变更。",
    keywords: ["权限", "开通", "申请", "账号", "系统"],
    preparations: ["确认系统名称", "确认角色权限", "说明使用原因"],
    entryUrl: "https://oa.example.com/tasks/permission-access",
    actionType: "url",
    availability: "available",
    fallbackContact: "IT 同学"
  }
];
