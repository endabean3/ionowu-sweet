import { describe, expect, it } from "vitest";
import {
  formatWA,
  looksLikeMemberCode,
  memberCodeFromUlid,
  normalizeHandle,
  normalizeWA,
} from "./member";

// Kasus yang SAMA dengan services/pos-engine/internal/httpapi/member_test.go.
// Kalau keduanya berbeda, member yang lolos di kasir ditolak server.
describe("normalizeWA — paritas dengan server", () => {
  it.each(["0812-3456-7890", "+62 812 3456 7890", "812 3456 7890", "6281234567890"])(
    "%s → 6281234567890",
    (s) => expect(normalizeWA(s)).toBe("6281234567890"),
  );
  it.each(["", "12345", "0812", "abc", "1-800-123-4567", "62812345678901234"])("%s ditolak", (s) =>
    expect(normalizeWA(s)).toBe(""),
  );
});

describe("tampilan & kode member", () => {
  it("formatWA untuk kasir", () => {
    expect(formatWA("6281234567890")).toBe("0812-3456-7890");
  });
  it("normalizeHandle", () => {
    expect(normalizeHandle(" @siti.wangi ")).toBe("siti.wangi");
  });
  it("kode dari ULID berbentuk M-XXXXXX dan dikenali saat dipindai", () => {
    const kode = memberCodeFromUlid("01M2TRJGPF6H7R3NKBJZ433XJB");
    expect(kode).toBe("M-433XJB");
    expect(looksLikeMemberCode(kode)).toBe(true);
    expect(looksLikeMemberCode(" m-433xjb ")).toBe(true);
    expect(looksLikeMemberCode("Botol Slim")).toBe(false);
    expect(looksLikeMemberCode("M-")).toBe(false);
  });
});
