"use client";

import { LazyMotion, MotionConfig, domAnimation } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Satu-satunya tempat framer-motion dikonfigurasi.
 *
 * **`domAnimation`, bukan `domMax`.** Paket fitur ini hanya membawa animasi
 * transform/opacity, gesture, dan exit — tanpa mesin layout animation yang
 * jauh lebih berat. Rute kasir punya anggaran bundle paling ketat di seluruh
 * produk (PERFORMANCE-BUDGET §4), dan animasi layout memang tidak boleh
 * dipakai di sini karena ia memicu reflow.
 *
 * **`strict`.** Memaksa seluruh aplikasi memakai komponen `m.*`. Satu saja
 * `motion.*` yang lolos akan menarik SELURUH pustaka ke dalam bundle dan
 * menghapus manfaat LazyMotion — tanpa error, tanpa yang menyadarinya sampai
 * ukuran bundle diperiksa. `strict` mengubah kelalaian itu jadi error.
 *
 * **`reducedMotion="user"`.** Menghormati pengaturan "kurangi gerak" sistem
 * secara terpusat: transform dan posisi dimatikan, opacity tetap jalan
 * sehingga umpan balik tidak hilang sama sekali. Ditaruh di sini, bukan di
 * tiap komponen, supaya tidak ada satu pun animasi yang bisa lupa
 * menghormatinya (WCAG 2.3.3).
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
