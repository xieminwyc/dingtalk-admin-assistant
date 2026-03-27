import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadEnvFiles } from "./load-env-files";

describe("loadEnvFiles", () => {
  const originalClientId = process.env.DINGTALK_CLIENT_ID;
  const originalClientSecret = process.env.DINGTALK_CLIENT_SECRET;

  afterEach(() => {
    if (originalClientId === undefined) {
      delete process.env.DINGTALK_CLIENT_ID;
    } else {
      process.env.DINGTALK_CLIENT_ID = originalClientId;
    }

    if (originalClientSecret === undefined) {
      delete process.env.DINGTALK_CLIENT_SECRET;
    } else {
      process.env.DINGTALK_CLIENT_SECRET = originalClientSecret;
    }
  });

  it("loads variables from .env.local when present", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dingtalk-env-"));

    fs.writeFileSync(
      path.join(tempDir, ".env.local"),
      "DINGTALK_CLIENT_ID=local-client\nDINGTALK_CLIENT_SECRET=local-secret\n"
    );

    delete process.env.DINGTALK_CLIENT_ID;
    delete process.env.DINGTALK_CLIENT_SECRET;

    loadEnvFiles(tempDir);

    expect(process.env.DINGTALK_CLIENT_ID).toBe("local-client");
    expect(process.env.DINGTALK_CLIENT_SECRET).toBe("local-secret");
  });
});
