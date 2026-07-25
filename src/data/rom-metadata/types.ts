export interface RomMetadataInput {
  name: string;
  file: string;
  system?: string;
}

export interface RomMagazineMeta {
  year: string;
  genre: string;
  players: string;
}

export type RomMetadataTable = Record<string, RomMagazineMeta>;