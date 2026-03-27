// 一期先用内存里的示例数据跑通问答链路，后续再迁到数据库。
export type FaqRecord = {
  id: string;
  question: string;
  aliases: string[];
  answer: string;
  scope?: string;
};

export const sampleAdminFaq: FaqRecord[] = [
  {
    id: "faq-1",
    question: "补卡流程是什么",
    aliases: ["忘记打卡怎么办", "漏打卡了怎么处理"],
    answer: "进入审批后发起补卡申请，由直属主管审批。",
    scope: "适用于因漏打卡产生异常的员工"
  },
  {
    id: "faq-2",
    question: "会议室怎么预订",
    aliases: ["会议室如何预约"],
    answer: "请在钉钉或 OA 的会议室预约入口中选择时间和会议室后提交。",
    scope: "适用于公司内部会议室使用场景"
  }
];
