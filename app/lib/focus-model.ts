export type FocusTask = { id: string; title: string; taskType: string; status: string; isRecurrenceTemplate?: boolean };
export type FocusSession = {
  id: string;
  startedAt: string;
  focusEndedAt: string | null;
  endedAt: string | null;
  phase: 'focus' | 'break' | 'ended';
  minimumMinutes: number;
  breakMinutes: number;
  tasks: (Pick<FocusTask, 'id' | 'title' | 'taskType'> & { unlinkedAt?: string; finalStatus?: string })[];
  endReason?: 'tasks-inactive';
  drifts: { at: string; returnedAt: string | null }[];
};
export type FocusState = { eligibleTasks: FocusTask[]; revision: number; settings: { minimumMinutes: number; breakMinutes: number }; sessions: FocusSession[]; serverNow: string };
export type FocusCommand = { requestId: string; expectedRevision: number; action: 'start' | 'resume' | 'drift' | 'recover' | 'break' | 'finish' | 'settings' | 'deleteSession'; targetSessionId?: string; sessionId?: string; taskIds?: string[]; minimumMinutes?: number; breakMinutes?: number };

export function eligibleFocusTasks(tasks: FocusTask[]) {
  return tasks.filter((task) => task.status === 'inProgress' && !task.isRecurrenceTemplate && /(学业|学习|复习|证书)/u.test(task.taskType) && !/工作/u.test(task.taskType));
}

export function focusDuration(session: FocusSession, now: number) {
  return Math.max(0, (session.focusEndedAt ? Date.parse(session.focusEndedAt) : now) - Date.parse(session.startedAt));
}

export function focusClock(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function focusDayKey(time: number) {
  const date = new Date(time);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Clip each interval to the local day; many task links never multiply the time.
export function focusDayStats(sessions: FocusSession[], day: Date, now: number) {
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  const end = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime();
  let total = 0;
  let longest = 0;
  let rounds = 0;
  let drifts = 0;
  let returns = 0;
  for (const session of sessions) {
    const duration = Math.max(0, Math.min(end, session.focusEndedAt ? Date.parse(session.focusEndedAt) : now) - Math.max(start, Date.parse(session.startedAt)));
    if (duration > 0) { total += duration; longest = Math.max(longest, duration); rounds += 1; }
    for (const drift of session.drifts) {
      if (Date.parse(drift.at) >= start && Date.parse(drift.at) < end) { drifts += 1; if (drift.returnedAt) returns += 1; }
    }
  }
  return { total, longest, rounds, drifts, returns, average: rounds ? total / rounds : 0 };
}
