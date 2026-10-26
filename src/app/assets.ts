/**
 * public/ 靜態資源網址（支援 GitHub Pages 子目錄）。
 */

export function getPublicAssetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path}`;
}
