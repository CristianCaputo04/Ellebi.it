import { resolve } from "node:path";
import { defineConfig } from "vite";
import { createHtmlPlugin } from "vite-plugin-html";

const root = resolve(__dirname);

// Ogni pagina statica del sito diventa un entry point Rollup separato:
// Vite genera un bundle CSS/JS ottimizzato e con hash per ciascuna,
// ma tutte condividono lo stesso main.scss/main.js grazie al code-splitting.
const pages = {
  index: "index.html",
  404: "404.html",
  accessibilita: "accessibilita.html",
};

export default defineConfig({
  root,
  base: "/",

  plugins: [
    // Inietta i partial (header, footer, meta) tramite sintassi EJS
    // <%- include('./src/partials/header.html') %> in ogni pagina HTML,
    // così l'header e il footer restano scritti una volta sola.
    createHtmlPlugin({
      minify: true,
      pages: Object.values(pages).map((filename) => ({
        filename,
        template: filename,
        injectOptions: {
          // ejs.include() risolve i percorsi relativi rispetto a "filename":
          // senza impostarlo esplicitamente non trova src/partials/*.html.
          ejsOptions: { filename: resolve(root, filename) },
        },
      })),
    }),
  ],

  css: {
    preprocessorOptions: {
      scss: {
        // API moderna di Dart Sass: elimina i warning di deprecazione
        // sull'@import legacy usati dalle versioni precedenti di Vite/Sass.
        api: "modern-compiler",
      },
    },
    devSourcemap: true,
  },

  build: {
    outDir: "dist",
    assetsDir: "assets",
    // Rimane sotto la soglia di inlining base64: i font woff2 e le icone
    // piccole restano file separati e sfruttano la cache HTTP a lungo termine.
    assetsInlineLimit: 0,
    rollupOptions: {
      input: Object.fromEntries(
        Object.entries(pages).map(([name, filename]) => [name, resolve(root, filename)])
      ),
      output: {
        // Nomi con hash del contenuto: cache "immutable" sicura lato Cloudflare,
        // vedi public/_headers per le regole di Cache-Control corrispondenti.
        entryFileNames: "assets/js/[name]-[hash].js",
        chunkFileNames: "assets/js/[name]-[hash].js",
        assetFileNames: (assetInfo) => {
          const name = assetInfo.name ?? "";
          if (name.endsWith(".css")) return "assets/css/[name]-[hash][extname]";
          if (/\.(woff2?|ttf|otf)$/.test(name)) return "assets/fonts/[name][extname]";
          return "assets/[name]-[hash][extname]";
        },
      },
    },
    cssCodeSplit: false,
  },

  server: {
    port: 5173,
    open: true,
  },
});
