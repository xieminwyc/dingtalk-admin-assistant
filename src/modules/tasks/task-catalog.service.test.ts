import { describe, expect, it } from "vitest";

import { sampleTaskCatalog } from "./sample-task-catalog";
import { TaskCatalogService } from "./task-catalog.service";

describe("TaskCatalogService", () => {
  const service = new TaskCatalogService(sampleTaskCatalog);

  it("会根据关键词命中请假事务", () => {
    const result = service.resolve({ query: "我想请假一天" });

    expect(result.title).toBe("请假申请");
    expect(result.description).toContain("请假");
    expect(result.preparations).toContain("确认请假日期");
  });

  it("命中结果会包含入口 URL", () => {
    const result = service.resolve({ query: "帮我预约会议室" });

    expect(result.title).toBe("会议室预约");
    expect(result.entryUrl).toMatch(/^https:\/\//);
  });

  it("可以只按 taskType 解析事务", () => {
    const result = service.resolve({ taskType: "permission_access" });

    expect(result.title).toBe("权限开通");
    expect(result.description).toContain("系统权限");
    expect(result.entryUrl).toMatch(/^https:\/\//);
  });

  it("taskType 和关键词同时存在时优先使用 taskType", () => {
    const customService = new TaskCatalogService([
      {
        taskType: "leave_application",
        title: "请假申请",
        description: "用于发起请假审批。",
        keywords: ["请假"],
        preparations: ["准备请假信息"],
        fallbackContact: "HR 同学"
      },
      {
        taskType: "permission_access",
        title: "权限开通",
        description: "用于申请系统权限。",
        keywords: ["权限"],
        preparations: ["准备系统名称"],
        entryUrl: "https://oa.example.com/tasks/permission-access",
        fallbackContact: "IT 同学"
      }
    ]);

    const result = customService.resolve({
      taskType: "permission_access",
      query: "我想请假"
    });

    expect(result.title).toBe("权限开通");
    expect(result.description).toContain("系统权限");
    expect(result.entryUrl).toMatch(/^https:\/\//);
  });

  it("无效 taskType 时会回退到关键词命中", () => {
    const result = service.resolve({
      taskType: "not_a_real_task",
      query: "我想请假"
    });

    expect(result.title).toBe("请假申请");
    expect(result.description).toContain("请假");
    expect(result.fallbackContact).toBe("HR 同学");
  });

  it("命中事务但没有入口 URL 时会保留事务自身信息", () => {
    const customService = new TaskCatalogService([
      {
        taskType: "leave_application",
        title: "请假申请",
        description: "用于发起请假审批。",
        keywords: ["请假"],
        preparations: ["确认请假日期", "准备请假类型"],
        fallbackContact: "HR 同学"
      }
    ]);

    const result = customService.resolve({ query: "我要请假" });

    expect(result.title).toBe("请假申请");
    expect(result.description).toContain("请假审批");
    expect(result.preparations).toContain("确认请假日期");
    expect(result.entryUrl).toBeUndefined();
    expect(result.fallbackContact).toBe("HR 同学");
  });

  it("找不到入口时会返回兜底联系人", () => {
    const result = service.resolve({ query: "我要办理一个不存在的事务" });

    expect(result.title).toBe("事务办理");
    expect(result.entryUrl).toBeUndefined();
    expect(result.fallbackContact).toContain("同学");
  });
});
