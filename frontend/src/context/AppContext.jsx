import { createContext, useContext, useEffect, useState } from "react";

const Ctx = createContext(null);

export const AppProvider = ({ children }) => {
  const [market, setMarket] = useState(() => localStorage.getItem("tw-market") || "ASX");
  const [theme, setTheme] = useState(() => localStorage.getItem("tw-theme") || "dark");

  useEffect(() => localStorage.setItem("tw-market", market), [market]);
  useEffect(() => {
    localStorage.setItem("tw-theme", theme);
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  return <Ctx.Provider value={{ market, setMarket, theme, setTheme }}>{children}</Ctx.Provider>;
};

export const useApp = () => useContext(Ctx);
