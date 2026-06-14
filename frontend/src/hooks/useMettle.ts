import { useCallback, useEffect, useState } from "react";
import { feedFromAgents, loadAgents, loadDecisionHistory } from "../lib/mettle";
import type { AgentLive, DecisionView, SystemStats } from "../types";

interface MettleState {
  agents: AgentLive[];
  stats: SystemStats | null;
  decisions: DecisionView[];
  loading: boolean;
  decisionsLoading: boolean;
  live: boolean;
  refresh: () => void;
}

export function useMettle(pollMs = 45_000): MettleState {
  const [agents, setAgents] = useState<AgentLive[]>([]);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [decisions, setDecisions] = useState<DecisionView[]>([]);
  const [loading, setLoading] = useState(true);
  const [decisionsLoading, setDecisionsLoading] = useState(true);

  const refresh = useCallback(async () => {
    // Agents are a handful of fast reads — render the leaderboard right away.
    const { agents, stats } = await loadAgents();
    setAgents(agents);
    setStats(stats);
    setLoading(false);

    // The full decision history walks the logs and is slower; fill it in after, and fall back to
    // each agent's latest decision if the public RPC won't serve the log range.
    setDecisionsLoading(true);
    const history = await loadDecisionHistory();
    setDecisions(history.length ? history : feedFromAgents(agents));
    setDecisionsLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, pollMs);
    return () => clearInterval(id);
  }, [refresh, pollMs]);

  const live = agents.some((a) => a.live);
  return { agents, stats, decisions, loading, decisionsLoading, live, refresh };
}
