import React, { useState, useEffect } from "react";
import { api } from "../services/api";
import { History } from "lucide-react";

export const DecisionHistoryPage: React.FC = () => {
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getApplications()
      .then((data) => setApplications(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="bg-[#FFFFFF] border border-[#E2E8F0] p-6 rounded-lg shadow-xs">
        <h1 className="text-xl font-bold text-[#0F172A] flex items-center gap-2">
          <History className="w-5 h-5 text-[#1E3A8A]" /> Decision History & Traceability Audit Log
        </h1>
        <p className="text-xs text-[#475569] mt-1.5 leading-relaxed">
          Complete audit history mapping score calculations, SHAP explanations, policy recommendations, and officer override rationale.
        </p>
      </div>

      <div className="bg-[#FFFFFF] border border-[#E2E8F0] rounded-lg p-6 space-y-4 shadow-xs">
        {loading ? (
          <div className="text-center py-12 text-xs text-[#475569] bg-[#F8FAFC] rounded-lg border border-[#E2E8F0]">
            Loading decision history...
          </div>
        ) : applications.length === 0 ? (
          <div className="text-center py-12 text-xs text-[#475569] bg-[#F8FAFC] rounded-lg border border-[#E2E8F0] font-medium">
            No recorded decisions in system.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#475569] font-semibold text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Application ID</th>
                  <th className="py-3 px-4">Borrower Name</th>
                  <th className="py-3 px-4">Requested Amount</th>
                  <th className="py-3 px-4">Latest Score</th>
                  <th className="py-3 px-4">Decision Status</th>
                  <th className="py-3 px-4">Assigned Officer</th>
                  <th className="py-3 px-4">Last Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {applications.map((app) => {
                  let statusBadge = "bg-[#FFFBEB] text-[#D97706] border-[#FDE68A]";
                  if (app.status === "Approved") statusBadge = "bg-[#F0FDF4] text-[#16A34A] border-[#BBF7D0]";
                  if (app.status === "Declined") statusBadge = "bg-[#FEF2F2] text-[#DC2626] border-[#FECACA]";

                  return (
                    <tr key={app.id} className="hover:bg-[#F8FAFC] transition-colors">
                      <td className="py-3.5 px-4 font-mono font-semibold text-[#1E3A8A] whitespace-nowrap">{app.id}</td>
                      <td className="py-3.5 px-4 font-semibold text-[#0F172A]">{app.borrower_name}</td>
                      <td className="py-3.5 px-4 text-[#0F172A] font-medium whitespace-nowrap">₹{app.requested_amount?.toLocaleString()}</td>
                      <td className="py-3.5 px-4 font-bold text-[#0F172A] whitespace-nowrap">{app.score || "-"}</td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className={`px-2.5 py-0.5 rounded-md border text-[11px] font-semibold inline-flex items-center ${statusBadge}`}>
                          {app.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-[#475569]">{app.assigned_officer_id || "System Underwriting"}</td>
                      <td className="py-3.5 px-4 text-[#475569] whitespace-nowrap">{new Date(app.updated_at).toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
