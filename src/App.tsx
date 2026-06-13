import React, { useState, useEffect } from "react";
import {
  loadAllEvents,
  saveEvent as firebaseSaveEvent,
  deleteEvent as firebaseDeleteEvent,
  testConnection
} from "./lib/firebase";
import { Event, Student, AttendanceRecord, AttendanceStatus } from "./types";
import EventSelector from "./components/EventSelector";
import StudentManager from "./components/StudentManager";
import StatsDashboard from "./components/StatsDashboard";
import StudentCard from "./components/StudentCard";
import { 
  ClipboardList, 
  HelpCircle, 
  Search, 
  Share2, 
  Copy, 
  Download, 
  RefreshCw, 
  Database,
  Grid,
  Filter,
  CheckCircle2,
  FileSpreadsheet
} from "lucide-react";

export default function App() {
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCloudConnected, setIsCloudConnected] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | AttendanceStatus>("all");
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [sortBy, setSortBy] = useState<"number" | "name">("number");

  // Load events on mount
  const handleLoadData = async () => {
    setIsLoading(true);
    try {
      const { events: loadedEvents, isCloudConnected: connected } = await loadAllEvents();
      setEvents(loadedEvents);
      setIsCloudConnected(connected);
      if (loadedEvents.length > 0 && !selectedEventId) {
        setSelectedEventId(loadedEvents[0].id);
      }
    } catch (e) {
      console.error("Error loading events init:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    handleLoadData();
  }, []);

  // Save utility to run offline or online
  const persistEvent = async (updatedEvent: Event) => {
    // Optimistically update React local state statefully and instantly
    setEvents((prev) => prev.map((ev) => (ev.id === updatedEvent.id ? updatedEvent : ev)));
    
    // Background cloud save so there is 0ms click latency
    try {
      const success = await firebaseSaveEvent(updatedEvent);
      if (success) {
        setIsCloudConnected(true);
      } else {
        setIsCloudConnected(false);
      }
    } catch (e) {
      console.warn("Background cloud save failed:", e);
      setIsCloudConnected(false);
    }
  };

  // Create new event
  const handleCreateEvent = async (title: string, date: string) => {
    // Check if default roster exists, initialize students with it!
    let initialStudents: AttendanceRecord[] = [];
    const saved = localStorage.getItem("default_student_roster");
    if (saved) {
      try {
        const defaultRoster: Student[] = JSON.parse(saved);
        initialStudents = defaultRoster.map((st) => ({
          studentId: st.id,
          name: st.name,
          number: st.number,
          status: AttendanceStatus.PRESENT, // Default all present initially
          memo: "",
          updatedAt: new Date().toISOString()
        }));
      } catch (e) {
        console.error("Failed to parse default student roster for new event", e);
      }
    }

    const newEvent: Event = {
      id: `ev_${Date.now()}`,
      title,
      date,
      students: initialStudents,
      createdAt: new Date().toISOString()
    };

    // Optimistically update React local state instantly
    setEvents((prev) => [newEvent, ...prev]);
    setSelectedEventId(newEvent.id);

    // Background cloud save so there is 0ms transition latency
    try {
      const success = await firebaseSaveEvent(newEvent);
      if (success) {
        setIsCloudConnected(true);
      } else {
        setIsCloudConnected(false);
      }
    } catch (e) {
      console.warn("Background event create failed:", e);
      setIsCloudConnected(false);
    }
  };

  // Delete event
  const handleDeleteEvent = async (id: string) => {
    // Optimistically update React local state instantly
    setEvents((prev) => prev.filter((ev) => ev.id !== id));
    if (selectedEventId === id) {
      const remaining = events.filter((ev) => ev.id !== id);
      setSelectedEventId(remaining.length > 0 ? remaining[0].id : null);
    }

    // Background cloud delete
    try {
      await firebaseDeleteEvent(id);
    } catch (e) {
      console.warn("Background event delete failed:", e);
    }
  };

  // Add students to active event
  const handleAddStudents = async (newStudents: Student[]) => {
    if (!selectedEventId) return;
    const activeEvent = events.find((ev) => ev.id === selectedEventId);
    if (!activeEvent) return;

    // Filter out duplicates (students with same name or number in active roster)
    const existingIds = new Set(activeEvent.students.map((st) => st.studentId));
    const uniqueNews = newStudents.filter((st) => !existingIds.has(st.id));

    const recordsToAdd: AttendanceRecord[] = uniqueNews.map((st) => ({
      studentId: st.id,
      name: st.name,
      number: st.number,
      status: AttendanceStatus.PRESENT,
      memo: "",
      updatedAt: new Date().toISOString()
    }));

    const updatedEvent: Event = {
      ...activeEvent,
      students: [...activeEvent.students, ...recordsToAdd]
    };

    await persistEvent(updatedEvent);
  };

  // Remove one student from active event
  const handleRemoveStudent = async (studentId: string) => {
    if (!selectedEventId) return;
    const activeEvent = events.find((ev) => ev.id === selectedEventId);
    if (!activeEvent) return;

    const updatedEvent: Event = {
      ...activeEvent,
      students: activeEvent.students.filter((st) => st.studentId !== studentId)
    };

    await persistEvent(updatedEvent);
  };

  // Clear students
  const handleClearRoster = async () => {
    if (!selectedEventId) return;
    const activeEvent = events.find((ev) => ev.id === selectedEventId);
    if (!activeEvent) return;

    if (confirm("현재 행사의 모든 학생 기록을 삭제하시겠습니까?")) {
      const updatedEvent: Event = {
        ...activeEvent,
        students: []
      };
      await persistEvent(updatedEvent);
    }
  };

  // Change student status
  const handleStatusChange = async (studentId: string, status: AttendanceStatus) => {
    if (!selectedEventId) return;
    const activeEvent = events.find((ev) => ev.id === selectedEventId);
    if (!activeEvent) return;

    const updatedStudents = activeEvent.students.map((st) => {
      if (st.studentId === studentId) {
        return {
          ...st,
          status,
          updatedAt: new Date().toISOString()
        };
      }
      return st;
    });

    const updatedEvent: Event = {
      ...activeEvent,
      students: updatedStudents
    };

    await persistEvent(updatedEvent);
  };

  // Update student memo
  const handleMemoChange = async (studentId: string, memo: string) => {
    if (!selectedEventId) return;
    const activeEvent = events.find((ev) => ev.id === selectedEventId);
    if (!activeEvent) return;

    const updatedStudents = activeEvent.students.map((st) => {
      if (st.studentId === studentId) {
        return {
          ...st,
          memo,
          updatedAt: new Date().toISOString()
        };
      }
      return st;
    });

    const updatedEvent: Event = {
      ...activeEvent,
      students: updatedStudents
    };

    await persistEvent(updatedEvent);
  };

  // Update student name and number (inline update feature)
  const handleUpdateStudent = async (studentId: string, name: string, number?: string) => {
    if (!selectedEventId) return;
    const activeEvent = events.find((ev) => ev.id === selectedEventId);
    if (!activeEvent) return;

    const updatedStudents = activeEvent.students.map((st) => {
      if (st.studentId === studentId) {
        return {
          ...st,
          name,
          number,
          updatedAt: new Date().toISOString()
        };
      }
      return st;
    });

    const updatedEvent: Event = {
      ...activeEvent,
      students: updatedStudents
    };

    await persistEvent(updatedEvent);
  };

  // Fetch active event
  const activeEvent = events.find((ev) => ev.id === selectedEventId);

  // Filter students based on search and selected filter status
  const getFilteredStudents = () => {
    if (!activeEvent) return [];
    
    return activeEvent.students.filter((st) => {
      const matchSearch = 
        st.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (st.number && st.number.toLowerCase().includes(searchQuery.toLowerCase()));
      
      const matchFilter = statusFilter === "all" || st.status === statusFilter;
      
      return matchSearch && matchFilter;
    }).sort((a, b) => {
      if (sortBy === "number") {
        const numAStr = a.number || "";
        const numBStr = b.number || "";
        
        // If one has number and other doesn't
        if (numAStr && !numBStr) return -1;
        if (!numAStr && numBStr) return 1;
        if (!numAStr && !numBStr) {
          return a.name.localeCompare(b.name, "ko");
        }
        
        const numA = parseInt(numAStr.replace(/\D/g, ""), 10);
        const numB = parseInt(numBStr.replace(/\D/g, ""), 10);
        if (!isNaN(numA) && !isNaN(numB)) {
          if (numA !== numB) return numA - numB;
        }
        
        // String sorting numeric fallback
        const comp = numAStr.localeCompare(numBStr, undefined, { numeric: true });
        if (comp !== 0) return comp;
        return a.name.localeCompare(b.name, "ko");
      } else {
        // Sort by name ascending
        const nameComp = a.name.localeCompare(b.name, "ko");
        if (nameComp !== 0) return nameComp;
        
        // Tie-breaker by number
        const numAStr = a.number || "";
        const numBStr = b.number || "";
        if (numAStr && !numBStr) return -1;
        if (!numAStr && numBStr) return 1;
        return numAStr.localeCompare(numBStr, undefined, { numeric: true });
      }
    });
  };

  const filteredStudents = getFilteredStudents();

  // Export 1: Excel CSV Download
  const downloadCSV = () => {
    if (!activeEvent || activeEvent.students.length === 0) return;

    // Use MS Excel-friendly BOM (utf-8 with BOM) for perfect Korean font display in Excel
    let csvContent = "\uFEFF";
    csvContent += "번호,이름,출결 상태,비고/메모,최종 수정일시\n";

    activeEvent.students.forEach((st) => {
      const statusText = 
        st.status === AttendanceStatus.PRESENT ? "출석" :
        st.status === AttendanceStatus.ABSENT ? "결석" : "제외";
      
      const cleanMemo = st.memo.replace(/"/g, '""'); // Escape double quotes
      const cleanName = st.name.replace(/"/g, '""');
      const numText = st.number ? st.number : "";
      
      csvContent += `"${numText}","${cleanName}","${statusText}","${cleanMemo}","${new Date(st.updatedAt).toLocaleString("ko-KR")}"\n`;
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${activeEvent.title}_출석결과_${activeEvent.date}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export 2: Copy beautifully formatted report for school communication apps
  const copyTextReport = () => {
    if (!activeEvent) return;

    const present = activeEvent.students.filter(s => s.status === AttendanceStatus.PRESENT);
    const absent = activeEvent.students.filter(s => s.status === AttendanceStatus.ABSENT);
    const excluded = activeEvent.students.filter(s => s.status === AttendanceStatus.EXCLUDED);
    const activeCount = present.length + absent.length;
    const rate = activeCount > 0 ? Math.round((present.length / activeCount) * 100) : 0;

    let text = `📋 [야외활동 출결 결과 보고]\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `■ 행사명: ${activeEvent.title}\n`;
    text += `■ 일자: ${activeEvent.date}\n`;
    text += `■ 정원: 총 ${activeEvent.students.length}명\n`;
    text += ` - 출석: ${present.length}명\n`;
    text += ` - 결석: ${absent.length}명\n`;
    text += ` - 제외: ${excluded.length}명\n`;
    text += `■ 출석률: ${rate}%\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;

    if (absent.length > 0) {
      text += `\n❌ [결석 학생 특이사항]\n`;
      absent.forEach((st) => {
        text += `- ${st.number ? `${st.number} ` : ""}${st.name} ${st.memo ? `(${st.memo})` : "(사유 미입력)"}\n`;
      });
    }

    if (excluded.length > 0) {
      text += `\n➖ [제외 학생 명단]\n`;
      excluded.forEach((st) => {
        text += `- ${st.number ? `${st.number} ` : ""}${st.name} ${st.memo ? `(${st.memo})` : ""}\n`;
      });
    }

    // List present students with notes if any have special remarks
    const presentWithNotes = present.filter(s => s.memo.trim() !== "");
    if (presentWithNotes.length > 0) {
      text += `\n📝 [출석 학생 개별 메모]\n`;
      presentWithNotes.forEach((st) => {
        text += `- ${st.number ? `${st.number} ` : ""}${st.name}: ${st.memo}\n`;
      });
    }

    navigator.clipboard.writeText(text).then(() => {
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-between">
      {/* Top Header */}
      <header className="sticky top-0 z-10 bg-white border-b border-slate-200/80 px-4 py-3.5 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-3">
          {/* Logo Title */}
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 text-white p-2.5 rounded-xl flex items-center justify-center shadow-md shadow-indigo-100">
              <ClipboardList size={22} className="stroke-[2.2]" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
                EduCheck Pro
                <span className="text-[10px] bg-indigo-50 text-indigo-700 font-extrabold px-1.5 py-0.5 rounded-md border border-indigo-100">V2.0</span>
              </h1>
              <p className="text-[11px] text-slate-400 font-bold">야외 활동 실시간 스마트 출석부</p>
            </div>
          </div>

          {/* Connection Status Badge */}
          <div className="flex items-center gap-2">
            <button 
              onClick={handleLoadData}
              className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-xl transition-colors cursor-pointer"
              title="데이터 동기화 새로고침"
            >
              <RefreshCw size={15} className={isLoading ? "animate-spin" : ""} />
            </button>
            
            {isCloudConnected ? (
              <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-xl px-3 py-1.5 text-xs font-bold">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                <Database size={11} />
                실시간 클라우드 연동 완료
              </div>
            ) : (
              <div className="flex items-center gap-1.5 bg-amber-50 text-amber-700 border border-amber-100 rounded-xl px-3 py-1.5 text-xs font-bold">
                <span className="w-2 h-2 bg-amber-400 rounded-full" />
                오프라인 대기 (로컬 저장)
              </div>
            )}
          </div>
        </div>
      </header>


      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {isLoading && events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <RefreshCw className="animate-spin text-indigo-600 mb-3" size={32} />
            <p className="text-sm font-bold text-slate-500">출석부 정보를 읽어 오는 중입니다...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Sidebar Columns (Selector & Manager) */}
            <div className="lg:col-span-4 space-y-6">
              <EventSelector
                events={events}
                selectedEventId={selectedEventId}
                onSelectEvent={(id) => {
                  setSelectedEventId(id);
                  setSearchQuery("");
                }}
                onCreateEvent={handleCreateEvent}
                onDeleteEvent={handleDeleteEvent}
              />

              {activeEvent && (
                <StudentManager
                  onAddStudents={handleAddStudents}
                  currentRoster={activeEvent.students.map((st) => ({
                    id: st.studentId,
                    name: st.name,
                    number: st.number
                  }))}
                  onRemoveStudent={handleRemoveStudent}
                  onClearRoster={handleClearRoster}
                  onUpdateStudent={handleUpdateStudent}
                />
              )}
            </div>

            {/* Content Area Column */}
            <div className="lg:col-span-8 space-y-6">
              {!activeEvent ? (
                <div className="bg-white border border-slate-200/80 rounded-2xl p-8 text-center shadow-xs">
                  <div className="w-16 h-16 bg-indigo-50 text-indigo-500 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-indigo-100/40">
                    <HelpCircle size={32} />
                  </div>
                  <h3 className="text-lg font-black text-slate-800 mb-2">체험학습 출석체크 시작하기 3초 가이드</h3>
                  <div className="max-w-md mx-auto text-left text-xs sm:text-sm text-slate-500 space-y-3.5 mt-4 bg-slate-50 p-5 rounded-xl border border-slate-200/50 leading-relaxed font-semibold">
                    <p className="flex items-start gap-2.5">
                      <span className="bg-indigo-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs shrink-0 font-bold">1</span>
                      <span>좌측 상단의 <b>[새 행사 추가]</b> 버튼을 눌러 활동명(예: 경복궁 체험학습)과 행사 일자를 선택해 주세요.</span>
                    </p>
                    <p className="flex items-start gap-2.5">
                      <span className="bg-indigo-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs shrink-0 font-bold">2</span>
                      <span>좌측 하단의 <b>[명단 관리 및 엑셀 일괄 입력]</b> 란에 학급 명단 목록을 줄바꿈으로 편하게 붙여넣어 생성해 줍니다.</span>
                    </p>
                    <p className="flex items-start gap-2.5">
                      <span className="bg-indigo-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs shrink-0 font-bold">3</span>
                      <span>생성된 실시간 출석 카드에서 터치 한 번으로 쉽게 출결을 기록하고 메모를 남기세요!</span>
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Active Event Banner */}
                  <div className="bg-gradient-to-r from-indigo-900 via-slate-900 to-indigo-950 text-white rounded-2xl p-6 shadow-md relative overflow-hidden">
                    <div className="absolute -right-10 -bottom-10 opacity-10 text-white">
                      <ClipboardList size={200} />
                    </div>
                    <div className="relative z-10">
                      <p className="text-xs font-bold text-indigo-400 tracking-wider font-mono">{activeEvent.date}</p>
                      <h2 className="text-xl sm:text-2xl font-black tracking-tight mt-1 mb-2">
                        {activeEvent.title}
                      </h2>
                      <p className="text-xs text-slate-300 font-medium">
                        활동 학생 {activeEvent.students.length}명 관리 중 • 실시간으로 변경 사항이 자동 저장됩니다.
                      </p>
                    </div>
                  </div>

                  {/* Stats View */}
                  {activeEvent.students.length > 0 && (
                    <StatsDashboard records={activeEvent.students} />
                  )}

                  {/* Main Attendance Card Roster Panel */}
                  <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-3.5 sm:p-6 space-y-4">

                    {/* Search and Filters */}
                    <div className="flex flex-col md:flex-row gap-3 justify-between items-stretch md:items-center border-b border-slate-100 pb-4">
                      {/* Search */}
                      <div className="relative flex-1">
                        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="학생 이름 또는 번호 검색..."
                          className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl pl-9.5 pr-4 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white text-slate-800 transition-all font-semibold"
                        />
                      </div>

                      {/* Filter badges */}
                      <div className="flex items-center gap-1 overflow-x-auto py-1">
                        <span className="text-xs text-slate-400 flex items-center gap-1 mr-1 font-bold whitespace-nowrap">
                          <Filter size={12} /> 필터:
                        </span>
                        <button
                          onClick={() => setStatusFilter("all")}
                          className={`text-xs px-2.5 py-1.5 rounded-lg font-bold transition whitespace-nowrap cursor-pointer ${
                            statusFilter === "all"
                              ? "bg-slate-900 text-white shadow-xs"
                              : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                          }`}
                        >
                          전체 ({activeEvent.students.length})
                        </button>
                        <button
                          onClick={() => setStatusFilter(AttendanceStatus.PRESENT)}
                          className={`text-xs px-2.5 py-1.5 rounded-lg font-bold transition whitespace-nowrap cursor-pointer ${
                            statusFilter === AttendanceStatus.PRESENT
                              ? "bg-emerald-600 text-white shadow-xs"
                              : "text-slate-500 hover:text-emerald-700 hover:bg-emerald-50/50"
                          }`}
                        >
                          출석 ({activeEvent.students.filter(s => s.status === AttendanceStatus.PRESENT).length})
                        </button>
                        <button
                          onClick={() => setStatusFilter(AttendanceStatus.ABSENT)}
                          className={`text-xs px-2.5 py-1.5 rounded-lg font-bold transition whitespace-nowrap cursor-pointer ${
                            statusFilter === AttendanceStatus.ABSENT
                              ? "bg-rose-600 text-white shadow-xs"
                              : "text-slate-500 hover:text-rose-700 hover:bg-rose-50/50"
                          }`}
                        >
                          결석 ({activeEvent.students.filter(s => s.status === AttendanceStatus.ABSENT).length})
                        </button>
                        <button
                          onClick={() => setStatusFilter(AttendanceStatus.EXCLUDED)}
                          className={`text-xs px-2.5 py-1.5 rounded-lg font-bold transition whitespace-nowrap cursor-pointer ${
                            statusFilter === AttendanceStatus.EXCLUDED
                              ? "bg-amber-600 text-white shadow-xs"
                              : "text-slate-500 hover:text-slate-700 hover:bg-amber-50/50"
                          }`}
                        >
                          제외 ({activeEvent.students.filter(s => s.status === AttendanceStatus.EXCLUDED).length})
                        </button>
                      </div>
                    </div>

                    {/* Exporters and quick controls */}
                    {activeEvent.students.length > 0 && (
                      <div className="flex flex-col sm:flex-row gap-3 justify-between items-stretch sm:items-center sm:bg-slate-50/60 sm:p-2 sm:rounded-xl border border-slate-100 p-2">
                        <div className="flex items-center justify-between sm:justify-start gap-3.5 flex-wrap">
                          <span className="text-xs text-slate-500 font-extrabold px-1 whitespace-nowrap">
                            학생 {filteredStudents.length}명
                          </span>
                          
                          {/* Sort Toggle */}
                          <div className="inline-flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 shrink-0">
                            <button
                              onClick={() => setSortBy("number")}
                              className={`text-[10px] sm:text-xs font-black px-2 py-1 rounded-md transition-all cursor-pointer ${
                                sortBy === "number"
                                  ? "bg-slate-800 text-white shadow-sm"
                                  : "text-slate-500 hover:text-slate-800"
                              }`}
                            >
                              🔢 번호순
                            </button>
                            <button
                              onClick={() => setSortBy("name")}
                              className={`text-[10px] sm:text-xs font-black px-2 py-1 rounded-md transition-all cursor-pointer ${
                                sortBy === "name"
                                  ? "bg-slate-800 text-white shadow-sm"
                                  : "text-slate-500 hover:text-slate-800"
                              }`}
                            >
                              🔤 이름순
                            </button>
                          </div>
                        </div>
                        
                        <div className="flex gap-1.5 w-full sm:w-auto">
                          {/* Copy reports */}
                          <button
                            onClick={copyTextReport}
                            className="flex-1 sm:flex-none text-xs bg-white text-slate-700 border border-slate-200 hover:border-indigo-400 font-bold px-3 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                          >
                            <Copy size={13} className="text-indigo-600" />
                            {copyFeedback ? (
                              <span className="text-emerald-600 font-black">보고서 복사 완료!</span>
                            ) : (
                              <span>메신저 보고용 텍스트 복사</span>
                            )}
                          </button>

                          {/* Excel Export */}
                          <button
                            onClick={downloadCSV}
                            className="flex-1 sm:flex-none text-xs bg-white text-slate-700 border border-slate-200 hover:border-indigo-400 font-bold px-3 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                          >
                            <FileSpreadsheet size={13} className="text-emerald-500" />
                            <span>엑셀 CSV 다운로드</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Cards Grid */}
                    {activeEvent.students.length === 0 ? (
                      <div className="text-center py-12 border border-dashed border-slate-200 rounded-xl text-slate-400 bg-slate-50/20">
                        <p className="text-sm font-bold text-slate-500">학생이 등록되지 않았습니다.</p>
                        <p className="text-xs mt-1 font-semibold">좌측 [학생 명단 관리] 란에 학생들을 추가하거나 붙여넣어 주세요!</p>
                      </div>
                    ) : filteredStudents.length === 0 ? (
                      <div className="text-center py-12 text-slate-400">
                        <p className="text-sm font-bold">검색 필터에 맞는 학생이 없습니다.</p>
                      </div>
                    ) : (
                      <div className="bg-white border border-slate-150 rounded-xl overflow-hidden divide-y divide-slate-100 flex flex-col shadow-xs">
                        {filteredStudents.map((st) => (
                          <StudentCard
                            key={st.studentId}
                            record={st}
                            onStatusChange={(status) => handleStatusChange(st.studentId, status)}
                            onMemoChange={(memo) => handleMemoChange(st.studentId, memo)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Bottom Footer */}
      <footer className="max-w-7xl w-full mx-auto bg-white border-t border-slate-200/80 px-8 py-3.5 mt-12 flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-450 font-bold gap-2 shrink-0 rounded-2xl mb-6 shadow-xs">
        <div className="flex gap-4">
          <span>데이터 실시간 상태: <strong className="text-emerald-600 uppercase font-extrabold">동기화 완료 (Cloud)</strong></span>
          <span className="text-slate-300">•</span>
          <span>출석 데이터 업데이트 방지 기술 활성화</span>
        </div>
        <div className="flex gap-4 items-center">
          <span className="hover:text-indigo-600 transition-colors cursor-pointer">도움말</span>
          <span className="text-slate-300">•</span>
          <span className="hover:text-indigo-600 transition-colors cursor-pointer">야외활동 매뉴얼</span>
          <span className="text-slate-300">•</span>
          <span className="text-xs bg-indigo-50 text-indigo-700 font-extrabold px-1.5 py-0.5 rounded-md border border-indigo-100">v2.0-stable</span>
        </div>
      </footer>
    </div>
  );
}
