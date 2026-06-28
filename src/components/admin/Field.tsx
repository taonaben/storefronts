import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface FieldProps {
  label: string;
  helper?: string;
  children: ReactNode;
  className?: string;
}

export function Field({ label, helper, children, className }: FieldProps) {
  return (
    <div className={cn("block space-y-1.5", className)}>
      <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
      {helper && <span className="block text-[10px] leading-snug text-muted-foreground">{helper}</span>}
    </div>
  );
}
