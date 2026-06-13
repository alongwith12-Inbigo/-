import React from "react";
import { AttendanceStatus, AttendanceRecord } from "../types";

interface StatsDashboardProps {
  records: AttendanceRecord[];
}

export default function StatsDashboard({ records }: StatsDashboardProps) {
  const totalCount = records.length;
  
  const presentCount = records.filter(r => r.status === AttendanceStatus.PRESENT).length;
  const absentCount = records.filter(r => r.status === AttendanceStatus.ABSENT).length;
  const excludedCount = records.filter(r => r.status === AttendanceStatus.EXCLUDED).length;
  
  const activeCount = presentCount + absentCount;
  const attendanceRate = activeCount > 0 ? Math.round((presentCount / activeCount) * 100) : 0;

  // Pie or ring gauge variables
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (attendanceRate / 100) * circumference;

  return (
    <div id="stats-dashboard" className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-3 sm:p-5 flex flex-col sm:flex-row gap-3 sm:gap-6 items-stretch sm:items-center">
      {/* Mini Circle Chart (Horizontal flow on phone, vertical on desktop) */}
      <div className="flex items-center sm:flex-col justify-between sm:justify-center border-b sm:border-b-0 sm:border-r border-slate-105 pb-3 sm:pb-0 sm:pr-6 gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="relative w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90">
              {/* Background circle */}
              <circle
                cx="28"
                cy="28"
                r={radius}
                className="stroke-slate-100 fill-none"
                strokeWidth="6"
              />
              {/* Active gauge */}
              <circle
                cx="28"
                cy="28"
                r={radius}
                className="stroke-indigo-650 fill-none transition-all duration-500 ease-out"
                strokeWidth="6"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute text-center">
              <span className="text-sm sm:text-base font-black text-slate-800 tracking-tight">{attendanceRate}%</span>
            </div>
          </div>
          <div>
            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">실시간 출석률</span>
            <span className="text-[11px] sm:text-xs text-slate-500 font-bold">
              참가 {activeCount}명 중 {presentCount}명 출석
            </span>
          </div>
        </div>
      </div>

      {/* Numerical Stats - Ultra High Density */}
      <div className="grid grid-cols-3 gap-2 flex-1">
        {/* Present Card */}
        <div className="bg-emerald-50/10 border border-emerald-100/80 rounded-xl p-2 text-center relative overflow-hidden">
          <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span className="block text-[10px] font-extrabold text-slate-400 mb-0.5">출석</span>
          <span className="text-lg sm:text-2xl font-black text-slate-800">
            {presentCount}<span className="text-[10px] sm:text-xs font-bold text-slate-400 ml-0.5">명</span>
          </span>
        </div>

        {/* Absent Card */}
        <div className="bg-rose-50/10 border border-rose-100/80 rounded-xl p-2 text-center relative overflow-hidden">
          <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-rose-550" />
          <span className="block text-[10px] font-extrabold text-slate-400 mb-0.5">결석</span>
          <span className="text-lg sm:text-2xl font-black text-slate-800">
            {absentCount}<span className="text-[10px] sm:text-xs font-bold text-slate-400 ml-0.5">명</span>
          </span>
        </div>

        {/* Excluded Card */}
        <div className="bg-slate-50/40 border border-slate-100 rounded-xl p-2 text-center relative overflow-hidden">
          <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-slate-400" />
          <span className="block text-[10px] font-extrabold text-slate-400 mb-0.5">제외</span>
          <span className="text-lg sm:text-2xl font-black text-slate-800">
            {excludedCount}<span className="text-[10px] sm:text-xs font-bold text-slate-400 ml-0.5">명</span>
          </span>
        </div>
      </div>
    </div>
  );
}
