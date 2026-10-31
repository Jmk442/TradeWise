import { NavLink } from "react-router-dom";
import { Sun, Moon, Sunrise, LineChart, Users, NotebookPen, BookOpen } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { SessionStrip } from "@/components/SessionStrip";

const TABS = [
  { to: "/", label: "Today", icon: Sunrise, id: "today" },
  { to: "/analyse", label: "Analyse", icon: LineChart, id: "analyse" },
  { to: "/follow", label: "Follow", icon: Users, id: "follow" },
  { to: "/trades", label: "My Trades", icon: NotebookPen, id: "trades" },
  { to: "/learn", label: "Learn", icon: BookOpen, id: "learn" },
];

const MarketSwitch = () => {
  const { market, setMarket } = useApp();
  return (
    <div className="flex rounded-full border bg-secondary p-1" role="group" aria-label="Market">
      {["ASX", "US"].map((m) => (
        <button key={m} data-testid={`market-switch-${m.toLowerCase()}`} onClick={() => setMarket(m)}
          aria-pressed={market === m}
          className={`h-9 rounded-full px-4 text-sm font-semibold transition-colors ${market === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
          {m}
        </button>
      ))}
    </div>
  );
};

export const Header = () => {
  const { theme, setTheme } = useApp();
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <NavLink to="/" className="flex items-center gap-2" data-testid="brand-logo">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary font-heading text-sm font-bold text-primary-foreground">TW</span>
          <span className="font-heading text-lg font-semibold tracking-tight">TradeWise</span>
        </NavLink>
        <nav className="ml-6 hidden gap-1 md:flex">
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} end data-testid={`nav-${t.id}`}
              className={({ isActive }) => `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${isActive ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {t.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <MarketSwitch />
          <button data-testid="theme-toggle" aria-label="Toggle light or dark mode" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="grid h-11 w-11 place-items-center rounded-full border text-muted-foreground transition-colors hover:text-foreground">
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </div>
      <SessionStrip />
    </header>
  );
};

export const MobileNav = () => (
  <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t bg-background/90 backdrop-blur-xl md:hidden">
    {TABS.map((t) => (
      <NavLink key={t.to} to={t.to} end data-testid={`mobile-nav-${t.id}`}
        className={({ isActive }) => `flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium ${isActive ? "text-primary" : "text-muted-foreground"}`}>
        <t.icon size={20} />
        {t.label}
      </NavLink>
    ))}
  </nav>
);
