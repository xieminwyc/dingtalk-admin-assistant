import { describe, expect, it } from "vitest";

import { ContactDirectoryService } from "./contact-directory.service";
import { sampleContactDirectory } from "./sample-contact-directory";

describe("ContactDirectoryService", () => {
  it("resolves expense reimbursement issues to the finance contact", () => {
    const service = new ContactDirectoryService(sampleContactDirectory);

    expect(service.resolve({ query: "报销单被退回应该联系谁？" })).toEqual(
      expect.objectContaining({
        title: "财务报销与发票问题",
        contactName: "财务同学",
      }),
    );
  });

  it("resolves administrative support questions to the admin contact", () => {
    const service = new ContactDirectoryService(sampleContactDirectory);

    expect(service.resolve({ query: "会议室预订冲突找谁处理？" })).toEqual(
      expect.objectContaining({
        team: "行政服务",
      }),
    );
  });
});
