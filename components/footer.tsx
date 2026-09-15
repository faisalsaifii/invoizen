import { ThemeSwitcher } from "@/components/theme-switcher";
import { Github } from "lucide-react";

export function Footer() {
  return (
    <footer className="w-full flex flex-col items-center justify-center border-t mx-auto text-center text-xs gap-4 py-6">
      <p>Extract invoices into structured, queryable data.</p>
      <div className="flex flex-row items-center gap-4">
        <a
          href={"https://github.com/faisalsaifii/invoizen"}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Github className="size-3.5" />
          Made by faisalsaifii
        </a>
        <ThemeSwitcher />
      </div>
    </footer>
  );
}
