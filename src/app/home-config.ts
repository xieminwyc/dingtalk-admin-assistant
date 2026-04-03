import type { EntryMode } from "@/modules/assistant/entry-mode.types";

export type QuickTag = {
  label: string;
  fillText: string;
};

export type HomeEntryTemplate = {
  label: string;
  prompt: string;
};

export type HomeEntryCard = {
  title: string;
  description: string;
  helper: string;
  exampleQuestion: string;
  entryMode: EntryMode;
  placeholder: string;
  quickTags: QuickTag[];
  templates?: HomeEntryTemplate[];
  isPlaceholder?: boolean;
};

export const homeEntryCards: HomeEntryCard[] = [
  {
    title: "找制度",
    description: "问财务、问行政",
    helper: "快速定位制度依据",
    exampleQuestion: "差旅报销标准是什么？",
    entryMode: "knowledge",
    placeholder: "请输入报销、发票、行政服务等关键词，AI 为你深度解读...",
    quickTags: [
      { label: "报销", fillText: "差旅报销标准是什么？" },
      { label: "发票", fillText: "报销需要提供什么发票？" },
      { label: "借款", fillText: "员工借款冲销规则是什么？" },
      { label: "会议室", fillText: "会议室预订流程是什么？" },
      { label: "办公用品", fillText: "办公用品申领流程是什么？" },
    ],
    templates: [
      {
        label: "查询差旅报销标准",
        prompt: "差旅报销标准是什么？",
      },
      {
        label: "查询发票报销要求",
        prompt: "报销需要提供什么发票？",
      },
      {
        label: "查询会议室预订规则",
        prompt: "会议室预订流程和注意事项是什么？",
      },
    ],
  },
  {
    title: "找对接人",
    description: "问财务、问行政联系人",
    helper: "快速找到负责同事",
    exampleQuestion: "报销单被退回应该联系谁？",
    entryMode: "contact",
    placeholder: "请输入业务场景或问题，AI 帮你找到对应同事...",
    quickTags: [
      { label: "报销退回", fillText: "报销单被退回应该联系谁？" },
      { label: "发票问题", fillText: "发票填写有问题应该找谁？" },
      { label: "会议室", fillText: "会议室预订冲突找谁处理？" },
      { label: "办公用品", fillText: "办公用品申领找谁？" },
    ],
    templates: [
      {
        label: "找财务报销对接人",
        prompt: "报销单被退回应该联系谁？",
      },
      {
        label: "找发票处理同学",
        prompt: "发票填写有问题应该找谁？",
      },
      {
        label: "找行政服务支持",
        prompt: "会议室预订冲突找谁处理？",
      },
    ],
  },
  {
    title: "找流程",
    description: "问流程、找入口",
    helper: "直接带你去入口",
    exampleQuestion: "报销流程入口在哪里？",
    entryMode: "task",
    placeholder: "请描述你要办理的财务或行政事项，AI 为你找到入口...",
    quickTags: [
      { label: "报销", fillText: "报销流程入口在哪里？" },
      { label: "会议室", fillText: "怎么预约会议室？" },
      { label: "办公用品", fillText: "办公用品怎么申领？" },
      { label: "权限申请", fillText: "系统权限怎么申请？" },
    ],
    templates: [
      {
        label: "找到报销办理入口",
        prompt: "报销流程入口在哪里？",
      },
      {
        label: "预约会议室",
        prompt: "怎么预约会议室？",
      },
      {
        label: "申请办公用品",
        prompt: "办公用品怎么申领？",
      },
    ],
  },
  {
    title: "发票识别",
    description: "OCR 识别、票据提取",
    helper: "规划中，先帮你梳理识别需求",
    exampleQuestion: "帮我识别这张发票的金额和税额",
    entryMode: "image_placeholder",
    placeholder: "描述你要识别的票据类型、字段和用途，AI 先帮你整理需求...",
    quickTags: [],
    templates: [
      {
        label: "梳理发票识别字段",
        prompt: "请帮我整理发票 OCR 需要提取的字段，例如金额、税额、抬头和发票号。",
      },
      {
        label: "整理报销票据清单",
        prompt: "请帮我整理一份发票识别后的报销信息清单模板。",
      },
    ],
    isPlaceholder: true,
  },
  {
    title: "帮我写作",
    description: "通知公告、一键成文",
    helper: "更像财务行政写作助手",
    exampleQuestion: "帮我写一份报销制度通知",
    entryMode: "writing",
    placeholder: "请告诉我你要写的文档类型、主题和字数...",
    quickTags: [
      { label: "通知", fillText: "帮我写一份报销制度通知" },
      { label: "周报", fillText: "帮我写一份行政周报" },
      { label: "纪要", fillText: "帮我整理一份财务例会纪要" },
      { label: "邮件", fillText: "帮我写一封发票补交流程提醒邮件" },
    ],
    templates: [
      {
        label: "写报销制度通知",
        prompt: "帮我写一份费用报销规范通知。",
      },
      {
        label: "润色行政周报",
        prompt: "请帮我润色这段行政周报：",
      },
      {
        label: "整理财务会议纪要",
        prompt: "请帮我整理今天财务例会的会议纪要。",
      },
    ],
  },
];

export const recommendedTeammates = ["财务助手", "行政助手", "流程助手"];

export const quickLinks = [
  "报销制度汇总",
  "会议室预订入口",
  "行政服务台",
  "供应链知识（规划中）",
  "销售知识（规划中）",
  "发票识别（规划中）",
];
