import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, readdirSync, existsSync } from 'fs';

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
          // 支援 .nes 和 .NES 副檔名
          if (file.toLowerCase().endsWith('.nes')) {
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
  // 將 WASM 檔案視為靜態資源
  assetsInclude: ['**/*.wasm'],
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
  plugins: [copyRomsPlugin()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
});
