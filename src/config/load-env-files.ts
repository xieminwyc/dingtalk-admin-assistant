import fs from "node:fs";
import path from "node:path";

import { config as loadDotenv } from "dotenv";

export function loadEnvFiles(cwd: string = process.cwd()) {
  const candidates = [".env.local", ".env"];

  for (const filename of candidates) {
    const fullPath = path.join(cwd, filename);

    if (fs.existsSync(fullPath)) {
      loadDotenv({ path: fullPath });
    }
  }
}
