import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-xs font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "bg-white text-zinc-950 shadow-sm hover:bg-zinc-200 active:scale-[0.98]",
        destructive:
          "bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 active:scale-[0.98]",
        outline:
          "border border-zinc-800 bg-zinc-900/60 text-zinc-200 shadow-sm hover:bg-zinc-800 hover:text-white active:scale-[0.98]",
        secondary:
          "bg-zinc-800 text-zinc-200 hover:bg-zinc-700 hover:text-white active:scale-[0.98]",
        ghost:
          "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 active:scale-[0.98]",
        link: "text-zinc-300 hover:text-white underline-offset-4 hover:underline",
        emerald:
          "bg-white text-zinc-950 font-semibold shadow-sm hover:bg-zinc-200 active:scale-[0.98]",
      },
      size: {
        default: "h-9 px-4 py-2",
        xs: "h-7 px-2.5 text-[11px] rounded-lg",
        sm: "h-8 px-3 rounded-lg text-xs",
        lg: "h-10 px-6 rounded-xl text-sm",
        icon: "h-9 w-9 p-0",
        "icon-xs": "h-6 w-6 p-0 rounded-md",
        "icon-sm": "h-7 w-7 p-0 rounded-lg",
        "icon-lg": "h-10 w-10 p-0 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  return (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  );
});
Button.displayName = "Button";

export { Button, buttonVariants };
