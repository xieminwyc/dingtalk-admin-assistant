import type {
  TaskCatalogItem,
  TaskCatalogResolveInput,
  TaskCatalogResolution
} from "./task-catalog.types";

const DEFAULT_FALLBACK_CONTACT = "行政同学";

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, "").toLowerCase();
}

function isKeywordHit(query: string, keyword: string) {
  return normalizeText(query).includes(normalizeText(keyword));
}

// 当目录里完全找不到事务时，统一返回一个保守兜底结果，
// 避免 assistant 误导用户跳到错误入口。
function buildFallbackResolution(): TaskCatalogResolution {
  // 找不到明确入口时，优先把人带到可确认入口的人，而不是硬猜一个链接。
  return {
    title: "事务办理",
    description: "暂未找到可直接跳转的入口，请联系兜底联系人确认办理方式。",
    preparations: [],
    entryUrl: undefined,
    actionType: undefined,
    availability: "unknown",
    availabilityReason: "当前未命中可用的事务配置。",
    fallbackContact: DEFAULT_FALLBACK_CONTACT
  };
}

// 目录项属于静态种子数据；这里复制出一份 resolution，
// 避免后续调用方修改返回值时反向污染目录原始数据。
function mapItemToResolution(
  item: TaskCatalogItem
): TaskCatalogResolution {
  return {
    taskType: item.taskType,
    title: item.title,
    description: item.description,
    preparations: [...item.preparations],
    entryUrl: item.entryUrl,
    // actionType 和 availability 先支持最小契约：
    // 目录里显式给了就复用；没给时按“有 URL 就可用”推一个保守默认值。
    actionType: item.actionType ?? (item.entryUrl ? "url" : undefined),
    availability: item.availability ?? "available",
    availabilityReason: item.availabilityReason,
    fallbackContact: item.fallbackContact
  };
}

export class TaskCatalogService {
  constructor(private readonly catalog: TaskCatalogItem[]) {}

  // taskType 是上游已经结构化完成后的精确命中路径，
  // 只要传入可识别 code，就直接走这条分支，不再依赖关键词猜测。
  private findByTaskType(taskType?: string) {
    if (!taskType) {
      return undefined;
    }

    const normalizedTaskType = normalizeText(taskType);

    return this.catalog.find(
      (item) => normalizeText(item.taskType) === normalizedTaskType
    );
  }

  // 关键词命中只负责自然语言兜底，
  // 适合“我要请假”“帮我预约会议室”这类还没被结构化的原始表达。
  private findByKeyword(query?: string) {
    if (!query) {
      return undefined;
    }

    let bestMatch:
      | {
          item: TaskCatalogItem;
          keyword: string;
          score: number;
        }
      | undefined;

    for (const item of this.catalog) {
      for (const keyword of item.keywords) {
        if (isKeywordHit(query, keyword)) {
          const score = normalizeText(keyword).length;

          // 关键词命中不是“先到先得”，而是“更具体的词优先”。
          // 否则像“申请”这类泛词会过早截走“办公用品采购”这种更明确的事务。
          if (!bestMatch || score > bestMatch.score) {
            bestMatch = {
              item,
              keyword,
              score
            };
          }
        }
      }
    }

    return bestMatch;
  }

  // resolve 是事务目录的统一入口：
  // 1. 先尝试结构化 taskType 精确命中
  // 2. 精确命中失败时，再退回到关键词匹配
  // 3. 两条都找不到时，返回保守兜底
  resolve(input: TaskCatalogResolveInput): TaskCatalogResolution {
    const matchedByType = this.findByTaskType(input.taskType);
    const matchedByKeyword = this.findByKeyword(input.query);
    const matchedItem = matchedByType ?? matchedByKeyword?.item;

    if (!matchedItem) {
      return buildFallbackResolution();
    }

    return mapItemToResolution(matchedItem);
  }
}
