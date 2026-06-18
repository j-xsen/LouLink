import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import { readFileSync, writeFileSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";

// Post-build HTML patches for the client bundle.
// Uses closeBundle (file-system pass) because @cloudflare/vite-plugin writes HTML outside the
// normal Rollup bundle object, so generateBundle/transformIndexHtml don't see the HTML entry.
//
// Patches applied:
//  1. Inline the extracted CSS — eliminates the render-blocking <link rel="stylesheet"> request.
//  2. Inject <link rel="preload" as="image"> for the hashed LCP logo SVG — makes it discoverable
//     from the initial HTML rather than requiring JS to execute first.
function htmlPatchPlugin(): Plugin {
  return {
    name: "html-patch",
    apply: "build",
    closeBundle() {
      const clientDir = "dist/client";
      const assetsDir = join(clientDir, "assets");
      const htmlPath = join(clientDir, "index.html");

      let cssFile: string | null = null;
      let css = "";
      let logoHref: string | null = null;

      try {
        for (const file of readdirSync(assetsDir)) {
          if (file.endsWith(".css")) {
            cssFile = join(assetsDir, file);
            css = readFileSync(cssFile, "utf-8");
          }
          if (file.startsWith("logo-full-color") && file.endsWith(".svg")) {
            logoHref = `/assets/${file}`;
          }
        }
      } catch { return; }

      try {
        let html = readFileSync(htmlPath, "utf-8");

        // 1. Remove the <link rel="stylesheet"> and inline CSS
        if (css && cssFile) {
          html = html.replace(/<link\b[^>]*\brel="stylesheet"[^>]*>/g, (tag) =>
            tag.includes(".css") ? "" : tag
          );
        }

        // 2. Build the injection block: preload + inline style
        let injection = "";
        if (logoHref) {
          injection += `<link rel="preload" as="image" href="${logoHref}" fetchpriority="high">`;
        }
        injection += `<link rel="preload" href="/api/directory" as="fetch" crossorigin="anonymous">`;
        if (css) {
          injection += `<style>${css}</style>`;
        }
        if (injection) {
          html = html.replace("</head>", `${injection}</head>`);
        }

        writeFileSync(htmlPath, html);
        if (cssFile) unlinkSync(cssFile);
      } catch { return; }
    },
  };
}

export default defineConfig({
	plugins: [react(), cloudflare(), htmlPatchPlugin()],
});
