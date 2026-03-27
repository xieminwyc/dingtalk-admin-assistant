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

function buildFallbackResolution(): TaskCatalogResolution {
  // 找不到明确入口时，优先把人带到可确认入口的人，而不是硬猜一个链接。
  return {
    title: "事务办理",
    description: "暂未找到可直接跳转的入口，请联系兜底联系人确认办理方式。",
    preparations: [],
    entryUrl: undefined,
    fallbackContact: DEFAULT_FALLBACK_CONTACT
  };
}

function mapItemToResolution(
  item: TaskCatalogItem
): TaskCatalogResolution {
  return {
    taskType: item.taskType,
    title: item.title,
    description: item.description,
    preparations: [...item.preparations],
    entryUrl: item.entryUrl,
    fallbackContact: item.fallbackContact
  };
}

export class TaskCatalogService {
  constructor(private readonly catalog: TaskCatalogItem[]) {}

  private findByTaskType(taskType?: string) {
    // taskType 是最高优先级的精确匹配入口，只要传了就先按目录 code 查。
    if (!taskType) {
      return undefined;
    }

    const normalizedTaskType = normalizeText(taskType);

    return this.catalog.find(
      (item) => normalizeText(item.taskType) === normalizedTaskType
    );
  }

  private findByKeyword(query?: string) {
    // 关键词命中是 taskType 的兜底路径，只有有自然语言查询时才执行。
    if (!query) {
      return undefined;
    }

    for (const item of this.catalog) {
      for (const keyword of item.keywords) {
        if (isKeywordHit(query, keyword)) {
          return { item, keyword };
        }
      }
    }

    return undefined;
  }

  resolve(input: TaskCatalogResolveInput): TaskCatalogResolution {
    // 先看是否有明确的 taskType；没有或无效时，再退回到关键词检索。
    const matchedByType = this.findByTaskType(input.taskType);
    const matchedByKeyword = this.findByKeyword(input.query);
    const matchedItem = matchedByType ?? matchedByKeyword?.item;

    if (!matchedItem) {
      return buildFallbackResolution();
    }

    return mapItemToResolution(matchedItem);
  }
}
