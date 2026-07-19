export const N64_REBUILT_ASSET_VERSION = '7f0ebbf78c-64m1';

export function getN64RuntimeAssetUrl(
  baseUrl: string,
  path: string,
  useRebuiltRuntime: boolean,
): string {
  const directory = useRebuiltRuntime ? 'n64-fork' : 'n64-mupen';
  const url = `${baseUrl}${directory}/${path}`;
  return useRebuiltRuntime ? `${url}?v=${N64_REBUILT_ASSET_VERSION}` : url;
}