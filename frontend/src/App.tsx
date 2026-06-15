import { Route, Routes } from "react-router-dom";
import { WalletProvider } from "./context/WalletContext";
import { MettleProvider } from "./context/MettleContext";
import { Layout } from "./components/Layout";
import { HomePage } from "./pages/HomePage";
import { DecisionsPage } from "./pages/DecisionsPage";
import { AllocationPage } from "./pages/AllocationPage";
import { HowItWorksPage } from "./pages/HowItWorksPage";
import { AgentDetailPage } from "./pages/AgentDetailPage";

export default function App() {
  return (
    <WalletProvider>
      <MettleProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/decisions" element={<DecisionsPage />} />
            <Route path="/allocation" element={<AllocationPage />} />
            <Route path="/how-it-works" element={<HowItWorksPage />} />
            <Route path="/agent/:id" element={<AgentDetailPage />} />
            <Route path="*" element={<HomePage />} />
          </Route>
        </Routes>
      </MettleProvider>
    </WalletProvider>
  );
}
