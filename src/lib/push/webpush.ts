// Web Push with no dependencies: VAPID sender identification (RFC 8292) and
// message encryption (RFC 8291, aes128gcm), using Node's built-in crypto.
// Used by the app server and by the scheduled Netlify function, so it must not
// import Next.js-only modules.

import { createCipheriv, createECDH, createHmac, createPrivateKey, randomBytes, sign } from "node:crypto";

export type StoredSubscription = { endpoint: string; p256dh: string; auth: string };
export type PushMessage = { title: string; body: string; url: string; tag?: string };
export type VapidKeys = { publicKey: string; privateKey: string; subject: string };

const b64u = (b: Uint8Array) => Buffer.from(b).toString("base64url");
// A P-256 private key is 32 bytes; generators sometimes drop a leading zero byte.
const privateKeyBytes = (key: string) => {
  const d = Buffer.from(key, "base64url");
  return d.length > 0 && d.length < 32 ? Buffer.concat([Buffer.alloc(32 - d.length), d]) : d;
};
const hmac = (key: Buffer, data: Buffer) => createHmac("sha256", key).update(data).digest();

// Only real browser push services, so the server never posts to an address someone made up.
const PUSH_HOSTS = [/^web\.push\.apple\.com$/, /\.push\.apple\.com$/, /^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/];

export function isPushEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    return u.protocol === "https:" && PUSH_HOSTS.some((h) => h.test(u.hostname));
  } catch {
    return false;
  }
}

/** RFC 8291 encryption of one push message. `asPrivate` and `salt` are only passed by tests. */
export function encryptPayload(plaintext: Buffer, uaPublic: Buffer, authSecret: Buffer, test?: { asPrivate: Buffer; salt: Buffer }): Buffer {
  const ecdh = createECDH("prime256v1");
  if (test) ecdh.setPrivateKey(test.asPrivate);
  else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey(); // uncompressed point, 65 bytes
  const ecdhSecret = ecdh.computeSecret(uaPublic);

  const prkKey = hmac(authSecret, ecdhSecret);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]);
  const ikm = hmac(prkKey, Buffer.concat([keyInfo, Buffer.from([1])]));
  const salt = test?.salt ?? randomBytes(16);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01")).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from("Content-Encoding: nonce\0\x01")).subarray(0, 12);

  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const ciphertext = Buffer.concat([cipher.update(Buffer.concat([plaintext, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);

  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16); // record size
  header[20] = asPublic.length;
  return Buffer.concat([header, asPublic, ciphertext]);
}

/** RFC 8292 "vapid" Authorization header: a short-lived ES256 token for the push service's origin. */
export function vapidAuthorization(endpoint: string, keys: VapidKeys, now = Date.now()): string {
  const enc = (o: object) => b64u(Buffer.from(JSON.stringify(o)));
  const unsigned = `${enc({ typ: "JWT", alg: "ES256" })}.${enc({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 3600, sub: keys.subject })}`;
  const pub = Buffer.from(keys.publicKey, "base64url");
  const key = createPrivateKey({
    key: { kty: "EC", crv: "P-256", d: b64u(privateKeyBytes(keys.privateKey)), x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) },
    format: "jwk",
  });
  const signature = sign("sha256", Buffer.from(unsigned), { key, dsaEncoding: "ieee-p1363" });
  return `vapid t=${unsigned}.${b64u(signature)}, k=${keys.publicKey}`;
}

/** Why these VAPID keys can't be used (e.g. a badly pasted private key), or null if they're fine. */
export function vapidKeyProblem(keys: VapidKeys): string | null {
  try {
    const raw = Buffer.from(keys.privateKey, "base64url");
    if (raw.length < 30 || raw.length > 32) return `the private key should be 43 characters (got ${keys.privateKey.length})`;
    const d = privateKeyBytes(keys.privateKey);
    const ecdh = createECDH("prime256v1");
    ecdh.setPrivateKey(d);
    return ecdh.getPublicKey("base64url") === keys.publicKey ? null : "the private key doesn't belong to this app's public key";
  } catch (e) {
    return `the private key can't be read (${e instanceof Error ? e.message : String(e)})`;
  }
}

/** Send one message. `gone` means the phone unsubscribed: delete that subscription. */
export async function sendPush(
  sub: StoredSubscription,
  message: PushMessage,
  keys: VapidKeys,
): Promise<{ ok: boolean; status: number; gone: boolean; error?: string }> {
  if (!isPushEndpoint(sub.endpoint)) return { ok: false, status: 0, gone: true, error: "not a push service address" };
  const body = encryptPayload(Buffer.from(JSON.stringify(message)), Buffer.from(sub.p256dh, "base64url"), Buffer.from(sub.auth, "base64url"));
  try {
    const res = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        Authorization: vapidAuthorization(sub.endpoint, keys),
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: "3600", // a reminder an hour late is useless
        Urgency: "high",
      },
      body: new Uint8Array(body),
      signal: AbortSignal.timeout(10_000),
    });
    const error = res.ok ? undefined : (await res.text().catch(() => "")).slice(0, 200) || res.statusText;
    return { ok: res.ok, status: res.status, gone: res.status === 404 || res.status === 410, error };
  } catch (e) {
    return { ok: false, status: 0, gone: false, error: e instanceof Error ? `${e.name}: ${e.message}` : String(e) };
  }
}
