import { useCallback, useEffect, useState } from "react";
import { feedFromAgents, loadAgents, loadDecisionHistory } from "../lib/mettle";
import type { AgentLive, DecisionView, SystemStats } from "../types";

interface MettleState {
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

export function useMettle(pollMs = 45_000): MettleState {
  const [agents, setAgents] = useState<AgentLive[]>([]);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [decisions, setDecisions] = useState<DecisionView[]>([]);
  const [loading, setLoading] = useState(true);
  const [decisionsLoading, setDecisionsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);

    // Agents are a handful of fast reads — render the leaderboard right away.
    const { agents, stats } = await loadAgents();
    setAgents(agents);
    setStats(stats);
    setLoading(false);

    // Show each agent's latest decision straight away so the feed isn't blank, then upgrade to the
    // full on-chain history (slower — it walks the logs). Falls back to the quick view if the public
    // RPC won't serve the log range.
    const quick = feedFromAgents(agents);
    setDecisions((prev) => (prev.length ? prev : quick));
    setDecisionsLoading(true);
    const history = await loadDecisionHistory();
    setDecisions(history.length ? history : quick);
    setDecisionsLoading(false);

    setLastUpdated(Date.now());
    setRefreshing(false);
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, pollMs);
    return () => clearInterval(id);
  }, [refresh, pollMs]);

  const live = agents.some((a) => a.live);
  return { agents, stats, decisions, loading, decisionsLoading, refreshing, lastUpdated, live, refresh };
}
