/**
 * Katalog jenis usaha untuk layar pendaftaran.
 *
 * JSON-nya sengaja diimpor dari paket Go — berkas yang SAMA yang di-embed
 * pos-engine lewat //go:embed (services/pos-engine/internal/businesstype).
 * Kalau daftar ini dikembarkan sebagai konstanta TypeScript, keduanya akan
 * menyimpang diam-diam: pengguna memilih kategori yang tampil di layar lalu
 * ditolak backend dengan INVALID_BUSINESS_TYPE, dan tidak ada yang gagal saat
 * build. Pola yang sama dipakai uji paritas uang (src/lib/money/calc.test.ts).
 *
 * Dibundel statis, bukan diambil lewat API: daftar ini ikut aturan
 * offline-first (CLAUDE.md §6.2) — pendaftaran tidak boleh bergantung pada
 * satu panggilan jaringan tambahan hanya untuk mengisi dropdown.
 */
import catalog from "../../../../../services/pos-engine/internal/businesstype/catalog.json";

export type ArchetypePhase = "fase-0" | "fase-1" | "fase-2" | "fase-3" | "ditunda";

export interface Archetype {
  code: string;
  label: string;
  phase: ArchetypePhase;
}

export interface BusinessCategory {
  slug: string;
  label: string;
  archetype: string;
}

export const archetypes: Archetype[] = catalog.archetypes as Archetype[];
export const categories: BusinessCategory[] = catalog.categories as BusinessCategory[];

const bySlug = new Map(categories.map((c) => [c.slug, c]));

export function lookup(slug: string): BusinessCategory | undefined {
  return bySlug.get(slug);
}

export function isValid(slug: string): boolean {
  return bySlug.has(slug);
}

/**
 * Kategori dikelompokkan per arketipe, urut sesuai urutan arketipe di katalog
 * — A dan B (fase-0) lebih dulu, supaya dua segmen yang benar-benar didukung
 * ada di paling atas daftar (MARKET-SEGMENTS.md §5).
 */
export function groupedByArchetype(): Array<{
  archetype: Archetype;
  categories: BusinessCategory[];
}> {
  return archetypes.map((archetype) => ({
    archetype,
    categories: categories.filter((c) => c.archetype === archetype.code),
  }));
}

/**
 * Label pendek status dukungan, dipakai sebagai penanda di dropdown supaya
 * pemilik tahu fiturnya belum digarap SEBELUM memilih — bukan setelah daftar.
 * Model datanya tetap menerima semua arketipe (§4b), yang ditunda hanya fitur.
 */
export function phaseNote(phase: ArchetypePhase): string | null {
  switch (phase) {
    case "fase-0":
      return null;
    case "ditunda":
      return "fitur ditunda";
    default:
      return `fitur ${phase}`;
  }
}
