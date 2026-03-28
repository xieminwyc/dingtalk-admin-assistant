import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

import type {
  KnowledgeRetriever,
  KnowledgeSearchOptions,
  KnowledgeSearchResult
} from "./retriever.types";

type DocumentChunk = {
  id: string;
  documentTitle: string;
  sectionTitle: string;
  referenceLabel: string;
  content: string;
  searchText: string;
};

const MATCH_QUERY_STOP_WORDS =
  /(是什么|什么意思|怎么办|怎么|如何|怎么算|多少|吗|呢|制度|规则|政策|规范|说明|管理办法)/g;
const SUGGESTION_STOP_WORDS =
  /(是什么|什么意思|怎么办|怎么|如何|怎么算|多少|吗|呢|制度|规则|政策|规范|说明|流程|入口|管理办法)/g;
const MIN_DOCUMENT_MATCH_SCORE = 0.72;

function normalizeText(text: string) {
  return text.trim().replace(/\s+/g, "").replace(/[：:、，,。；;（）()《》【】]/g, "").toLowerCase();
}

function normalizeMatchQuery(query: string) {
  return normalizeText(query).replace(MATCH_QUERY_STOP_WORDS, "");
}

function normalizeSuggestionQuery(query: string) {
  return normalizeText(query).replace(SUGGESTION_STOP_WORDS, "");
}

function uniqueSharedCharacterCount(left: string, right: string) {
  return [...new Set(left)].filter((character) => right.includes(character)).length;
}

function scoreChunk(query: string, chunk: DocumentChunk) {
  if (!query) {
    return 0;
  }

  if (chunk.searchText.includes(query)) {
    return 0.96;
  }

  const sharedCharacters = uniqueSharedCharacterCount(query, chunk.searchText);
  const coverage = sharedCharacters / Math.max(query.length, 1);

  if (sharedCharacters >= 3 && coverage >= 0.75) {
    return 0.86;
  }

  if (sharedCharacters >= 2 && coverage >= 0.6) {
    return 0.74;
  }

  return 0;
}

function scoreSuggestion(query: string, candidate: string) {
  if (!query || !candidate) {
    return 0;
  }

  if (candidate.includes(query) || query.includes(candidate)) {
    return query.length + candidate.length;
  }

  return uniqueSharedCharacterCount(query, candidate);
}

function finalizeChunk(chunks: DocumentChunk[], input: {
  documentTitle: string;
  headings: string[];
  contentLines: string[];
  fileName: string;
  index: number;
}) {
  const content = input.contentLines.join("\n").trim();

  if (!content) {
    return;
  }

  const sectionTitle = input.headings.length > 0
    ? input.headings.join(" / ")
    : input.documentTitle;
  const referenceLabel =
    input.headings.length > 0
      ? `${input.documentTitle} - ${sectionTitle}`
      : input.documentTitle;

  chunks.push({
    id: `${input.fileName}#${input.index}`,
    documentTitle: input.documentTitle,
    sectionTitle,
    referenceLabel,
    content,
    searchText: normalizeText(
      [input.documentTitle, sectionTitle, content].join("\n")
    )
  });
}

function parseMarkdownDocument(fileName: string, content: string): DocumentChunk[] {
  const lines = content.split(/\r?\n/);
  const chunks: DocumentChunk[] = [];
  const headings: string[] = [];
  let documentTitle = basename(fileName, ".md");
  let contentLines: string[] = [];
  let chunkIndex = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      if (contentLines.length > 0) {
        contentLines.push("");
      }
      continue;
    }

    const headingMatch = rawLine.match(/^(#{1,3})\s+(.+)$/);

    if (headingMatch) {
      // Markdown 文档当前按 H1/H2/H3 切片：
      // 每遇到一个新标题，就把上一个标题下面累计的正文收成一个独立 chunk，
      // 这样制度条款既不会整篇过大，也能保留“属于哪份制度、哪一章哪一节”的上下文。
      finalizeChunk(chunks, {
        documentTitle,
        headings: [...headings],
        contentLines,
        fileName,
        index: chunkIndex
      });
      chunkIndex += 1;
      contentLines = [];

      const level = headingMatch[1].length;
      const headingText = headingMatch[2].trim();

      if (level === 1) {
        documentTitle = headingText;
        headings.length = 0;
      } else {
        headings.splice(level - 2);
        headings[level - 2] = headingText;
      }

      continue;
    }

    contentLines.push(line);
  }

  finalizeChunk(chunks, {
    documentTitle,
    headings,
    contentLines,
    fileName,
    index: chunkIndex
  });

  return chunks;
}

function buildRelatedKeywords(query: string, chunks: DocumentChunk[]) {
  const normalizedQuery = normalizeSuggestionQuery(query);
  const labels = chunks.flatMap((chunk) => [chunk.documentTitle, ...chunk.sectionTitle.split(" / ")]);
  const candidates = chunks
    .flatMap((chunk) => [chunk.documentTitle, ...chunk.sectionTitle.split(" / ")])
    .map((candidate) => ({
      value: candidate,
      score: normalizedQuery
        ? scoreSuggestion(normalizedQuery, normalizeText(candidate))
        : 0
    }))
    .filter((candidate) => normalizedQuery ? candidate.score >= 2 : true)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return right.value.length - left.value.length;
    });

  const dedupedCandidates = [...new Set(candidates.map((candidate) => candidate.value))];

  if (dedupedCandidates.length > 0) {
    return dedupedCandidates.slice(0, 3);
  }

  return [...new Set(labels)].slice(0, 3);
}

function loadMarkdownChunks(directory: string) {
  if (!existsSync(directory)) {
    return [];
  }

  return readdirSync(directory)
    .filter((fileName) => fileName.endsWith(".md"))
    .flatMap((fileName) =>
      parseMarkdownDocument(
        fileName,
        readFileSync(join(directory, fileName), "utf8")
      )
    );
}

export class LocalDocumentRetriever implements KnowledgeRetriever {
  private readonly chunks: DocumentChunk[];

  constructor(private readonly directory: string) {
    // 文档型知识源当前主要服务本地联调，所以初始化时直接把切片读进内存，
    // 这样运行期查询更简单，也方便后续替换成正式 RAG provider。
    this.chunks = loadMarkdownChunks(directory);
  }

  async search(
    query: string,
    _options?: KnowledgeSearchOptions
  ): Promise<KnowledgeSearchResult> {
    const normalizedQuery = normalizeText(query);
    const normalizedMatchQuery = normalizeMatchQuery(query);

    const hits = this.chunks
      .map((chunk) => {
        const score = Math.max(
          scoreChunk(normalizedQuery, chunk),
          normalizedMatchQuery && normalizedMatchQuery !== normalizedQuery
            ? scoreChunk(normalizedMatchQuery, chunk)
            : 0
        );

        return {
          chunk,
          score
        };
      })
      .filter((candidate) => candidate.score >= MIN_DOCUMENT_MATCH_SCORE)
      .sort((left, right) => right.score - left.score)
      .slice(0, 3)
      .map(({ chunk, score }) => ({
        id: chunk.id,
        question: chunk.sectionTitle,
        title: chunk.sectionTitle,
        answer: chunk.content,
        content: chunk.content,
        score,
        source: "document" as const,
        referenceLabel: chunk.referenceLabel
      }));

    return {
      hits,
      relatedKeywords: hits.length > 0 ? [] : buildRelatedKeywords(query, this.chunks)
    };
  }
}
