import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, readdirSync, existsSync, readFileSync, statSync } from 'fs';

function getMupen64AssetFiles(sourceDir: string): string[] {
  // mupen64plus-web 的 wasm/data 檔名含有版本 hash，因此用目錄掃描避免升降版後失效。
  const runtimeFiles = existsSync(sourceDir)
    ? readdirSync(sourceDir).filter(file => /^index\..*\.(wasm|data)$/.test(file))
    : [];
  return [...runtimeFiles, 'mupen64plus.cfg'];
}

// 複製 roms 目錄的 plugin
function copyRomsPlugin() {
  return {
    name: 'copy-roms',
    writeBundle() {
      const romsDir = resolve(__dirname, 'roms');
      const distRomsDir = resolve(__dirname, 'dist/roms');
      
      if (existsSync(romsDir)) {
        if (!existsSync(distRomsDir)) {
          mkdirSync(distRomsDir, { recursive: true });
        }
        
        const files = readdirSync(romsDir);
        files.forEach(file => {
          // 支援 .nes, .NES, .gb, .gbc, .gg, .sms, .smc, .sfc, .z64, .zip 副檔名
          const lower = file.toLowerCase();
          if (lower.endsWith('.nes') || lower.endsWith('.gb') || lower.endsWith('.gbc') || lower.endsWith('.gg') || lower.endsWith('.sms') || lower.endsWith('.smc') || lower.endsWith('.sfc') || lower.endsWith('.z64') || lower.endsWith('.n64') || lower.endsWith('.v64') || lower.endsWith('.zip')) {
            copyFileSync(
              resolve(romsDir, file),
              resolve(distRomsDir, file)
            );
            console.log(`Copied: ${file}`);
          }
        });
      }
    }
  };
}

// 在開發模式下正確處理 .smc/.sfc/.z64 ROM 檔案的二進位請求
// (Vite 不認識這些副檔名，會誤觸 SPA fallback 回傳 index.html)
function serveRomBinaryPlugin() {
  return {
    name: 'serve-rom-binary',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        const url = decodeURIComponent(req.url || '');
        const lower = url.toLowerCase();
        if (lower.startsWith('/roms/') && (lower.endsWith('.smc') || lower.endsWith('.sfc') || lower.endsWith('.z64') || lower.endsWith('.n64') || lower.endsWith('.v64') || lower.endsWith('.zip'))) {
          const filePath = resolve(__dirname, url.slice(1)); // 去掉開頭的 /
          if (existsSync(filePath)) {
            const data = readFileSync(filePath);
            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader('Content-Length', data.length);
            res.end(data);
            return;
          }
        }
        next();
      });
    }
  };
}

// 提供 Mupen64Plus-web 的 Emscripten runtime assets。
// JS 會由 Vite bundle；大型 .wasm/.data 則以靜態檔服務，避免被錯誤轉換。
function mupen64AssetsPlugin() {
  const sourceDir = resolve(__dirname, 'node_modules/mupen64plus-web/bin/web');
  const publicPath = '/n64-mupen/';

  return {
    name: 'mupen64-assets',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        const url = decodeURIComponent(req.url || '').split('?')[0];
        if (!url.startsWith(publicPath)) {
          next();
          return;
        }

        const fileName = url.slice(publicPath.length);
        if (!getMupen64AssetFiles(sourceDir).includes(fileName)) {
          next();
          return;
        }

        const filePath = resolve(fileName === 'mupen64plus.cfg' ? resolve(sourceDir, 'data') : sourceDir, fileName);
        if (!existsSync(filePath)) {
          next();
          return;
        }

        const stat = statSync(filePath);
        res.setHeader('Content-Type', fileName.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream');
        res.setHeader('Content-Length', stat.size);
        res.end(readFileSync(filePath));
      });
    },
    writeBundle() {
      const distDir = resolve(__dirname, 'dist/n64-mupen');
      if (!existsSync(distDir)) {
        mkdirSync(distDir, { recursive: true });
      }

      for (const fileName of getMupen64AssetFiles(sourceDir)) {
        const sourcePath = resolve(fileName === 'mupen64plus.cfg' ? resolve(sourceDir, 'data') : sourceDir, fileName);
        if (existsSync(sourcePath)) {
          copyFileSync(sourcePath, resolve(distDir, fileName));
          console.log(`Copied N64 runtime: ${fileName}`);
        }
      }
    },
  };
}

export default defineConfig({
  // GitHub Pages 部署需要設定正確的 base 路徑
  // 使用環境變數 VITE_BASE_PATH，預設為 './' (本地開發)
  // 在 GitHub Actions 中會設定為 '/<repo-name>/'
  base: process.env.VITE_BASE_PATH || './',
  resolve: {
    alias: {
      '@core': resolve(__dirname, 'src/core'),
      '@mappers': resolve(__dirname, 'src/mappers'),
      '@utils': resolve(__dirname, 'src/utils'),
      '@ui': resolve(__dirname, 'src/ui'),
    },
  },
  // 開發伺服器設定
  server: {
    // 允許存取 roms 及 WASM 目錄
    fs: {
      allow: ['..']
    }
  },
  // Exclude nes-wasm from dependency pre-bundling so changes are picked up immediately
  optimizeDeps: {
    exclude: ['nes-wasm']
  },
  // 將 WASM 及 ROM 檔案視為靜態資源
  assetsInclude: ['**/*.wasm', '**/*.smc', '**/*.sfc', '**/*.z64', '**/*.n64', '**/*.v64', '**/*.zip'],
  // 將 public 目錄設為根目錄
  publicDir: 'public',
  build: {
    target: 'es2022',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
  plugins: [copyRomsPlugin(), serveRomBinaryPlugin(), mupen64AssetsPlugin()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
});
