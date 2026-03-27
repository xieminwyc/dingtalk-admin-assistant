import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      // 让测试环境和 Next.js 一样支持 "@/..." 导入路径。
      "@": path.resolve(__dirname, "src")
    }
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"]
  }
});
