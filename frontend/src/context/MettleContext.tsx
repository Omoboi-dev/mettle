import { createContext, useContext, type ReactNode } from "react";
import { useMettle } from "../hooks/useMettle";
import type { AgentLive, DecisionView, SystemStats } from "../types";

interface MettleData {
  agents: AgentLive[];
  stats: SystemStats | null;
  decisions: DecisionView[];
  loading: boolean;
  decisionsLoading: boolean;
  refreshing: boolean;
  lastUpdated: number | null;
  live: boolean;
  refresh: () => void;
}

const MettleContext = createContext<MettleData | null>(null);

// Loads the chain data once and shares it across every route, so navigating between pages doesn't
// refetch everything.
export function MettleProvider({ children }: { children: ReactNode }) {
  const value = useMettle();
  return <MettleContext.Provider value={value}>{children}</MettleContext.Provider>;
}

export function useMettleData(): MettleData {
  const ctx = useContext(MettleContext);
  if (!ctx) throw new Error("useMettleData must be used within a MettleProvider");
  return ctx;
}
