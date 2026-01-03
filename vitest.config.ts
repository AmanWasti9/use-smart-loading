import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    globals: true,
    watch: false,
    include: ["src/**/*.{test,spec}.{js,ts}"],
  },
});
