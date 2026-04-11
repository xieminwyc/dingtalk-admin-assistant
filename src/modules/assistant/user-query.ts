export const DEFAULT_IMAGE_QUERY = "请识别这张图片内容";

function hasImage(input: { imageUrl?: string; imageUrls?: string[] }) {
  if (typeof input.imageUrl === "string" && input.imageUrl.trim().length > 0) {
    return true;
  }

  return (
    Array.isArray(input.imageUrls) &&
    input.imageUrls.some(
      (imageUrl) => typeof imageUrl === "string" && imageUrl.trim().length > 0,
    )
  );
}

function isImagePlaceholderQuery(query: string) {
  return /^\[?图片消息\]?$/u.test(query);
}

export function resolveUserQuery(input: {
  text?: string;
  imageUrl?: string;
  imageUrls?: string[];
}) {
  const query = input.text?.trim();

  if (query && !(hasImage(input) && isImagePlaceholderQuery(query))) {
    return query;
  }

  if (hasImage(input)) {
    return DEFAULT_IMAGE_QUERY;
  }

  return query ?? null;
}
