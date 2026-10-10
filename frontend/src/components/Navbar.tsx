import React from "react";
import { useAuth } from "../context/AuthContext";
import { ShieldCheck, LogOut, UserCheck } from "lucide-react";

export const Navbar: React.FC = () => {
  const { user, logout } = useAuth();

  return (
    <header className="bg-[#FFFFFF] border-b border-[#E2E8F0] sticky top-0 z-40 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand identity */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#1E3A8A] flex items-center justify-center shadow-xs">
            <ShieldCheck className="w-4.5 h-4.5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base tracking-tight text-[#0F172A]">
                CREDENCE <span className="text-[#1E3A8A]">AI</span>
              </span>
              <span className="bg-[#DBEAFE] text-[#1E3A8A] border border-[#BFDBFE] text-[10px] font-semibold px-2 py-0.5 rounded-md uppercase tracking-wider">
                Production Prototype
              </span>
            </div>
            <p className="text-[11px] text-[#475569] hidden sm:block">
              Explainable Alternative Credit Scoring & Informal Income Synthesizer
            </p>
          </div>
        </div>

        {/* User profile & actions */}
        <div className="flex items-center gap-3">
          {user && (
            <div className="flex items-center gap-2.5">
              <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
                <UserCheck className="w-4 h-4 text-[#1E3A8A]" />
                <div className="text-left">
                  <div className="text-xs font-semibold text-[#0F172A] leading-tight">{user.full_name}</div>
                  <div className="text-[10px] text-[#475569] capitalize flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${user.role === "officer" ? "bg-[#059669]" : "bg-[#2563EB]"}`}></span>
                    {user.role} Account
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={logout}
                title="Sign out"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#475569] hover:text-[#DC2626] hover:bg-[#FEF2F2] hover:border-[#FECACA] border border-transparent transition-all cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
