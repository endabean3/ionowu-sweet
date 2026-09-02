import { clsx } from "clsx";
import { type InputHTMLAttributes, forwardRef } from "react";

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
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-[--sweet-dark-cocoa]">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={clsx(
            // Base
            "w-full px-4 py-3 rounded-[22px] text-base outline-none transition-all",
            // Background & border
            "bg-white/60 backdrop-blur-sm border border-white/40",
            "shadow-[0_1px_3px_rgba(45,35,30,0.08)]",
            // Focus — ring matcha
            "focus:border-[--sweet-matcha] focus:ring-2 focus:ring-[--sweet-matcha]/30",
            // Error
            error && "border-red-400 focus:border-red-500 focus:ring-red-200",
            // Placeholder
            "placeholder:text-[--sweet-dark-cocoa]/40",
            // Disabled
            "disabled:opacity-50 disabled:cursor-not-allowed",
            className,
          )}
          {...props}
        />
        {error && <p className="text-xs text-red-500">{error}</p>}
        {hint && !error && <p className="text-xs text-[--sweet-dark-cocoa]/60">{hint}</p>}
      </div>
    );
  },
);
Input.displayName = "Input";

export { Input };
