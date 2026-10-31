import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import { AppProvider, useApp } from "@/context/AppContext";
import { Header, MobileNav } from "@/components/Header";
import Today from "@/pages/Today";
import Analyse from "@/pages/Analyse";
import Follow from "@/pages/Follow";
import Trades from "@/pages/Trades";
import Learn from "@/pages/Learn";

const Shell = () => {
  const { theme } = useApp();
  return (
    <div className="App pb-24 md:pb-10">
      <Header />
      <main className="mx-auto max-w-6xl px-4 sm:px-6 pt-6">
        <Routes>
          <Route path="/" element={<Today />} />
          <Route path="/analyse" element={<Analyse />} />
          <Route path="/follow" element={<Follow />} />
          <Route path="/trades" element={<Trades />} />
          <Route path="/learn" element={<Learn />} />
        </Routes>
        <p className="mt-12 text-xs text-muted-foreground" data-testid="footer-disclaimer">
          TradeWise is a decision-support journal. It never places orders. Prices are free delayed data and may differ from your broker.
        </p>
      </main>
      <MobileNav />
      <Toaster theme={theme} position="top-center" richColors />
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Shell />
      </BrowserRouter>
    </AppProvider>
  );
}
