import React, { useState, useEffect } from "react";
import { AttendanceStatus, AttendanceRecord } from "../types";
import { Check, X, Ban, CheckCircle } from "lucide-react";

interface StudentCardProps {
  key?: string;
  record: AttendanceRecord;
  onStatusChange: (status: AttendanceStatus) => void;
  onMemoChange: (memo: string) => void;
}

export default function StudentCard({ record, onStatusChange, onMemoChange }: StudentCardProps) {
  const [memoText, setMemoText] = useState(record.memo || "");
  const [isSaved, setIsSaved] = useState(false);

  // Sync internal state when external prop changes (vital for switching events or remote sync)
  useEffect(() => {
    setMemoText(record.memo || "");
  }, [record.memo]);

  const handleBlur = () => {
    const freshMemo = memoText.trim();
    if (freshMemo !== (record.memo || "").trim()) {
      onMemoChange(freshMemo);
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2000);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      (e.target as HTMLInputElement).blur();
    }
  };

  // Ensure memo is saved immediately if a user types a memo and then taps a status button
  const handleStatusChangeClick = (status: AttendanceStatus) => {
    const freshMemo = memoText.trim();
    if (freshMemo !== (record.memo || "").trim()) {
      onMemoChange(freshMemo);
    }
    onStatusChange(status);
  };

  const getRowStyle = () => {
    switch (record.status) {
      case AttendanceStatus.PRESENT:
        return "border-l-[5px] border-l-emerald-500 bg-emerald-50/10";
      case AttendanceStatus.ABSENT:
        return "border-l-[5px] border-l-rose-500 bg-rose-55/10";
      case AttendanceStatus.EXCLUDED:
        return "border-l-[5px] border-l-slate-400 bg-slate-55/30";
      default:
        return "border-l-[5px] border-l-slate-200/40 hover:bg-slate-50/50";
    }
  };

  return (
    <div 
      id={`student-card-${record.studentId}`} 
      className={`flex items-center justify-between py-1.5 px-2 px-3.5 transition-colors duration-200 gap-2 sm:gap-4 border-b border-slate-100 ${getRowStyle()}`}
    >
      {/* Student Info: Num & Name */}
      <div className="flex items-center gap-2 shrink-0 min-w-[70px] sm:min-w-[95px]">
        {record.number ? (
          <span className="text-[9px] font-black text-slate-450 font-mono tracking-tight shrink-0 bg-slate-100 px-1 py-0.5 rounded leading-none">
            {record.number}
          </span>
        ) : (
          <span className="text-[10px] text-slate-300 font-mono shrink-0 w-3 text-center leading-none">
            -
          </span>
        )}
        <span className="font-extrabold text-[13px] sm:text-sm text-slate-800 truncate select-none">
          {record.name}
        </span>
      </div>

      {/* Memo Field (Takes up remaining center space) */}
      <div className="flex-1 relative min-w-0">
        <div className="flex items-center w-full">
          <input
            type="text"
            value={memoText}
            onChange={(e) => setMemoText(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            placeholder="메모..."
            className="w-full text-xs bg-slate-50 hover:bg-slate-100/70 focus:bg-white text-slate-700 placeholder-slate-400 border border-slate-200/40 focus:border-slate-350 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500/20 transition-all truncate h-[32px]"
          />
          {isSaved && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[8px] font-black text-emerald-600 flex items-center gap-0.5 bg-white shadow-xs px-1.5 py-0.5 rounded border border-emerald-100 animate-pulse">
              <CheckCircle size={8} /> <span>저장됨</span>
            </span>
          )}
        </div>
      </div>

      {/* Action button bar */}
      <div className="flex gap-1 shrink-0">
        {/* Present Button */}
        <button
          onClick={() => handleStatusChangeClick(AttendanceStatus.PRESENT)}
          className={`flex items-center justify-center gap-0.5 h-8 px-2 sm:px-3 text-xs font-bold rounded-lg transition-all border cursor-pointer ${
            record.status === AttendanceStatus.PRESENT
              ? "bg-emerald-500 text-white border-emerald-500 shadow-xs shadow-emerald-100"
              : "bg-white text-slate-400 border-slate-200 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-100"
          }`}
          title="출석"
        >
          <Check size={12} strokeWidth={3} />
          <span className="hidden xs:inline text-[11px]">출석</span>
          <span className="xs:hidden text-[10px]">출</span>
        </button>

        {/* Absent Button */}
        <button
          onClick={() => handleStatusChangeClick(AttendanceStatus.ABSENT)}
          className={`flex items-center justify-center gap-0.5 h-8 px-2 sm:px-3 text-xs font-bold rounded-lg transition-all border cursor-pointer ${
            record.status === AttendanceStatus.ABSENT
              ? "bg-rose-500 text-white border-rose-500 shadow-xs shadow-rose-100"
              : "bg-white text-slate-400 border-slate-200 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-100"
          }`}
          title="결석"
        >
          <X size={12} strokeWidth={3} />
          <span className="hidden xs:inline text-[11px]">결석</span>
          <span className="xs:hidden text-[10px]">결</span>
        </button>

        {/* Excluded Button */}
        <button
          onClick={() => handleStatusChangeClick(AttendanceStatus.EXCLUDED)}
          className={`flex items-center justify-center gap-0.5 h-8 px-1.5 sm:px-2.5 text-xs font-bold rounded-lg transition-all border cursor-pointer ${
            record.status === AttendanceStatus.EXCLUDED
              ? "bg-slate-500 text-white border-slate-500 shadow-xs"
              : "bg-white text-slate-400 border-slate-200 hover:bg-slate-100 hover:text-slate-650"
          }`}
          title="제외"
        >
          <Ban size={11} strokeWidth={2.5} />
          <span className="hidden xs:inline text-[11px]">제외</span>
          <span className="xs:hidden text-[10px]">제외</span>
        </button>
      </div>
    </div>
  );
}
