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
    templates: [
      {
        label: "查询特定项目的验收结果",
        prompt: "雅斯特美途酒店工程验收结果如何？",
      },
      {
        label: "查询工程验收的国家标准",
        prompt: "请查询工程验收国家标准（如 GB/T 50300-2013）。",
      },
      {
        label: "下载安全施工管理条例",
        prompt: "帮我找一下安全施工管理条例 PDF 下载链接。",
      },
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
    templates: [
      {
        label: "找项目一级负责人",
        prompt: "雅斯特酒店项目的一级负责人是谁？",
      },
      {
        label: "找 PMS 故障支持",
        prompt: "PMS制卡问题应该找谁处理？",
      },
      {
        label: "找 OA 流程处理同学",
        prompt: "OA流程异常应该找谁处理？",
      },
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
    templates: [
      {
        label: "打开智慧管家",
        prompt: "帮我打开智慧管家系统。",
      },
      {
        label: "发起请假流程",
        prompt: "我想申请年假，流程怎么走？",
      },
      {
        label: "找到报销办理入口",
        prompt: "报销流程入口在哪里？",
      },
    ],
  },
  {
    title: "图片生成",
    description: "百变风格、随心生成",
    helper: "尚未上线，先帮你整理提示词",
    exampleQuestion: "帮我整理一段江南春景图的提示词",
    entryMode: "image_placeholder",
    placeholder: "描述你想生成的画面：风格、场景、主体...",
    quickTags: [],
    templates: [
      {
        label: "整理宣传海报提示词",
        prompt: "请帮我整理一组春季酒店宣传海报的提示词。",
      },
      {
        label: "整理产品视觉提示词",
        prompt: "请帮我整理一组智能前台产品海报的提示词。",
      },
    ],
    isPlaceholder: true,
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
    templates: [
      {
        label: "写团建策划",
        prompt: "帮我写一份 50 人员工团建策划案。",
      },
      {
        label: "润色周报内容",
        prompt: "请帮我润色这段本周工作总结：",
      },
      {
        label: "整理会议纪要",
        prompt: "请帮我整理今天项目复盘会的会议纪要。",
      },
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
