# Star Ocean S-DD1 Native Visual Parity

## 目的與目前結論

本文件記錄《Star Ocean / 銀河遊俠》native SNES core 的畫面 parity 調查，避免重複已完成但沒有判別力的實驗。

- Star Ocean 必須維持 Rust/WASM native routing。
- Snes9x 只作為行為與狀態 oracle，不作為 native implementation。
- Native core 可以載入並執行 Star Ocean；native 600-frame smoke、SRAM round-trip、save-state replay 與 S-DD1 diagnostic records 已通過。
- Native 標題畫面仍與 Snes9x 有嚴重視覺差異。
- 目前最可靠的定位是：在一次相對 130-frame 的狀態比較中，差異集中於 physical VRAM `$8000-$8FFF`，其他 VRAM 區域相符。
- 這次比較尚未與 S-DD1 DMA 事件對齊，因此不能據此判定是 decoder、DMA/PPU 寫入、CPU timing 或 renderer 的錯誤。現階段不應再修改 renderer 或 BG 位址轉換。

## 不可變基線

以下資料是後續實驗的固定 baseline；若新實驗改變其中任何一項，應先記錄原因，不要默默更新 baseline。

| 項目 | 已確認值 |
| --- | --- |
| Native S-DD1 source | `FF:D0AB` |
| Source ROM offset | `0x5FD0AB` |
| Raw input length | `811` bytes |
| Requested decompressed output length | `2084` bytes (`0x0824`) |
| Native output digest | `B9657D0DA921D294` |
| S-DD1 selector map at the transfer | `[0, 1, 4, 5]` |
| Initial VRAM word address | `0x4008` |
| Native first non-zero physical byte in the inspected transfer | 約 `0x803F` |
| Physical VRAM model | 64 KiB byte array |

VRAM register semantics relevant to every comparison are `$2115` increment/remap mode、`$2116/$2117` word address、`$2118/$2119` low/high byte writes。不要把 PPU word address、logical tile address 與 physical VRAM byte offset 混為同一個座標。

## Native DMA 事件基線

目前 native trace 中最重要的相鄰事件如下：

| Native frame | DMA event | 目前意義 |
| ---: | --- | --- |
| 81 | `00:0000 -> $2118/$2119`, count `FFFF` | 後續正常 DMA；不是 S-DD1 decompressed transfer |
| 82 | `FF:D0AB -> $2118/$2119`, count `0824` | 目前已確認的 S-DD1 transfer |

早期的 `C0:8000` transfer 讀到真實 ROM 內容，行為看起來是遊戲刻意執行的 clear sequence，不應再假設它是「從未初始化 WRAM 讀取」。

## 已取得的比較證據

在受控的相對 130-frame 比較中：

| 區域 | 結果 |
| --- | --- |
| VRAM low region | 相符 |
| VRAM middle region | 相符 |
| VRAM high region | 相符 |
| `$8000-$8FFF` | 不相符 |
| Native non-zero count in `$8000-$8FFF` | `1740` |
| Reference non-zero count in `$8000-$8FFF` | `1285` |
| Native first non-zero | `0x803F` |
| Reference first non-zero | `0x806C` |

另一份 byte-stream 紀錄指出，在 `$8010-$8833` 的比較窗口內，native/reference 的第一個不同點約在相對 byte `47`。這些數字只能證明「差異位於 BG3 character-data 對應的 physical VRAM window」；由於兩個 core 的 CPU/PPU/DMA 事件尚未同步，不能把它解讀成 decoder 的第一個錯誤 byte。

S-DD1 source、input/output length、selector map 與 output digest 在 native 端可重複取得。這表示目前至少有一組穩定的 native transfer baseline，但還沒有證明 reference 在同一時刻使用相同的 source/output phase。

## 已排除或降級的假設

下列假設已由局部 probe、native diagnostics 或對照結果顯著降低優先級。除非新的 event-aligned 證據直接推翻它們，否則不要重新開同一組測試。

- BGSC/BGNBA 的廣泛 double conversion 或整體 BG 位址公式錯誤。
- 基本 2bpp/4bpp planar tile decoder 讀取順序錯誤。
- CGRAM palette index 或 color formula 的一般性錯誤。
- S-DD1 transfer 的基本 physical VRAM destination 選錯。
- Canvas dimensions、native framebuffer copy 或顯示尺寸造成的畫面損壞。
- 將 WRAM reset 填成 `0x55` 可以解決差異的假設；該 probe 已完成並回復。
- 早期 `C0:8000` transfer 是未初始化 WRAM 的簡單錯誤來源。

「降級」不代表這些項目在所有時序下已形式化證明正確；它代表在目前證據下，繼續修改它們的資訊增益低於先完成 event alignment。

## 不要重複的測試與工具誤區

- 不要用未同步的 absolute frame number 直接比較 native 與 Snes9x 的 VRAM。Snes9x 重啟後可能保留不同的 internal frame counter；使用相對 advancement 與明確事件 marker。
- 不要把 `EJS_emulator.paused` 當作可靠的執行狀態。參考 harness 應使用 `EJS_emulator.gameManager.toggleMainLoop(0/1)`，並觀察 `_get_current_frame_count()`。
- 不要呼叫不存在的 `debugGetTrapLog()`；native API 的正確名稱是 `debugTrapLog()`。
- 不要再用 WebGL `readPixels` 或 `toDataURL` 作為主要 reference evidence。Serialized state extraction 比 canvas pixel extraction 穩定，優先使用 `EJS_emulator.gameManager.getState()`。
- 不要重跑 broad BGSC/BGNBA conversion probe、基本 tile decoder check、CGRAM formula check、canvas/framebuffer check 或 `0x55` WRAM reset-fill experiment。
- 不要把目前的相對 130-frame diff 當成根因定位；它只是一個 region-localization 結果。
- 不要因為 native smoke 顯示 `status=ok` 就宣稱已完成 visual parity。Smoke 驗證可執行性與 deterministic activity，不能取代 event-aligned pixel/state parity。

## Reference harness 使用規則

Reference state 應透過 isolated Snes9x iframe 的 `EJS_emulator.gameManager.getState()` 取得。已知可用的 state block 包含 `VRA`、`RAM`、`FIL`、`DMA` 與 `PPU`；後續比較至少要保留：

- PPU `$2115-$2117` 對應的 VRAM address/increment state。
- DMA channel registers、direction、A-address mode、source bank/address 與 count。
- S-DD1 selectors/enables（若該 state block 暴露）。
- DMA 前後的 WRAM 相關窗口。
- physical VRAM `$8000-$8FFF` 的 before/after bytes。

參考流程必須以「相對於可觀察事件」的步數記錄，而不是以頁面載入後的 absolute frame 作 key。若 browser page 已不存在，先重建 isolated reference page，再進行任何比較；不要把舊頁面的 frame number 與新頁面混用。

## 後續路徑排序

### 1. DMA 事件對齊的 Snes9x state capture（最高優先）

目標是在 S-DD1 transfer 前後取得同一 visual/CPU phase 的 native 與 reference state。

建議步驟：

1. 以 native frame 82 的 S-DD1 setup 作事件 marker，而不是使用 absolute frame number。
2. 在 reference 中以相對 advancement 找到相同的 DMA/source signature，於事件前、第一批 VRAM write 後、transfer 完成後各擷取一次 state。
3. 對照 `DMA`、`FIL`、PPU `$2115-$2117`、WRAM 相關窗口與 physical VRAM `$8000-$8FFF`。
4. 把結果分類：
   - DMA 前 WRAM/source 或寄存器已不同：先走 CPU setup/timing 路徑。
   - DMA 前相同但 decoded/output 或 VRAM writes 不同：先走 decoder 或 DMA/PPU path。
   - DMA 後 state 完全相同但畫面不同：才重新開 renderer path。

這是目前最便宜、判別力最高的實驗。沒有完成它之前，不要根據目前的畫面截圖修改 native renderer。

### 2. 獨立 S-DD1 decoder oracle

使用 `0x5FD0AB` 的 exact raw source window 與 `811` bytes input，透過獨立且已驗證的 Snes9x/bsnes-compatible decoder 產生 `2084` bytes output。這個 oracle 只用來驗證資料流，不把 reference core 的其他行為帶入 native implementation。

判別 gate：

- output bytes 與 native digest `B9657D0DA921D294` 相同：decoder 降級，進入 DMA/PPU write path。
- output bytes 或 bitplane ordering 不同：先修 decoder，不能從 title screen 反推 renderer。
- source window 本身不同：先修正 cartridge mapping/selector 或 CPU DMA setup。

比較應以完整 output bytes、digest 與 first-difference offset 為主，不以一個看起來正確的 pixel 作為 decoder 通過條件。

### 3. Native DMA/PPU write history

從 S-DD1 transfer start 到下一個 frame，記錄每一筆寫入 physical `$8000-$8FFF` 的：

- S-DD1 decoded-buffer offset。
- PPU VRAM word address 與 `$2115` increment/remap 狀態。
- 實際 physical byte address、寫入 byte 與 `$2118/$2119` lane。
- DMA channel 最終 A-address、direction、count 與 pending-transfer completion。
- 後續是否有 CPU/HDMA/DMA overwrite 同一區域。

若第一筆差異在 DMA 當下出現，問題集中於 decoded stream 或 address/write semantics；若 transfer 完成時相同、之後才不同，問題是後續 overwrite 或 timing，不能修改 S-DD1 decoder。

### 4. CPU/PPU timing 與 DMA setup

只有在 source bytes、decoded bytes 與 PPU write state 都相同後才進入此路徑。比較 CPU PC/PB、DMA register setup、scanline、dot、master clock、NMI/IRQ 狀態與 DMA 前 WRAM。優先檢查事件順序與 phase，不要先做大範圍 CPU 指令重寫。

### 5. Renderer

只有在 event-aligned 的 VRAM、CGRAM、PPU mode/scroll/window state 與 DMA 後 state 都相同，而 framebuffer 仍不同時，才重新打開 tile decode、BG priority、palette 或 framebuffer copy 的 renderer investigation。

## 實驗決策表

| 觀察 | 下一步 |
| --- | --- |
| Native/reference 在 DMA 前已不同 | 對照 CPU setup、WRAM、PPU registers、S-DD1 selectors |
| Source bytes 不同 | 修正 cartridge mapping、selector 或 DMA source cursor |
| Source 相同、decoder output 不同 | 修正 S-DD1 decoder；保留 digest regression |
| Output 相同、physical VRAM write 不同 | 修正 DMA/PPU address、lane、increment 或 timing |
| Transfer 後相同、下一個事件後不同 | 搜尋後續 overwrite、HDMA 或 CPU VRAM writes |
| VRAM/PPU state 相同、framebuffer 不同 | 才檢查 renderer |

## 已完成驗證

本輪已確認：

- Rust focused emulator tests：47 tests passed。
- `npm run wasm:build`：成功。
- Star Ocean native 600-frame smoke：`status=ok`、acceptance/determinism 通過且無 warning。
- S-DD1 input/output metadata 與 output digest 可重複。
- Native/reference VRAM diff 已定位到 `$8000-$8FFF`，但尚未 event-aligned。
- 沒有套用新的 behavior fix；native Star Ocean routing 保持不變。

既有 Phase 1 硬體契約、smoke 指令與 save-state 說明仍以 [DEVELOPMENT.md](DEVELOPMENT.md) 為準。本文件只補充 unresolved visual-parity investigation，不把 smoke acceptance 改寫成 visual parity acceptance。

## 恢復工作時的最短流程

1. 重新建立 Snes9x isolated reference page（若瀏覽器頁面不存在）。
2. 先做 DMA event-aligned before/after capture。
3. 若 event state 無法解釋差異，再做獨立 decoder output comparison。
4. 只在上述結果允許時，增加 native `$8000-$8FFF` write-history logging。
5. 更新本文件的證據表與決策結果，再提交 behavior change 與對應 regression test。

## 本文件提交邊界

本文件本身不改變 emulator 行為。建立本紀錄時，工作樹已有其他未提交修改，包含 `artifacts/snes-smoke-report.json`、`docs/DEVELOPMENT.md`、WASM binding、APU、cartridge、emulator、PPU 與 S-DD1 相關檔案；這些變更不應因本文件提交而被回復，也不應在本文件的 documentation commit 中混入。