import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // 测试在 Node 跑，不是 React Server Component；server-only 换成空的模块
      "server-only": fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
