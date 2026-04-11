import { describe, expect, it, vi } from "vitest";

import { prepareComposerImage } from "./composer-image";

describe("prepareComposerImage", () => {
  it("keeps small pasted images unchanged", async () => {
    const file = new File(["image-bytes"], "receipt.png", {
      type: "image/png",
    });
    const readFileAsDataUrl = vi
      .fn()
      .mockResolvedValue("data:image/png;base64,abc123");
    const compressDataUrl = vi.fn();

    const result = await prepareComposerImage(file, {
      maxUploadBytes: 10,
      readFileAsDataUrl,
      compressDataUrl,
    });

    expect(result).toEqual({
      name: "receipt.png",
      previewUrl: "data:image/png;base64,abc123",
      uploadUrl: "data:image/png;base64,abc123",
      optimized: false,
    });
    expect(compressDataUrl).not.toHaveBeenCalled();
  });

  it("compresses oversized pasted images before upload", async () => {
    const file = new File(["image-bytes"], "receipt.png", {
      type: "image/png",
    });
    const readFileAsDataUrl = vi
      .fn()
      .mockResolvedValue(`data:image/png;base64,${"a".repeat(24)}`);
    const compressDataUrl = vi
      .fn()
      .mockResolvedValue("data:image/jpeg;base64,compressed");

    const result = await prepareComposerImage(file, {
      maxUploadBytes: 10,
      maxDimension: 1200,
      readFileAsDataUrl,
      compressDataUrl,
    });

    expect(compressDataUrl).toHaveBeenCalledWith({
      dataUrl: `data:image/png;base64,${"a".repeat(24)}`,
      fileType: "image/png",
      maxBytes: 10,
      maxDimension: 1200,
    });
    expect(result).toEqual({
      name: "receipt.png",
      previewUrl: `data:image/png;base64,${"a".repeat(24)}`,
      uploadUrl: "data:image/jpeg;base64,compressed",
      optimized: true,
    });
  });
});
