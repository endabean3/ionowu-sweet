"use client";

import type { InputHTMLAttributes } from "react";

/**
 * Kolom nominal rupiah: SATU kolom dengan awalan "Rp" di dalamnya.
 *
 * Menggantikan pola lama "kotak Rp + kolom angka" yang ditulis ulang di modal
 * bayar dan modal buka shift. Di layar 360px pola itu punya celah di antara
 * keduanya, tepi yang tidak menyatu, cincin fokus yang hanya membungkus
 * separuh, dan panah naik/turun kolom angka yang tak berguna di layar sentuh
 * tetapi memakan ruang angka.
 */
export function MoneyInput({
  className = "",
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "inputMode">) {
  return (
    <div className={`relative ${className}`}>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-4 flex items-center font-mono text-lg font-bold text-main"
      >
        Rp
      </span>
      <input
        type="number"
        inputMode="numeric"
        className="w-full rounded-xl border-2 border-card-border bg-surface py-3 pl-14 pr-4 font-mono text-lg font-bold text-main outline-none [appearance:textfield] focus:ring-4 focus:ring-sweet-strawberry/50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        {...props}
      />
    </div>
  );
}
