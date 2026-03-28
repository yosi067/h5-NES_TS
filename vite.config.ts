import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, readdirSync, existsSync, readFileSync, statSync } from 'fs';

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
          // 支援 .nes, .NES, .gb, .gbc, .gg, .sms, .smc, .sfc 副檔名
          const lower = file.toLowerCase();
          if (lower.endsWith('.nes') || lower.endsWith('.gb') || lower.endsWith('.gbc') || lower.endsWith('.gg') || lower.endsWith('.sms') || lower.endsWith('.smc') || lower.endsWith('.sfc')) {
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

// 在開發模式下正確處理 .smc/.sfc ROM 檔案的二進位請求
// (Vite 不認識這些副檔名，會誤觸 SPA fallback 回傳 index.html)
function serveRomBinaryPlugin() {
  return {
    name: 'serve-rom-binary',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        const url = decodeURIComponent(req.url || '');
        const lower = url.toLowerCase();
        if (lower.startsWith('/roms/') && (lower.endsWith('.smc') || lower.endsWith('.sfc'))) {
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
  // 將 WASM 及 ROM 檔案視為靜態資源
  assetsInclude: ['**/*.wasm', '**/*.smc', '**/*.sfc'],
  // 將 public 目錄設為根目錄
  publicDir: 'public',
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
  plugins: [copyRomsPlugin(), serveRomBinaryPlugin()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
});
