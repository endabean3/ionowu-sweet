import { clsx } from "clsx";
import { type SelectHTMLAttributes, forwardRef } from "react";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
}

/**
 * Select primitif — token dan bentuknya sengaja disalin persis dari
 * components/ui/input.tsx, bukan dikarang baru, supaya field pilihan dan field
 * ketik berdiri sejajar di form yang sama.
 *
 * Memakai <select> bawaan, bukan dropdown kustom: di ponsel murah (perangkat
 * kasir paling umum) picker bawaan sistem jauh lebih ringan dan sudah benar
 * soal aksesibilitas serta keyboard.
 */
const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, hint, className, id, children, ...props }, ref) => {
    const selectId = id ?? label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={selectId} className="text-sm font-medium text-main">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          className={clsx(
            "w-full px-4 py-3 rounded-[22px] text-base outline-none transition-all",
            // Garis tepi berwarna tinta, bukan putih transparan: di atas kartu
            // putih, border-surface/40 tidak terlihat sama sekali dan kolom yang
            // belum difokus tampak seperti bukan kolom isian.
            "bg-surface/60 text-main backdrop-blur-sm border-2 border-card-border/25",
            "shadow-[0_1px_3px_rgba(45,35,30,0.08)]",
            "focus:border-card-border focus:ring-4 focus:ring-[rgba(162,232,206,0.6)]",
            error && "border-red-400 focus:border-red-500 focus:ring-red-200",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            className,
          )}
          {...props}
        >
          {children}
        </select>
        {error && <p className="text-xs text-red-500">{error}</p>}
        {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      </div>
    );
  },
);
Select.displayName = "Select";

export { Select };
