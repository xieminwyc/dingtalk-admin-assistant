/**
 * 知识库检索请求参数
 */
export type RagSearchRequest = {
  /** 搜索查询文本，即用户的问题或关键词 */
  query: string;
  /** 操作者 unionId（用于 ACL 权限过滤和审计，确保用户只能搜到自己有权限看的文档） */
  operatorId: string;
  /** 限定 workspace 范围，不填则跨所有 workspace 搜索 */
  workspaceId?: string;
  /** 返回数量，默认 10，上限 50 */
  maxResults?: number;
  /** 限定目录范围搜索 */
  directoryId?: string;
  /** 分页游标，如果结果很多，通过这个游标获取下一页（来自上一次响应） */
  nextToken?: string;
  /** 搜索模式：fulltext（全文语义搜索，默认） 或 keyword（纯文本关键词精确匹配） */
  searchMode?: "fulltext" | "keyword";
};

/**
 * 单条检索命中的知识切片
 */
export type RagSearchItem = {
  /** 知识片段(Chunk)的全局唯一 ID */
  chunkId: number;
  /** 该片段所属文档的 ID */
  documentId: number;
  /** 该片段所属的文档标题 */
  title: string;
  /** 切片具体的文本内容 */
  chunkText: string;
  /** 文档内的层级路径，如 "第三章 > 假期制度"，用于快速溯源出处 */
  headingPath?: string;
  /** 该片段在原文档的具体页码（若是 PDF 等翻页文档） */
  pageNo?: number;
  /** 检索的相关度打分 (Score)，通常是 0~1，越高表示跟问题越相关 */
  score: number;
  /** 可以直接跳转到钉钉文档查看原文的 URL */
  sourceUrl?: string;
};

/**
 * 知识库检索接口的响应结构
 */
export type RagSearchResponse = {
  /** 查到的知识片段列表 */
  items: RagSearchItem[];
  /** 下一页的分页游标，没有则为空 */
  nextToken?: string;
  /** 符合条件的碎片总数 */
  total: number;
};

/**
 * 知识库问答(RAG多轮对话)的请求参数
 */
export type RagAskRequest = {
  /** 用户提问的问题 */
  question: string;
  /** 提问者的 unionId，用于保证它只能用他有权限的文档来生成答案 */
  operatorId: string;
  /** 会话 ID；不传则由服务端创建新会话。若要继续多轮对话，传上一次返回的 sessionId */
  sessionId?: string;
  /** 参与大模型回答的片段数，默认 5，上限 20，给的越多模型可参考的信息越全，但也更慢 */
  maxChunks?: number;
};

/**
 * 问答生成的答案引用的具体文档数据
 */
export type RagAskCitation = {
  /** 引用的片段 ID */
  chunkId: number;
  /** 引用的文档 ID */
  documentId: number;
  /** 引用的文档标题 */
  documentTitle: string;
  /** 跳转看全文的钉钉链接 */
  sourceUrl: string;
  /** 所在章节，例如 "第一章" */
  headingPath?: string;
};

/**
 * 知识库问答的直接响应结构 (不仅返回资料，直接返回大模型组织好的答案)
 */
export type RagAskResponse = {
  /** 当前问答的会话 ID，下一次追问时需要带上这个 ID */
  sessionId?: string;
  /** 大模型基于搜索结果直接针对你的问题给出的最终回答文本 */
  answer: string;
  /** 大模型参考了哪些具体文档才得出的结论（引用依据） */
  sources?: RagAskCitation[];
};

/**
 * 上下文截取请求参数（获取某个核心段落前后的内容）
 */
export type RagContextRequest = {
  /** 已知某个片段 ID，想看看它前后文（和下方的 documentId + chunkNo 二选一必填） */
  chunkId?: number;
  /** 已知文档ID和片段序号（和 chunkId 二选一必填） */
  documentId?: number;
  /** 在文档中属于第几块内容 */
  chunkNo?: number;
  /** 想要看前后各多远的内容？比如 2，表示连带取出前面 2 段和后面 2 段供大模型理解 */
  windowSize?: number;
};

export type RagContextChunk = {
  chunkId: number;
  chunkNo: number;
  chunkText: string;
  headingPath?: string;
  pageNo?: number;
  /** 是否是你查询请求里指定的那个核心片段 (True为搜索核心，False为连带查出的前后文) */
  isFocus: boolean;
};

export type RagContextResponse = {
  chunks: RagContextChunk[];
  documentTitle: string;
  sourceUrl?: string;
};

/**
 * 扫描入库任务触发的请求参数
 */
export type RagScanRequest = {
  /** 想要让知识库学习的 钉钉文档 或 钉钉文件夹 的可访问链接 */
  url: string;
  /** 操作人的 unionId，后台用来做记录 */
  operatorId?: string;
  /** 如果指定了外部独立的空间 */
  spaceId?: string;
  /** 对于文件夹，最多允许递归扫描多少篇文档入库 */
  maxDocs?: number;
};

export type RagScanResponse = {
  /** 扫描是个异步耗时过程，所以接口会立刻返回一个 taskId 给你，你可以拿着它去查进度 */
  taskId: number;
  /** 创建时必然是 pending (等待中) */
  status: string;
};

/**
 * 任意入库任务的状态查询响应
 */
export type RagTaskResponse = {
  id: number;
  /** 比如是 'scan' 扫描任务 */
  taskType: string;
  scopeType: string;
  scopeId: string;
  /** 任务当前进度：pending / running / success / failed / dead */
  status: string;
  /** 已重试次数 */
  retryCount: number;
  /** 如果 status 是 failed，这里会挂载具体是怎么失败的错误原因 */
  lastError: string | null;
  createdAt: string;
};

/**
 * 钉钉外部知识库 (RAG 服务) 的官方 API 调用客户端
 * 提供封装好的 Typescript 方法供业务便捷调用
 */
export class KnowledgeApiClient {
  private readonly baseUrl: string;

  /**
   * 构造函数，需要传入服务的地址和鉴权秘钥
   */
  constructor(
    private readonly config: {
      /** RAG 知识库基础地址，例如 http://192.168.30.68:13718 */
      baseUrl: string;
      /** API_KEY，用于通过鉴权 */
      apiKey?: string;
      /** 用于重写底层的 fetch (NodeJS 或 Worker 场景可以用) */
      fetchImpl?: typeof fetch;
      /** 请求超时时间，单位毫秒，默认30000（30秒） */
      timeout?: number;
      /** 重试次数，默认1 */
      retryCount?: number;
    }
  ) {
    // 移除尾部的斜杠防止路径拼接出错
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
  }

  /**
   * 内部统一封装的标准请求函数，自动处理 Headers、鉴权验证与报错抛出
   */
  private async request<T>(endpoint: string, options: RequestInit): Promise<T> {
    const fetchImpl = this.config.fetchImpl ?? fetch;
    const headers = new Headers(options.headers);
    headers.set("Content-Type", "application/json");

    if (this.config.apiKey) {
      // 通过环境 API Key 实现 Bearer 令牌鉴权
      headers.set("Authorization", `Bearer ${this.config.apiKey}`);
    }

    const timeout = this.config.timeout ?? 30000; // 默认30秒
    const retryCount = this.config.retryCount ?? 1;
    const maxRetries = Math.max(0, retryCount);

    console.log("==========================================");
    console.log(`🚀 [KnowledgeApiClient] 发起后端请求: ${options.method} ${endpoint}`);
    console.log(`📦 请求参数:`, options.body ? JSON.parse(options.body as string) : "无");
    console.log(`⏱️ 超时设置: ${timeout}ms, 重试次数: ${maxRetries}`);

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      // 创建 AbortController 用于超时控制
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetchImpl(`${this.baseUrl}${endpoint}`, {
          ...options,
          headers,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          let errorMessage = `${response.status} ${response.statusText}`;
          try {
            const errorData = await response.json();
            if (errorData && typeof errorData === 'object') {
              errorMessage = errorData.error || errorData.message || JSON.stringify(errorData);
            }
          } catch (e) {
            // response may not be JSON, keep the statusText
          }

          lastError = new Error(errorMessage);
          console.error(`❌ [KnowledgeApiClient] 请求失败 (尝试 ${attempt}/${maxRetries + 1}): ${errorMessage}`);

          // 如果是超时错误，跳过重试，直接返回
          if (lastError.message.includes('超时') || lastError.message.includes('timeout')) {
            break;
          }

          // 如果还有重试次数，等待一段时间再重试
          if (attempt <= maxRetries) {
            const waitTime = Math.min(1000 * attempt, 5000); // 递增等待时间，最多5秒
            console.log(`⏳ ${waitTime}ms 后重试...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          }

          throw lastError;
        }

        const data = await response.json() as T;
        console.log(`✅ [KnowledgeApiClient] 请求成功, 收到数据:`, JSON.stringify(data).substring(0, 100) + "...");
        console.log("==========================================\n");
        return data;
      } catch (error) {
        clearTimeout(timeoutId);

        if (error instanceof Error && error.name === 'AbortError') {
          lastError = new Error(`请求超时: 超过${timeout}ms限制`);
          console.error(`❌ [KnowledgeApiClient] 请求超时 (尝试 ${attempt}/${maxRetries + 1}): 超过${timeout}ms限制`);
        } else {
          lastError = error instanceof Error ? error : new Error(String(error));
          console.error(`❌ [KnowledgeApiClient] 请求失败 (尝试 ${attempt}/${maxRetries + 1}): ${lastError.message}`);
        }

        // 如果是最后一次尝试，抛出错误
        if (attempt === maxRetries + 1) {
          break;
        }

        // 如果还有重试次数，等待一段时间再重试
        const waitTime = Math.min(1000 * attempt, 5000); // 递增等待时间，最多5秒
        console.log(`⏳ ${waitTime}ms 后重试...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    console.error(`❌ [KnowledgeApiClient] 所有重试均失败: ${lastError?.message}`);
    throw lastError!;
  }

  /**
   * 测试微服务本身存活性配置
   */
  async checkHealth(): Promise<{ status: string }> {
    return this.request<{ status: string }>("/healthz", { method: "GET" });
  }

  /**
   * 检查底层的检索数据库/向量库等依赖组件是否一切就绪
   */
  async checkReady(): Promise<any> {
    return this.request<any>("/readyz", { method: "GET" });
  }

  /**
   * [核心功能] 检索知识片段
   * 在你的应用向大模型提问前，先通过这个方法把相似的知识库内容找出来
   */
  async search(data: RagSearchRequest): Promise<RagSearchResponse> {
    return this.request<RagSearchResponse>("/api/v1/knowledge/search", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /**
   * [一站式功能] 直接要求知识库回答问题
   * 直接丢提问给此接口，它会在后台自行去检索文档 + 自动组装大模型 + 一次性给你返回答案和引用的源文件
   */
  async ask(data: RagAskRequest): Promise<RagAskResponse> {
    return this.request<RagAskResponse>("/api/v1/knowledge/ask", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /**
   * [增强功能] 获取某句话的上下文
   * 如果搜索回来的那句话因为切片切太薄了意思不够完整，用这个查出它前后的完整段落
   */
  async getContext(data: RagContextRequest): Promise<RagContextResponse> {
    return this.request<RagContextResponse>("/api/v1/knowledge/context", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /**
   * [录入功能] 提供新文档供库学习
   * 发现系统回答不上来，丢一篇钉钉在线文档或文件夹进去，系统会自动拉取并在后台异步切块学习
   */
  async scan(data: RagScanRequest): Promise<RagScanResponse> {
    return this.request<RagScanResponse>("/api/v1/knowledge/scan", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /**
   * 查询上面的学习/扫描任务学习得怎么样了 (100% 了没)
   */
  async getTask(taskId: number | string): Promise<RagTaskResponse> {
    return this.request<RagTaskResponse>(`/api/v1/tasks/${taskId}`, {
      method: "GET",
    });
  }

  /**
   * 如果学习途中遇到死锁或者断网失败了，立刻重新触发刚才的任务进行学习
   */
  async retryTask(taskId: number | string): Promise<RagScanResponse> {
    return this.request<RagScanResponse>(`/api/v1/tasks/${taskId}/retry`, {
      method: "POST",
    });
  }
}
