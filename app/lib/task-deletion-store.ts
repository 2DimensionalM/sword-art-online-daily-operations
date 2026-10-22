const TASK_DELETIONS_URL = 'http://127.0.0.1:43110/v1/task-deletions';

export type TaskDeletionSnapshot = {
  id: string;
  index?: number;
  title?: string;
  description?: string;
  status: TaskDeletionEvent['status'];
  taskType?: string;
  startedAt?: string;
  completedAt?: string;
  dueAt?: string;
  priority: TaskDeletionEvent['priority'];
  location?: string;
  recurrence?: 'none' | 'daily' | 'weekdays' | 'weekly';
  recurrenceDays?: number[];
  recurrenceStartTime?: string;
  isRecurrenceTemplate?: boolean;
  seriesId?: string;
  seriesHead?: boolean;
  lastGeneratedDate?: string;
  manualOrder?: number | null;
};

export type TaskDeletionEvent = {
  id: number;
  taskId: string;
  deletedAt: string;
  title: string;
  taskType: string;
  status: 'pending' | 'inProgress' | 'completed';
  startedAt: string;
  completedAt: string;
  dueAt: string;
  priority: 'must' | 'high' | 'medium' | 'low';
  snapshot: TaskDeletionSnapshot | null;
};

export async function loadTaskDeletionEvents() {
  const response = await fetch(TASK_DELETIONS_URL, { cache: 'no-store' });
  const body = await response.json() as TaskDeletionEvent[] | { error: string };
  if (!response.ok) throw new Error('error' in body ? body.error : `Task deletion request failed (${response.status})`);
  return body as TaskDeletionEvent[];
}

export async function recordTaskDeletionEvent(task: {
  id: string;
  title: string;
  taskType: string;
  status: TaskDeletionEvent['status'];
  startedAt: string;
  completedAt: string;
  dueAt: string;
  priority: TaskDeletionEvent['priority'];
  isRecurrenceTemplate?: boolean;
}) {
  const response = await fetch(TASK_DELETIONS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(task),
  });
  const body = await response.json() as TaskDeletionEvent[] | { error: string };
  if (!response.ok) throw new Error('error' in body ? body.error : `Task deletion request failed (${response.status})`);
  return body as TaskDeletionEvent[];
}

export async function removeTaskDeletionEvent(id: number) {
  const response = await fetch(`${TASK_DELETIONS_URL}/${encodeURIComponent(id)}`, { method: 'DELETE' });
  const body = await response.json() as TaskDeletionEvent[] | { error: string };
  if (!response.ok) throw new Error('error' in body ? body.error : `Task deletion request failed (${response.status})`);
  return body as TaskDeletionEvent[];
}
