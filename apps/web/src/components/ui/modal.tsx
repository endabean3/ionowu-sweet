"use client";

import { latarModal, panelModal } from "@/lib/motion/tokens";
import { m } from "framer-motion";
import { X } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useId, useRef } from "react";

const FOKUSABEL =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface ModalProps {
  children: ReactNode;
  onClose: () => void;
  /** Judul di bilah atas. Bila kosong, pemanggil wajib mengisi `ariaLabel`. */
  title?: string;
  /** Nama untuk pembaca layar saat modal tidak punya bilah judul. */
  ariaLabel?: string;
  /**
   * false = hanya bisa ditutup lewat tombol di dalam konten. Dipakai untuk
   * langkah yang wajib diselesaikan (mis. membuka shift), bukan untuk menahan
   * kasir di dalam dialog — jalan keluar tetap harus ada di isinya
   * (escape-routes, Apple HIG).
   */
  dismissible?: boolean;
  size?: "md" | "lg";
}

/**
 * Dialog bersama untuk seluruh aplikasi.
 *
 * Menyatukan empat hal yang sebelumnya ditulis ulang (dan sebagian terlewat)
 * di tiap modal:
 *
 * 1. **Semantik.** `role="dialog"` + `aria-modal` + nama yang terbaca. Tanpa
 *    ini pembaca layar mengumumkan isinya sebagai bagian biasa dari halaman.
 * 2. **Perangkap fokus.** Tab berputar di dalam panel, dan fokus dikembalikan
 *    ke elemen pemicu saat modal tertutup.
 * 3. **Escape yang tidak bocor.** Penangan dipasang di fase CAPTURE lalu
 *    menghentikan penyebaran. Ini memperbaiki bug nyata: layar kasir punya
 *    pendengar Escape global yang MENGOSONGKAN KERANJANG, sehingga menekan
 *    Escape untuk menutup dialog printer ikut menghapus belanjaan pembeli
 *    yang sedang dilayani.
 * 4. **Gerak.** Fade latar + panel membesar dari arah pemicunya. Di ponsel ia
 *    menempel ke tepi bawah (jangkauan ibu jari), di layar lebar ia di tengah.
 *
 * **Kenapa bukan `<dialog>` native.** Elemen `<dialog>` yang dibuka dengan
 * `showModal()` dipindahkan browser ke *top layer*, dan elemen di top layer
 * hilang seketika saat ditutup — animasi keluar AnimatePresence tidak pernah
 * sempat berjalan. Semantik yang hilang karena itu dipenuhi manual di sini:
 * role, aria-modal, nama, perangkap fokus, pengembalian fokus, dan Escape.
 * Kalau nanti animasi keluar tidak lagi diperlukan, `<dialog>` native adalah
 * pilihan yang lebih baik dan penggantinya harus dilakukan.
 */
export function Modal({
  children,
  onClose,
  title,
  ariaLabel,
  dismissible = true,
  size = "lg",
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const pemicuRef = useRef<Element | null>(null);
  const judulId = useId();

  const tutup = useCallback(() => {
    if (dismissible) onClose();
  }, [dismissible, onClose]);

  useEffect(() => {
    pemicuRef.current = document.activeElement;

    // Fokus awal diletakkan di panel, bukan di tombol pertama: tombol pertama
    // sering "Tutup", dan mengumumkan "Tutup" sebagai hal pertama menyembunyikan
    // judul dialognya sendiri.
    panelRef.current?.focus();

    const sebelumnya = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Selalu ditahan, bahkan saat dialog tidak bisa ditutup — kalau tidak,
        // Escape menembus ke pintasan global di belakang dialog.
        e.stopPropagation();
        e.preventDefault();
        tutup();
        return;
      }
      if (e.key !== "Tab") return;

      const fokusabel = panelRef.current?.querySelectorAll<HTMLElement>(FOKUSABEL);
      if (!fokusabel || fokusabel.length === 0) return;
      const pertama = fokusabel[0];
      const terakhir = fokusabel[fokusabel.length - 1];
      const aktif = document.activeElement;

      if (e.shiftKey && (aktif === pertama || aktif === panelRef.current)) {
        e.preventDefault();
        terakhir.focus();
      } else if (!e.shiftKey && aktif === terakhir) {
        e.preventDefault();
        pertama.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = sebelumnya;
      // Fokus dikembalikan ke pemicu supaya kasir yang memakai keyboard tidak
      // terlempar ke awal halaman setiap kali menutup dialog.
      (pemicuRef.current as HTMLElement | null)?.focus?.();
    };
  }, [tutup]);

  return (
    <m.div
      className="fixed inset-0 z-50 flex items-end justify-center bg-main/40 backdrop-blur-sm sm:items-center sm:p-4"
      variants={latarModal}
      initial="sembunyi"
      animate="tampil"
      exit="pergi"
      onMouseDown={(e) => {
        // Hanya klik yang BENAR-BENAR di latar. Tanpa cek ini, seret dari
        // dalam panel ke luar ikut menutup dialog di tengah pengisian.
        if (e.target === e.currentTarget) tutup();
      }}
    >
      <m.div
        ref={panelRef}
        // biome-ignore lint/a11y/useSemanticElements: lihat "Kenapa bukan <dialog>" di atas
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title ? undefined : ariaLabel}
        aria-labelledby={title ? judulId : undefined}
        variants={panelModal}
        className={`flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[32px] border-2 border-card-border bg-base shadow-hard-lg outline-none sm:rounded-[32px] ${
          size === "md" ? "sm:max-w-md" : "sm:max-w-lg"
        }`}
      >
        {title && (
          <div className="flex shrink-0 items-center justify-between border-b-2 border-card-border bg-surface px-6 py-4">
            <h2 id={judulId} className="font-display text-xl font-bold text-main">
              {title}
            </h2>
            {dismissible && (
              <button
                type="button"
                onClick={onClose}
                aria-label={`Tutup ${title}`}
                className="pos-touch-target -mr-2 flex items-center justify-center rounded-pill px-2 text-main hover:bg-black/5"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            )}
          </div>
        )}
        {/* Ruang aman bawah HANYA di ponsel (sm:pb-0): di sana panel menempel
           ke tepi layar, tepat di tempat gesture bar Android/iOS berada, dan
           tombol terakhir dialog jatuh di bawah jari sistem. Di layar lebar
           panel mengambang di tengah dan tidak butuh ini. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)] sm:pb-0">
          {children}
        </div>
      </m.div>
    </m.div>
  );
}
