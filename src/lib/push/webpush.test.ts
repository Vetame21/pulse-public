import { createECDH, createPublicKey, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { encryptPayload, isPushEndpoint, vapidAuthorization, vapidKeyProblem } from "./webpush";

const b = (s: string) => Buffer.from(s.replace(/\s+/g, ""), "base64url");

describe("encryptPayload (RFC 8291 Appendix A)", () => {
  it("produces exactly the header and ciphertext from the spec's example", () => {
    const out = encryptPayload(
      b("V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24"),
      b("BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcx aOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4"),
      b("BTBZMqHH6r4Tts7J_aSIgg"),
      { asPrivate: b("yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw"), salt: b("DGv6ra1nlYgDCS1FRnbzlw") },
    );
    const header = b("DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z 9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml mlMoZIIgDll6e3vCYLocInmYWAmS6Tlz AC8wEqKK6PBru3jl7A8");
    const ciphertext = b("8pfeW0KbunFT06SuDKoJH9Ql87S1QUrd irN6GcG7sFz1y1sqLgVi1VhjVkHsUoEs bI_0LpXMuGvnzQ");
    expect(out.toString("base64url")).toBe(Buffer.concat([header, ciphertext]).toString("base64url"));
  });
});

describe("vapidAuthorization", () => {
  it("signs a token for the push service's origin that verifies with the public key", () => {
    const ecdh = createECDH("prime256v1");
    ecdh.generateKeys();
    const keys = { publicKey: ecdh.getPublicKey("base64url"), privateKey: ecdh.getPrivateKey("base64url"), subject: "https://example.app" };
    const now = Date.UTC(2026, 9, 17, 12);
    const header = vapidAuthorization("https://web.push.apple.com/abc123", keys, now);
    const [, token, k] = header.match(/^vapid t=([^,]+), k=(.+)$/)!;
    expect(k).toBe(keys.publicKey);
    const [h, c, s] = token.split(".");
    expect(JSON.parse(Buffer.from(c, "base64url").toString())).toEqual({ aud: "https://web.push.apple.com", exp: now / 1000 + 3600, sub: "https://example.app" });
    const pub = Buffer.from(keys.publicKey, "base64url");
    const key = createPublicKey({ key: { kty: "EC", crv: "P-256", x: pub.subarray(1, 33).toString("base64url"), y: pub.subarray(33).toString("base64url") }, format: "jwk" });
    expect(verify("sha256", Buffer.from(`${h}.${c}`), { key, dsaEncoding: "ieee-p1363" }, Buffer.from(s, "base64url"))).toBe(true);
  });
});

describe("isPushEndpoint", () => {
  it("accepts real push services only", () => {
    expect(isPushEndpoint("https://web.push.apple.com/QGx")).toBe(true);
    expect(isPushEndpoint("https://fcm.googleapis.com/fcm/send/x")).toBe(true);
    expect(isPushEndpoint("http://web.push.apple.com/x")).toBe(false);
    expect(isPushEndpoint("https://evil.example/web.push.apple.com")).toBe(false);
    expect(isPushEndpoint("https://localhost/x")).toBe(false);
  });
});

describe("31-byte private keys (leading zero dropped)", () => {
  it("are accepted and sign correctly", () => {
    // Node drops the leading zero byte itself (about 1 key in 256); find such a key (bounded).
    let ecdh = createECDH("prime256v1");
    for (let i = 0; i < 20_000; i++) {
      ecdh = createECDH("prime256v1");
      ecdh.generateKeys();
      if (ecdh.getPrivateKey().length < 32) break;
    }
    expect(ecdh.getPrivateKey().length).toBeLessThan(32);
    const short = ecdh.getPrivateKey("base64url");
    const keys = { publicKey: ecdh.getPublicKey("base64url"), privateKey: short, subject: "https://x.app" };
    expect(vapidKeyProblem(keys)).toBeNull();
    expect(vapidAuthorization("https://web.push.apple.com/x", keys)).toMatch(/^vapid t=/);
  });
});

describe("vapidKeyProblem", () => {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const publicKey = ecdh.getPublicKey("base64url");
  const privateKey = ecdh.getPrivateKey("base64url");
  it("accepts a matching key pair", () => {
    expect(vapidKeyProblem({ publicKey, privateKey, subject: "https://x.app" })).toBeNull();
  });
  it("explains a wrong or badly pasted private key", () => {
    const other = createECDH("prime256v1");
    other.generateKeys();
    expect(vapidKeyProblem({ publicKey, privateKey: other.getPrivateKey("base64url"), subject: "https://x.app" })).toMatch(/doesn't belong/);
    expect(vapidKeyProblem({ publicKey, privateKey: "sb_secret_abc", subject: "https://x.app" })).toMatch(/43 characters/);
  });
});
