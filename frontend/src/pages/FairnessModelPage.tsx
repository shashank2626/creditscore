import React, { useState, useEffect } from "react";
import { api } from "../services/api";
import { Scale, AlertCircle } from "lucide-react";

export const FairnessModelPage: React.FC = () => {
  const [fairnessData, setFairnessData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getFairness()
      .then((data) => setFairnessData(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="bg-[#FFFFFF] border border-[#E2E8F0] p-6 rounded-lg shadow-xs">
        <h1 className="text-xl font-bold text-[#0F172A] flex items-center gap-2">
          <Scale className="w-5 h-5 text-[#1E3A8A]" /> Fairness & Model Monitoring Diagnostic Panel
        </h1>
        <p className="text-xs text-[#475569] mt-1.5 leading-relaxed">
          Synthetic benchmark metrics across documented borrower archetypes. This panel evaluates group approval parity and disparate impact ratio.
        </p>
      </div>

      {loading ? (
        <div className="text-center py-12 text-xs text-[#475569] bg-[#F8FAFC] rounded-lg border border-[#E2E8F0]">
          Computing synthetic fairness benchmarks...
        </div>
      ) : fairnessData ? (
        <>
          {/* Overview Disparate Impact Metric Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-[#FFFFFF] p-5 rounded-lg border border-[#E2E8F0] shadow-xs space-y-1">
              <div className="text-xs font-medium text-[#475569]">Disparate Impact Ratio</div>
              <div className="text-2xl font-black text-[#1E3A8A]">
                {fairnessData.overall_disparate_impact}
              </div>
              <div className="text-[10px] text-[#475569]">Screening benchmark ratio (&ge; 0.80 standard threshold)</div>
            </div>

            <div className="bg-[#FFFFFF] p-5 rounded-lg border border-[#E2E8F0] shadow-xs space-y-1">
              <div className="text-xs font-medium text-[#475569]">Model Version</div>
              <div className="text-xl font-bold font-mono text-[#0F172A]">{fairnessData.model_version}</div>
              <div className="text-[10px] text-[#475569]">GradientBoostingClassifier</div>
            </div>

            <div className="bg-[#FFFFFF] p-5 rounded-lg border border-[#E2E8F0] shadow-xs space-y-1">
              <div className="text-xs font-medium text-[#475569]">Evaluation Dataset</div>
              <div className="text-xl font-bold text-[#0F172A]">{fairnessData.dataset_identifier}</div>
              <div className="text-[10px] text-[#475569]">5,000 synthetic borrowers</div>
            </div>
          </div>

          {/* Group Fairness Table */}
          <div className="bg-[#FFFFFF] border border-[#E2E8F0] rounded-lg p-6 space-y-4 shadow-xs">
            <h2 className="text-base font-bold text-[#0F172A]">Group Approval & Performance Breakdown</h2>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#475569] font-semibold text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Borrower Archetype</th>
                    <th className="py-3 px-4">Sample Size</th>
                    <th className="py-3 px-4">Approval Rate (&ge; 600)</th>
                    <th className="py-3 px-4">Mean Score</th>
                    <th className="py-3 px-4">Group AUC</th>
                    <th className="py-3 px-4">Disparate Impact Ratio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {fairnessData.groups.map((g: any, idx: number) => (
                    <tr key={idx} className="hover:bg-[#F8FAFC] transition-colors">
                      <td className="py-3.5 px-4 font-semibold text-[#0F172A]">{g.group_name}</td>
                      <td className="py-3.5 px-4 text-[#475569]">{g.sample_count}</td>
                      <td className="py-3.5 px-4 font-bold text-[#0F172A]">{(g.approval_rate * 100).toFixed(1)}%</td>
                      <td className="py-3.5 px-4 font-mono font-bold text-[#0F172A]">{g.score_average}</td>
                      <td className="py-3.5 px-4 text-[#475569] font-medium">{g.auc}</td>
                      <td className="py-3.5 px-4 font-mono font-bold text-[#1E3A8A]">{g.disparate_impact_ratio}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mandatory Disclaimer Box */}
          <div className="bg-[#FFFBEB] border border-[#FDE68A] p-5 rounded-lg text-xs text-[#92400E] space-y-1.5 shadow-xs">
            <div className="font-bold text-[#D97706] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-[#D97706]" /> Mandatory Synthetic Fairness Disclaimer
            </div>
            <p className="text-[#B45309] leading-relaxed">
              {fairnessData.disclaimer}
            </p>
          </div>
        </>
      ) : null}
    </div>
  );
};
