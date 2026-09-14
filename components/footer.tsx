import { ThemeSwitcher } from "@/components/theme-switcher";

export function Footer() {
  return (
    <footer className="w-full flex items-center justify-center border-t mx-auto text-center text-xs gap-4 py-6">
      <p>Extract invoice PDFs into structured, queryable data.</p>
      <ThemeSwitcher />
    </footer>
  );
}
