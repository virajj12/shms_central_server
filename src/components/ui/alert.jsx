import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const alertVariants = cva(
  "relative w-full rounded-2xl border p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-zinc-100",
  {
    variants: {
      variant: {
        default: "bg-[#18181c] text-zinc-100 border-zinc-800",
        destructive:
          "border-rose-500/30 bg-rose-500/10 text-rose-300 [&>svg]:text-rose-400",
        warning:
          "border-amber-500/30 bg-amber-500/10 text-amber-300 [&>svg]:text-amber-400",
        success:
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 [&>svg]:text-emerald-400",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

const Alert = React.forwardRef(({ className, variant, ...props }, ref) => (
  <div
    ref={ref}
    role="alert"
    className={cn(alertVariants({ variant }), className)}
    {...props}
  />
));
Alert.displayName = "Alert";

const AlertTitle = React.forwardRef(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn("mb-1 text-xs font-bold leading-none tracking-tight", className)}
    {...props}
  />
));
AlertTitle.displayName = "AlertTitle";

const AlertDescription = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-xs [&_p]:leading-relaxed text-zinc-300", className)}
    {...props}
  />
));
AlertDescription.displayName = "AlertDescription";

const AlertAction = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("absolute right-4 top-4 flex items-center gap-2", className)}
    {...props}
  />
));
AlertAction.displayName = "AlertAction";

export { Alert, AlertTitle, AlertDescription, AlertAction };
