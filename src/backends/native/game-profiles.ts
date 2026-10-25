/**
 * 遊戲設定檔（BPS 修補、畫面提示）的索引與套用。
 */
import { applyBpsPatch } from '../../game-profiles/bps';
import JSZip from 'jszip';
import { runtime } from '../../app/runtime';
import { throwIfSignalAborted } from '../../app/async';
import { sha256Hex } from '../../app/storage';
import { ControllerButton } from '../../input/buttons';

interface GameProfileIndex {
  schemaVersion: number;
  profiles: Record<string, string>;
}


interface GamePresentationRect {
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
}


interface GamePresentationLabel {
  text: string;
  x: number;
  y: number;
  size: number;
  align?: CanvasTextAlign;
  color?: string;
}


export interface GamePresentationRegionGuard {
  x: number;
  y: number;
  width: number;
  height: number;
  hash: string;
  sampleStep?: number;
}


interface GamePresentationCue {
  id: string;
  trigger: {
    type: 'frame' | 'afterInput';
    from: number;
    to?: number;
  };
  regionGuard?: GamePresentationRegionGuard;
  masks: GamePresentationRect[];
  labels: GamePresentationLabel[];
}


export interface GamePresentation {
  schemaVersion: number;
  profileId: string;
  inputArmFrame: number;
  cues: GamePresentationCue[];
}


export interface PreparedGameProfile {
  romBytes: Uint8Array;
  runtimeJson: string | null;
  presentation: GamePresentation | null;
}


interface GmodManifestV2 {
  format: 'gmod';
  formatVersion: 2;
  profileId: string;
  platform: 'nes';
  source: { sha256: string; sha256Aliases?: string[] };
  target: { sha256: string };
  patch: { format: 'bps'; file: string };
  runtime?: { file: string };
  presentation?: { file: string };
}


let gameProfileIndexPromise: Promise<GameProfileIndex> | null = null;


async function loadGameProfileIndex(signal?: AbortSignal): Promise<GameProfileIndex> {
  if (!gameProfileIndexPromise) {
    const url = new URL('game-profiles/index.json', window.location.href);
    gameProfileIndexPromise = fetch(url, { signal })
      .then(async response => {
        if (!response.ok) throw new Error(`profile index HTTP ${response.status}`);
        const index = await response.json() as GameProfileIndex;
        if (index.schemaVersion !== 1 || typeof index.profiles !== 'object') {
          throw new Error('unsupported game profile index');
        }
        return index;
      })
      .catch(error => {
        gameProfileIndexPromise = null;
        throw error;
      });
  }
  return gameProfileIndexPromise;
}


export async function prepareGameProfileForRom(romBytes: Uint8Array, signal?: AbortSignal): Promise<PreparedGameProfile | null> {
  runtime.activeGamePresentation = null;
  runtime.activeGamePresentationFrame = 0;
  runtime.activeGamePresentationInputFrame = null;
  if (!globalThis.crypto?.subtle) return null;
  const sha256 = await sha256Hex(romBytes);
  throwIfSignalAborted(signal);
  const index = await loadGameProfileIndex(signal);
  const profilePath = index.profiles[sha256];
  if (!profilePath) return null;

  const response = await fetch(new URL(profilePath, window.location.href), { signal });
  if (!response.ok) throw new Error(`profile HTTP ${response.status}`);
  let runtimeJson: string | null = null;
  let presentation: GamePresentation | null = null;
  if (profilePath.toLowerCase().endsWith('.gmod')) {
    const archive = await JSZip.loadAsync(await response.arrayBuffer());
    const manifestFile = archive.file('manifest.json');
    if (!manifestFile) throw new Error('gmod package is missing manifest.json');
    const manifest = JSON.parse(await manifestFile.async('string')) as GmodManifestV2 | { formatVersion: 1 };
    if (manifest.formatVersion === 2) {
      const v2 = manifest as GmodManifestV2;
      const acceptedSources = [v2.source?.sha256, ...(v2.source?.sha256Aliases ?? [])];
      if (v2.format !== 'gmod' || v2.platform !== 'nes' || v2.patch?.format !== 'bps'
          || !acceptedSources.includes(sha256)) {
        throw new Error('gmod v2 manifest does not match the source ROM');
      }
      const patchFile = archive.file(v2.patch.file);
      if (!patchFile) throw new Error(`gmod package is missing ${v2.patch.file}`);
      const patchedBytes = await applyBpsPatch(romBytes, await patchFile.async('uint8array'));
      if (await sha256Hex(patchedBytes) !== v2.target?.sha256) {
        throw new Error('gmod target SHA-256 mismatch');
      }
      const runtime = v2.runtime ? archive.file(v2.runtime.file) : null;
      if (v2.runtime && !runtime) throw new Error(`gmod package is missing ${v2.runtime.file}`);
      runtimeJson = runtime ? await runtime.async('string') : null;
      const presentationFile = v2.presentation ? archive.file(v2.presentation.file) : null;
      if (v2.presentation && !presentationFile) throw new Error(`gmod package is missing ${v2.presentation.file}`);
      presentation = presentationFile
        ? JSON.parse(await presentationFile.async('string')) as GamePresentation
        : null;
      return { romBytes: patchedBytes, runtimeJson, presentation };
    }
    const runtime = archive.file('runtime.json');
    if (!runtime) throw new Error('gmod package is missing runtime.json');
    runtimeJson = await runtime.async('string');
    const presentationFile = archive.file('presentation.json');
    if (presentationFile) {
      presentation = JSON.parse(await presentationFile.async('string')) as GamePresentation;
    }
  } else {
    runtimeJson = await response.text();
  }
  return { romBytes, runtimeJson, presentation };
}


export function activatePreparedGameProfile(prepared: PreparedGameProfile): void {
  if (!runtime.nes || !prepared.runtimeJson) return;
  runtime.nes.loadGameProfile(prepared.runtimeJson);
  const presentation = prepared.presentation;
  if (presentation?.schemaVersion === 1 && presentation.profileId === runtime.nes.getActiveGameProfileId()) {
    runtime.activeGamePresentation = presentation;
  }
  console.log(`[NES] 已套用遊戲設定檔 ${runtime.nes.getActiveGameProfileId()}`);
}


export function noteGamePresentationInput(button: ControllerButton, pressed: boolean): void {
  if (!pressed || !runtime.activeGamePresentation || runtime.activeGamePresentationInputFrame !== null) return;
  if (button !== ControllerButton.A && button !== ControllerButton.Start) return;
  if (runtime.activeGamePresentationFrame < runtime.activeGamePresentation.inputArmFrame) return;
  runtime.activeGamePresentationInputFrame = runtime.activeGamePresentationFrame;
}
