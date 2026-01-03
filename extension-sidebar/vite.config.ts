import { defineConfig } from 'vite';
import { resolve } from 'path';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { existsSync, copyFileSync } from 'fs';

export default defineConfig({
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background.ts'),
        contentScript: resolve(__dirname, 'src/contentScript.ts'),
        sidebar: resolve(__dirname, 'src/sidebar/sidebar.ts'),
        analysis: resolve(__dirname, 'src/analysis/analysis.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
  plugins: [
    viteStaticCopy({
      targets: [
        { src: 'src/sidebar/sidebar.html', dest: '' },
        { src: 'src/sidebar/sidebar.css', dest: '' },
        { src: 'src/analysis/analysis.html', dest: '' },
        { src: 'src/analysis/analysis.css', dest: '' },
        { src: 'manifest.json', dest: '' },
        { src: 'icons/*', dest: 'icons' },
      ],
    }),
    // Custom plugin to conditionally copy PDF worker file
    {
      name: 'copy-pdf-worker',
      writeBundle() {
        const workerPaths = [
          'node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
          'node_modules/pdfjs-dist/build/pdf.worker.min.js',
          'node_modules/pdfjs-dist/build/pdf.worker.mjs',
          'node_modules/pdfjs-dist/build/pdf.worker.js',
        ];
        
        for (const workerPath of workerPaths) {
          const fullPath = resolve(__dirname, workerPath);
          if (existsSync(fullPath)) {
            const destPath = resolve(__dirname, 'dist/pdf.worker.min.js');
            copyFileSync(fullPath, destPath);
            console.log(`Copied PDF worker: ${workerPath} -> dist/pdf.worker.min.js`);
            return;
          }
        }
        
        console.warn('PDF worker file not found. PDF parsing may not work. Run: npm install pdfjs-dist');
      },
    },
  ],
});

