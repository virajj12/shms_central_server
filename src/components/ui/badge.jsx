import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wider transition-colors",
  {
    variants: {
      variant: {
        default:
          "bg-white text-zinc-950 shadow-sm",
        secondary:
          "bg-zinc-800 text-zinc-300 border border-zinc-700/80",
        destructive:
          "bg-rose-500/10 text-rose-400 border border-rose-500/30",
        outline:
          "text-zinc-400 border border-zinc-800 bg-zinc-900/60",
        success:
          "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30",
        warning:
          "bg-amber-500/10 text-amber-400 border border-amber-500/30",
        ghost:
          "text-zinc-400 hover:bg-zinc-800",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function Badge({ className, variant, ...props }) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
