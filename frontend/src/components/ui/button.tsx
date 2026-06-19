import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[0_4px_14px_rgba(224,138,60,0.25)] hover:bg-primary-hover hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(224,138,60,0.32)] active:translate-y-0 active:scale-[0.98]",
        secondary:
          "border border-primary/35 bg-transparent text-primary hover:bg-primary-soft hover:border-primary",
        outline:
          "border border-border-strong bg-transparent text-foreground hover:border-primary/40 hover:bg-surface-elevated",
        ghost:
          "text-muted hover:bg-surface-elevated hover:text-foreground",
        destructive:
          "border border-destructive/40 bg-transparent text-destructive hover:bg-destructive-soft hover:border-destructive/60",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-11 px-6 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
  ),
);
Button.displayName = "Button";
