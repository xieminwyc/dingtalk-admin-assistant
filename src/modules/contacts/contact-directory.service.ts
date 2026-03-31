import type {
  ContactDirectoryItem,
  ContactDirectoryResolveInput,
  ContactDirectoryResolution,
} from "./contact-directory.types";

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, "").toLowerCase();
}

function isKeywordHit(query: string, keyword: string) {
  return normalizeText(query).includes(normalizeText(keyword));
}

function mapItemToResolution(
  item: ContactDirectoryItem,
): ContactDirectoryResolution {
  return {
    title: item.title,
    contactName: item.contactName,
    userId: item.userId,
    team: item.team,
    description: item.description,
    actionHint: item.actionHint,
  };
}

export class ContactDirectoryService {
  constructor(private readonly directory: ContactDirectoryItem[]) {}

  resolve(
    input: ContactDirectoryResolveInput,
  ): ContactDirectoryResolution | null {
    let bestMatch:
      | {
          item: ContactDirectoryItem;
          score: number;
        }
      | undefined;

    for (const item of this.directory) {
      for (const keyword of item.keywords) {
        if (isKeywordHit(input.query, keyword)) {
          const score = normalizeText(keyword).length;

          if (!bestMatch || score > bestMatch.score) {
            bestMatch = {
              item,
              score,
            };
          }
        }
      }
    }

    return bestMatch ? mapItemToResolution(bestMatch.item) : null;
  }
}
