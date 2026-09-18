import { clsx } from "clsx";
import { type InputHTMLAttributes, forwardRef, useId } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

/**
 * Input primitif dengan token Sweet Creamy Spatial Luxe.
 * Mendukung label, error message, dan hint text.
 */
const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className, id, ...props }, ref) => {
    // useId, bukan label yang di-slug: dua field berlabel sama di satu halaman
    // (mis. "Harga Jual" di tiap baris varian) menghasilkan id KEMBAR, dan
    // <label htmlFor> kembar membuat ketukan pada label kedua memindahkan
    // fokus ke input pertama.
    const autoId = useId();
    const inputId = id ?? autoId;
    const errorId = `${inputId}-error`;
    const hintId = `${inputId}-hint`;

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-main">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
          className={clsx(
            // Base
            "w-full px-4 py-3 rounded-[22px] text-base outline-none transition-all",
            // Background & border
            // Garis tepi berwarna tinta, bukan putih transparan: di atas kartu
            // putih, border-surface/40 tidak terlihat sama sekali dan kolom yang
            // belum difokus tampak seperti bukan kolom isian.
            "bg-surface/60 text-main backdrop-blur-sm border-2 border-card-border/25",
            "shadow-[0_1px_3px_rgba(45,35,30,0.08)]",
            // Focus — ring matcha. Warna literal, bukan token+opacity: lihat
            // catatan di login/page.tsx soal keterbatasan opacity-modifier
            // pada warna yang didefinisikan sebagai var(--x) di tailwind.config.
            "focus:border-card-border focus:ring-4 focus:ring-[rgba(162,232,206,0.6)]",
            // Error
            error && "border-red-400 focus:border-red-500 focus:ring-red-200",
            // Placeholder
            "placeholder:text-muted",
            // Disabled
            "disabled:opacity-50 disabled:cursor-not-allowed",
            className,
          )}
          {...props}
        />
        {error && (
          <p id={errorId} role="alert" className="text-xs font-semibold text-red-700">
            {error}
          </p>
        )}
        {hint && !error && (
          <p id={hintId} className="text-xs text-muted">
            {hint}
          </p>
        )}
      </div>
    );
  },
);
Input.displayName = "Input";

export { Input };
