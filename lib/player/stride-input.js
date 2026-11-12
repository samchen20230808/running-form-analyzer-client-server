// UI 輸入解析：手動步幅。非 server-only，不得 import lib/core 或 lib/server。

export function parseManualStrideValue(val) {
  const parsed = parseFloat(val);
  if (isNaN(parsed) || parsed < 0.05 || parsed > 2.5) return null;
  return Number(parsed.toFixed(2));
}
