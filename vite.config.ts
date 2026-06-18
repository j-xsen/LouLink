import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import { readFileSync, writeFileSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";

// Inline the app CSS into the HTML to remove the separate render-blocking stylesheet request.
// Uses closeBundle (file-system pass) because @cloudflare/vite-plugin writes HTML outside the
// normal Rollup bundle object, so generateBundle/transformIndexHtml don't see the HTML entry.
function inlineCssPlugin(): Plugin {
  return {
    name: "inline-css",
    apply: "build",
    closeBundle() {
      const clientDir = "dist/client";
      const assetsDir = join(clientDir, "assets");
      const htmlPath = join(clientDir, "index.html");

      let cssFile: string | null = null;
      let css = "";
      try {
        for (const file of readdirSync(assetsDir)) {
          if (file.endsWith(".css")) {
            cssFile = join(assetsDir, file);
            css = readFileSync(cssFile, "utf-8");
            break;
          }
        }
      } catch { return; }
      if (!css || !cssFile) return;

      try {
        let html = readFileSync(htmlPath, "utf-8");
        html = html.replace(/<link\b[^>]*\brel="stylesheet"[^>]*>/g, (tag) =>
          tag.includes(".css") ? "" : tag
        );
        html = html.replace("</head>", `<style>${css}</style></head>`);
        writeFileSync(htmlPath, html);
        unlinkSync(cssFile);
      } catch { return; }
    },
  };
}

export default defineConfig({
	plugins: [react(), cloudflare(), inlineCssPlugin()],
});
