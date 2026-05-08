import dotenv from "dotenv";
// Load .env into process.env, overriding any pre-existing values from the
// parent shell. Without `override: true`, an empty ANTHROPIC_API_KEY exported
// by some IDE / desktop tooling can shadow the value in .env.
dotenv.config({ override: true, quiet: true });

import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  resolve: {
    tsconfigPaths: true,
  },
});
