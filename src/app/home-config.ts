import type { EntryMode } from "@/modules/assistant/entry-mode.types";

export type QuickTag = {
  label: string;
  fillText: string;
};

export type HomeEntryCard = {
  title: string;
  description: string;
  helper: string;
  exampleQuestion: string;
  entryMode: EntryMode;
  placeholder: string;
  quickTags: QuickTag[];
};

export const homeEntryCards: HomeEntryCard[] = [
  {
    title: "找制度",
    description: "问制度、问政策",
    helper: "快速定位制度依据",
    exampleQuestion: "雅斯特美途酒店工程验收结果如何？",
    entryMode: "knowledge",
    placeholder: "请输入制度名、政策关键词，AI 为你深度解读...",
    quickTags: [
      { label: "考勤", fillText: "考勤相关制度是什么？" },
      { label: "请假", fillText: "请假相关制度是什么？" },
      { label: "年终奖", fillText: "年终奖相关制度是什么？" },
      { label: "绩效", fillText: "绩效考核制度是什么？" },
      { label: "福利", fillText: "员工福利有哪些？" },
    ],
  },
  {
    title: "找对接人",
    description: "问业务对接人",
    helper: "快速找到负责同事",
    exampleQuestion: "PMS制卡问题应该找谁处理？",
    entryMode: "contact",
    placeholder: "请输入业务场景或问题，AI 帮你找到对接人...",
    quickTags: [
      { label: "PMS制卡", fillText: "PMS制卡问题应该找谁？" },
      { label: "人力资源", fillText: "人力资源相关咨询找谁？" },
      { label: "OA流程", fillText: "OA流程问题应该找谁？" },
      { label: "IT支持", fillText: "IT支持找谁处理？" },
    ],
  },
  {
    title: "找流程",
    description: "问流程、问系统",
    helper: "直接带你去入口",
    exampleQuestion: "帮我打开慧管家",
    entryMode: "task",
    placeholder: "请描述你要办的事，AI 为你找到办理入口...",
    quickTags: [
      { label: "请假", fillText: "怎么申请请假？" },
      { label: "报销", fillText: "怎么提交报销？" },
      { label: "权限申请", fillText: "怎么申请系统权限？" },
      { label: "慧管家", fillText: "帮我打开慧管家" },
    ],
  },
  {
    title: "图片生成",
    description: "百变风格、随心生成",
    helper: "先做占位与提示词整理",
    exampleQuestion: "画一幅江南春景图",
    entryMode: "image_placeholder",
    placeholder: "描述你想生成的画面：风格、场景、主体...",
    quickTags: [],
  },
  {
    title: "帮我写作",
    description: "方案汇报、一键成文",
    helper: "更像企业写作助手",
    exampleQuestion: "帮我写一份团建策划",
    entryMode: "writing",
    placeholder: "请告诉我你要写的文章类型、主题、字数...",
    quickTags: [
      { label: "周报", fillText: "帮我写一份工作周报" },
      { label: "方案", fillText: "帮我写一份项目方案" },
      { label: "通知", fillText: "帮我写一份通知公告" },
      { label: "总结", fillText: "帮我写一份工作总结" },
    ],
  },
];

export const recommendedTeammates = ["日程助理", "律政助手", "查询状态"];

export const quickLinks = [
  "抖音商城模板",
  "积分排行榜",
  "问题反馈及建议",
  "多维表操作视频",
  "钉钉各应用教程入口",
];

