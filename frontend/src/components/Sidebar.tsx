import React from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  PlusCircle,
  FileSpreadsheet,
  History,
  Scale,
  Settings,
  Cpu
} from "lucide-react";

export const Sidebar: React.FC = () => {
  const navItems = [
    { to: "/overview", label: "Overview Dashboard", icon: LayoutDashboard },
    { to: "/new-analysis", label: "New Credit Analysis", icon: PlusCircle },
    { to: "/applications", label: "Borrower Applications", icon: FileSpreadsheet },
    { to: "/decision-history", label: "Decision History & Audit", icon: History },
    { to: "/fairness-model", label: "Fairness & Model Panel", icon: Scale },
    { to: "/settings", label: "Settings & Disclaimers", icon: Settings },
  ];

  return (
    <aside className="w-64 bg-[#FFFFFF] border-r border-[#E2E8F0] flex-shrink-0 min-h-[calc(100vh-4rem)] p-4 flex flex-col justify-between">
      <div className="space-y-1">
        <div className="px-3 py-2 text-[11px] font-semibold text-[#475569] uppercase tracking-wider">
          Platform Menu
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs transition-all ${
                  isActive
                    ? "bg-[#DBEAFE] text-[#1E3A8A] font-semibold shadow-xs"
                    : "text-[#475569] hover:text-[#0F172A] hover:bg-[#F8FAFC] font-medium"
                }`
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </div>

      <div className="bg-[#F8FAFC] p-3.5 rounded-lg border border-[#E2E8F0] space-y-1.5 text-xs text-[#475569]">
        <div className="flex items-center gap-2 font-semibold text-[#0F172A]">
          <Cpu className="w-4 h-4 text-[#1E3A8A]" />
          <span>Model Registry</span>
        </div>
        <p className="text-[11px] leading-relaxed text-[#475569] font-mono">
          Model: <strong className="text-[#0F172A] font-sans">credence_gb_v1</strong><br />
          Target: <strong className="text-[#0F172A] font-sans">synthetic_default</strong>
        </p>
      </div>
    </aside>
  );
};
