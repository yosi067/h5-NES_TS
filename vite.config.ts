import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, readdirSync, existsSync, readFileSync, statSync, writeFileSync } from 'fs';
import { getN64RebuiltAssetFileName } from './src/n64/runtime-assets';

function copyDirectory(sourceDir: string, destinationDir: string): void {
  mkdirSync(destinationDir, { recursive: true });
  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = resolve(sourceDir, entry.name);
    const destinationPath = resolve(destinationDir, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(sourcePath, destinationPath);
    } else if (entry.isFile()) {
      copyFileSync(sourcePath, destinationPath);
    }
  }
}

function getMupen64AssetFiles(sourceDir: string): string[] {
  // mupen64plus-web 的 wasm/data 檔名含有版本 hash，因此用目錄掃描避免升降版後失效。
  const runtimeFiles = existsSync(sourceDir)
    ? readdirSync(sourceDir).filter(file => /^index\..*\.(wasm|data)$/.test(file))
    : [];
  return [...runtimeFiles, 'mupen64plus.cfg'];
}

function getVersionedRebuiltRuntimeFiles(sourceDir: string): Array<{
  sourceName: string;
  publishedName: string;
}> {
  if (!existsSync(sourceDir)) return [];
  return readdirSync(sourceDir)
    .filter(file => file === 'main.bundle.js' || /^index\..*\.(wasm|data)$/.test(file))
    .map(sourceName => ({
      sourceName,
      publishedName: getN64RebuiltAssetFileName(sourceName),
    }));
}

function assertRebuiltMupenAssets(sourceDir: string): void {
  const files = existsSync(sourceDir) ? readdirSync(sourceDir) : [];
  const manifestPath = resolve(sourceDir, 'h5-nes-build.json');
  const missing = [
    ...(!files.includes('main.bundle.js') ? ['main.bundle.js'] : []),
    ...(!files.some(file => /^index\..*\.wasm$/.test(file)) ? ['index.<hash>.wasm'] : []),
    ...(!files.some(file => /^index\..*\.data$/.test(file)) ? ['index.<hash>.data'] : []),
    ...(!existsSync(manifestPath) ? ['h5-nes-build.json'] : []),
  ];
  if (missing.length > 0) {
    throw new Error(
      `Rebuilt N64 runtime is incomplete (${missing.join(', ')}). ` +
      'Restore artifacts/n64/mupen64plus-web-1.5.7-baseline or run npm run n64:build.',
    );
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, '')) as {
    initialMemoryBytes?: number;
  };
  if (manifest.initialMemoryBytes !== 64 * 1024 * 1024) {
    throw new Error(
      'Rebuilt N64 runtime does not have the required 64 MiB initial memory. ' +
      'Run npm run n64:build before creating a production build.',
    );
  }
}

function preserveLegacyMainEntryAliases() {
  const legacyAliases = ['main-B7UcPLyS.js', 'main-C1H5E3qI.js'];
  return {
    name: 'preserve-legacy-main-entry-aliases',
    writeBundle() {
      const assetsDir = resolve(__dirname, 'dist/assets');
      const indexHtmlPath = resolve(__dirname, 'dist/index.html');
      const indexHtml = existsSync(indexHtmlPath) ? readFileSync(indexHtmlPath, 'utf8') : '';
      const currentEntry = /assets\/(main-[^/]+\.js)/.exec(indexHtml)?.[1];
      if (!currentEntry) return;
      for (const alias of legacyAliases) {
        if (alias !== currentEntry) {
          copyFileSync(resolve(assetsDir, currentEntry), resolve(assetsDir, alias));
        }
      }
    },
  };
}

// 複製 roms 目錄的 plugin
function copyRomsPlugin() {
  return {
    name: 'copy-roms',
    writeBundle() {
      const romsDir = resolve(__dirname, 'roms');
      const distRomsDir = resolve(__dirname, 'dist/roms');
      const isPagesDeploy = process.env.PAGES_DEPLOY === 'true';
      const catalogPath = resolve(__dirname, 'public/roms.json');
      const catalog = JSON.parse(readFileSync(catalogPath, 'utf8')) as {
        roms: Array<{ file: string; system: string }>;
      };
      const pagesExcludedRomFiles = new Set([
        'samsh5sp.zip',
        'kof2001.zip',
        'kof2002.zip',
        'kof2003.zip',
        'tmnt.zip',
        'sengoku3.zip',
        'captcomm.zip',
        'strider.zip',
        'knights.zip',
        'sonicwi3.zip',
        'punisher.zip',
        'snowbros.zip',
        'tetris.zip',
        '1943.zip',
        '1200合1.zip',
        '6合1.zip',
        '6in1.zip',
        '54合1.zip',
        '0009 - 天使之翼5 (繁)(劇情漢化)(Angel_Poon).SMC',
        '0030 - 哆啦A夢4-大雄和月之王國 (簡)(少量漢化)(hxr-dc).SMC',
        '0002 - GO!GO!惡魔少年 (繁)(V1.01)(模擬中文網漢化小組).zip',
        '0033 - 斬3 (繁)(V1.0)(天空漢化組).zip',
        '0028 - 風塵英雄 (簡)(V0.1)(fenghaim14).zip',
        '0037 - 釣魚太郎 (繁)(完全漢化)(Angel_Poon等).zip',
        'rbffspec.zip',
        'garou.zip',
        'mslug3b6.zip',
      ]);
      const deployedRoms = isPagesDeploy
        ? catalog.roms.filter(rom => !pagesExcludedRomFiles.has(rom.file))
        : catalog.roms;
      const deployedFiles = new Set(deployedRoms.map(rom => rom.file));
      
      if (existsSync(romsDir)) {
        if (!existsSync(distRomsDir)) {
          mkdirSync(distRomsDir, { recursive: true });
        }
        
        const files = readdirSync(romsDir);
        files.forEach(file => {
          // 支援家用主機 ROM 與 ZIP 封裝。
          const lower = file.toLowerCase();
          if (deployedFiles.has(file) && (lower.endsWith('.nes') || lower.endsWith('.gb') || lower.endsWith('.gbc') || lower.endsWith('.gg') || lower.endsWith('.sms') || lower.endsWith('.smc') || lower.endsWith('.sfc') || lower.endsWith('.fig') || lower.endsWith('.z64') || lower.endsWith('.n64') || lower.endsWith('.v64') || lower.endsWith('.zip'))) {
            copyFileSync(
              resolve(romsDir, file),
              resolve(distRomsDir, file)
            );
            console.log(`Copied: ${file}`);
          }
        });
      }

      if (isPagesDeploy) {
        writeFileSync(
          resolve(__dirname, 'dist/roms.json'),
          `${JSON.stringify({ ...catalog, roms: deployedRoms }, null, 2)}\n`,
        );
        console.log(`GitHub Pages catalog excludes ${catalog.roms.length - deployedRoms.length} ROMs`);
      }
    }
  };
}

// 在開發模式下正確處理 Vite 不認識的 ROM 二進位請求。
// (Vite 不認識這些副檔名，會誤觸 SPA fallback 回傳 index.html)
function serveRomBinaryPlugin() {
  return {
    name: 'serve-rom-binary',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        const url = decodeURIComponent(req.url || '');
        const lower = url.toLowerCase();
        if (lower.startsWith('/roms/') && (lower.endsWith('.smc') || lower.endsWith('.sfc') || lower.endsWith('.fig') || lower.endsWith('.z64') || lower.endsWith('.n64') || lower.endsWith('.v64') || lower.endsWith('.zip'))) {
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
  const forkSourceDir = resolve(__dirname, 'artifacts/n64/mupen64plus-web-1.5.7-baseline');
  const forkPublicPath = '/n64-fork/';

  return {
    name: 'mupen64-assets',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        const url = decodeURIComponent(req.url || '').split('?')[0];
        if (url === '/__n64-benchmark' && req.method === 'POST') {
          let body = '';
          req.setEncoding('utf8');
          req.on('data', (chunk: string) => {
            if (body.length < 64 * 1024) body += chunk;
          });
          req.on('end', () => {
            try {
              const result = JSON.parse(body);
              console.log('\n[N64 benchmark received]');
              console.log(JSON.stringify(result, null, 2));
              res.statusCode = 204;
              res.end();
            } catch {
              res.statusCode = 400;
              res.end('Invalid benchmark result');
            }
          });
          return;
        }

        if (url.startsWith(forkPublicPath)) {
          const requestedName = url.slice(forkPublicPath.length);
          const versionedFile = getVersionedRebuiltRuntimeFiles(forkSourceDir)
            .find(file => file.publishedName === requestedName);
          const filePath = resolve(forkSourceDir, versionedFile?.sourceName ?? requestedName);
          if (filePath.startsWith(`${forkSourceDir}\\`) && existsSync(filePath) && statSync(filePath).isFile()) {
            const stat = statSync(filePath);
            const contentType = filePath.endsWith('.wasm')
              ? 'application/wasm'
              : filePath.endsWith('.js') ? 'text/javascript' : 'application/octet-stream';
            res.setHeader('Content-Type', contentType);
            res.setHeader('Content-Length', stat.size);
            res.end(readFileSync(filePath));
            return;
          }
          next();
          return;
        }

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
      assertRebuiltMupenAssets(forkSourceDir);
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

      const forkDistDir = resolve(__dirname, 'dist/n64-fork');
      copyDirectory(forkSourceDir, forkDistDir);
      for (const file of getVersionedRebuiltRuntimeFiles(forkSourceDir)) {
        copyFileSync(
          resolve(forkSourceDir, file.sourceName),
          resolve(forkDistDir, file.publishedName),
        );
      }
      console.log('Copied rebuilt N64 mobile runtime');
    },
  };
}

function emulatorJsAssetsPlugin() {
  const hostDataDir = resolve(__dirname, 'node_modules/@emulatorjs/emulatorjs/data');
  const coreDirs = [
    resolve(__dirname, 'node_modules/@emulatorjs/core-snes9x'),
    resolve(__dirname, 'node_modules/@emulatorjs/core-fceumm'),
    resolve(__dirname, 'node_modules/@emulatorjs/core-genesis_plus_gx'),
  ];
  const publicPath = '/emulatorjs/data/';

  const resolveAsset = (relativePath: string): string => {
    if (relativePath.startsWith('cores/')) {
      const corePath = relativePath.slice('cores/'.length);
      for (const coreDir of coreDirs) {
        const candidate = corePath.startsWith('reports/')
          ? resolve(coreDir, 'reports', corePath.slice('reports/'.length))
          : resolve(coreDir, corePath);
        if (existsSync(candidate)) return candidate;
      }
    }
    return resolve(hostDataDir, relativePath);
  };

  return {
    name: 'emulatorjs-assets',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        const url = decodeURIComponent(req.url || '').split('?')[0];
        if (!url.startsWith(publicPath)) return next();
        const filePath = resolveAsset(url.slice(publicPath.length));
        if (!existsSync(filePath) || !statSync(filePath).isFile()) return next();
        const stat = statSync(filePath);
        const contentType = filePath.endsWith('.js') ? 'text/javascript'
          : filePath.endsWith('.css') ? 'text/css'
          : filePath.endsWith('.json') ? 'application/json'
          : 'application/octet-stream';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Length', stat.size);
        res.end(readFileSync(filePath));
      });
    },
    writeBundle() {
      const distDataDir = resolve(__dirname, 'dist/emulatorjs/data');
      copyDirectory(hostDataDir, distDataDir);
      const distCoresDir = resolve(distDataDir, 'cores');
      mkdirSync(resolve(distCoresDir, 'reports'), { recursive: true });
      for (const coreDir of coreDirs) {
        for (const file of readdirSync(coreDir)) {
          if (file.endsWith('.data')) {
            copyFileSync(resolve(coreDir, file), resolve(distCoresDir, file));
          }
        }
        copyDirectory(resolve(coreDir, 'reports'), resolve(distCoresDir, 'reports'));
      }
      console.log('Copied EmulatorJS Snes9x, FCEUmm, and Genesis Plus GX runtimes');
    },
  };
}

function romPatcherAssetsPlugin() {
  const sourceDir = resolve(__dirname, 'node_modules/rom-patcher/rom-patcher-js/modules');
  const assetFiles = ['BinFile.js', 'HashCalculator.js', 'RomPatcher.format.bps.js'];
  const publicPath = '/rom-patcher/';

  return {
    name: 'rom-patcher-assets',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        const url = decodeURIComponent(req.url || '').split('?')[0];
        if (!url.startsWith(publicPath)) return next();
        const fileName = url.slice(publicPath.length);
        if (!assetFiles.includes(fileName)) return next();
        const filePath = resolve(sourceDir, fileName);
        if (!existsSync(filePath)) return next();
        res.setHeader('Content-Type', 'text/javascript');
        res.end(readFileSync(filePath));
      });
    },
    writeBundle() {
      const destinationDir = resolve(__dirname, 'dist/rom-patcher');
      mkdirSync(destinationDir, { recursive: true });
      for (const fileName of assetFiles) {
        copyFileSync(resolve(sourceDir, fileName), resolve(destinationDir, fileName));
      }
      console.log('Copied RomPatcher.js BPS worker assets');
    },
  };
}

export default defineConfig({
  // GitHub Pages 部署需要設定正確的 base 路徑
  // 使用環境變數 VITE_BASE_PATH，預設為 './' (本地開發)
  // GitHub Actions會依repository path設定為 '/<name>/'
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
  assetsInclude: ['**/*.wasm', '**/*.smc', '**/*.sfc', '**/*.fig', '**/*.z64', '**/*.n64', '**/*.v64', '**/*.zip'],
  // 將 public 目錄設為根目錄
  publicDir: 'public',
  build: {
    target: 'es2018',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        translationStudio: resolve(__dirname, 'translation-studio.html'),
      },
      output: {
        manualChunks: undefined,
      },
    },
  },
  plugins: [preserveLegacyMainEntryAliases(), copyRomsPlugin(), serveRomBinaryPlugin(), mupen64AssetsPlugin(), emulatorJsAssetsPlugin(), romPatcherAssetsPlugin()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
});
