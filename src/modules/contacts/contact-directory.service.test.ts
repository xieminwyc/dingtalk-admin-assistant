import { describe, expect, it } from "vitest";

import { ContactDirectoryService } from "./contact-directory.service";
import { sampleContactDirectory } from "./sample-contact-directory";

describe("ContactDirectoryService", () => {
  it("resolves PMS card issues to the store system contact", () => {
    const service = new ContactDirectoryService(sampleContactDirectory);

    expect(
      service.resolve({ query: "PMS制卡问题应该找谁处理？" })
    ).toEqual(
      expect.objectContaining({
        title: "PMS 制卡问题",
        contactName: "门店系统支持同学"
      })
    );
  });

  it("resolves HR questions to the HR team contact", () => {
    const service = new ContactDirectoryService(sampleContactDirectory);

    expect(
      service.resolve({ query: "人力资源相关的同事是谁？" })
    ).toEqual(
      expect.objectContaining({
        team: "HR"
      })
    );
  });
});
