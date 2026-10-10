import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { Navbar } from "./components/Navbar";
import { Sidebar } from "./components/Sidebar";
import { LoginPage } from "./pages/LoginPage";
import { OverviewDashboard } from "./pages/OverviewDashboard";
import { NewAnalysisPage } from "./pages/NewAnalysisPage";
import { ApplicationDetailPage } from "./pages/ApplicationDetailPage";
import { DecisionHistoryPage } from "./pages/DecisionHistoryPage";
import { FairnessModelPage } from "./pages/FairnessModelPage";
import { SettingsPage } from "./pages/SettingsPage";

const ProtectedLayout: React.FC = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center text-xs text-[#475569]">
        Loading Credence AI Session...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col text-[#0F172A]">
      <Navbar />
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 p-6 md:p-8 overflow-y-auto max-w-7xl w-full mx-auto">
          <Routes>
            <Route path="/overview" element={<OverviewDashboard />} />
            <Route path="/new-analysis" element={<NewAnalysisPage />} />
            <Route path="/applications" element={<OverviewDashboard />} />
            <Route path="/applications/:id" element={<ApplicationDetailPage />} />
            <Route path="/decision-history" element={<DecisionHistoryPage />} />
            <Route path="/fairness-model" element={<FairnessModelPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/overview" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
};

export const AppContent: React.FC = () => {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/overview" replace /> : <LoginPage />} />
      <Route path="/*" element={<ProtectedLayout />} />
    </Routes>
  );
};

export const App: React.FC = () => {
  return (
    <Router>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </Router>
  );
};

export default App;
