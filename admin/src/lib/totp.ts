// TOTP (RFC 6238, HMAC-SHA1) — used by the dev seed admin and e2e tests.
// Real staff type the 6-digit code from their authenticator app at login.
export async function totp(secret: string, atMs = Date.now(), step = 30): Promise<string> {
  const key = base32Decode(secret);
  const counter = Math.floor(atMs / 1000 / step);
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  view.setUint32(0, Math.floor(counter / 2 ** 32));
  view.setUint32(4, counter >>> 0);
  const cryptoKey = await crypto.subtle.importKey("raw", key.buffer.slice(key.byteOffset, key.byteOffset + key.byteLength) as ArrayBuffer, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, buf));
  const offset = sig[sig.length - 1]! & 0x0f;
  const bin =
    ((sig[offset]! & 0x7f) << 24) | ((sig[offset + 1]! & 0xff) << 16) | ((sig[offset + 2]! & 0xff) << 8) | (sig[offset + 3]! & 0xff);
  return String(bin % 1_000_000).padStart(6, "0");
}

function base32Decode(s: string): Uint8Array {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const c of s.toUpperCase().replace(/=+$/, "")) {
    const idx = alphabet.indexOf(c);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}
