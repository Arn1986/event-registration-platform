import { defineConfig } from "drizzle-kit";

export default defineConfig({ dialect: "sqlite", schema: "./app/infrastructure/db/schema.ts", out: "./migrations" });
