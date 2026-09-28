import path from "node:path";
import { fileURLToPath } from "node:url";

// Tailwind looks for its config in the working directory by default; point it
// at this project so the build works wherever the process starts (cPanel).
const projectDir = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    tailwindcss: { config: path.join(projectDir, "tailwind.config.ts") },
    autoprefixer: {},
  },
};

export default config;
