import React, { useState } from "react";
import { Plus, Calendar, Trash2, Tag, ChevronDown, Check } from "lucide-react";
import { Event } from "../types";

interface EventSelectorProps {
  events: Event[];
  selectedEventId: string | null;
  onSelectEvent: (id: string) => void;
  onCreateEvent: (title: string, date: string) => void;
  onDeleteEvent: (id: string) => void;
}

export default function EventSelector({
  events,
  selectedEventId,
  onSelectEvent,
  onCreateEvent,
  onDeleteEvent
}: EventSelectorProps) {
  const [newEventTitle, setNewEventTitle] = useState("");
  const [newEventDate, setNewEventDate] = useState(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });
  const [showCreateForm, setShowCreateForm] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEventTitle.trim()) return;
    onCreateEvent(newEventTitle.trim(), newEventDate);
    setNewEventTitle("");
    setShowCreateForm(false);
  };

  const selectedEvent = events.find((ev) => ev.id === selectedEventId);

  return (
    <div id="event-selector" className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-extrabold text-sm text-slate-800 flex items-center gap-2">
          <Calendar size={17} className="text-indigo-600" />
          야외 행사 / 학습 현황
        </h3>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold px-3 py-1.5 rounded-lg transition-all duration-200 flex items-center gap-1 cursor-pointer"
        >
          <Plus size={14} />
          {showCreateForm ? "접기" : "새 행사 추가"}
        </button>
      </div>

      {showCreateForm && (
        <form onSubmit={handleSubmit} className="bg-slate-50/80 rounded-xl p-4 border border-slate-200/60 mb-4 space-y-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">행사명</label>
            <input
              type="text"
              value={newEventTitle}
              onChange={(e) => setNewEventTitle(e.target.value)}
              placeholder="예: 경복궁 체험학습, 체육대회"
              className="w-full text-xs border border-slate-200 bg-white rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800"
              required
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">이용 일자</label>
            <input
              type="date"
              value={newEventDate}
              onChange={(e) => setNewEventDate(e.target.value)}
              className="w-full text-xs border border-slate-200 bg-white rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800"
              required
            />
          </div>
          <button
            type="submit"
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-2 rounded-lg transition-colors cursor-pointer shadow-sm shadow-indigo-100"
          >
            행사 생성 및 가져오기
          </button>
        </form>
      )}

      {events.length === 0 ? (
        <div className="text-center py-6 border border-dashed border-slate-200 rounded-xl text-slate-400">
          <p className="text-sm font-semibold">등록된 행사가 없습니다.</p>
          <p className="text-[11px] mt-1">상단의 '새 행사 추가'를 눌러 시작해 주세요.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <label className="block text-[10px] uppercase font-bold tracking-wider text-slate-400">% 활동 히스토리 선택 %</label>
          <div className="max-h-52 overflow-y-auto space-y-2 pr-1 divide-y divide-slate-100/55">
            {events.map((ev) => {
              const isActive = ev.id === selectedEventId;
              const completedCount = ev.students.length;
              return (
                <div
                  key={ev.id}
                  className={`flex items-center justify-between p-3.5 rounded-xl transition-all duration-200 cursor-pointer border ${
                    isActive
                      ? "bg-indigo-50/80 border-indigo-200/80 text-indigo-950 shadow-xs"
                      : "bg-white text-slate-700 border-slate-150 hover:bg-slate-50"
                  }`}
                  onClick={() => onSelectEvent(ev.id)}
                >
                  <div className="flex-1 min-w-0 pr-2">
                    <p className={`text-[10px] font-mono font-bold tracking-wide ${isActive ? "text-indigo-600" : "text-slate-400"}`}>
                      {ev.date}
                    </p>
                    <h4 className={`text-sm font-extrabold truncate ${isActive ? "text-indigo-950" : "text-slate-800"}`}>
                      {ev.title}
                    </h4>
                    <p className={`text-[10px] font-semibold mt-0.5 ${isActive ? "text-indigo-700" : "text-slate-400"}`}>
                      학생 {completedCount}명 등록됨
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {isActive && (
                      <span className="bg-indigo-500/10 text-indigo-600 p-1 rounded-full">
                        <Check size={11} className="stroke-[3]" />
                      </span>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`'${ev.title}' 행사를 정말 삭제하시겠습니까? 데이터가 초기화됩니다.`)) {
                          onDeleteEvent(ev.id);
                        }
                      }}
                      className={`p-1.5 rounded-lg hover:bg-rose-500/10 hover:text-rose-500 transition-colors cursor-pointer ${
                        isActive ? "text-indigo-400 hover:text-rose-600" : "text-slate-300 hover:text-rose-500"
                      }`}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

