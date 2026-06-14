import { Hero } from "../components/Hero";
import { Leaderboard } from "../components/Leaderboard";
import { useMettleData } from "../context/MettleContext";

export function HomePage() {
  const { stats, agents, loading } = useMettleData();
  return (
    <>
      <Hero stats={stats} />
      <Leaderboard agents={agents} loading={loading} />
    </>
  );
}
