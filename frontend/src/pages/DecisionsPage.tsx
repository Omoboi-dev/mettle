import { DecisionFeed } from "../components/DecisionFeed";
import { useMettleData } from "../context/MettleContext";

export function DecisionsPage() {
  const { decisions, decisionsLoading } = useMettleData();
  return <DecisionFeed decisions={decisions} loading={decisionsLoading} />;
}
