// Server for the Playwright tests: a throwaway in-memory MongoDB plus the
// production build (`next start`) on port 3200. Never touches your real database.
// Started automatically by `npm run test:e2e` (see playwright.config.ts).
import { spawn } from "node:child_process";
import { MongoMemoryServer } from "mongodb-memory-server";

const PORT = process.env.E2E_PORT ?? "3200";
const mongod = await MongoMemoryServer.create();

const next = spawn("npx", ["next", "start", "-p", PORT], {
  stdio: "inherit",
  env: {
    ...process.env,
    MONGODB_URI: mongod.getUri("clinic_e2e"),
    ENABLE_DEV_SEED: "true", // lets the test load the demo data into this throwaway DB
  },
});

async function shutdown(code = 0) {
  next.kill("SIGTERM");
  await mongod.stop();
  process.exit(code);
}
process.on("SIGINT", () => shutdown());
process.on("SIGTERM", () => shutdown());
next.on("exit", (code) => shutdown(code ?? 0));
