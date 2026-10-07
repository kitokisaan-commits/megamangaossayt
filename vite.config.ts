import vinext from "vinext";
import { defineConfig } from "vite";
export default defineConfig({
  plugins: [vinext()],
  server: { host: "0.0.0.0", allowedHosts: ["terminal.local"] },
  ssr: {
    external: [
      "node:sqlite",
      "sharp",
      "@napi-rs/canvas",
      "yauzl",
      "pdfjs-dist",
    ],
  },
});
