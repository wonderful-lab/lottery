/**
 * 候補者リストのパース。
 * カンマ（半角・全角）、セミコロン、改行、タブで区切る。空欄は除く。
 * 同じ名前の重複はそのまま残す（＝くじの枚数が増える＝当たりやすくなる）。
 */
export function parseCandidates(text: string): string[] {
  return text
    .split(/[,、，;；\n\r\t]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
