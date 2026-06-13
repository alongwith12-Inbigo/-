export enum AttendanceStatus {
  PRESENT = "present",   // 출석
  ABSENT = "absent",     // 결석
  EXCLUDED = "excluded"  // 제외
}

export interface Student {
  id: string;            // Unique ID
  name: string;          // Name of the student
  number?: string;       // Student ID/Number (optional, e.g. "1번", "10101")
}

export interface AttendanceRecord {
  studentId: string;
  name: string;
  number?: string;
  status: AttendanceStatus;
  memo: string;
  updatedAt: string;     // ISO String
}

export interface Event {
  id: string;
  title: string;
  date: string;          // Event Date (YYYY-MM-DD)
  description?: string;
  students: AttendanceRecord[];
  createdAt: string;     // ISO String
  updatedAt?: string;    // ISO String for cloud/local sync reconciliation
}
