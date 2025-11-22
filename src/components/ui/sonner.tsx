import { Toaster as Sonner } from "sonner";
import type { ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      style={
        {
          "--normal-bg": "#ffffff",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--success-bg": "#ffffff",
          "--success-text": "var(--popover-foreground)",
          "--success-border": "var(--border)",
          "--warning-bg": "#ffffff",
          "--warning-text": "var(--popover-foreground)",
          "--warning-border": "var(--border)",
          "--error-bg": "#ffffff",
          "--error-text": "var(--popover-foreground)",
          "--error-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
