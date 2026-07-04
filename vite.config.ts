import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.GITHUB_PAGES ? "/WallFu/" : "/",
  server: {
    host: true, // listen on all interfaces so other machines on the LAN can reach the dev server
  },
  preview: {
    host: true,
  },
});
