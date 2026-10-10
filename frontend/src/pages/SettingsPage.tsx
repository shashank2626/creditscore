import React from "react";
import { useAuth } from "../context/AuthContext";
import { Settings, AlertCircle, Server } from "lucide-react";

export const SettingsPage: React.FC = () => {
  const { user, logout } = useAuth();

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-[#FFFFFF] border border-[#E2E8F0] p-6 rounded-lg shadow-xs">
        <h1 className="text-xl font-bold text-[#0F172A] flex items-center gap-2">
          <Settings className="w-5 h-5 text-[#1E3A8A]" /> Settings & Prototype Specifications
        </h1>
        <p className="text-xs text-[#475569] mt-1.5 leading-relaxed">
          System metadata, active session details, ML model registry, and transparent prototype disclosures.
        </p>
      </div>

      {/* Account Info */}
      <div className="bg-[#FFFFFF] border border-[#E2E8F0] p-6 rounded-lg shadow-xs space-y-4">
        <h2 className="text-base font-bold text-[#0F172A]">Active Session Details</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="bg-[#F8FAFC] p-4 rounded-lg border border-[#E2E8F0] space-y-1">
            <span className="text-[#475569] font-medium">Full Name</span>
            <div className="font-bold text-[#0F172A]">{user?.full_name}</div>
          </div>
          <div className="bg-[#F8FAFC] p-4 rounded-lg border border-[#E2E8F0] space-y-1">
            <span className="text-[#475569] font-medium">Username</span>
            <div className="font-bold text-[#0F172A]">{user?.username}</div>
          </div>
          <div className="bg-[#F8FAFC] p-4 rounded-lg border border-[#E2E8F0] space-y-1">
            <span className="text-[#475569] font-medium">Assigned Role</span>
            <div className="font-bold text-[#1E3A8A] uppercase">{user?.role}</div>
          </div>
          <div className="bg-[#F8FAFC] p-4 rounded-lg border border-[#E2E8F0] space-y-1">
            <span className="text-[#475569] font-medium">Session Status</span>
            <div className="font-bold text-[#16A34A]">Authenticated</div>
          </div>
        </div>

        <button
          type="button"
          onClick={logout}
          className="px-4 py-2 bg-[#FEF2F2] hover:bg-[#FEE2E2] text-[#DC2626] border border-[#FECACA] font-semibold text-xs rounded-lg transition-all cursor-pointer"
        >
          Sign Out
        </button>
      </div>

      {/* Model & Architecture Specifications */}
      <div className="bg-[#FFFFFF] border border-[#E2E8F0] p-6 rounded-lg shadow-xs space-y-4">
        <h2 className="text-base font-bold text-[#0F172A] flex items-center gap-2">
          <Server className="w-4 h-4 text-[#1E3A8A]" /> Active Model & Pipeline Specifications
        </h2>

        <div className="space-y-3 text-xs text-[#0F172A]">
          <div className="p-3.5 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0] flex justify-between">
            <span className="text-[#475569] font-medium">Model Version:</span>
            <span className="font-mono font-bold text-[#1E3A8A]">credence_gb_v1</span>
          </div>
          <div className="p-3.5 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0] flex justify-between">
            <span className="text-[#475569] font-medium">Classifier Algorithm:</span>
            <span className="font-mono text-[#0F172A]">GradientBoostingClassifier (n_est=150, depth=3)</span>
          </div>
          <div className="p-3.5 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0] flex justify-between">
            <span className="text-[#475569] font-medium">SHAP Explainer:</span>
            <span className="font-mono text-[#0F172A]">shap.TreeExplainer (Log-Odds Additivity Verified)</span>
          </div>
          <div className="p-3.5 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0] flex justify-between">
            <span className="text-[#475569] font-medium">Scorecard Transformation:</span>
            <span className="font-mono text-[#0F172A]">Base=600, Good/Bad Odds=20, PDO=40</span>
          </div>
        </div>
      </div>

      {/* Prototype Limitations Disclosure */}
      <div className="bg-[#FFFFFF] border border-[#E2E8F0] p-6 rounded-lg shadow-xs space-y-4">
        <h2 className="text-base font-bold text-[#0F172A] flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-[#D97706]" /> Prototype Limitations & Production Path
        </h2>

        <ul className="list-disc list-inside text-xs text-[#475569] space-y-2 leading-relaxed">
          <li>The model is trained on synthetic data, not real-world loan repayment outcomes.</li>
          <li>Default probabilities are not calibrated to a real lending population.</li>
          <li>Score thresholds and loan policy multipliers are illustrative choices for demonstration.</li>
          <li>Fraud checks are transparent heuristics designed to alert human loan officers, not automatic rejection triggers.</li>
          <li>Real lending deployment requires formal legal, privacy, compliance, model-risk, and production identity governance.</li>
        </ul>
      </div>
    </div>
  );
};
