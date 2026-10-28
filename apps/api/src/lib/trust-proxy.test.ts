import { describe, expect, it } from "vitest";
import { leerTrustProxy } from "./trust-proxy.js";

describe("leerTrustProxy", () => {
  it("usa el número de saltos si es un entero >= 1", () => {
    expect(leerTrustProxy("1")).toBe(1);
    expect(leerTrustProxy(" 2 ")).toBe(2);
  });

  it("confía en todos si falta o no es válido", () => {
    expect(leerTrustProxy(undefined)).toBe(true);
    expect(leerTrustProxy("")).toBe(true);
    expect(leerTrustProxy("0")).toBe(true);
    expect(leerTrustProxy("-1")).toBe(true);
    expect(leerTrustProxy("1.5")).toBe(true);
    expect(leerTrustProxy("abc")).toBe(true);
  });
});
