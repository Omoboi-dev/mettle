import { Outlet, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { motion } from "framer-motion";
import { TopNav } from "./TopNav";
import { CORE } from "../data/deployment";
import { addressUrl } from "../lib/format";

export function Layout() {
  const { pathname } = useLocation();

  // Start each route at the top.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="flex min-h-screen flex-col">
      <TopNav />
      <motion.main
        key={pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex-1"
      >
        <Outlet />
      </motion.main>

      <footer className="border-t border-line px-5 py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 text-sm text-slate sm:flex-row">
          <span>Mettle — trustless reputation for AI trading agents on Mantle.</span>
          <div className="flex items-center gap-5">
            <a href={addressUrl(CORE.AIRunner)} target="_blank" rel="noreferrer" className="hover:text-white">
              AIRunner
            </a>
            <a href={addressUrl(CORE.ValidationRegistry)} target="_blank" rel="noreferrer" className="hover:text-white">
              ValidationRegistry
            </a>
            <a href={addressUrl(CORE.AllocationController)} target="_blank" rel="noreferrer" className="hover:text-white">
              AllocationController
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
