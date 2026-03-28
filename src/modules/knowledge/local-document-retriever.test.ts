import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import { LocalDocumentRetriever } from "./local-document-retriever";

describe("LocalDocumentRetriever", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map((directory) =>
        rm(directory, { recursive: true, force: true })
      )
    );
  });

  async function createKnowledgeDir(files: Record<string, string>) {
    const directory = await mkdtemp(join(tmpdir(), "mt-knowledge-"));
    const knowledgeDir = join(directory, "knowledge");
    tempDirs.push(directory);
    await mkdir(knowledgeDir, { recursive: true });

    await Promise.all(
      Object.entries(files).map(([name, content]) =>
        writeFile(join(knowledgeDir, name), content, "utf8")
      )
    );

    return knowledgeDir;
  }

  it("loads markdown documents and finds a section by policy question", async () => {
    const knowledgeDir = await createKnowledgeDir({
      "假勤管理办法.md": `# 员工假勤管理办法

发布日期：2025/5/30
文件编号：MT-202505010001

## 异常处理（豁免与乐捐）
### 迟到扣款处理标准
每月有 2 小时异常豁免额度。
迟到 15-30 分钟不可豁免，按 2 元/分钟进行乐捐。
迟到超过 30 分钟视同旷工，按 2 倍旷工时长扣薪。
`
    });

    const retriever = new LocalDocumentRetriever(knowledgeDir);
    const result = await retriever.search("迟到扣钱制度");

    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]?.source).toBe("document");
    expect(result.hits[0]?.title).toContain("迟到扣款处理标准");
    expect(result.hits[0]?.referenceLabel).toContain("员工假勤管理办法");
    expect(result.hits[0]?.answer).toContain("2 元/分钟");
  });

  it("returns related headings when no document chunk matches confidently", async () => {
    const knowledgeDir = await createKnowledgeDir({
      "员工福利管理制度.md": `# 员工福利管理制度

## 通用福利
### 团建补贴
团建补贴标准为 100 元/人/月。

### 健康体检
转正员工每年一次免费体检。
`
    });

    const retriever = new LocalDocumentRetriever(knowledgeDir);
    const result = await retriever.search("春节红包");

    expect(result.hits).toEqual([]);
    expect(result.relatedKeywords).toContain("员工福利管理制度");
    expect(result.relatedKeywords).toContain("团建补贴");
  });
});
