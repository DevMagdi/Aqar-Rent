// Prepare the sandbox browser before workers start:
// 1) inflate Amazon-Linux shared libs from @sparticuz/chromium (…/bin/al2023.tar.br)
//    because the package only auto-inflates on real Amazon Linux,
// 2) extract the Chromium binary to /tmp/chromium,
// 3) export LD_LIBRARY_PATH for the browser process.
// NOTE: /tmp is wiped between agent tool calls, so this runs inside every
// `playwright test` invocation (globalSetup runs in-process before launch).
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import chromium, { inflate } from "@sparticuz/chromium";

function regenerateFixtures(): void {
  // The backend's perceptual-hash duplicate guard rejects identical photos
  // across listings of the same owner, so each run seeds fresh noise.
  const py = process.env.E2E_PYTHON || "/home/user/Aqar-Rent/.venv/bin/python";
  const res = spawnSync(py, [path.join(__dirname, "make_fixtures.py"), String(Date.now())], {
    cwd: __dirname,
    encoding: "utf8",
  });
  if (res.status !== 0) {
    throw new Error(`fixture generation failed: ${res.stderr || res.stdout}`);
  }
}

export default async function globalSetup(): Promise<void> {
  regenerateFixtures();
  const libDir = "/tmp/al2023/lib";
  if (!fs.existsSync(path.join(libDir, "libnss3.so"))) {
    const brPath = path.join(__dirname, "node_modules", "@sparticuz", "chromium", "bin", "al2023.tar.br");
    if (fs.existsSync(brPath)) {
      await inflate(brPath);
    }
  }
  if (!fs.existsSync(path.join(libDir, "libnss3.so"))) {
    throw new Error(`Chromium shared libs missing at ${libDir} (inflate failed)`);
  }
  const exe = await chromium.executablePath(); // extracts /tmp/chromium if needed
  if (!fs.existsSync(exe)) throw new Error(`Chromium binary missing: ${exe}`);
  process.env.LD_LIBRARY_PATH = [libDir, process.env.LD_LIBRARY_PATH].filter(Boolean).join(":");
  // eslint-disable-next-line no-console
  console.log(`[e2e] chromium ready: ${exe} (LD_LIBRARY_PATH=${process.env.LD_LIBRARY_PATH})`);
}
