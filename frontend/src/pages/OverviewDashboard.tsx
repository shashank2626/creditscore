import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import {
  PlusCircle,
  Users,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  ShieldCheck,
  Search,
  FileSpreadsheet
} from "lucide-react";

export const OverviewDashboard: React.FC = () => {
  const { user } = useAuth();
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const loadData = async () => {
    try {
      const data = await api.getApplications();
      setApplications(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const totalApps = applications.length;
  const approvedApps = applications.filter((a) => a.status === "Approved").length;
  const pendingApps = applications.filter((a) => a.status === "Under Review" || a.status === "Submitted").length;
  const avgScore = totalApps > 0
    ? Math.round(applications.reduce((acc, a) => acc + (a.score || 600), 0) / totalApps)
    : 600;

  const filteredApps = applications.filter(
    (a) =>
      (a.borrower_name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Top Executive Header - 8px radius, crisp border */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#FFFFFF] border border-[#E2E8F0] p-6 rounded-lg shadow-xs">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl font-bold text-[#0F172A] tracking-tight">
              Welcome back, {user?.full_name}
            </h1>
            <span className="text-xs bg-[#DBEAFE] text-[#1E3A8A] border border-[#BFDBFE] px-2.5 py-0.5 rounded-md capitalize font-semibold">
              {user?.role} Portal
            </span>
          </div>
          <p className="text-xs text-[#475569] mt-1.5 leading-relaxed">
            Real-time executive dashboard summarizing active credit applications, data quality ratings, and risk scores.
          </p>
        </div>

        <div>
          <Link
            to="/new-analysis"
            className="px-4 py-2.5 rounded-lg bg-[#1E3A8A] hover:bg-[#1D4ED8] active:bg-[#1E3A8A] text-xs font-semibold text-white shadow-xs flex items-center gap-2 transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#1E3A8A]"
          >
            <PlusCircle className="w-4 h-4" />
            New Credit Analysis
          </Link>
        </div>
      </div>

      {/* Metrics / KPI Grid - Flat Surfaces, 1px Border, 8px Radius */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#FFFFFF] p-5 rounded-lg border border-[#E2E8F0] shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-[#475569]">
            <span>Total Applications</span>
            <Users className="w-4 h-4 text-[#475569]" />
          </div>
          <div className="text-2xl font-black text-[#0F172A] tracking-tight">{totalApps}</div>
          <div className="text-[11px] text-[#475569]">Active records in system</div>
        </div>

        <div className="bg-[#FFFFFF] p-5 rounded-lg border border-[#E2E8F0] shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-[#475569]">
            <span>Approved Applications</span>
            <CheckCircle2 className="w-4 h-4 text-[#16A34A]" />
          </div>
          <div className="text-2xl font-black text-[#16A34A] tracking-tight">{approvedApps}</div>
          <div className="flex items-center gap-1.5">
            <span className="bg-[#D1FAE5] text-[#059669] border border-[#A7F3D0] text-[10px] font-semibold px-1.5 py-0.5 rounded">
              Approved
            </span>
            <span className="text-[11px] text-[#475569]">by underwriting</span>
          </div>
        </div>

        <div className="bg-[#FFFFFF] p-5 rounded-lg border border-[#E2E8F0] shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-[#475569]">
            <span>Pending Review</span>
            <Clock className="w-4 h-4 text-[#D97706]" />
          </div>
          <div className="text-2xl font-black text-[#D97706] tracking-tight">{pendingApps}</div>
          <div className="flex items-center gap-1.5">
            <span className="bg-[#FFFBEB] text-[#D97706] border border-[#FDE68A] text-[10px] font-semibold px-1.5 py-0.5 rounded">
              Pending
            </span>
            <span className="text-[11px] text-[#475569]">officer review</span>
          </div>
        </div>

        <div className="bg-[#FFFFFF] p-5 rounded-lg border border-[#E2E8F0] shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-[#475569]">
            <span>Mean Credit Score</span>
            <ShieldCheck className="w-4 h-4 text-[#1E3A8A]" />
          </div>
          <div className="text-2xl font-black text-[#0F172A] tracking-tight">{avgScore}</div>
          <div className="text-[11px] text-[#475569]">Scale 300 – 900 benchmark</div>
        </div>
      </div>

      {/* Applications Data Table Container - 8px radius */}
      <div className="bg-[#FFFFFF] border border-[#E2E8F0] rounded-lg p-6 space-y-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-[#0F172A]">Application Queue</h2>
            <p className="text-xs text-[#475569] mt-0.5">
              Select an application record to inspect data quality, score, SHAP explanation, and decision log.
            </p>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-[#94A3B8] absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search applicant or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg pl-9 pr-4 py-2 text-xs text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#1E3A8A] focus:ring-2 focus:ring-[#DBEAFE] focus:bg-[#FFFFFF] w-full sm:w-64 transition-all"
            />
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-xs text-[#475569] bg-[#F8FAFC] rounded-lg border border-[#E2E8F0] flex flex-col items-center justify-center gap-2.5">
            <div className="w-5 h-5 border-2 border-[#1E3A8A] border-t-transparent rounded-full animate-spin"></div>
            <span>Loading application queue from database...</span>
          </div>
        ) : filteredApps.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-[#E2E8F0] rounded-lg bg-[#F8FAFC] space-y-3">
            <FileSpreadsheet className="w-10 h-10 text-[#94A3B8] mx-auto" />
            <div className="text-sm font-semibold text-[#0F172A]">No Application Records Found</div>
            <p className="text-xs text-[#475569] max-w-sm mx-auto">
              Start by uploading transaction records to create a new application analysis.
            </p>
            <Link
              to="/new-analysis"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1E3A8A] hover:bg-[#1D4ED8] text-xs font-semibold text-white shadow-xs transition-all mt-2"
            >
              <PlusCircle className="w-3.5 h-3.5" /> Create New Analysis
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#475569] font-semibold text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Application ID</th>
                  <th className="py-3 px-4">Borrower Name</th>
                  <th className="py-3 px-4">Requested Loan</th>
                  <th className="py-3 px-4">Est. Score</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Created Date</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {filteredApps.map((app) => {
                  let statusBadge = "bg-[#FFFBEB] text-[#D97706] border-[#FDE68A]";
                  if (app.status === "Approved") statusBadge = "bg-[#F0FDF4] text-[#16A34A] border-[#BBF7D0]";
                  if (app.status === "Declined") statusBadge = "bg-[#FEF2F2] text-[#DC2626] border-[#FECACA]";

                  return (
                    <tr key={app.id} className="hover:bg-[#F8FAFC] transition-colors">
                      <td className="py-3.5 px-4 font-mono font-semibold text-[#1E3A8A] whitespace-nowrap">
                        {app.id}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-[#0F172A]">
                        <div>{app.borrower_name}</div>
                        {(app.occupation || app.income_source) && (
                          <div className="text-[10px] text-[#475569] font-normal mt-0.5 flex items-center gap-1.5 flex-wrap">
                            <span className="bg-[#F1F5F9] text-[#475569] px-1.5 py-0.5 rounded font-medium">
                              {app.occupation || "Applicant"}
                            </span>
                            <span>•</span>
                            <span className="text-[#475569]">{app.income_source || "Direct Deposits"}</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-medium text-[#0F172A] whitespace-nowrap">
                        <div>₹{app.requested_amount?.toLocaleString()}</div>
                        {app.tenure_months && (
                          <div className="text-[10px] text-[#475569]">{app.tenure_months} mo. tenure</div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {app.score ? (
                          <span className="font-bold text-[#0F172A] bg-[#F1F5F9] px-2 py-0.5 rounded border border-[#E2E8F0]">
                            {app.score}
                          </span>
                        ) : (
                          <span className="text-[#94A3B8] italic">Pending analysis</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className={`px-2.5 py-0.5 rounded-md border text-[11px] font-semibold inline-flex items-center ${statusBadge}`}>
                          {app.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-[#475569] whitespace-nowrap">
                        {new Date(app.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <Link
                          to={`/applications/${app.id}`}
                          className="inline-flex items-center gap-1 text-[#1E3A8A] hover:text-[#1D4ED8] font-semibold text-xs transition-colors"
                        >
                          View Analysis <ArrowUpRight className="w-3.5 h-3.5" />
                        </Link>
                      </td>
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
