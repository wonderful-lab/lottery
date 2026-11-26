/**
 * 暗号論的乱数による公平な抽選。
 * `Math.random() % max` の剰余バイアスを避けるため、棄却サンプリングを使う。
 */
export function randomIndex(max: number): number {
  const cryptoObj = globalThis.crypto;
  if (!cryptoObj) throw new Error("crypto.getRandomValues() is not available");
  const buf = new Uint32Array(1);
  const limit = Math.floor(4294967296 / max) * max;
  do {
    cryptoObj.getRandomValues(buf);
  } while (buf[0] >= limit);
  return buf[0] % max;
}
