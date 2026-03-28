import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import { createAssistantRuntime } from "./create-assistant-runtime";

describe("createAssistantRuntime", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map((directory) =>
        rm(directory, { recursive: true, force: true })
      )
    );
  });

  async function createKnowledgeDir() {
    const directory = await mkdtemp(join(tmpdir(), "mt-runtime-knowledge-"));
    const knowledgeDir = join(directory, "knowledge");
    tempDirs.push(directory);
    await mkdir(knowledgeDir, { recursive: true });
    await writeFile(
      join(knowledgeDir, "假勤管理办法.md"),
      `# 员工假勤管理办法

## 异常处理（豁免与乐捐）
### 迟到扣款处理标准
迟到 15-30 分钟不可豁免，按 2 元/分钟进行乐捐。
`,
      "utf8"
    );

    return knowledgeDir;
  }

  it("prefers local markdown documents as the default knowledge source", async () => {
    const knowledgeDocsDir = await createKnowledgeDir();
    const runtime = createAssistantRuntime({
      env: {},
      knowledgeDocsDir
    });

    const result = await runtime.localRetriever.search("迟到扣钱制度");

    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]?.source).toBe("document");
    expect(result.hits[0]?.referenceLabel).toContain("员工假勤管理办法");
  });
});
