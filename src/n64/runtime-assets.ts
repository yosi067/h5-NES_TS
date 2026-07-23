export const N64_REBUILT_ASSET_VERSION = '7f0ebbf78c-64m2';

export function shouldRetryN64WithNpm(userAgent: string, forceNpmRuntime: boolean): boolean {
  return !forceNpmRuntime && /Android/i.test(userAgent);
}

export function getN64RebuiltAssetFileName(path: string): string {
  const extensionIndex = path.lastIndexOf('.');
  if (extensionIndex < 0) return `${path}.${N64_REBUILT_ASSET_VERSION}`;
  return `${path.slice(0, extensionIndex)}.${N64_REBUILT_ASSET_VERSION}${path.slice(extensionIndex)}`;
}

export function getN64RuntimeAssetUrl(
  baseUrl: string,
  path: string,
  useRebuiltRuntime: boolean,
): string {
  const directory = useRebuiltRuntime ? 'n64-fork' : 'n64-mupen';
  const fileName = useRebuiltRuntime ? getN64RebuiltAssetFileName(path) : path;
  return `${baseUrl}${directory}/${fileName}`;
}

export function getN64RuntimeImportUrl(
  documentBaseUrl: string,
  baseUrl: string,
): string {
  return new URL(
    getN64RuntimeAssetUrl(baseUrl, 'main.bundle.js', true),
    documentBaseUrl,
  ).href;
}