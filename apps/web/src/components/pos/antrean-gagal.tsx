"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";

import { Modal } from "@/components/ui/modal";
import type { SyncQueueEntry } from "@/lib/db";

/**
 * Daftar antrean yang DITOLAK server, beserta alasannya.
 *
 * Kenapa ini ada: `syncQueue.error_message` sudah lama disimpan tapi tidak
 * pernah ditampilkan di mana pun. Yang terlihat kasir hanya angka di lencana,
 * dan angka itu sama saja untuk "sedang antre" dan "ditolak server".
 *
 * Akibatnya nyata: satu shift yang lupa ditutup pada 19 Sep 2026 membuat
 * server menolak SEMUA penjualan selama tiga hari. Pesan penolakannya —
 * "kasir sudah memiliki shift terbuka lain di outlet ini" — tersimpan sejak
 * percobaan pertama dan sudah gagal 11 kali, tapi tidak ada satu pun cara
 * melihatnya tanpa membuka DevTools. Nota tidak pernah sampai ke server,
 * sehingga QR garansi di nota pembeli menjawab 404.
 */

/** Nama jenis antrean dalam bahasa kasir, bukan nama teknis. */
const JENIS: Record<string, string> = {
  sale: "Penjualan",
  customer: "Member baru",
  shift_open: "Buka shift",
  shift_close: "Tutup shift",
  stock_event: "Perubahan stok",
};

/**
 * Menerjemahkan galat server yang paling sering muncul.
 *
 * Pesan aslinya tetap ditampilkan di bawahnya: menyembunyikannya membuat
 * galat yang belum dikenali jadi tidak bisa dilacak sama sekali.
 */
export function penjelasan(pesan: string): string | null {
  const p = pesan.toLowerCase();
  if (p.includes("shift terbuka lain")) {
    return "Ada shift lama yang belum ditutup. Tutup shift itu dulu, lalu kirim ulang.";
  }
  if (p.includes("shift_id_fkey")) {
    return "Penjualan ini menunggu shift-nya terkirim lebih dulu. Biasanya ikut beres setelah masalah shift di atas selesai.";
  }
  if (p.includes("duplicate") || p.includes("23505")) {
    return "Datanya sudah ada di server. Biasanya aman diabaikan.";
  }
  return null;
}

export function AntreanGagal({
  items,
  sedangKirim,
  onKirimUlang,
  onTutup,
}: {
  items: SyncQueueEntry[];
  sedangKirim: boolean;
  onKirimUlang: () => void;
  onTutup: () => void;
}) {
  return (
    <Modal title="Data yang gagal terkirim" onClose={onTutup} size="lg">
      <div className="space-y-4">
        <p className="font-sans text-sm text-muted">
          {items.length} data ditolak server. Selama belum terkirim, data ini{" "}
          <strong className="text-main">hanya ada di perangkat ini</strong> — tidak muncul di
          laporan, dan QR garansi pada notanya belum bisa dibuka pembeli.
        </p>

        <ul className="space-y-3">
          {items.map((it) => {
            const bantuan = it.error_message ? penjelasan(it.error_message) : null;
            return (
              <li
                key={it.id}
                className="rounded-squircle border-2 border-card-border bg-card p-3 shadow-hard-sm"
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle
                    className="mt-0.5 h-4 w-4 shrink-0 text-sweet-strawberry"
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-sans text-sm font-bold text-main">
                      {JENIS[it.type] ?? it.type}
                      {it.retry_count > 0 && (
                        <span className="ml-2 font-normal text-muted">gagal {it.retry_count}×</span>
                      )}
                    </p>
                    {bantuan && <p className="mt-1 font-sans text-sm text-main">{bantuan}</p>}
                    {/* Pesan mentah dari server. Sengaja tetap ditampilkan:
                        galat yang belum dikenali harus tetap bisa dibaca dan
                        disalin, bukan berubah jadi "terjadi kesalahan". */}
                    <p className="mt-1 break-words font-mono text-[11px] leading-snug text-muted">
                      {it.error_message ?? "Ditolak server tanpa keterangan"}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onKirimUlang}
          disabled={sedangKirim}
          className="mochi-button flex h-11 items-center gap-2 rounded-pill border-2 border-card-border bg-sweet-matcha px-4 font-sans text-sm font-bold text-main shadow-hard-sm disabled:opacity-50"
        >
          <RefreshCw
            className={`h-4 w-4 ${sedangKirim ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
          {sedangKirim ? "Mengirim…" : "Coba kirim lagi"}
        </button>
      </div>
    </Modal>
  );
}
