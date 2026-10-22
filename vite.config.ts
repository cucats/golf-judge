import adapter from "@sveltejs/adapter-bun";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    sveltekit({
      adapter: adapter({
        serverOptions: {
          idleTimeout: 120,
          maxRequestBodySize: 2 * 1024 * 1024,
        },
      }),
      paths: { origin: process.env.BUILD_ORIGIN || undefined },
    }),
  ],
});
