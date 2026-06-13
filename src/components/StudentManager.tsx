import React, { useState } from "react";
import { Plus, Trash2, Upload, Users, AlertCircle, Check, X, Pencil, CloudLightning } from "lucide-react";
import { Student } from "../types";

interface StudentManagerProps {
  onAddStudents: (students: Student[]) => void;
  currentRoster: Student[];
  onRemoveStudent?: (id: string) => void;
  onClearRoster?: () => void;
  onUpdateStudent?: (id: string, name: string, number?: string) => void;
  defaultSavedRoster?: Student[];
  onSaveDefaultRoster?: (students: Student[]) => Promise<void>;
}

export default function StudentManager({
  onAddStudents,
  currentRoster,
  onRemoveStudent,
  onClearRoster,
  onUpdateStudent,
  defaultSavedRoster = [],
  onSaveDefaultRoster
}: StudentManagerProps) {
  const [bulkInput, setBulkInput] = useState("");
  const [singleName, setSingleName] = useState("");
  const [singleNumber, setSingleNumber] = useState("");
  const [activeTab, setActiveTab] = useState<"bulk" | "single">("bulk");
  const [showSavedFeedback, setShowSavedFeedback] = useState(false);

  // States for inline student editing (Name & Number in the active/default state roster)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingNumber, setEditingNumber] = useState("");

  const startEditing = (student: Student) => {
    setEditingId(student.id);
    setEditingName(student.name);
    setEditingNumber(student.number || "");
  };

  const handleSaveEdit = (id: string) => {
    if (!editingName.trim()) return;
    if (onUpdateStudent) {
      onUpdateStudent(id, editingName.trim(), editingNumber.trim() || undefined);
    }
    setEditingId(null);
  };

  const handleSingleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!singleName.trim()) return;

    const newStudent: Student = {
      id: `std_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      name: singleName.trim(),
      number: singleNumber.trim() || undefined,
    };

    onAddStudents([newStudent]);
    setSingleName("");
    setSingleNumber("");
  };

  const handleBulkAdd = () => {
    if (!bulkInput.trim()) return;

    // Split by newlines or commas
    const lines = bulkInput.split(/[\n,;]+/);
    const parsedStudents: Student[] = [];

    lines.forEach((line, index) => {
      const cleanLine = line.trim();
      if (!cleanLine) return;

      // Regular expression to parse typical Korean student names with optional leading number
      // Examples: "1번 홍길동", "10301 홍길동", "홍길동", "23 김민수"
      const numberNameMatch = cleanLine.match(/^(\d+번?|\d+-\d+)?\s*(.+)$/);

      let num: string | undefined = undefined;
      let name = cleanLine;

      if (numberNameMatch) {
        num = numberNameMatch[1]?.trim();
        name = numberNameMatch[2]?.trim();
      }

      // Safeguard duplicates inside the bulk paste
      parsedStudents.push({
        id: `std_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 5)}`,
        name: name,
        number: num,
      });
    });

    if (parsedStudents.length > 0) {
      onAddStudents(parsedStudents);
      setBulkInput("");
    }
  };

  const saveAsDefault = async () => {
    if (currentRoster.length === 0) return;
    try {
      if (onSaveDefaultRoster) {
        await onSaveDefaultRoster(currentRoster);
      }
      setShowSavedFeedback(true);
      setTimeout(() => setShowSavedFeedback(false), 2500);
    } catch (e) {
      console.error("Failed to save default roster:", e);
    }
  };

  const loadDefaultRoster = () => {
    if (defaultSavedRoster.length === 0) return;
    onAddStudents(defaultSavedRoster);
  };

  return (
    <div id="student-manager" className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6">
      <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="bg-indigo-50 text-indigo-600 p-2.5 rounded-xl">
            <Users size={18} />
          </div>
          <div>
            <h3 className="font-extrabold text-sm text-slate-800">학생 명단 관리</h3>
            <p className="text-[11px] font-semibold text-slate-400">현재 등록된 학생: {currentRoster.length}명</p>
          </div>
        </div>
        {currentRoster.length > 0 && onClearRoster && (
          <button
            onClick={onClearRoster}
            className="text-xs text-rose-500 hover:text-rose-600 font-bold transition-colors cursor-pointer"
          >
            전체 비우기
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-50 p-1 rounded-xl mb-4">
        <button
          onClick={() => setActiveTab("bulk")}
          className={`flex-1 text-center py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
            activeTab === "bulk" ? "bg-white text-indigo-600 shadow-xs" : "text-slate-500 hover:text-slate-800"
          }`}
        >
          엑셀 복사/일괄 입력
        </button>
        <button
          onClick={() => setActiveTab("single")}
          className={`flex-1 text-center py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
            activeTab === "single" ? "bg-white text-indigo-600 shadow-xs" : "text-slate-500 hover:text-slate-800"
          }`}
        >
          직접 한 명씩 추가
        </button>
      </div>

      {activeTab === "bulk" ? (
        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-wide">
              이름 목록 붙여넣기 (엔터/쉼표 구분 가능)
            </label>
            <textarea
              rows={4}
              value={bulkInput}
              onChange={(e) => setBulkInput(e.target.value)}
              placeholder="예시:&#10;1번 홍길동&#10;2번 이영희&#10;또는&#10;김철수, 박수민, 최다연"
              className="w-full text-xs text-slate-800 border border-slate-200 rounded-xl p-3 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono transition bg-slate-50/20 focus:bg-white"
            />
            <p className="text-[10px] text-slate-400 mt-1 font-semibold leading-relaxed">
              ※ 학급 명부(한글/엑셀)의 이름 열을 복사해서 붙여넣으시면 매우 편리합니다.
            </p>
          </div>
          <button
            onClick={handleBulkAdd}
            disabled={!bulkInput.trim()}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-100 disabled:text-slate-450 text-white font-bold text-xs py-2.5 px-4 rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Upload size={14} />
            명단에 일괄 추가하기
          </button>
        </div>
      ) : (
        <form onSubmit={handleSingleAdd} className="space-y-3">
          <div className="flex gap-2">
            <div className="w-1/3">
              <label className="block text-[11px] font-bold text-slate-400 mb-1">번호 (선택)</label>
              <input
                type="text"
                value={singleNumber}
                onChange={(e) => setSingleNumber(e.target.value)}
                placeholder="예: 1번"
                className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800"
              />
            </div>
            <div className="flex-1">
              <label className="block text-[11px] font-bold text-slate-400 mb-1">학생 이름</label>
              <input
                type="text"
                value={singleName}
                onChange={(e) => setSingleName(e.target.value)}
                placeholder="이름 입력"
                className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800"
                required
              />
            </div>
          </div>
          <button
            type="submit"
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-2.5 px-4 rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Plus size={14} />
            개별 학생 추가
          </button>
        </form>
      )}

      {/* Defaults management */}
      <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap gap-2 justify-between items-center">
        {currentRoster.length > 0 ? (
          <button
            onClick={saveAsDefault}
            className="text-xs bg-slate-50 text-slate-650 hover:bg-slate-100 px-3 py-2 rounded-lg font-bold transition flex items-center gap-1 cursor-pointer border border-slate-100"
          >
            {showSavedFeedback ? (
              <>
                <Check size={12} className="text-emerald-500" />
                <span className="text-emerald-600 font-bold">저장 완료!</span>
              </>
            ) : (
              <>
                <span>★ 현재 명단을 기본값으로 저장</span>
              </>
            )}
          </button>
        ) : (
          <div />
        )}

        {defaultSavedRoster.length > 0 && (
          <button
            onClick={loadDefaultRoster}
            className="text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-3 py-2 rounded-lg font-bold transition cursor-pointer border border-emerald-100"
          >
            기본 명단 불러오기 ({defaultSavedRoster.length}명)
          </button>
        )}
      </div>

      {/* Roster list view */}
      {currentRoster.length > 0 && (
        <div className="mt-5">
          <label className="block text-[10px] font-bold text-slate-400 mb-2 uppercase tracking-wide">등록된 학생 목록</label>
          <div className="max-h-48 overflow-y-auto border border-slate-100 rounded-xl divide-y divide-slate-50">
            {currentRoster.map((student, idx) => {
              const isEditing = student.id === editingId;
              return (
                <div key={student.id} className="flex justify-between items-center py-2 px-3 text-xs hover:bg-slate-50 gap-2">
                  <span className="text-slate-400 font-mono text-xs w-6 shrink-0">{idx + 1}</span>
                  
                  {isEditing ? (
                    <div className="flex-1 flex gap-1.5 items-center">
                      <input
                        type="text"
                        value={editingNumber}
                        onChange={(e) => setEditingNumber(e.target.value)}
                        placeholder="번호(예: 1번)"
                        className="w-16 border border-slate-200 rounded px-1.5 py-0.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-550 font-bold bg-white"
                      />
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        placeholder="이름"
                        required
                        className="flex-1 min-w-0 border border-slate-200 rounded px-1.5 py-0.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-550 font-bold bg-white"
                      />
                      <button
                        onClick={() => handleSaveEdit(student.id)}
                        className="text-emerald-600 hover:text-emerald-700 p-1 cursor-pointer shrink-0"
                        title="저장"
                      >
                        <Check size={14} className="stroke-[2.5]" />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer shrink-0"
                        title="취소"
                      >
                        <X size={14} className="stroke-[2.5]" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="flex-1 font-bold text-slate-700 truncate">
                        {student.number ? `${student.number} ` : ""}{student.name}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => startEditing(student)}
                          className="text-slate-300 hover:text-indigo-600 p-1 transition cursor-pointer"
                          title="수정"
                        >
                          <Pencil size={11} />
                        </button>
                        {onRemoveStudent && (
                          <button
                            onClick={() => onRemoveStudent(student.id)}
                            className="text-slate-350 hover:text-rose-600 p-1 transition cursor-pointer"
                            title="삭제"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

