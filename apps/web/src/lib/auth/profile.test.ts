import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type ProfilPerangkat, hapusProfil, profilTerakhir, simpanProfil } from "./profile";

const contoh: ProfilPerangkat = {
  id: "01USER",
  tenant_id: "01TENANT",
  name: "Siti",
  email: "siti@warung.test",
  role: "cashier",
};

// jsdom tidak aktif di konfigurasi vitest ini; localStorage dipalsukan manual.
beforeEach(() => {
  const simpanan = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (k: string) => simpanan.get(k) ?? null,
    setItem: (k: string, v: string) => void simpanan.set(k, v),
    removeItem: (k: string) => void simpanan.delete(k),
    clear: () => simpanan.clear(),
    key: () => null,
    length: 0,
  } as unknown as Storage;
});

afterEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = undefined;
});

describe("profil perangkat", () => {
  it("disimpan dan dibaca utuh", () => {
    simpanProfil(contoh);
    expect(profilTerakhir()).toEqual(contoh);
  });

  it("kosong sebelum pernah login", () => {
    expect(profilTerakhir()).toBeNull();
  });

  it("dihapus saat logout", () => {
    simpanProfil(contoh);
    hapusProfil();
    expect(profilTerakhir()).toBeNull();
  });

  it("profil tanpa tenant_id dianggap tidak ada — lebih baik daripada dipakai setengah", () => {
    localStorage.setItem("ionowu_profil", JSON.stringify({ id: "01USER", name: "Siti" }));
    expect(profilTerakhir()).toBeNull();
  });

  it("isi rusak tidak melempar error", () => {
    localStorage.setItem("ionowu_profil", "{bukan json");
    expect(profilTerakhir()).toBeNull();
  });
});
