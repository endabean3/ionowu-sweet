import { clsx } from "clsx";
import React from "react";
import { twMerge } from "tailwind-merge";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "milky" | "solid" | "matcha" | "custard";
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = "milky", children, ...props }, ref) => {
    const variantStyles = {
      milky: "milky-glass",
      solid: "bg-white border-2 border-card-border shadow-hard",
      matcha: "bg-sweet-matcha border-2 border-card-border shadow-hard",
      custard: "bg-sweet-custard border-2 border-card-border shadow-hard",
    };

    return (
      <div
        ref={ref}
        className={twMerge(
          clsx("rounded-squircle p-6 text-main transition-all", variantStyles[variant], className),
        )}
        {...props}
      >
        {children}
      </div>
    );
  },
);

Card.displayName = "Card";
