import { describe, expect, it } from "vitest";
import { aksesKasir, aksesPemilik } from "./access";

describe("aksesKasir", () => {
  it("menunggu selama sesi masih dipulihkan", () => {
    expect(aksesKasir({ isLoading: true, adaSesi: false, pernahLogin: false })).toBe("tunggu");
    // Bahkan bila perangkat dikenal — memindahkan halaman di tengah pemulihan
    // membuat kasir terlempar ke login lalu kembali lagi.
    expect(aksesKasir({ isLoading: true, adaSesi: false, pernahLogin: true })).toBe("tunggu");
  });

  it("mengizinkan sesi yang hidup", () => {
    expect(aksesKasir({ isLoading: false, adaSesi: true, pernahLogin: true })).toBe("izinkan");
  });

  it("⭐ kasir OFFLINE dengan sesi mati tetap boleh berjualan", () => {
    // Inti invarian #2 (CLAUDE.md §6.2). Kalau baris ini berubah jadi
    // "ke-login", toko berhenti berjualan setiap kali internet mati —
    // tepat di saat aplikasi ini paling dibutuhkan.
    expect(aksesKasir({ isLoading: false, adaSesi: false, pernahLogin: true })).toBe("izinkan");
  });

  it("perangkat yang belum pernah dipakai login diarahkan ke /login", () => {
    expect(aksesKasir({ isLoading: false, adaSesi: false, pernahLogin: false })).toBe("ke-login");
  });
});

describe("aksesPemilik", () => {
  it("butuh sesi hidup — tidak ada toleransi offline", () => {
    expect(aksesPemilik({ isLoading: false, adaSesi: true, pernahLogin: true })).toBe("izinkan");
    expect(aksesPemilik({ isLoading: false, adaSesi: false, pernahLogin: true })).toBe("ke-login");
  });

  it("menunggu selama pemulihan sesi", () => {
    expect(aksesPemilik({ isLoading: true, adaSesi: false, pernahLogin: true })).toBe("tunggu");
  });
});
