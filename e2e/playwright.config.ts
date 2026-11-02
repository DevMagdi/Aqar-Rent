// Playwright config: playwright-core + @sparticuz/chromium (CDNs are blocked in
// this environment, so no `playwright install` — the binary ships via npm).
// webServer array boots backend (SQLite + MockProvider), Next web, and Vite admin;
// existing dev servers are reused when already running.
import path from "node:path";
import chromium from "@sparticuz/chromium";
import { defineConfig } from "@playwright/test";

process.env.WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "e2e-webhook-secret-change-me";
// Hermetic stack: e2e runs on its own ports with a fresh SQLite DB per run,
// leaving the dev preview servers (3000/5173/8000) untouched.
const E2E_BACKEND = "http://localhost:8010";
const E2E_WEB = "http://localhost:3010";
const E2E_ADMIN = "http://localhost:5180";
process.env.BACKEND_URL = E2E_BACKEND;

const backendEnv = {
  PATH: `${path.resolve(__dirname, "../.venv/bin")}:${process.env.PATH || ""}`,
  APP_ENV: "dev",
  DEBUG: "true",
  SECRET_KEY: "dev-secret-key-arena-stage3a-0123456789",
  DATABASE_URL: "sqlite:///./data/e2e.db", // hermetic: wiped by the webServer command each run
  PAYMENT_PROVIDER: "mock",
  WEBHOOK_SECRET: process.env.WEBHOOK_SECRET,
  STORAGE_LOCAL_ROOT: "./data/storage-e2e",
};

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./global-setup.ts",
  timeout: 300_000,
  expect: { timeout: 20_000 },
  retries: 0,
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: E2E_WEB,
    viewport: { width: 1280, height: 860 },
    locale: "ar-EG",
    timezoneId: "Africa/Cairo",
    actionTimeout: 20_000,
    launchOptions: {
      executablePath: "/tmp/chromium",
      // NOTE: `--single-process`/`--no-zygote` (part of the serverless arg set)
      // break localStorage isolation between BrowserContexts — drop them so the
      // owner and tenant phases get independent sessions.
      args: chromium.args.filter((a) => !a.includes("single-process") && !a.includes("no-zygote")),
      env: {
        ...(process.env as Record<string, string>),
        LD_LIBRARY_PATH: ["/tmp/al2023/lib", process.env.LD_LIBRARY_PATH].filter(Boolean).join(":"),
      },
    },
  },
  webServer: [
    {
      command:
        "rm -f data/e2e.db data/e2e.db-journal data/e2e.db-wal data/e2e.db-shm && alembic upgrade head && python -m app.scripts.seed && uvicorn app.main:app --host 0.0.0.0 --port 8010",
      cwd: "../backend",
      url: "http://localhost:8010/health",
      reuseExistingServer: false,
      timeout: 90_000,
      env: backendEnv,
    },
    {
      command: "npx next dev -H 0.0.0.0 -p 3010",
      cwd: "../web",
      url: "http://localhost:3010/ar",
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        BACKEND_URL: E2E_BACKEND,
        NEXT_PUBLIC_MOCK_PAY: "true",
        WEBHOOK_SECRET: process.env.WEBHOOK_SECRET,
        NEXT_DIST_DIR: ".next-e2e",
        NEXT_PUBLIC_SITE_URL: E2E_WEB, // correct absolute canonicals/OG in tests
      },
    },
    {
      command: "npx vite --host 0.0.0.0 --port 5180",
      cwd: "../admin",
      url: "http://localhost:5180/",
      reuseExistingServer: false,
      timeout: 90_000,
      env: { BACKEND_URL: E2E_BACKEND },
    },
  ],
});
