import type { EntryMode } from "@/modules/assistant/entry-mode.types";

export type HomeEntryCard = {
  title: string;
  description: string;
  helper: string;
  exampleQuestion: string;
  entryMode: EntryMode;
};

export const homeEntryCards: HomeEntryCard[] = [
  {
    title: "找制度",
    description: "问制度、问政策",
    helper: "快速定位制度依据",
    exampleQuestion: "雅斯特美途酒店工程验收结果如何？",
    entryMode: "knowledge"
  },
  {
    title: "找对接人",
    description: "问业务对接人",
    helper: "快速找到负责同事",
    exampleQuestion: "PMS制卡问题应该找谁处理？",
    entryMode: "contact"
  },
  {
    title: "找流程",
    description: "问流程、问系统",
    helper: "直接带你去入口",
    exampleQuestion: "帮我打开慧管家",
    entryMode: "task"
  },
  {
    title: "图片生成",
    description: "百变风格、随心生成",
    helper: "先做占位与提示词整理",
    exampleQuestion: "画一幅江南春景图",
    entryMode: "image_placeholder"
  },
  {
    title: "帮我写作",
    description: "方案汇报、一键成文",
    helper: "更像企业写作助手",
    exampleQuestion: "帮我写一份团建策划",
    entryMode: "writing"
  }
];

export const recommendedTeammates = [
  "日程助理",
  "律政助手",
  "查询状态"
];

export const quickLinks = [
  "抖音商城模板",
  "积分排行榜",
  "问题反馈及建议",
  "多维表操作视频",
  "钉钉各应用教程入口"
];
