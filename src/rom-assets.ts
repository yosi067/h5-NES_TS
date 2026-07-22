export function getRomAssetUrl(baseUrl: string, filename: string): string {
  const encodedFilename = encodeURIComponent(filename).replace(/%2C/gi, ',');
  return `${baseUrl}roms/${encodedFilename}`;
}

export function hasN64RomMagic(romData: ArrayBuffer): boolean {
  if (romData.byteLength < 4) return false;

  const bytes = new Uint8Array(romData, 0, 4);
  return (
    (bytes[0] === 0x80 && bytes[1] === 0x37 && bytes[2] === 0x12 && bytes[3] === 0x40) ||
    (bytes[0] === 0x37 && bytes[1] === 0x80 && bytes[2] === 0x40 && bytes[3] === 0x12) ||
    (bytes[0] === 0x40 && bytes[1] === 0x12 && bytes[2] === 0x37 && bytes[3] === 0x80)
  );
}