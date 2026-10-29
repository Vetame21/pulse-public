import { describe, expect, it } from "vitest";
import { isAndroidWebView } from "./webview";

describe("isAndroidWebView", () => {
  it("spots an Android WebView", () => {
    expect(isAndroidWebView("Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP1A.240505.005; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0.0.0 Mobile Safari/537.36")).toBe(true);
  });
  it("lets Chrome on Android through (and Trusted Web Activities, which use it)", () => {
    expect(isAndroidWebView("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36")).toBe(false);
  });
  it("lets iPhone, desktop and missing user agents through", () => {
    expect(isAndroidWebView("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1")).toBe(false);
    expect(isAndroidWebView("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36")).toBe(false);
    expect(isAndroidWebView(null)).toBe(false);
  });
});
