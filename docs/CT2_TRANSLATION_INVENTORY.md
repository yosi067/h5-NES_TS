# 足球小將 II 翻譯來源盤點

> 現況：本文記錄**萃取**範圍（劇情、比賽雲框訊息、固定 bank 字典），不是顯示覆蓋率。目前的顯示行為與限制見 [CT2_LOCALIZATION_STUDIO.md](CT2_LOCALIZATION_STUDIO.md)。
> 原始來源 SHA-256：`bf5038afe4c9df1c1c7eff0bc74a12f3cd8ed994b9aab92617d066d9d10ad746`。在比賽訊息、選單、名字與字典都有各自驗證的 runtime writer 前，不宣稱全遊戲覆蓋。

## 目前狀態

- 原始來源選單已有匹配器；完整觀察到的比賽／字典出現已有世代與 CHR 防護的 renderer。下文舊的「僅 BPS」與「比賽完全未啟用」描述為歷史。
- 原 ROM 路線已驗證球隊／球員替換、一般射門、實際選擇抽球射門與旁白（`抽球射門`、`抽球射門！！`、`大空翼的`、`抽球射門！`）。
- 必殺技選單字典 writer（bank `$30000`／CPU `$8A79`）與球員姓名 writer（`$8D7B`）提供受防護的來源事件；它們不是 221 筆選單目錄中的額外靜態定義。
- 只有抽球射門有原遊戲必殺射門路線覆蓋（使用支援的 read-side 等級 64，非 RAM 注入）。其他招式、整句、RAM 字典 index 0、不完整／控制前綴片段仍未完成。
- `battle-clouds.14.text.0010`、`.58.text.0004`、`.75.text.0004`：原 FC 換列路徑會略過一個 byte。builder 驗證游標前進 opcode signature、前一個 FC 與指定 prefix byte 後，只縮小這三個 runtime span；交換 ID／原文與 lossless IR 不變。其他控制前綴片段未批次修正——lossless 不代表語意分段已驗證。

## 翻譯檔格式（bundle contract）

- `artifacts/` 下的詳細 JSON 是機器來源目錄。
- 翻譯人員用的檔案在 `game-profiles/captain-tsubasa-2-jp/translations/`，採精簡 schema v2：每筆只含穩定 `id`、`category`、`translation`，以及選填的非空 `notes`。
- 來源 bytes、解碼原文、指標與配置長度在驗證時由萃取目錄解析；bundle 保留來源 ROM 雜湊及相關的 scene、message、bank 或 dictionary 雜湊。

分類刻意分開：

| 分類 | 內容 |
| --- | --- |
| `dialogue` | 敘事與過場文字 |
| `menu` | 玩家選單選項，目前登記為 `title.menu.*` 目錄單位 |
| `interface` | 非選單的 HUD、狀態與系統標籤 |
| `battleMessage` | 比賽／雲框訊息 |
| `dictionary` | 固定 bank 的可重用名字、招式與片語 |

adapter 在遷移期接受 schema v1；拒絕過期來源雜湊、缺漏或重複 ID、舊來源證據被改動、錯誤分類與不完整的來源盤點。

```bash
node tools/captain-tsubasa-2-adapter.mjs validate-bundle --input <bundle.json> --require-complete false
node tools/captain-tsubasa-2-adapter.mjs migrate-bundle --input <legacy.json> --output <compact.json>
```

標題選單目錄與 dialogue／interface 分開。來源／CHR 選單匹配已啟用，但顯示層刻意保留 KICK OFF／CONTINUE 英文。密碼假名是功能性代碼，不翻；提示與已驗證的遊戲標籤可翻。目錄登記本身不代表選單已全面覆蓋。

## 覆蓋數量

### 劇情（cutscene）

| 指標表 | PRG offset | 場景 | 編碼 bytes | 文字片段 | 來源字元 | 唯一字碼 | 控制碼 | 停頓 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `opening-cutscenes` | `0x6000` | 16 | 8,159 | 487 | 5,319 | 157 | 1,414 | 406 |
| `cutscenes-bank-04` | `0x8000` | 16 | 8,127 | 455 | 4,965 | 165 | 1,556 | 404 |
| `cutscenes-bank-05` | `0xA000` | 64（56 唯一） | 8,053 | 505 | 5,476 | 164 | 1,288 | 300 |
| 合計 | | 96（88 唯一） | 24,339 | 1,447 | 15,760 | | 4,258 | 1,110 |

- 三張表都是 MMC3 `$A000-$BFFF` CPU window 中的 little-endian 指標；每個指令流 parse 後 encode 皆位元組相同。
- 最後一個場景以第一個語意上的 `$FF` 結束碼為界，而非第一個原始 `$FF`（`$FF` 也可能是控制參數）。
- bank 5 有八個指標別名，只匯出一次並以 ID 參照。
- 容量：第一個 bank 在 32-byte 指標表之後的 8,160 bytes 用了 8,159；第二個 bank 最後結束碼之後只剩 33 bytes。較長的譯文不能假設可原地放入，編譯至少需支援以下之一：縮短譯文、重新打包場景並改寫指標、搬到額外 PRG 空間或替換 bank、遊戲專用壓縮或字典編碼。

### 比賽雲框訊息（battle cloud）

| 訊息 | 唯一 | Render IR | 不透明 graph／setup | 文字片段 | 來源字元 | 唯一字碼 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 240 | 236 | 223 | 13 | 513 | 2,697 | 134 |

- 指標表含 240 個訊息 ID、236 個唯一配置、4 個別名；6,428 個配置 bytes 全部盤點並保留。
- renderer 使用兩 byte 標頭：一個停頓 byte，加一個設定 byte（高 nibble 選雲框視窗；值小於 `$90` 時低 nibble 選 Charlie）。文字控制碼從 `$E0` 起，誤當字元會產生錯誤條目。
- 13 個不透明配置是 lossless 保留，不是未發現：3 個只有 setup（`F0`、`F2 F0`、`F5 02 F0`）；其餘使用 `$F4` 條件目標表，有些目標直接指向前一區塊的結尾 `$F0`。需要共享位元組範圍的 graph IR；依目標位址切分會重複或遺漏 bytes。graph encoder 完成前，來源 bytes 不可改，列在 bundle 的 `opaqueMessages`。

### 固定 bank 字典

| 指標表 | 固定 PRG window | 條目 | 固定記錄 | 外部指標 | 記錄 bytes | 結束碼 |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| CPU `$F329`／PRG `0x3F329` | CPU `$E000-$FFFF`／PRG `0x3E000` | 240 | 239 | 1（`index 0 -> $05EB` RAM） | 1,475 | `$FC` |

- reset 路徑經 `$C53C` trampoline（`JMP $F30F`）進入解析器：A 為字詞索引，從 `$F329` 讀 little-endian 指標，結果放在 zero-page `$30/$31`。表佔 `$F329-$F508`，正好 240 個 u16；不使用上游 `$5116` bank 切換路徑。
- 索引 `1..239` 的指標由 `$F509` 單調遞增到 `$FAC8`；每筆在第一個 `$FC` 結束，239 筆佔 `$F509-$FACC`，重新編碼位元組相同。
- index 0 指向 CPU RAM，保留為不透明外部條目，不當 ROM 文字解碼。
- 內容含球員名、球隊／招式名與短片語；語意分類是可編輯的 metadata，不從位元組佈局推斷。
- 字典編譯器刻意只做原地替換：保留指標表與每筆原配置，要求 `$FC` 結束，拒絕超出配置的譯文，輸出有來源防護的 PRG overlay。尚未搬移記錄、改寫指標或配置安全的繁中 CHR 頁；在審核過的 glyph map 與 CHR／runtime 路徑完成前，`compile-dictionary` 只是產生 artifact 的步驟。

## 產生的資料

| 路徑 | 內容 | 大小（bytes） |
| --- | --- | ---: |
| `artifacts/captain-tsubasa-2-cutscene-bank-ir.json` | bank 3 lossless IR | 670,786 |
| `artifacts/captain-tsubasa-2-cutscenes-bank-04-ir.json` | bank 4 lossless IR | 695,955 |
| `artifacts/captain-tsubasa-2-cutscenes-bank-05-ir.json` | bank 5 lossless IR | 661,980 |
| `artifacts/captain-tsubasa-2-battle-clouds-ir.json` | 完整雲框盤點 | 595,849 |
| `artifacts/captain-tsubasa-2-fixed-bank-words-ir.json` | 固定 bank 字典盤點 | 265,283 |
| `game-profiles/captain-tsubasa-2-jp/translations/opening-cutscenes.zh-Hant.json` | 487 筆（含 35 筆已審開場） | 68,582 |
| `game-profiles/captain-tsubasa-2-jp/translations/cutscenes-bank-04.zh-Hant.json` | 455 筆 | 63,716 |
| `game-profiles/captain-tsubasa-2-jp/translations/cutscenes-bank-05.zh-Hant.json` | 505 筆 | 77,814 |
| `game-profiles/captain-tsubasa-2-jp/translations/battle-clouds.zh-Hant.json` | 513 筆 | 106,746 |
| `game-profiles/captain-tsubasa-2-jp/translations/fixed-bank-words.zh-Hant.json` | 239 筆 + 1 個外部指標 | 25,758 |
| `game-profiles/captain-tsubasa-2-jp/translations/opening.intro.00.zh-Hant.json` | 35 筆已審 | 4,871 |

- 六個精簡翻譯 bundle 共 347,487 bytes。舊 v1 每筆重複來源證據；新檔改由萃取測試做來源防護。
- 重新產生時，只有來源雜湊（及舊條目的來源證據）仍相符，才保留條目的分類、譯文與 notes；過期或變更的條目不會默默沿用。
- IR 與翻譯 bundle 是建置期輸入。目前支援的原 ROM 中文化使用產生的目錄／runtime 索引與只改顯示的 overlay，繞過舊 BPS 路徑。runtime 觀察、來源比對與繪製有每幀成本，本文不宣稱新的效能基準。

## 尚未納入的 ROM 區域

結構掃描以 `(first pointer - $A000) / 2` 推斷指標數，在 PRG offset `0xC000`、`0xE000`、`0x12000`、`0x14000` 找到其他表。它們的 `$FF` 密度與 parser 失敗情形和已驗證的劇情 bank 明顯不同，未登記為劇情；可能是名字、圖形指令、字典或無關索引資料，需依分類驗證。

全遊戲覆蓋仍待以下區域完成對應並安全寫入：

- 已驗證來源匹配器與抽球射門路線以外的選單／介面變體；
- 其餘球員、球隊、對手名，特別是 RAM 字典 index 0；
- 其餘重複字詞／名字表與壓縮文字；
- 片尾與結果畫面；
- 經由區域呼叫點到達的其他 renderer 專用文字。

## 重用評估

| 可跨 NES 遊戲重用 | 每款遊戲各自處理 |
| --- | --- |
| 語意 script IR 與可編輯翻譯 bundle | mapper bank 選擇與指標位址換算 |
| lossless parse／encode 檢查 | 文字編碼與控制 opcode 寬度 |
| 來源與場景 SHA-256 防護 | 場景結束與跳躍語意 |
| 指標表萃取與固定配置統計 | 字型／CHR 配置與 tile 上傳行為 |
| 僅 BPS 的 GMOD v2 打包 | 搬移、壓縮與 runtime 排版規則 |
| 來源對齊的排版策略與建置期 glyph 盤點 | |

框架可重用，但新遊戲仍需一個有證據支持的小型 adapter。僅靠指標發現不足以把任意 ROM 資料判為文字。

## 限制與待辦（非阻擋）

- 替換或人工整理複雜的 8x8 繁中字形。
- 啟用既有離線 8x16 rasterizer 前，先設計安全的 MMC3 文字 CHR bank。
- 加入以事件對齊的視覺回歸；固定延遲截圖會因填充改變打字機時間而漂移。
- 多 bank 編譯器：重新打包場景並改寫指標。
- 原地編譯器證明有空閒 bank 後，加入字典記錄搬移與指標改寫。
- 字典文字的已審繁中 glyph map 與安全 MMC3 CHR 配置。
- 13 個雲框 setup／分支配置的共享範圍 graph IR 與 encoder。
- 多個 bank 編譯後，在桌機與手機量測 profile 套用與幀節奏。
- 控制碼模式驗證後才自動分類；批次劇情匯出預設 `dialogue`，選單目錄單位明確使用 `menu`。

目前 8x8 輸出仍是安全基準；只有在文字無法閱讀或原生 UI tile 損壞時，字型工作才應阻擋更廣的萃取。

## 歷史紀錄

- 早期萃取量測：單一 8KB bank 約 216 ms；四個 IR 檔約 2.5 MB，四個可編輯 bundle 約 746 KB。
- 2026-09-06：顯示層改為原 ROM 來源驗證 overlay，取代「僅 BPS」與「比賽顯示完全未啟用」的描述。
