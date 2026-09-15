import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "group relative inline-flex items-center justify-center gap-2 whitespace-nowrap overflow-hidden rounded-md text-sm font-medium transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-x-0 active:translate-y-0 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 after:pointer-events-none after:absolute after:inset-0 after:-translate-x-[150%] after:bg-[linear-gradient(120deg,transparent_30%,rgba(255,255,255,0.5)_50%,transparent_70%)] dark:after:bg-[linear-gradient(120deg,transparent_30%,rgba(0,0,0,0.15)_50%,transparent_70%)] after:transition-transform after:duration-700 after:ease-out group-hover:after:translate-x-[150%]",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow shadow-primary/25 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[4px_4px_0_0_hsl(var(--primary-shadow))]",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:-translate-x-0.5 hover:-translate-y-0.5 hover:bg-destructive/90 hover:shadow-[4px_4px_0_0_hsl(var(--destructive-shadow))]",
        outline:
          "border border-input bg-background shadow-sm hover:-translate-x-0.5 hover:-translate-y-0.5 hover:border-primary/60 hover:bg-background hover:text-primary hover:shadow-[4px_4px_0_0_hsl(var(--primary)/0.5),0_0_25px_hsl(var(--primary)/0.25)]",
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:-translate-x-0.5 hover:-translate-y-0.5 hover:bg-secondary/80 hover:shadow-[4px_4px_0_0_hsl(var(--secondary-foreground)/0.15)]",
        ghost:
          "hover:-translate-x-0.5 hover:-translate-y-0.5 hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
