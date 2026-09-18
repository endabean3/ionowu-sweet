import { playPop } from "@/lib/audio/haptics";
import { clsx } from "clsx";
import React from "react";
import { twMerge } from "tailwind-merge";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "matcha" | "custard" | "ghost" | "destructive";
  size?: "default" | "sm" | "pos" | "pos-lg";
  disableHaptic?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      type = "button",
      variant = "primary",
      size = "default",
      disableHaptic = false,
      onClick,
      children,
      ...props
    },
    ref,
  ) => {
    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (!disableHaptic) {
        playPop();
      }
      if (onClick) {
        onClick(e);
      }
    };

    const variantStyles = {
      primary: "bg-sweet-strawberry text-main border-card-border hover:bg-[#ff8da4]",
      secondary: "bg-sweet-sky text-main border-card-border hover:bg-[#92ccf4]",
      matcha: "bg-sweet-matcha text-main border-card-border hover:bg-[#8de0c1]",
      custard: "bg-sweet-custard text-main border-card-border hover:bg-[#fae290]",
      ghost: "bg-transparent text-main border-transparent shadow-none hover:bg-black/5",
      destructive: "bg-[#ff7b7b] text-main border-card-border hover:bg-[#ff6161]",
    };

    const sizeStyles = {
      default: "h-10 px-5 text-sm font-semibold",
      sm: "h-8 px-3 text-xs font-semibold",
      pos: "h-12 px-6 text-base font-bold pos-touch-target", // 48px standard POS touch target
      "pos-lg": "h-16 px-8 text-lg font-extrabold pos-touch-target", // 64px Checkout touch target
    };

    return (
      <button
        ref={ref}
        // `type` WAJIB diteruskan. Sebelumnya ia diambil dari props (bawaan
        // "button") lalu dibuang, sehingga setiap <Button> di dalam <form>
        // menjadi tombol submit HTML: pintasan jumlah di keypad kasir langsung
        // memasukkan barang ke keranjang, dan tombol tambah varian di form
        // produk ikut mengirim form.
        type={type}
        onClick={handleClick}
        className={twMerge(
          clsx(
            "mochi-button inline-flex items-center justify-center rounded-pill border-2 border-card-border font-sans transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-sweet-strawberry disabled:pointer-events-none disabled:opacity-50",
            variantStyles[variant],
            sizeStyles[size],
            className,
          ),
        )}
        {...props}
      >
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";
