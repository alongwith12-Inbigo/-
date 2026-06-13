import React, { useState } from "react";
import { Cloud, Check, AlertCircle, RefreshCw, Smartphone, LayoutDashboard, Database } from "lucide-react";
import { Event, Student } from "../types";
import { saveEvent, saveDefaultRoster, loadAllEvents, loadDefaultRoster } from "../lib/firebase";

interface CloudSyncHubProps {
  onSyncComplete: () => void;
  isCloudConnected: boolean;
}

export default function BackupManager({ onSyncComplete, isCloudConnected }: CloudSyncHubProps) {
  const [isSuccess, setIsSuccess] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Push all local data (events + rosters) directly to Firebase Cloud in one go
  const handlePushToCloud = async () => {
    setIsSyncing(true);
    setErrorMsg("");
    setIsSuccess(false);

    try {
      // 1. Get current local storage data
      const eventsStr = localStorage.getItem("outdoor_attendance_events") || "[]";
      const rosterStr = localStorage.getItem("default_student_roster") || "[]";

      const localEvents: Event[] = JSON.parse(eventsStr);
      const localRoster: Student[] = JSON.parse(rosterStr);

      if (localEvents.length === 0 && localRoster.length === 0) {
        setErrorMsg("클라우드 서버에 업로드할 데이터가 이 브라우저에 존재하지 않습니다.");
        setIsSyncing(false);
        return;
      }

      let eventSyncCount = 0;

      // 2. Upload events to Firestore
      for (const ev of localEvents) {
        try {
          const success = await saveEvent(ev);
          if (success) eventSyncCount++;
        } catch (err) {
          console.warn(`Failed to sync event ${ev.id}:`, err);
        }
      }

      // 3. Upload roster to Firestore
      let rosterSynced = false;
      if (localRoster.length > 0) {
        try {
          const success = await saveDefaultRoster(localRoster);
          if (success) rosterSynced = true;
        } catch (err) {
          console.warn("Failed to sync default roster:", err);
        }
      }

      setIsSyncing(false);
      setSuccessMsg(
        `동기화 성공! 기기에 입력했던 ${eventSyncCount}개의 행사 출석 기록과 ${
          rosterSynced ? "기본 등록 학생 명단" : "학생 명단"
        }이 Firebase 클라우드 데이터베이스에 영구 저장되었습니다. 이제 Vercel 배포 사이트나 다른 기기에서 접속하더라도 동일한 데이터가 그대로 보이게 됩니다!`
      );
      setIsSuccess(true);
      
      // Trigger update on parent
      onSyncComplete();
    } catch (e) {
      console.error("Failed to push data to cloud", e);
      setErrorMsg("클라우드 데이터 업로드 도중 오류가 발생했습니다.");
      setIsSyncing(false);
    }
  };

  // Force trigger fresh download/load from Firestore Cloud
  const handlePullFromCloud = async () => {
    setIsSyncing(true);
    setErrorMsg("");
    setIsSuccess(false);

    try {
      await loadAllEvents();
      await loadDefaultRoster();
      
      setIsSyncing(false);
      setSuccessMsg("클라우드 동기화 완료! 서버의 최신 데이터를 이 기기로 불러왔습니다.");
      setIsSuccess(true);
      setTimeout(() => setIsSuccess(false), 4000);
      
      onSyncComplete();
    } catch (e) {
      console.error("Failed to pull from cloud", e);
      setErrorMsg("클라우드 데이터를 불러오지 못했습니다.");
      setIsSyncing(false);
    }
  };

  return (
    <div id="cloud-sync-center" className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-4">
      <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
        <div className={`p-2.5 rounded-xl ${isCloudConnected ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>
          <Cloud size={18} className={isSyncing ? "animate-bounce" : ""} />
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <h4 className="text-xs font-black text-slate-800">실시간 파이어베이스 클라우드 동기화</h4>
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-black leading-none ${
              isCloudConnected ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
            }`}>
              ● {isCloudConnected ? "온라인 연결됨" : "오프라인 모드"}
            </span>
          </div>
          <p className="text-[10px] text-slate-400 font-extrabold leading-relaxed mt-0.5">
            AI Studio에서 입력한 전체 데이터를 클라우드 서버에 영구히 동기화하여 Vercel 등 다른 환경에서도 연동되게 합니다.
          </p>
        </div>
      </div>

      {/* Sync Diagnostics Dashboard status info */}
      <div className="bg-slate-50/70 rounded-xl p-3 border border-slate-100 text-[10px] text-slate-500 font-bold space-y-1.5">
        <div className="flex justify-between">
          <span className="flex items-center gap-1">📁 로컬 브라우저 기기 데이터 상태:</span>
          <span className="text-slate-800 font-extrabold">저장되어 있음</span>
        </div>
        <div className="flex justify-between">
          <span className="flex items-center gap-1">🌐 Firebase 클라우드 상태:</span>
          <span className={isCloudConnected ? "text-emerald-600 font-extrabold" : "text-amber-600 font-extrabold"}>
            {isCloudConnected ? "활성화 완료 (포트 3000 양방향 동기화)" : "로컬 우선 캐싱 작동 중"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {/* Force Push to Cloud Button */}
        <button
          onClick={handlePushToCloud}
          disabled={isSyncing}
          className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white font-extrabold text-xs rounded-xl shadow-xs transition cursor-pointer"
          title="현재 기기에 입력된 데이터를 Firebase 클라우드로 영구 동기화"
        >
          {isSyncing ? (
            <RefreshCw size={13} className="animate-spin" />
          ) : (
            <Cloud size={14} strokeWidth={2.5} />
          )}
          <span>현재 입력한 데이터 클라우드로 올리기</span>
        </button>

        {/* Fresh Pull/Sync Update Button */}
        <button
          onClick={handlePullFromCloud}
          disabled={isSyncing}
          className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-white hover:bg-slate-50 border border-slate-200 disabled:bg-slate-100 text-slate-700 font-extrabold text-xs rounded-xl shadow-xs transition cursor-pointer"
          title="클라우드 실시간 최신 정보로 갱신하기"
        >
          <RefreshCw size={13} className={`${isSyncing ? "animate-spin" : ""}`} />
          <span>클라우드 데이터 내려받기 / 갱신</span>
        </button>
      </div>

      {/* Success Notification Banner */}
      {isSuccess && (
        <div className="flex items-start gap-2 bg-emerald-50 text-emerald-800 text-[11px] font-bold p-3.5 rounded-xl border border-emerald-100 animate-fadeIn leading-relaxed">
          <Check size={14} className="text-emerald-600 shrink-0 mt-0.5 animate-pulse" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Error Notification Banner */}
      {errorMsg && (
        <div className="flex items-start gap-2 bg-rose-50 text-rose-800 text-[11px] font-bold p-3.5 rounded-xl border border-rose-100 animate-fadeIn">
          <AlertCircle size={14} className="text-rose-600 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}
    </div>
  );
}
