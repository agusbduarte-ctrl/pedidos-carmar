import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Igual que dev/seed: cargar .env explícitamente si existe
const envFile = fileURLToPath(new URL(".env", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
