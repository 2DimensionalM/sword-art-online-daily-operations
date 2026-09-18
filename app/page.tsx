'use client';

import { FormEvent, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { DiscardSignalDialog } from './components/DiscardSignalDialog';
import { GoalRadar, SignalRoom, SignalTicker, useSignals } from './components/SignalRoom';
import { BrandLockup } from './components/BrandLockup';
import { LifeDashboard, type DashboardCampaignScale, type DashboardTask } from './components/LifeDashboard';
import { loadDeadlineEvents, type DeadlineEvent } from './lib/deadline-store';
import { loadPlannerState, savePlannerState } from './lib/planner-store';
import { createSleepRecord, loadSleepRecords, removeSleepRecord, type SleepRecord } from './lib/sleep-store';
import { loadTaskDeletionEvents, recordTaskDeletionEvent, removeTaskDeletionEvent, type TaskDeletionEvent } from './lib/task-deletion-store';

type Status = 'pending' | 'inProgress' | 'completed';
type Priority = 'must' | 'high' | 'medium' | 'low';
type Recurrence = 'none' | 'daily' | 'weekdays' | 'weekly';
type View = 'dashboard' | 'board' | 'table' | 'calendar' | 'sleep' | 'signals' | 'settings';
type ChoiceFieldName = 'status' | 'priority' | 'taskType' | 'location' | 'recurrence';
type DateFieldName = 'startedAt' | 'completedAt' | 'dueAt';
type TypeColor = 'purple' | 'blue' | 'green' | 'yellow';
type CountdownUrgency = 'oneHour' | 'halfHour' | 'fifteen' | 'five' | 'finalMinute' | 'finalTen' | 'overdue';
type CountdownKind = 'start' | 'deadline';
type PendingSort = 'priority' | 'start' | 'deadline' | 'custom';
type BoardDensity = 'standard' | 'compact';
type SleepDisplayMode = 'standard' | 'compact';
type ArchiveFilterOption = { value: string; label: string; tone?: string };
type ScheduleVariant = 'pending-start' | 'pending-deadline' | 'pending-range' | 'in-progress' | 'completed';
type DayScheduleBlock = { id: string; task: Task; startMinute: number; endMinute: number; labelStartMinute: number; labelEndMinute: number; lane: number; laneCount: number; offline: boolean; variant: ScheduleVariant; continuesBefore: boolean; continuesAfter: boolean; terminal: boolean };

type Task = {
  id: string;
  index: number;
  title: string;
  description: string;
  status: Status;
  taskType: string;
  startedAt: string;
  completedAt: string;
  dueAt: string;
  priority: Priority;
  location: string;
  recurrence: Recurrence;
  recurrenceDays: number[];
  recurrenceStartTime: string;
  isRecurrenceTemplate: boolean;
  seriesId: string;
  seriesHead: boolean;
  lastGeneratedDate: string;
  manualOrder: number | null;
};

type CountdownSignal = { task: Task; kind: CountdownKind; urgency: CountdownUrgency; targetAt: string };

type DialogSessionState = {
  menuOpen: boolean;
  dayAgendaOpen: boolean;
  selectedDay: string;
  draft: Task | null;
  choiceField: ChoiceFieldName | null;
  dateField: DateFieldName | null;
  pickerDate: string;
  pickerTime: string;
  pickerMonth: string;
};

type PlannerSettings = {
  username: string;
  taskTypes: { value: string; color: TypeColor; custom?: boolean }[];
  locations: { value: string; custom?: boolean }[];
  defaultTaskType: string;
  defaultLocation: string;
  recurrenceEnabled: boolean;
  recurrenceOrder: string[];
};

const BASE_TYPES: PlannerSettings['taskTypes'] = [
  ...['🧬 个人', '📚 学业', '🎯 复习', '✍️ 考试', '💼 工作', '📕 阅读', '🎓 证书', '🧠 复盘'].map((value) => ({ value, color: 'purple' as const })),
  ...['✉️ 邮件', '📅 会议', '🚪 出行'].map((value) => ({ value, color: 'blue' as const })),
  ...['🍽️ 饮食', '🛒 购物', '📋 杂事', '🧹 家务', '🫧 卫生'].map((value) => ({ value, color: 'green' as const })),
  ...['🏃‍➡️ 运动', '🧘 冥想', '🎈 聚会', '🎮 娱乐', '🛏️ 休息'].map((value) => ({ value, color: 'yellow' as const })),
];
const BASE_LOCATIONS = ['🏠 家', '🏢 公司', '🏫 学校', '💻 线上', '🏃 户外', '✈️ 机场', '🚉 车站', '🛒 超市', '📍 其他'].map((value) => ({ value }));
const DEFAULT_SETTINGS: PlannerSettings = { username: '2DimensionalM', taskTypes: BASE_TYPES, locations: BASE_LOCATIONS, defaultTaskType: '🧬 个人', defaultLocation: '🏠 家', recurrenceEnabled: true, recurrenceOrder: [] };
const CANCELLATION_LOG_LIMIT = 6;
const RETIRED_ROUTINE_TYPE = '⏰ 作息';
const TASK_KEY = 'sao-planner-tasks-v2';
const LEGACY_TASK_KEY = 'sao-planner-tasks-v1';
const SETTINGS_KEY = 'sao-planner-settings-v1';
const THEME_KEY = 'sao-planner-theme-v1';
const VIEW_SESSION_KEY = 'sao-planner-active-view-v1';
const DIALOG_SESSION_KEY = 'sao-planner-dialog-state-v1';
const PENDING_SORT_SESSION_KEY = 'sao-planner-pending-sort-v1';
const BOARD_DENSITY_SESSION_KEY = 'sao-planner-board-density-v1';
const DASHBOARD_SCALE_SESSION_KEY = 'sao-dashboard-campaign-scale-v1';
const DASHBOARD_PERIOD_SESSION_KEY = 'sao-dashboard-campaign-period-v1';
const SLEEP_STANDARD_LIMIT = 9;
const VISIBLE_LIMIT: Record<BoardDensity, Record<Status, number>> = {
  standard: { pending: 5, inProgress: 5, completed: 5 },
  compact: { pending: 9, inProgress: 9, completed: 9 },
};
const STATUS_ORDER: Record<Status, number> = { inProgress: 0, pending: 1, completed: 2 };
const PRIORITY_ORDER: Record<Priority, number> = { must: 0, high: 1, medium: 2, low: 3 };
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const TYPE_COLOR_ORDER: Record<TypeColor, number> = { purple: 0, blue: 1, green: 2, yellow: 3 };
const ACTION_DAY_START = 2 * 60;
const ACTION_DAY_ACTIVE_START = 7 * 60;
const ACTION_DAY_MAIN_MINUTES = 19 * 60;
const ACTION_DAY_OFFLINE_DISPLAY_MINUTES = 120;
const ACTION_DAY_DISPLAY_MINUTES = ACTION_DAY_MAIN_MINUTES + ACTION_DAY_OFFLINE_DISPLAY_MINUTES;

function sortedTaskTypes(taskTypes: PlannerSettings['taskTypes']) {
  return [...taskTypes].sort((a, b) => TYPE_COLOR_ORDER[a.color] - TYPE_COLOR_ORDER[b.color]);
}

function normalizeSettings(raw: Partial<PlannerSettings> | null | undefined): PlannerSettings {
  const merged = { ...DEFAULT_SETTINGS, ...(raw ?? {}) };
  const taskTypes = sortedTaskTypes((Array.isArray(merged.taskTypes) ? merged.taskTypes : BASE_TYPES).filter((type) => type.value !== RETIRED_ROUTINE_TYPE));
  return {
    username: typeof merged.username === 'string' && merged.username.trim() ? merged.username.trim() : DEFAULT_SETTINGS.username,
    taskTypes,
    locations: Array.isArray(merged.locations) ? merged.locations : BASE_LOCATIONS,
    defaultTaskType: typeof merged.defaultTaskType === 'string' && merged.defaultTaskType !== RETIRED_ROUTINE_TYPE && taskTypes.some((type) => type.value === merged.defaultTaskType) ? merged.defaultTaskType : DEFAULT_SETTINGS.defaultTaskType,
    defaultLocation: typeof merged.defaultLocation === 'string' ? merged.defaultLocation : DEFAULT_SETTINGS.defaultLocation,
    recurrenceEnabled: merged.recurrenceEnabled !== false,
    recurrenceOrder: Array.isArray(merged.recurrenceOrder) ? [...new Set(merged.recurrenceOrder.filter((seriesId): seriesId is string => typeof seriesId === 'string' && seriesId.length > 0))] : [],
  };
}

const boardMeta: { id: Status; index: string; title: string; subtitle: string }[] = [
  { id: 'pending', index: '01', title: 'PENDING', subtitle: '等待行动' },
  { id: 'inProgress', index: '02', title: 'IN PROGRESS', subtitle: '正在攻略' },
  { id: 'completed', index: '03', title: 'COMPLETED', subtitle: '今日战果' },
];

const navItems: { id: View; no: string; title: string; subtitle: string; mark: string }[] = [
  { id: 'dashboard', no: '00', title: 'LIFE COMMAND', subtitle: '战役指挥中心', mark: '◉' },
  { id: 'board', no: '01', title: 'DAILY OPS', subtitle: '每日作战计划', mark: '▶' },
  { id: 'table', no: '02', title: 'MISSION ARCHIVE', subtitle: '任务档案表', mark: '▦' },
  { id: 'sleep', no: '03', title: 'NIGHT LOG', subtitle: '夜间状态档案', mark: '☾' },
  { id: 'calendar', no: '04', title: 'CALENDAR', subtitle: '月度行动日历', mark: '◆' },
  { id: 'signals', no: '05', title: 'SIGNAL ROOM', subtitle: '心愿放送室', mark: '◈' },
  { id: 'settings', no: '06', title: 'DESIGN', subtitle: '默认设置', mark: '✦' },
];

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function localTimeKey(value: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function dateAtLocalTime(date: Date, time: string) {
  if (!/^\d{2}:\d{2}$/.test(time)) return '';
  const [hour, minute] = time.split(':').map(Number);
  const result = new Date(date);
  result.setHours(hour, minute, 0, 0);
  return result.toISOString();
}

function dateAt(offset: number, hour: number, minute = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

function newTask(settings: PlannerSettings, index: number): Task {
  const id = crypto.randomUUID();
  return {
    id, index, title: '', description: '', status: 'pending', taskType: settings.defaultTaskType,
    startedAt: '', completedAt: '', dueAt: '', priority: 'medium', location: settings.defaultLocation,
    recurrence: 'none', recurrenceDays: [new Date().getDay()], recurrenceStartTime: '', isRecurrenceTemplate: false, seriesId: id, seriesHead: false,
    lastGeneratedDate: localDateKey(new Date()), manualOrder: null,
  };
}

function seedTasks(): Task[] {
  const today = localDateKey(new Date());
  const make = (index: number) => newTask(DEFAULT_SETTINGS, index);
  return [
    { ...make(1), id: 'seed-build', seriesId: 'seed-build', title: '完善 Sword Art Online 计划页', description: '完成三栏看板的核心交互与视觉基线。', taskType: '🧬 个人', priority: 'high', dueAt: dateAt(0, 22), lastGeneratedDate: today },
    { ...make(2), id: 'seed-review', seriesId: 'seed-review', title: '复盘本周行动与计划偏差', taskType: '🧠 复盘', priority: 'medium', dueAt: dateAt(1, 10, 30), location: '💻 线上', recurrence: 'weekly', recurrenceDays: [new Date().getDay()], seriesHead: true, lastGeneratedDate: today },
    { ...make(3), id: 'seed-email', seriesId: 'seed-email', title: '回复项目邮件', taskType: '✉️ 邮件', priority: 'high', dueAt: dateAt(0, 18, 30), location: '🏢 公司', lastGeneratedDate: today },
    { ...make(4), id: 'seed-cert', seriesId: 'seed-cert', title: '学习 Data Engineering 课程', taskType: '🎓 证书', priority: 'low', location: '💻 线上', lastGeneratedDate: today },
    { ...make(5), id: 'seed-work', seriesId: 'seed-work', title: '整理数据管道需求', description: '把散落的需求合并为一个可执行清单。', status: 'inProgress', taskType: '💼 工作', priority: 'high', startedAt: dateAt(0, Math.max(0, new Date().getHours() - 2), 5), location: '🏢 公司', lastGeneratedDate: today },
    { ...make(6), id: 'seed-lunch', seriesId: 'seed-lunch', title: '吃午饭并离开屏幕', status: 'completed', taskType: '🍽️ 饮食', priority: 'medium', startedAt: dateAt(0, 12, 30), completedAt: dateAt(0, 13, 10), location: '🏠 家', recurrence: 'daily', seriesHead: true, lastGeneratedDate: today },
  ];
}

function normalizeTasks(raw: Partial<Task>[]): Task[] {
  const today = localDateKey(new Date());
  return raw.map((task, position) => ({
    ...newTask(DEFAULT_SETTINGS, position + 1),
    ...task,
    index: task.index ?? position + 1,
    recurrenceDays: task.recurrenceDays ?? [Number((task as Partial<Task> & { recurrenceDay?: number }).recurrenceDay ?? new Date().getDay())],
    recurrenceStartTime: task.recurrenceStartTime ?? (task.recurrence && task.recurrence !== 'none' ? localTimeKey(task.startedAt ?? '') : ''),
    isRecurrenceTemplate: task.isRecurrenceTemplate === true,
    seriesId: task.seriesId ?? task.id ?? crypto.randomUUID(),
    seriesHead: task.seriesHead ?? (task.recurrence !== undefined && task.recurrence !== 'none'),
    lastGeneratedDate: task.lastGeneratedDate ?? (task as Partial<Task> & { lastResetDate?: string }).lastResetDate ?? today,
    manualOrder: task.manualOrder ?? null,
  }));
}

function typeColor(type: string, settings: PlannerSettings) {
  return settings.taskTypes.find((item) => item.value === type)?.color ?? 'purple';
}

function sortTasks(tasks: Task[], status: Status) {
  return [...tasks].sort((a, b) => {
    const hasManualOrder = tasks.some((task) => task.manualOrder !== null);
    if (status !== 'completed' && hasManualOrder) return (a.manualOrder ?? Number.MAX_SAFE_INTEGER) - (b.manualOrder ?? Number.MAX_SAFE_INTEGER);
    if (status === 'pending') return b.index - a.index;
    if (status === 'inProgress') return +new Date(b.startedAt || 0) - +new Date(a.startedAt || 0);
    return +new Date(b.completedAt || 0) - +new Date(a.completedAt || 0);
  });
}

function sortPendingTasks(tasks: Task[], sort: PendingSort) {
  if (sort === 'custom') return sortTasks(tasks, 'pending');
  return [...tasks].sort((a, b) => {
    if (sort === 'priority') {
      const priorityDifference = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (priorityDifference) return priorityDifference;
    } else {
      const aTime = sort === 'start' ? a.startedAt : a.dueAt;
      const bTime = sort === 'start' ? b.startedAt : b.dueAt;
      if (Boolean(aTime) !== Boolean(bTime)) return aTime ? -1 : 1;
      if (aTime && bTime) {
        const timeDifference = +new Date(aTime) - +new Date(bTime);
        if (timeDifference) return timeDifference;
      }
      const priorityDifference = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (priorityDifference) return priorityDifference;
    }
    return b.index - a.index;
  });
}

function pendingSortLabel(sort: PendingSort) {
  if (sort === 'custom') return 'CUSTOM';
  if (sort === 'start') return 'START TIME';
  if (sort === 'deadline') return 'DEADLINE';
  return 'PRIORITY';
}

function isPendingSort(value: string | null): value is PendingSort {
  return value === 'custom' || value === 'priority' || value === 'start' || value === 'deadline';
}

function transitionTask(task: Task, next: Status): Task {
  if (task.status === next) return task;
  const now = new Date().toISOString();
  if (next === 'pending') return { ...task, status: next, startedAt: task.recurrenceStartTime ? dateAtLocalTime(new Date(), task.recurrenceStartTime) : '', completedAt: '', manualOrder: null };
  if (next === 'inProgress') return { ...task, status: next, startedAt: now, completedAt: '', manualOrder: null };
  return { ...task, status: next, startedAt: task.startedAt || now, completedAt: now, manualOrder: null };
}

function shouldGenerate(task: Task, now: Date) {
  if (task.recurrence === 'daily') return true;
  if (task.recurrence === 'weekdays') return now.getDay() > 0 && now.getDay() < 6;
  if (task.recurrence === 'weekly') return task.recurrenceDays.includes(now.getDay());
  return false;
}

function ensureRecurrenceTemplates(tasks: Task[]) {
  const templateSeries = new Set(tasks.filter((task) => task.isRecurrenceTemplate).map((task) => task.seriesId || task.id));
  const sourceBySeries = new Map<string, Task>();
  const startTimeBySeries = new Map<string, { index: number; time: string }>();
  tasks.filter((task) => !task.isRecurrenceTemplate && task.recurrence !== 'none').forEach((task) => {
    const seriesKey = task.seriesId || task.id;
    const source = sourceBySeries.get(seriesKey);
    if (!source || task.seriesHead || (!source.seriesHead && task.index > source.index)) sourceBySeries.set(seriesKey, task);
    const candidateStartTime = task.recurrenceStartTime || localTimeKey(task.startedAt);
    if (candidateStartTime) {
      const template = startTimeBySeries.get(seriesKey);
      if (!template || task.index > template.index) startTimeBySeries.set(seriesKey, { index: task.index, time: candidateStartTime });
    }
  });
  const normalized = tasks.map((task) => {
    if (task.isRecurrenceTemplate) return task;
    const seriesKey = task.seriesId || task.id;
    const recurrenceStartTime = task.recurrence === 'none' ? '' : startTimeBySeries.get(seriesKey)?.time ?? task.recurrenceStartTime;
    const generatedDate = /^\d{4}-\d{2}-\d{2}$/.test(task.lastGeneratedDate) ? new Date(`${task.lastGeneratedDate}T00:00:00`) : new Date();
    const startedAt = task.recurrence !== 'none' && sourceBySeries.get(seriesKey)?.id === task.id && task.status === 'pending' && !task.startedAt && recurrenceStartTime
      ? dateAtLocalTime(generatedDate, recurrenceStartTime)
      : task.startedAt;
    if (!task.seriesHead && task.recurrenceStartTime === recurrenceStartTime && task.startedAt === startedAt) return task;
    return { ...task, seriesHead: false, recurrenceStartTime, startedAt };
  });
  const templates = [...sourceBySeries.entries()].flatMap(([seriesId, source]) => {
    if (templateSeries.has(seriesId)) return [];
    const recurrenceStartTime = startTimeBySeries.get(seriesId)?.time ?? source.recurrenceStartTime;
    const startedAt = recurrenceStartTime ? dateAtLocalTime(new Date(source.startedAt || source.dueAt || new Date()), recurrenceStartTime) : source.startedAt;
    return [{
      ...source,
      id: `repeat-template-${seriesId}`,
      status: 'pending' as const,
      startedAt,
      completedAt: '',
      recurrenceStartTime,
      isRecurrenceTemplate: true,
      seriesId,
      seriesHead: true,
      manualOrder: null,
    }];
  });
  return templates.length || normalized.some((task, index) => task !== tasks[index]) ? [...normalized, ...templates] : tasks;
}

function processRecurring(tasks: Task[], enabled = true) {
  const recurringReady = ensureRecurrenceTemplates(tasks);
  if (!enabled) return recurringReady;
  const now = new Date();
  const today = localDateKey(now);
  let nextIndex = recurringReady.reduce((max, task) => Math.max(max, task.index), 0) + 1;
  const generated: Task[] = [];
  const updated = recurringReady.map((task) => {
    if (!task.isRecurrenceTemplate || task.recurrence === 'none' || task.lastGeneratedDate === today || !shouldGenerate(task, now)) return task;
    let dueAt = task.dueAt;
    if (dueAt) {
      const due = new Date(dueAt);
      due.setFullYear(now.getFullYear(), now.getMonth(), now.getDate());
      dueAt = due.toISOString();
    }
    const startedAt = task.recurrenceStartTime ? dateAtLocalTime(now, task.recurrenceStartTime) : '';
    const next: Task = {
      ...task, id: crypto.randomUUID(), index: nextIndex++, status: 'pending', startedAt, completedAt: '', dueAt,
      isRecurrenceTemplate: false, seriesHead: false, lastGeneratedDate: today, manualOrder: null,
    };
    generated.push(next);
    return { ...task, seriesHead: true, lastGeneratedDate: today };
  });
  if (!generated.length) return recurringReady;
  const existingPending = sortTasks(updated.filter((task) => !task.isRecurrenceTemplate && task.status === 'pending'), 'pending');
  if (!existingPending.some((task) => task.manualOrder !== null)) return [...updated, ...generated];
  const orderedPending = [...generated, ...existingPending];
  const ranks = new Map(orderedPending.map((task, index) => [task.id, index]));
  return [...updated, ...generated].map((task) => !task.isRecurrenceTemplate && task.status === 'pending' ? { ...task, manualOrder: ranks.get(task.id) ?? null } : task);
}

function formatTime(value: string, includeDate = true) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('zh-CN', includeDate
    ? { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }
    : { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
}

function localDateTimeInputValue(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatSleepDateTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
}

function formatSleepArchiveDate(value: string) {
  const date = new Date(value);
  return {
    month: new Intl.DateTimeFormat('en-US', { month: 'short' }).format(date).toUpperCase(),
    day: new Intl.DateTimeFormat('en-US', { day: '2-digit' }).format(date),
    weekday: new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date).toUpperCase(),
  };
}

function formatSleepDuration(startedAt: string, wakeAt: string) {
  const minutes = Math.round((new Date(wakeAt).getTime() - new Date(startedAt).getTime()) / 60_000);
  return formatSleepMinutes(minutes);
}

function formatSleepMinutes(minutes: number) {
  if (!Number.isFinite(minutes) || minutes <= 0) return '—';
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}H ${String(remainingMinutes).padStart(2, '0')}M`;
}

function sleepDayPosition(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 0;
  return (date.getHours() * 60 + date.getMinutes()) / (24 * 60) * 100;
}

function circularMeanTime(records: SleepRecord[], selectValue: (record: SleepRecord) => string) {
  if (!records.length) return null;
  const vectors = records.reduce((total, record) => {
    const date = new Date(selectValue(record));
    if (Number.isNaN(date.getTime())) return total;
    const minutes = date.getHours() * 60 + date.getMinutes();
    const angle = minutes / (24 * 60) * Math.PI * 2;
    return { x: total.x + Math.cos(angle), y: total.y + Math.sin(angle), count: total.count + 1 };
  }, { x: 0, y: 0, count: 0 });
  if (!vectors.count) return null;
  const angle = Math.atan2(vectors.y / vectors.count, vectors.x / vectors.count);
  return Math.round(((angle < 0 ? angle + Math.PI * 2 : angle) / (Math.PI * 2)) * 24 * 60) % (24 * 60);
}

function formatClockMinutes(minutes: number | null) {
  if (minutes === null) return '—';
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function statusLabel(status: Status) {
  return status === 'pending' ? 'PENDING' : status === 'inProgress' ? 'IN PROGRESS' : 'COMPLETED';
}

function priorityLabel(priority: Priority) {
  if (priority === 'must') return '必 · MUST';
  if (priority === 'high') return '高 · HIGH';
  if (priority === 'medium') return '中 · MID';
  return '低 · LOW';
}

function recurrenceLabel(task: Task) {
  if (task.recurrence === 'none') return '不循环';
  if (task.recurrence === 'daily') return '每天';
  if (task.recurrence === 'weekdays') return '工作日';
  return `每周 · ${task.recurrenceDays.map((day) => `周${WEEKDAYS[day]}`).join(' / ')}`;
}

function descriptionToText(value: string) {
  return value
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p>|<\/div>|<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function descriptionMarkup(value: string) {
  if (/<[a-z][\s\S]*>/i.test(value)) return value;
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
}

function taskScheduleRange(task: Task, referenceNow = new Date()) {
  if (task.status === 'pending') {
    if (task.startedAt && task.dueAt) {
      const start = new Date(task.startedAt);
      const end = new Date(task.dueAt);
      if (!Number.isNaN(+start) && !Number.isNaN(+end) && +end > +start) {
        return { start, end, variant: 'pending-range' as const };
      }
    }
    if (task.startedAt) {
      const start = new Date(task.startedAt);
      return { start, end: new Date(+start + 75 * 60_000), variant: 'pending-start' as const };
    }
    if (task.dueAt) {
      const end = new Date(task.dueAt);
      return { start: new Date(+end - 75 * 60_000), end, variant: 'pending-deadline' as const };
    }
    return null;
  }
  if (task.status === 'inProgress') {
    const start = new Date(task.startedAt || task.dueAt || referenceNow.toISOString());
    const end = +referenceNow > +start ? referenceNow : new Date(+start + 60_000);
    return { start, end, variant: 'in-progress' as const };
  }
  const end = new Date(task.completedAt || task.dueAt || task.startedAt);
  if (Number.isNaN(+end)) return null;
  const start = task.startedAt ? new Date(task.startedAt) : new Date(+end - 45 * 60_000);
  return { start, end: +end > +start ? end : new Date(+start + 45 * 60_000), variant: 'completed' as const };
}

function calendarTaskDate(task: Task, referenceNow = new Date()) {
  return taskScheduleRange(task, referenceNow)?.start.toISOString() || '';
}

function taskOccursOnCalendarDay(task: Task, dayKey: string, referenceNow = new Date()) {
  if (task.status === 'pending' && !(task.startedAt && task.dueAt)) {
    const marker = task.startedAt || task.dueAt;
    return Boolean(marker) && localDateKey(new Date(marker)) === dayKey;
  }
  const range = taskScheduleRange(task, referenceNow);
  if (!range) return false;
  const dayStart = new Date(`${dayKey}T00:00:00`);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  return +range.start < +dayEnd && +range.end > +dayStart;
}

function taskOccursInActionDay(task: Task, dayKey: string, referenceNow = new Date()) {
  const range = taskScheduleRange(task, referenceNow);
  if (!range) return false;
  const actionStart = new Date(`${dayKey}T02:00:00`);
  const actionEnd = new Date(actionStart);
  actionEnd.setDate(actionEnd.getDate() + 1);
  return +range.start < +actionEnd && +range.end > +actionStart;
}

function minuteLabel(minutes: number) {
  const total = ((Math.max(0, Math.round(minutes)) % (24 * 60)) + (24 * 60)) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function scheduleTimeLabel(variant: ScheduleVariant, startMinute: number, endMinute: number, terminal = true) {
  if (variant === 'pending-start') return `START ${minuteLabel(startMinute)}`;
  if (variant === 'pending-deadline') return `DEADLINE ${minuteLabel(endMinute)}`;
  if (variant === 'pending-range') return `PLAN ${minuteLabel(startMinute)}–${minuteLabel(endMinute)}`;
  if (variant === 'in-progress') return terminal ? `${minuteLabel(startMinute)} → NOW ${minuteLabel(endMinute)}` : `${minuteLabel(startMinute)}–${minuteLabel(endMinute)}`;
  return `${minuteLabel(startMinute)}–${minuteLabel(endMinute)}`;
}

function taskWindowOnDay(task: Task, dayKey: string, referenceNow = new Date()) {
  const dayStart = new Date(`${dayKey}T00:00:00`);
  const actionStart = new Date(dayStart);
  actionStart.setHours(2, 0, 0, 0);
  const calendarEnd = new Date(dayStart);
  calendarEnd.setDate(calendarEnd.getDate() + 1);
  const actionEnd = new Date(actionStart);
  actionEnd.setDate(actionEnd.getDate() + 1);
  const range = taskScheduleRange(task, referenceNow);
  if (!range) return null;
  const start = new Date(Math.max(+range.start, +actionStart));
  const end = new Date(Math.min(+range.end, +actionEnd));
  if (+end <= +start) return null;
  const realDuration = +range.end - +range.start;
  const canCrossDay = range.variant === 'pending-range' || range.variant === 'in-progress' || range.variant === 'completed';
  return { startMinute: (+start - +dayStart) / 60_000, endMinute: (+end - +dayStart) / 60_000, variant: range.variant, continuesBefore: canCrossDay && +range.start < +actionStart && realDuration > 0, continuesAfter: canCrossDay && +range.start < +calendarEnd && +range.end > +calendarEnd && realDuration > 0, endsAfterWindow: +range.end > +actionEnd };
}

function actionDayMinute(minute: number) {
  if (minute <= ACTION_DAY_ACTIVE_START) return (minute - ACTION_DAY_START) * ACTION_DAY_OFFLINE_DISPLAY_MINUTES / (ACTION_DAY_ACTIVE_START - ACTION_DAY_START);
  return ACTION_DAY_OFFLINE_DISPLAY_MINUTES + minute - ACTION_DAY_ACTIVE_START;
}

function layoutDaySchedule(tasks: Task[], dayKey: string, referenceNow = new Date()): DayScheduleBlock[] {
  const windows = tasks.flatMap<DayScheduleBlock>((task) => {
    const window = taskWindowOnDay(task, dayKey, referenceNow);
    if (!window) return [];
    if (window.variant === 'pending-start' || window.variant === 'pending-deadline') {
      const anchor = window.variant === 'pending-start' ? window.startMinute : window.endMinute;
      const anchorDisplay = actionDayMinute(anchor);
      const markerSize = 75;
      const markerStart = Math.max(0, Math.min(ACTION_DAY_DISPLAY_MINUTES - markerSize, window.variant === 'pending-start' ? anchorDisplay : anchorDisplay - markerSize));
      return [{ id: `${task.id}-marker`, task, startMinute: markerStart, endMinute: markerStart + markerSize, labelStartMinute: window.startMinute, labelEndMinute: window.endMinute, lane: 0, laneCount: 1, offline: (anchor >= ACTION_DAY_START && anchor < ACTION_DAY_ACTIVE_START) || anchor >= 24 * 60, variant: window.variant, continuesBefore: false, continuesAfter: false, terminal: true }];
    }
    return [{
      id: `${task.id}-range`,
      task,
      startMinute: actionDayMinute(window.startMinute),
      endMinute: actionDayMinute(window.endMinute),
      labelStartMinute: window.startMinute,
      labelEndMinute: window.endMinute,
      lane: 0,
      laneCount: 1,
      offline: window.endMinute <= ACTION_DAY_ACTIVE_START || window.startMinute >= 24 * 60,
      variant: window.variant,
      continuesBefore: window.continuesBefore,
      continuesAfter: window.continuesAfter,
      terminal: !window.endsAfterWindow,
    }];
  }).sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute);

  const laidOut: DayScheduleBlock[] = [];
  let group: DayScheduleBlock[] = [];
  let groupEnd = -1;
  const flushGroup = () => {
    const laneEnds: number[] = [];
    group.forEach((block) => {
      const lane = laneEnds.findIndex((end) => end <= block.startMinute);
      block.lane = lane === -1 ? laneEnds.length : lane;
      laneEnds[block.lane] = block.endMinute;
    });
    group.forEach((block) => { block.laneCount = laneEnds.length; });
    laidOut.push(...group);
    group = [];
    groupEnd = -1;
  };
  windows.forEach((block) => {
    if (group.length && block.startMinute >= groupEnd) flushGroup();
    group.push(block);
    groupEnd = Math.max(groupEnd, block.endMinute);
  });
  if (group.length) flushGroup();
  return laidOut;
}

const COUNTDOWN_URGENCY_RANK: Record<CountdownUrgency, number> = { oneHour: 1, halfHour: 2, fifteen: 3, five: 4, finalMinute: 5, finalTen: 6, overdue: 7 };

function countdownUrgency(targetAt: string, now: Date): CountdownUrgency | null {
  const target = +new Date(targetAt);
  if (!targetAt || Number.isNaN(target)) return null;
  const remaining = target - +now;
  if (remaining <= 0) return 'overdue';
  if (remaining <= 10_000) return 'finalTen';
  if (remaining <= 60_000) return 'finalMinute';
  if (remaining <= 5 * 60_000) return 'five';
  if (remaining <= 15 * 60_000) return 'fifteen';
  if (remaining <= 30 * 60_000) return 'halfHour';
  if (remaining <= 60 * 60_000) return 'oneHour';
  return null;
}

function countdownText(targetAt: string, now: Date) {
  const difference = +new Date(targetAt) - +now;
  const absoluteSeconds = Math.max(0, Math.floor(Math.abs(difference) / 1000));
  const hours = Math.floor(absoluteSeconds / 3600);
  const minutes = Math.floor((absoluteSeconds % 3600) / 60);
  const seconds = absoluteSeconds % 60;
  const clock = `${hours ? `${String(hours).padStart(2, '0')}:` : ''}${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return difference <= 0 ? `+${clock}` : `T−${clock}`;
}

function countdownSignals(task: Task, now: Date): CountdownSignal[] {
  const signals: CountdownSignal[] = [];
  if (task.status === 'pending' && task.startedAt) {
    const urgency = countdownUrgency(task.startedAt, now);
    if (urgency) signals.push({ task, kind: 'start', urgency, targetAt: task.startedAt });
  }
  if ((task.status === 'pending' || task.status === 'inProgress') && task.dueAt) {
    const urgency = countdownUrgency(task.dueAt, now);
    if (urgency) signals.push({ task, kind: 'deadline', urgency, targetAt: task.dueAt });
  }
  // A deadline always supersedes a simultaneous start signal. This keeps one
  // task from occupying two HUD slots or showing competing card instruments.
  const deadline = signals.find((signal) => signal.kind === 'deadline');
  return deadline ? [deadline] : signals;
}

function compareCountdownSignals(a: CountdownSignal, b: CountdownSignal) {
  const urgencyDifference = COUNTDOWN_URGENCY_RANK[b.urgency] - COUNTDOWN_URGENCY_RANK[a.urgency];
  if (urgencyDifference) return urgencyDifference;
  if (a.kind !== b.kind) return a.kind === 'deadline' ? -1 : 1;
  return +new Date(a.targetAt) - +new Date(b.targetAt);
}

function countdownSignalLabel(signal: CountdownSignal) {
  if (signal.kind === 'deadline') {
    if (signal.urgency === 'overdue') return 'DEADLINE BREACHED / 已越过截止线';
    if (signal.urgency === 'finalTen') return 'TABOO · 最后十秒';
    if (signal.urgency === 'finalMinute') return 'FORBIDDEN MINUTE / 禁忌一分钟';
    if (signal.urgency === 'five') return 'LOCKDOWN 5 / 截止五分钟';
    if (signal.urgency === 'fifteen') return 'DEADLINE 15 / 截止十五分钟';
    if (signal.urgency === 'halfHour') return 'DEADLINE 30 / 截止半小时';
    return 'DEADLINE 60 / 截止一小时';
  }
  if (signal.urgency === 'overdue') return 'START WINDOW BREACHED / 立即开始';
  if (signal.urgency === 'finalTen') return 'DANGER · 最后十秒';
  if (signal.urgency === 'finalMinute') return 'FINAL MINUTE / 最后一分钟';
  if (signal.urgency === 'five') return 'START 5 / 五分钟后开始';
  if (signal.urgency === 'fifteen') return 'START 15 / 十五分钟后开始';
  if (signal.urgency === 'halfHour') return 'START 30 / 半小时后开始';
  return 'START 60 / 一小时后开始';
}

function countdownImpactTitle(signal: CountdownSignal) {
  if (signal.kind === 'deadline') {
    if (signal.urgency === 'overdue') return 'DEADLINE BREACHED!';
    if (signal.urgency === 'finalTen') return 'TABOO: 10 SECONDS!';
    if (signal.urgency === 'finalMinute') return 'FORBIDDEN MINUTE!';
    if (signal.urgency === 'five') return 'DEADLINE: 5 MINUTES!';
    return 'DEADLINE: 15 MINUTES!';
  }
  if (signal.urgency === 'overdue') return 'MISSION START NOW!';
  if (signal.urgency === 'finalTen') return 'DANGER: 10 SECONDS!';
  if (signal.urgency === 'finalMinute') return 'FINAL MINUTE!';
  if (signal.urgency === 'five') return 'START IN 5 MINUTES!';
  return 'START IN 15 MINUTES!';
}

function ChoiceField({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return <button type="button" className="choice-field" onClick={onClick}><span>{label}</span><strong>{value}</strong><i>›</i></button>;
}

function DateChoice({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return <button type="button" className="choice-field date-choice" onClick={onClick}><span>{label}</span><strong>{value ? formatTime(value) : '未设置'}</strong><i>◷</i></button>;
}

function ArchiveFilterMenu({ label, mark, value, options, onChange }: {
  label: string; mark: string; value: string; options: ArchiveFilterOption[]; onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return <div className={`archive-filter ${open ? 'is-open' : ''}`} ref={rootRef}>
    <span>{label}</span>
    <button type="button" className="archive-filter-trigger" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
      <i aria-hidden="true">{mark}</i><strong>{selected.label}</strong><em aria-hidden="true">⌄</em>
    </button>
    {open && <div className="archive-filter-menu" role="listbox" aria-label={`${label} 筛选`}>
      <small>SELECT / 选择</small>
      {options.map((option, index) => <button type="button" role="option" aria-selected={option.value === value} className={`archive-filter-option ${option.value === value ? 'active' : ''} ${option.tone ? `tone-${option.tone}` : ''}`} key={option.value} onClick={() => { onChange(option.value); setOpen(false); }}>
        <span>{String(index + 1).padStart(2, '0')}</span><strong>{option.label}</strong><i aria-hidden="true">{option.value === value ? '◆' : '›'}</i>
      </button>)}
    </div>}
  </div>;
}

function SignalSelect({ value, options, onChange, mark, label }: {
  value: string; options: ArchiveFilterOption[]; onChange: (value: string) => void; mark: string; label: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => { document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('keydown', closeOnEscape); };
  }, [open]);

  return <div className={`signal-select ${open ? 'is-open' : ''}`} ref={rootRef}>
    <button type="button" className="signal-select-trigger" aria-label={label} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)}><i className={mark === '⌖' ? 'signal-select-location-mark' : undefined} aria-hidden="true">{mark}</i><strong>{selected.label}</strong><em aria-hidden="true">⌄</em></button>
    {open && <div className="signal-select-menu" role="listbox" aria-label={label}>
      {options.map((option, index) => <button type="button" role="option" aria-selected={option.value === value} className={`signal-select-option ${option.value === value ? 'active' : ''} ${option.tone ? `tone-${option.tone}` : ''}`} key={option.value} onClick={() => { onChange(option.value); setOpen(false); }}><span>{String(index + 1).padStart(2, '0')}</span><strong>{option.label}</strong><i aria-hidden="true">{option.value === value ? '◆' : '›'}</i></button>)}
    </div>}
  </div>;
}

function WorkshopCombobox({ value, options, onChange, onOptionSelect, placeholder }: {
  value: string; options: ArchiveFilterOption[]; onChange: (value: string) => void; onOptionSelect?: (value: string) => void; placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const filteredOptions = options.filter((option) => option.label.toLowerCase().includes(value.trim().toLowerCase()));

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => { document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('keydown', closeOnEscape); };
  }, [open]);

  return <div className={`workshop-combobox ${open ? 'is-open' : ''}`} ref={rootRef}>
    <input value={value} role="combobox" aria-autocomplete="list" aria-controls={menuId} aria-expanded={open} aria-haspopup="listbox" onFocus={() => setOpen(true)} onChange={(event) => { onChange(event.target.value); setOpen(true); }} placeholder={placeholder} />
    <button type="button" className="workshop-combobox-toggle" aria-label="显示候选项" tabIndex={-1} onMouseDown={(event) => event.preventDefault()} onClick={() => setOpen((current) => !current)}>⌄</button>
    {open && <div className="workshop-combobox-menu" id={menuId} role="listbox">{filteredOptions.length ? filteredOptions.map((option, index) => <button type="button" role="option" aria-selected={option.value === value.trim()} className={option.tone ? `tone-${option.tone}` : ''} key={option.value} onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(option.value); onOptionSelect?.(option.value); setOpen(false); }}><span>{String(index + 1).padStart(2, '0')}</span><strong>{option.label}</strong><i aria-hidden="true">{option.value === value.trim() ? '◆' : '›'}</i></button>) : <small>NO MATCH / 可作为新项目添加</small>}</div>}
  </div>;
}

function ArchiveDateFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => value ? new Date(`${value}T00:00:00`) : new Date());
  const rootRef = useRef<HTMLDivElement>(null);
  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    return Array.from({ length: 42 }, (_, index) => { const day = new Date(start); day.setDate(start.getDate() + index); return day; });
  }, [month]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => { document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('keydown', closeOnEscape); };
  }, [open]);

  const openPicker = () => {
    if (value) setMonth(new Date(`${value}T00:00:00`));
    setOpen((current) => !current);
  };
  return <div className={`archive-filter archive-date-filter ${open ? 'is-open' : ''}`} ref={rootRef}>
    <span>DAILY FLOW DATE</span>
    <button type="button" className="archive-filter-trigger" aria-haspopup="dialog" aria-expanded={open} onClick={openPicker}>
      <i aria-hidden="true">▣</i><strong>{value ? value.replaceAll('-', ' / ') : '全部行动日 / ALL DAYS'}</strong><em aria-hidden="true">⌄</em>
    </button>
    {open && <section className="archive-date-menu" role="dialog" aria-label="按 DAILY FLOW 日期筛选">
      <header><button type="button" aria-label="上个月" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button><strong>{month.getFullYear()} / {String(month.getMonth() + 1).padStart(2, '0')}</strong><button type="button" aria-label="下个月" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button></header>
      <div className="archive-date-weekdays">{WEEKDAYS.map((day) => <span key={day}>周{day}</span>)}</div>
      <div className="archive-date-days">{days.map((day) => {
        const key = localDateKey(day);
        return <button type="button" key={key} className={`${day.getMonth() !== month.getMonth() ? 'outside' : ''} ${key === value ? 'active' : ''} ${key === localDateKey(new Date()) ? 'today' : ''}`} onClick={() => { onChange(key); setOpen(false); }}>{day.getDate()}</button>;
      })}</div>
      <footer><span>按 DAILY FLOW 的任务分配筛选</span><button type="button" onClick={() => { onChange(''); setOpen(false); }}>CLEAR / 清除</button></footer>
    </section>}
  </div>;
}

function RichTextDescription({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const editorRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<Range | null>(null);
  const createChecklistInput = () => {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.contentEditable = 'false';
    input.setAttribute('aria-label', '完成清单项');
    return input;
  };
  const createChecklistItem = () => {
    const item = document.createElement('li');
    const entry = document.createElement('span');
    entry.className = 'checklist-entry';
    entry.textContent = '\u00a0';
    item.insertAdjacentElement('beforeend', createChecklistInput());
    item.insertAdjacentElement('beforeend', entry);
    return item;
  };
  const normalizeChecklistItem = (item: HTMLLIElement) => {
    const checkbox = Array.from(item.children).find((child): child is HTMLInputElement => child instanceof HTMLInputElement && child.type === 'checkbox');
    if (!checkbox) return;
    const existingEntry = Array.from(item.children).find((child): child is HTMLSpanElement => child instanceof HTMLSpanElement && child.classList.contains('checklist-entry'));
    if (existingEntry) return;
    const entry = document.createElement('span');
    entry.className = 'checklist-entry';
    Array.from(item.childNodes).filter((node) => node !== checkbox).forEach((node) => {
      node.remove();
      if (node instanceof Element) entry.insertAdjacentElement('beforeend', node);
      else entry.insertAdjacentText('beforeend', node.textContent ?? '');
    });
    if (!entry.childNodes.length) entry.textContent = '\u00a0';
    item.insertAdjacentElement('beforeend', entry);
  };
  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== descriptionMarkup(value)) editorRef.current.innerHTML = descriptionMarkup(value);
    editorRef.current?.querySelectorAll<HTMLLIElement>('ul.checklist > li').forEach(normalizeChecklistItem);
  }, [value]);
  const rememberSelection = () => {
    const selection = window.getSelection();
    if (!selection?.rangeCount || !editorRef.current?.contains(selection.anchorNode)) return;
    selectionRef.current = selection.getRangeAt(0).cloneRange();
  };
  const restoreSelection = () => {
    const selection = window.getSelection();
    if (!selectionRef.current || !selection) return;
    selection.removeAllRanges();
    selection.addRange(selectionRef.current);
  };
  const selectedLists = () => {
    const selection = window.getSelection();
    if (!editorRef.current || !selection?.rangeCount) return [] as (HTMLUListElement | HTMLOListElement)[];
    const range = selection.getRangeAt(0);
    const anchorElement = selection.anchorNode instanceof Element ? selection.anchorNode : selection.anchorNode?.parentElement;
    const activeList = anchorElement?.closest('ul,ol');
    const intersectingLists = Array.from(editorRef.current.querySelectorAll<HTMLUListElement | HTMLOListElement>('ul,ol')).filter((list) => range.intersectsNode(list));
    if ((activeList instanceof HTMLUListElement || activeList instanceof HTMLOListElement) && editorRef.current.contains(activeList)) {
      return [...new Set([activeList, ...intersectingLists])];
    }
    return intersectingLists;
  };
  const placeCaretAtChecklistTextStart = (item: HTMLLIElement) => {
    normalizeChecklistItem(item);
    const entry = Array.from(item.children).find((child): child is HTMLSpanElement => child instanceof HTMLSpanElement && child.classList.contains('checklist-entry'));
    const range = document.createRange();
    if (entry) range.selectNodeContents(entry);
    else range.setStart(item, Math.min(1, item.childNodes.length));
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  };
  const placeCaretAtChecklistTextEnd = (item: HTMLLIElement) => {
    normalizeChecklistItem(item);
    const entry = Array.from(item.children).find((child): child is HTMLSpanElement => child instanceof HTMLSpanElement && child.classList.contains('checklist-entry'));
    const range = document.createRange();
    if (entry) range.selectNodeContents(entry);
    else range.selectNodeContents(item);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  };
  const replaceList = (list: HTMLUListElement | HTMLOListElement, tagName: 'ul' | 'ol', checklist = false) => {
    const replacement = document.createElement(tagName);
    if (checklist) replacement.classList.add('checklist');
    replacement.innerHTML = list.innerHTML;
    Array.from(replacement.children).filter((item): item is HTMLLIElement => item instanceof HTMLLIElement).forEach((item) => {
      const checkbox = Array.from(item.children).find((child): child is HTMLInputElement => child instanceof HTMLInputElement && child.type === 'checkbox');
      if (checklist && !checkbox) {
        item.insertAdjacentElement('afterbegin', createChecklistInput());
      }
      if (checklist) normalizeChecklistItem(item);
      if (!checklist) checkbox?.remove();
    });
    list.replaceWith(replacement);
    return replacement;
  };
  const removeListFormatting = (list: HTMLUListElement | HTMLOListElement) => {
    const fragment = document.createDocumentFragment();
    let lastLine: HTMLDivElement | null = null;
    Array.from(list.children).filter((item): item is HTMLLIElement => item instanceof HTMLLIElement).forEach((item) => {
      const line = document.createElement('div');
      Array.from(item.childNodes).forEach((node) => {
        if (node instanceof HTMLInputElement && node.type === 'checkbox') return;
        if (node instanceof HTMLSpanElement && node.classList.contains('checklist-entry')) {
          while (node.firstChild) line.appendChild(node.firstChild);
          return;
        }
        line.appendChild(node);
      });
      if (!line.childNodes.length) line.appendChild(document.createElement('br'));
      fragment.append(line);
      lastLine = line;
    });
    list.replaceWith(fragment);
    return lastLine;
  };
  const formatSelectedChecklistText = (command: 'bold' | 'italic' | 'underline') => {
    const selection = window.getSelection();
    if (!editorRef.current || !selection?.rangeCount) return false;
    const selectedRange = selection.getRangeAt(0);
    if (selectedRange.collapsed) return false;
    const entries = Array.from(editorRef.current.querySelectorAll<HTMLSpanElement>('ul.checklist .checklist-entry'))
      .filter((entry) => selectedRange.intersectsNode(entry));
    if (!entries.length) return false;
    const originalRange = selectedRange.cloneRange();
    entries.forEach((entry) => {
      const entryRange = document.createRange();
      entryRange.selectNodeContents(entry);
      selection.removeAllRanges();
      selection.addRange(entryRange);
      document.execCommand(command);
    });
    selection.removeAllRanges();
    selection.addRange(originalRange);
    return true;
  };
  const format = (command: 'bold' | 'italic' | 'underline' | 'insertUnorderedList' | 'insertOrderedList' | 'checklist') => {
    editorRef.current?.focus();
    restoreSelection();
    let lists = selectedLists();
    if (command === 'checklist') {
      const checklistIsActive = lists.length > 0 && lists.every((list) => list instanceof HTMLUListElement && list.classList.contains('checklist'));
      if (checklistIsActive) {
        const lastLine = lists.map(removeListFormatting).at(-1);
        if (lastLine) {
          const range = document.createRange();
          range.selectNodeContents(lastLine);
          range.collapse(false);
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
        }
      } else {
        if (!lists.length) {
          const existingLists = new Set(editorRef.current?.querySelectorAll<HTMLUListElement | HTMLOListElement>('ul,ol'));
          document.execCommand('insertUnorderedList');
          lists = selectedLists();
          // Empty contenteditables can lose their selection during execCommand.
          // In that case, target the list that this command just created instead
          // of leaving its browser-default bullet styling in place.
          if (!lists.length) {
            lists = Array.from(editorRef.current?.querySelectorAll<HTMLUListElement | HTMLOListElement>('ul,ol') ?? [])
              .filter((list) => !existingLists.has(list));
          }
        }
        const replacements = lists.map((list) => replaceList(list, 'ul', true));
        const replacement = replacements.at(-1);
        const lastItem = replacement?.lastElementChild;
        if (lastItem instanceof HTMLLIElement) placeCaretAtChecklistTextEnd(lastItem);
      }
    } else if (command === 'insertUnorderedList' || command === 'insertOrderedList') {
      const targetTag = command === 'insertUnorderedList' ? 'ul' : 'ol';
      const listFormatIsActive = lists.length > 0 && lists.every((list) => list.tagName.toLowerCase() === targetTag && !list.classList.contains('checklist'));
      if (listFormatIsActive) {
        const lastLine = lists.map(removeListFormatting).at(-1);
        if (lastLine) {
          const range = document.createRange();
          range.selectNodeContents(lastLine);
          range.collapse(false);
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
        }
      } else if (lists.length) {
        const replacements = lists.map((list) => replaceList(list, command === 'insertUnorderedList' ? 'ul' : 'ol'));
        const replacement = replacements.at(-1);
        if (replacement) {
          const range = document.createRange();
          range.selectNodeContents(replacement);
          range.collapse(false);
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
        }
      }
      else document.execCommand(command);
    } else if (command === 'bold' || command === 'italic' || command === 'underline') {
      if (!formatSelectedChecklistText(command)) document.execCommand(command);
    }
    rememberSelection();
    onChange(editorRef.current?.innerHTML ?? '');
  };
  const continueChecklist = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || !editorRef.current) return;
    const selection = window.getSelection();
    const anchor = selection?.anchorNode;
    const element = anchor instanceof HTMLElement ? anchor : anchor?.parentElement;
    const item = element?.closest('li');
    if (!(item instanceof HTMLLIElement) || !editorRef.current.contains(item) || !item.parentElement?.matches('ul.checklist')) return;
    event.preventDefault();
    const entry = Array.from(item.children).find((child): child is HTMLSpanElement => child instanceof HTMLSpanElement && child.classList.contains('checklist-entry'));
    if (!entry?.textContent?.replaceAll('\u00a0', '').trim()) {
      const list = item.parentElement;
      const followingItems = Array.from(item.parentElement.children)
        .slice(Array.from(item.parentElement.children).indexOf(item) + 1)
        .filter((sibling): sibling is HTMLLIElement => sibling instanceof HTMLLIElement);
      const followingList = followingItems.length ? list.cloneNode(false) as HTMLUListElement : null;
      followingItems.forEach((followingItem) => followingList?.appendChild(followingItem));
      item.remove();
      const paragraph = document.createElement('div');
      paragraph.appendChild(document.createElement('br'));
      if (list.children.length) list.insertAdjacentElement('afterend', paragraph);
      else list.replaceWith(paragraph);
      if (followingList) paragraph.insertAdjacentElement('afterend', followingList);
      const range = document.createRange();
      range.selectNodeContents(paragraph);
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
      rememberSelection();
      onChange(editorRef.current.innerHTML);
      return;
    }
    const range = selection?.getRangeAt(0);
    if (!range || !entry.contains(range.startContainer) || !entry.contains(range.endContainer)) return;
    // Native list items split at the caret. Extracting the trailing DOM range
    // keeps inline formatting intact and, when the caret is at the start, moves
    // the whole line into the new checklist item.
    range.deleteContents();
    const trailingRange = document.createRange();
    trailingRange.selectNodeContents(entry);
    trailingRange.setStart(range.startContainer, range.startOffset);
    const trailingContents = trailingRange.extractContents();
    if (!entry.childNodes.length) entry.textContent = '\u00a0';
    const nextItem = createChecklistItem();
    const nextEntry = Array.from(nextItem.children).find((child): child is HTMLSpanElement => child instanceof HTMLSpanElement && child.classList.contains('checklist-entry'));
    if (nextEntry && trailingContents.childNodes.length) {
      nextEntry.replaceChildren(trailingContents);
    }
    item.insertAdjacentElement('afterend', nextItem);
    placeCaretAtChecklistTextStart(nextItem);
    rememberSelection();
    onChange(editorRef.current.innerHTML);
  };
  const deleteEmptyChecklistItem = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Backspace' || !editorRef.current) return;
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (!range.collapsed) return;
    const anchor = selection.anchorNode;
    const element = anchor instanceof HTMLElement ? anchor : anchor?.parentElement;
    const item = element?.closest('li');
    if (!(item instanceof HTMLLIElement) || !editorRef.current.contains(item) || !item.parentElement?.matches('ul.checklist')) return;
    const entry = Array.from(item.children).find((child): child is HTMLSpanElement => child instanceof HTMLSpanElement && child.classList.contains('checklist-entry'));
    if (!entry || entry.textContent?.trim()) return;
    const beforeCaret = range.cloneRange();
    beforeCaret.selectNodeContents(entry);
    beforeCaret.setEnd(range.startContainer, range.startOffset);
    if (beforeCaret.toString().replaceAll('\u00a0', '').trim()) return;
    event.preventDefault();
    const previousItem = item.previousElementSibling;
    const nextItem = item.nextElementSibling;
    const list = item.parentElement;
    item.remove();
    if (previousItem instanceof HTMLLIElement) placeCaretAtChecklistTextEnd(previousItem);
    else if (nextItem instanceof HTMLLIElement) placeCaretAtChecklistTextStart(nextItem);
    else if (list instanceof HTMLUListElement) {
      const paragraph = document.createElement('div');
      paragraph.insertAdjacentElement('beforeend', document.createElement('br'));
      list.replaceWith(paragraph);
      const fallbackRange = document.createRange();
      fallbackRange.selectNodeContents(paragraph);
      fallbackRange.collapse(true);
      selection.removeAllRanges();
      selection.addRange(fallbackRange);
    }
    rememberSelection();
    onChange(editorRef.current.innerHTML);
  };
  const focusEmptyChecklistItem = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!editorRef.current || event.target instanceof HTMLInputElement) return;
    const target = event.target instanceof Element ? event.target : null;
    const item = target?.closest('li');
    if (!(item instanceof HTMLLIElement) || !editorRef.current.contains(item) || !item.parentElement?.matches('ul.checklist') || item.textContent?.trim()) return;
    event.preventDefault();
    editorRef.current.focus();
    placeCaretAtChecklistTextStart(item);
    rememberSelection();
  };
  return <div className="field field-wide rich-description-field"><span>Description / 描述</span><div className="rich-text-toolbar" role="toolbar" aria-label="描述文字格式">
    <button type="button" title="加粗" aria-label="加粗" onMouseDown={(event) => event.preventDefault()} onClick={() => format('bold')}><b>B</b></button>
    <button type="button" title="斜体" aria-label="斜体" onMouseDown={(event) => event.preventDefault()} onClick={() => format('italic')}><i>I</i></button>
    <button type="button" title="下划线" aria-label="下划线" onMouseDown={(event) => event.preventDefault()} onClick={() => format('underline')}><u>U</u></button>
    <span aria-hidden="true" />
    <button type="button" title="项目符号" aria-label="项目符号" onMouseDown={(event) => event.preventDefault()} onClick={() => format('insertUnorderedList')}>• ≡</button>
    <button type="button" title="编号列表" aria-label="编号列表" onMouseDown={(event) => event.preventDefault()} onClick={() => format('insertOrderedList')}>1 ≡</button>
    <button type="button" title="待办清单" aria-label="待办清单" onMouseDown={(event) => event.preventDefault()} onClick={() => format('checklist')}>☑ ≡</button>
  </div><div ref={editorRef} className="rich-description-editor" contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" data-placeholder="补充任务背景、完成标准或下一步…" onFocus={rememberSelection} onMouseDown={focusEmptyChecklistItem} onKeyDown={(event) => { continueChecklist(event); if (!event.defaultPrevented) deleteEmptyChecklistItem(event); }} onKeyUp={rememberSelection} onMouseUp={rememberSelection} onClick={(event) => { const target = event.target; if (target instanceof HTMLInputElement && target.type === 'checkbox') { target.toggleAttribute('checked', target.checked); onChange(editorRef.current?.innerHTML ?? ''); } }} onInput={() => { rememberSelection(); onChange(editorRef.current?.innerHTML ?? ''); }} /></div>;
}

function TaskCard({ task, color, now, dragging, landed, onOpen, onStart, onDragStart, onDragEnd, onDragOver, onDrop }: {
  task: Task; color: TypeColor; now: Date; dragging: boolean; landed: boolean; onOpen: () => void;
  onStart: () => void;
  onDragStart: (event: React.DragEvent<HTMLElement>) => void; onDragEnd: () => void;
  onDragOver: (event: React.DragEvent<HTMLElement>) => void; onDrop: (event: React.DragEvent<HTMLElement>) => void;
}) {
  const countdowns = countdownSignals(task, now);
  const countdown = countdowns.find((signal) => signal.kind === 'start') ?? countdowns.sort(compareCountdownSignals)[0];
  return <article className={`task-card status-${task.status} type-${color} priority-${task.priority} ${countdown ? `has-countdown countdown-${countdown.kind} signal-${countdown.urgency}` : ''} ${dragging ? 'is-dragging' : ''} ${landed ? 'is-landed' : ''}`}
    draggable tabIndex={0} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragOver={onDragOver} onDrop={onDrop} onClick={onOpen}
    onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(); } }}>
    <div className="card-stripe" />
    <div className="card-topline"><span className="task-type">{task.location}</span><div className="task-flags">{task.recurrence !== 'none' && <span title={recurrenceLabel(task)} className="repeat-icon"><i aria-hidden="true">↻</i></span>}<span className="priority-label">{task.priority === 'must' ? 'MUST' : task.priority === 'high' ? 'HIGH' : task.priority === 'medium' ? 'MID' : 'LOW'}</span></div></div>
    <h3>{task.title}</h3>
    <p className={`card-description ${task.description ? '' : 'is-empty'}`} aria-hidden={task.description ? undefined : true}>{descriptionToText(task.description) || '\u00a0'}</p>
    {task.status === 'pending' && <span className="mission-state-signal pending-state-signal" aria-hidden="true">WAIT</span>}
    {task.status === 'inProgress' && <span className="mission-state-signal" aria-hidden="true">LIVE</span>}
    {task.status === 'completed' && <span className="mission-state-signal" aria-hidden="true">CLEAR</span>}
    {countdown && <div className={`card-countdown countdown-${countdown.kind} urgency-${countdown.urgency}`} aria-label={`${countdownSignalLabel(countdown)} ${countdownText(countdown.targetAt, now)}`}><div><span>{countdown.kind === 'start' ? '▶ START' : '⊘ DEADLINE'}</span><small>{countdown.kind === 'start' ? '行动窗口' : '禁忌时限'}</small></div><strong>{countdownText(countdown.targetAt, now)}</strong>{countdown.kind === 'start' ? <button type="button" aria-label={`开始任务：${task.title}`} onClick={(event) => { event.stopPropagation(); onStart(); }}>▶</button> : <i className="deadline-seal" aria-hidden="true" />}</div>}
    <div className="card-meta"><span>{task.taskType}</span>
      {task.status === 'pending' && <span className={task.dueAt && +new Date(task.dueAt) < +now ? 'is-overdue' : ''}>⌁ {task.dueAt ? formatTime(task.dueAt) : 'NO DEADLINE'}</span>}
      {task.status === 'inProgress' && <span>▶ {formatTime(task.startedAt)}</span>}
      {task.status === 'completed' && <span>✓ {formatTime(task.completedAt)}</span>}
    </div><div className="compact-card-meta"><span>{task.taskType}</span><span className={task.dueAt && +new Date(task.dueAt) < +now ? 'is-overdue' : ''}>⌁ {task.dueAt ? formatTime(task.dueAt) : 'NO DEADLINE'}</span></div><span className="drag-hint" aria-hidden="true">⋮⋮</span>
  </article>;
}

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>(seedTasks);
  const [settings, setSettings] = useState<PlannerSettings>(DEFAULT_SETTINGS);
  const [hydrated, setHydrated] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saveRetry, setSaveRetry] = useState(0);
  const [clock, setClock] = useState(() => new Date());
  const databaseRevision = useRef(0);
  const lastPersistedSnapshot = useRef('');
  const saveQueue = useRef(Promise.resolve());
  const reminderBands = useRef(new Map<string, CountdownUrgency>());
  const remindersReady = useRef(false);
  const pendingSortRef = useRef<HTMLDivElement>(null);
  const scheduleTimelineRef = useRef<HTMLDivElement>(null);
  const signals = useSignals();
  const [signalDirty, setSignalDirty] = useState(false);
  const [pendingSignalView, setPendingSignalView] = useState<View | null>(null);
  const [view, setView] = useState<View>('dashboard');
  const [viewRestored, setViewRestored] = useState(false);
  const [dashboardScale, setDashboardScale] = useState<DashboardCampaignScale>('week');
  const [dashboardPeriodId, setDashboardPeriodId] = useState('');
  const [dialogStateRestored, setDialogStateRestored] = useState(false);
  const [introVisible, setIntroVisible] = useState(false);
  const [introMinimumMet, setIntroMinimumMet] = useState(false);
  const [introProgress, setIntroProgress] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuClosing, setMenuClosing] = useState(false);
  const [theme, setTheme] = useState<'day' | 'night'>('day');
  const [pageMotion, setPageMotion] = useState<'idle' | 'exit' | 'enter'>('idle');
  const [pageDirection, setPageDirection] = useState<'forward' | 'backward'>('forward');
  const [showAll, setShowAll] = useState<Record<Status, boolean>>({ pending: false, inProgress: false, completed: false });
  const [boardDensity, setBoardDensity] = useState<BoardDensity>(() => {
    if (typeof window === 'undefined') return 'standard';
    return window.sessionStorage.getItem(BOARD_DENSITY_SESSION_KEY) === 'compact' ? 'compact' : 'standard';
  });
  const [pendingSort, setPendingSort] = useState<PendingSort>(() => {
    if (typeof window === 'undefined') return 'custom';
    const savedSort = window.sessionStorage.getItem(PENDING_SORT_SESSION_KEY);
    return isPendingSort(savedSort) ? savedSort : 'custom';
  });
  const [pendingSortOpen, setPendingSortOpen] = useState(false);
  const [showCompletedHistory, setShowCompletedHistory] = useState(false);
  const [draggingId, setDraggingId] = useState('');
  const [dropTarget, setDropTarget] = useState<Status | ''>('');
  const [landedId, setLandedId] = useState('');
  const [impact, setImpact] = useState<{ title: string; subtitle: string; tier?: CountdownUrgency | 'action' } | null>(null);
  const [draft, setDraft] = useState<Task | null>(null);
  const [choiceField, setChoiceField] = useState<ChoiceFieldName | null>(null);
  const [dateField, setDateField] = useState<DateFieldName | null>(null);
  const [pickerDate, setPickerDate] = useState(localDateKey(new Date()));
  const [pickerTime, setPickerTime] = useState('12:00');
  const [pickerMonth, setPickerMonth] = useState(() => { const date = new Date(); date.setDate(1); return date; });
  const [toast, setToast] = useState('');
  const [tableQuery, setTableQuery] = useState('');
  const [tableStatus, setTableStatus] = useState<Status | 'all'>('all');
  const [tableType, setTableType] = useState('all');
  const [tablePriority, setTablePriority] = useState<Priority | 'all'>('all');
  const [tableDate, setTableDate] = useState('');
  const [calendarMonth, setCalendarMonth] = useState(() => { const date = new Date(); date.setDate(1); return date; });
  const [selectedDay, setSelectedDay] = useState(localDateKey(new Date()));
  const [dayAgendaOpen, setDayAgendaOpen] = useState(false);
  const [linkedScheduleTaskId, setLinkedScheduleTaskId] = useState('');
  const [customType, setCustomType] = useState('');
  const [customTypeColor, setCustomTypeColor] = useState<TypeColor>('purple');
  const [customLocation, setCustomLocation] = useState('');
  const [selectedWorkshopLocation, setSelectedWorkshopLocation] = useState('');
  const [sleepRecords, setSleepRecords] = useState<SleepRecord[]>([]);
  const [deadlineEvents, setDeadlineEvents] = useState<DeadlineEvent[]>([]);
  const [taskDeletionEvents, setTaskDeletionEvents] = useState<TaskDeletionEvent[]>([]);
  const [sleepLoading, setSleepLoading] = useState(true);
  const [sleepSubmitting, setSleepSubmitting] = useState(false);
  const [sleepStartedAt, setSleepStartedAt] = useState(() => localDateTimeInputValue(new Date(Date.now() - 8 * 60 * 60_000).toISOString()));
  const [wakeAt, setWakeAt] = useState(() => localDateTimeInputValue(new Date().toISOString()));
  const [sleepPickerField, setSleepPickerField] = useState<'sleepStartedAt' | 'wakeAt' | null>(null);
  const [sleepPickerDate, setSleepPickerDate] = useState(localDateKey(new Date()));
  const [sleepPickerTime, setSleepPickerTime] = useState('00:00');
  const [sleepPickerMonth, setSleepPickerMonth] = useState(() => { const date = new Date(); date.setDate(1); return date; });
  const [sleepDisplayMode, setSleepDisplayMode] = useState<SleepDisplayMode>('standard');
  const [sleepStandardExpanded, setSleepStandardExpanded] = useState(false);
  const [repeatersExpanded, setRepeatersExpanded] = useState(true);
  const [cancellationLogExpanded, setCancellationLogExpanded] = useState(false);
  const [repeaterDraggingId, setRepeaterDraggingId] = useState('');
  const missionTasks = useMemo(() => tasks.filter((task) => !task.isRecurrenceTemplate), [tasks]);

  useEffect(() => {
    const savedView = window.sessionStorage.getItem(VIEW_SESSION_KEY);
    const restoredView = navItems.some((item) => item.id === savedView) ? savedView as View : navItems[0].id;
    const savedDashboardScale = window.sessionStorage.getItem(DASHBOARD_SCALE_SESSION_KEY);
    const restoredDashboardScale: DashboardCampaignScale = savedDashboardScale === 'month' || savedDashboardScale === 'quarter' ? savedDashboardScale : 'week';
    const restoredDashboardPeriodId = window.sessionStorage.getItem(DASHBOARD_PERIOD_SESSION_KEY) ?? '';
    const savedDialogState = window.sessionStorage.getItem(DIALOG_SESSION_KEY);
    let restoredDialogState: Partial<DialogSessionState> = {};
    try {
      restoredDialogState = savedDialogState ? JSON.parse(savedDialogState) as Partial<DialogSessionState> : {};
    } catch {
      restoredDialogState = {};
    }
    const restoredDraft = restoredDialogState.draft && typeof restoredDialogState.draft === 'object'
      ? normalizeTasks([restoredDialogState.draft])[0]
      : null;
    const restoredChoiceField = restoredDraft && (['status', 'priority', 'taskType', 'location', 'recurrence'] as ChoiceFieldName[]).includes(restoredDialogState.choiceField as ChoiceFieldName)
      ? restoredDialogState.choiceField as ChoiceFieldName
      : null;
    const restoredDateField = restoredDraft && (['startedAt', 'completedAt', 'dueAt'] as DateFieldName[]).includes(restoredDialogState.dateField as DateFieldName)
      ? restoredDialogState.dateField as DateFieldName
      : null;
    const restoredPickerMonth = restoredDialogState.pickerMonth ? new Date(restoredDialogState.pickerMonth) : null;
    const timers = [window.setTimeout(() => {
      setView(restoredView);
      setViewRestored(true);
      setDashboardScale(restoredDashboardScale);
      setDashboardPeriodId(restoredDashboardPeriodId);
      setMenuOpen(restoredDialogState.menuOpen === true);
      setDayAgendaOpen(restoredDialogState.dayAgendaOpen === true);
      if (typeof restoredDialogState.selectedDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(restoredDialogState.selectedDay)) setSelectedDay(restoredDialogState.selectedDay);
      setDraft(restoredDraft);
      setChoiceField(restoredChoiceField);
      setDateField(restoredDateField);
      if (typeof restoredDialogState.pickerDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(restoredDialogState.pickerDate)) setPickerDate(restoredDialogState.pickerDate);
      if (typeof restoredDialogState.pickerTime === 'string' && /^\d{2}:\d{2}$/.test(restoredDialogState.pickerTime)) setPickerTime(restoredDialogState.pickerTime);
      if (restoredPickerMonth && !Number.isNaN(restoredPickerMonth.getTime())) setPickerMonth(restoredPickerMonth);
      setDialogStateRestored(true);
      if (restoredView === navItems[0].id && restoredDialogState.menuOpen !== true && restoredDialogState.dayAgendaOpen !== true && !restoredDraft) {
        setIntroVisible(true);
        setIntroProgress(8);
      }
    }, 0)];
    if (restoredView === navItems[0].id && restoredDialogState.menuOpen !== true && restoredDialogState.dayAgendaOpen !== true && !restoredDraft) timers.push(
      window.setTimeout(() => setIntroProgress(27), 260),
      window.setTimeout(() => setIntroProgress(51), 620),
      window.setTimeout(() => setIntroProgress(73), 1_020),
      window.setTimeout(() => setIntroProgress(89), 1_430),
      window.setTimeout(() => setIntroMinimumMet(true), 1_850),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, []);

  useEffect(() => {
    if (!viewRestored) return;
    window.sessionStorage.setItem(VIEW_SESSION_KEY, view);
  }, [view, viewRestored]);

  useEffect(() => {
    if (!viewRestored) return;
    window.sessionStorage.setItem(PENDING_SORT_SESSION_KEY, pendingSort);
  }, [pendingSort, viewRestored]);

  useEffect(() => {
    if (!viewRestored) return;
    window.sessionStorage.setItem(BOARD_DENSITY_SESSION_KEY, boardDensity);
  }, [boardDensity, viewRestored]);

  useEffect(() => {
    if (!viewRestored) return;
    window.sessionStorage.setItem(DASHBOARD_SCALE_SESSION_KEY, dashboardScale);
    window.sessionStorage.setItem(DASHBOARD_PERIOD_SESSION_KEY, dashboardPeriodId);
  }, [dashboardPeriodId, dashboardScale, viewRestored]);

  useEffect(() => {
    if (!dialogStateRestored) return;
    const dialogState: DialogSessionState = {
      menuOpen,
      dayAgendaOpen,
      selectedDay,
      draft,
      choiceField: draft ? choiceField : null,
      dateField: draft ? dateField : null,
      pickerDate,
      pickerTime,
      pickerMonth: pickerMonth.toISOString(),
    };
    window.sessionStorage.setItem(DIALOG_SESSION_KEY, JSON.stringify(dialogState));
  }, [choiceField, dateField, dayAgendaOpen, dialogStateRestored, draft, menuOpen, pickerDate, pickerMonth, pickerTime, selectedDay]);

  useEffect(() => {
    if (!introVisible || !introMinimumMet || !hydrated) return;
    const progressTimer = window.setTimeout(() => setIntroProgress(100), 0);
    const finishTimer = window.setTimeout(() => setIntroVisible(false), 380);
    return () => { window.clearTimeout(progressTimer); window.clearTimeout(finishTimer); };
  }, [hydrated, introMinimumMet, introVisible]);

  useEffect(() => {
    let cancelled = false;

    const hydrateFromDatabase = async () => {
      try {
        let databaseState = await loadPlannerState<Task, PlannerSettings>();
        if (cancelled) return;

        if (!databaseState.initialized) {
          const savedTasks = localStorage.getItem(TASK_KEY) || localStorage.getItem(LEGACY_TASK_KEY);
          const savedSettings = localStorage.getItem(SETTINGS_KEY);
          const savedTheme = localStorage.getItem(THEME_KEY);
          const importedSettings = normalizeSettings(savedSettings ? JSON.parse(savedSettings) : null);
          const importedTheme = savedTheme === 'night' ? 'night' : 'day';
          const importedTasks = processRecurring(savedTasks ? normalizeTasks(JSON.parse(savedTasks)) : seedTasks(), importedSettings.recurrenceEnabled);
          const imported = await savePlannerState<Task, PlannerSettings>({
            expectedRevision: databaseState.revision,
            tasks: importedTasks,
            settings: importedSettings,
            theme: importedTheme,
            migrationSource: `localStorage@${window.location.origin}`,
          });
          databaseState = imported.state;
          localStorage.removeItem(TASK_KEY);
          localStorage.removeItem(LEGACY_TASK_KEY);
          localStorage.removeItem(SETTINGS_KEY);
          localStorage.removeItem(THEME_KEY);
        }

        if (cancelled) return;
        const normalizedSettings = normalizeSettings(databaseState.settings);
        const normalizedTasks = normalizeTasks(databaseState.tasks);
        const recurringTasks = processRecurring(normalizedTasks, normalizedSettings.recurrenceEnabled);
        databaseRevision.current = databaseState.revision;
        lastPersistedSnapshot.current = JSON.stringify({
          tasks: normalizedTasks,
          settings: normalizedSettings,
          theme: databaseState.theme,
        });
        setSettings(normalizedSettings);
        setTheme(databaseState.theme);
        setTasks(recurringTasks);
        setHydrated(true);
      } catch (error) {
        if (!cancelled) setStorageError(error instanceof Error ? error.message : '无法连接本地数据库');
      }
    };

    void hydrateFromDatabase();
    return () => { cancelled = true; };
  }, [loadAttempt]);

  useEffect(() => {
    let cancelled = false;
    void loadSleepRecords().then((records) => {
      if (!cancelled) {
        setSleepRecords(records);
        const todayRecord = records.find((record) => localDateKey(new Date(record.wakeAt)) === localDateKey(new Date()));
        if (todayRecord) {
          setSleepStartedAt(localDateTimeInputValue(todayRecord.sleepStartedAt));
          setWakeAt(localDateTimeInputValue(todayRecord.wakeAt));
        }
      }
    }).catch((error) => {
      if (!cancelled) setToast(error instanceof Error ? error.message : '无法读取睡眠档案');
    }).finally(() => {
      if (!cancelled) setSleepLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([loadDeadlineEvents(), loadTaskDeletionEvents()]).then(([deadlineHistory, deletionHistory]) => {
      if (!cancelled) {
        setDeadlineEvents(deadlineHistory);
        setTaskDeletionEvents(deletionHistory);
      }
    }).catch(() => {
      if (!cancelled) {
        setDeadlineEvents([]);
        setTaskDeletionEvents([]);
      }
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const snapshot = JSON.stringify({ tasks, settings, theme });
    if (snapshot === lastPersistedSnapshot.current) return;
    const timer = window.setTimeout(() => {
      saveQueue.current = saveQueue.current.catch(() => undefined).then(async () => {
        if (snapshot === lastPersistedSnapshot.current) return;
        try {
          const pending = JSON.parse(snapshot) as { tasks: Task[]; settings: PlannerSettings; theme: 'day' | 'night' };
          const result = await savePlannerState<Task, PlannerSettings>({
            expectedRevision: databaseRevision.current,
            ...pending,
          });
          databaseRevision.current = result.state.revision;
          if (result.conflicted) {
            const currentSettings = normalizeSettings(result.state.settings);
            const currentTasks = normalizeTasks(result.state.tasks);
            lastPersistedSnapshot.current = JSON.stringify({ tasks: currentTasks, settings: currentSettings, theme: result.state.theme });
            setTasks(currentTasks);
            setSettings(currentSettings);
            setTheme(result.state.theme);
            setToast('DATABASE UPDATED · 已载入较新的数据');
            return;
          }
          lastPersistedSnapshot.current = snapshot;
          void Promise.all([loadDeadlineEvents(), loadTaskDeletionEvents()]).then(([deadlineHistory, deletionHistory]) => {
            setDeadlineEvents(deadlineHistory);
            setTaskDeletionEvents(deletionHistory);
          }).catch(() => undefined);
        } catch {
          setToast('DATABASE OFFLINE · 修改尚未保存，正在等待重试');
          window.setTimeout(() => setSaveRetry((current) => current + 1), 1_500);
        }
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [tasks, settings, theme, hydrated, saveRetry]);
  useEffect(() => { const interval = window.setInterval(() => setTasks((current) => processRecurring(current, settings.recurrenceEnabled)), 60_000); return () => window.clearInterval(interval); }, [settings.recurrenceEnabled]);
  useEffect(() => { const interval = window.setInterval(() => setClock(new Date()), 1_000); return () => window.clearInterval(interval); }, []);
  useEffect(() => {
    if (!pendingSortOpen) return;
    const closeOnOutsidePress = (event: MouseEvent) => {
      if (!pendingSortRef.current?.contains(event.target as Node)) setPendingSortOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPendingSortOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsidePress);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsidePress);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [pendingSortOpen]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 2200); return () => window.clearTimeout(timer); }, [toast]);
  useEffect(() => {
    if (!impact) return;
    const duration = impact.tier === 'finalTen' ? 1_600 : impact.tier === 'finalMinute' ? 1_300 : impact.tier === 'five' ? 1_100 : 900;
    const timer = window.setTimeout(() => { setImpact(null); setLandedId(''); }, duration);
    return () => window.clearTimeout(timer);
  }, [impact]);
  useEffect(() => {
    if (!hydrated) return;
    const reminding = missionTasks.flatMap((task) => countdownSignals(task, clock)).sort(compareCountdownSignals);
    const activeKeys = new Set(reminding.map((signal) => `${signal.task.id}:${signal.kind}`));
    for (const key of reminderBands.current.keys()) if (!activeKeys.has(key)) reminderBands.current.delete(key);
    if (!remindersReady.current) {
      for (const signal of reminding) reminderBands.current.set(`${signal.task.id}:${signal.kind}`, signal.urgency);
      remindersReady.current = true;
      return;
    }
    const changed = reminding.find((signal) => reminderBands.current.get(`${signal.task.id}:${signal.kind}`) !== signal.urgency);
    for (const signal of reminding) reminderBands.current.set(`${signal.task.id}:${signal.kind}`, signal.urgency);
    if (!changed || changed.urgency === 'oneHour' || changed.urgency === 'halfHour') return;
    setImpact({
      title: countdownImpactTitle(changed),
      subtitle: `${changed.task.title} · ${countdownSignalLabel(changed)}`,
      tier: changed.urgency,
    });
  }, [clock, hydrated, missionTasks]);

  const grouped = useMemo(() => boardMeta.reduce((result, board) => {
    const today = localDateKey(new Date());
    const boardTasks = missionTasks.filter((task) => task.status === board.id && (board.id !== 'completed' || showCompletedHistory || (task.completedAt && localDateKey(new Date(task.completedAt)) === today)));
    result[board.id] = board.id === 'pending' ? sortPendingTasks(boardTasks, pendingSort) : sortTasks(boardTasks, board.id);
    return result;
  }, {} as Record<Status, Task[]>), [missionTasks, showCompletedHistory, pendingSort]);

  const activeRecurringTasks = useMemo(() => {
    const recurringTasks = tasks.filter((task) => task.isRecurrenceTemplate && task.recurrence !== 'none');
    const recurrenceRanks = new Map(settings.recurrenceOrder.map((seriesId, index) => [seriesId, index]));
    const hasManualOrder = recurringTasks.some((task) => task.manualOrder !== null);
    return [...recurringTasks].sort((a, b) => {
      const aRank = recurrenceRanks.get(a.seriesId || a.id);
      const bRank = recurrenceRanks.get(b.seriesId || b.id);
      if (aRank !== undefined || bRank !== undefined) return (aRank ?? Number.MAX_SAFE_INTEGER) - (bRank ?? Number.MAX_SAFE_INTEGER);
      return hasManualOrder ? (a.manualOrder ?? Number.MAX_SAFE_INTEGER) - (b.manualOrder ?? Number.MAX_SAFE_INTEGER) : a.index - b.index;
    });
  }, [settings.recurrenceOrder, tasks]);
  const visibleCancellationEvents = cancellationLogExpanded ? taskDeletionEvents : taskDeletionEvents.slice(0, CANCELLATION_LOG_LIMIT);

  const filteredTable = useMemo(() => {
    const query = tableQuery.trim().toLowerCase();
    const matchingTasks = missionTasks.filter((task) => (
      (!query || `${task.title} ${task.description} ${task.taskType} ${task.location}`.toLowerCase().includes(query))
      && (tableStatus === 'all' || task.status === tableStatus)
      && (tableType === 'all' || task.taskType === tableType)
      && (tablePriority === 'all' || task.priority === tablePriority)
      && (!tableDate || taskOccursInActionDay(task, tableDate, clock))
    ));
    const pendingRanks = new Map(sortPendingTasks(matchingTasks.filter((task) => task.status === 'pending'), pendingSort).map((task, index) => [task.id, index]));
    return matchingTasks.sort((a, b) => {
      const statusDiff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      if (statusDiff) return statusDiff;
      if (a.status === 'pending') return (pendingRanks.get(a.id) ?? 0) - (pendingRanks.get(b.id) ?? 0);
      const aSortTime = a.status === 'completed' ? a.completedAt : a.dueAt;
      const bSortTime = b.status === 'completed' ? b.completedAt : b.dueAt;
      if (Boolean(aSortTime) !== Boolean(bSortTime)) return aSortTime ? -1 : 1;
      if (aSortTime && bSortTime) {
        const dayDifference = localDateKey(new Date(bSortTime)).localeCompare(localDateKey(new Date(aSortTime)));
        if (dayDifference) return dayDifference;
        const timeDifference = +new Date(aSortTime) - +new Date(bSortTime);
        if (timeDifference) return timeDifference;
      }
      if (a.status === 'inProgress') {
        const priorityDifference = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
        if (priorityDifference) return priorityDifference;
      }
      return b.index - a.index;
    });
  }, [missionTasks, pendingSort, tableQuery, tableStatus, tableType, tablePriority, tableDate, clock]);

  const calendarDays = useMemo(() => {
    const first = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    return Array.from({ length: 42 }, (_, index) => { const day = new Date(start); day.setDate(start.getDate() + index); return day; });
  }, [calendarMonth]);

  const pickerCalendarDays = useMemo(() => {
    const first = new Date(pickerMonth.getFullYear(), pickerMonth.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    return Array.from({ length: 42 }, (_, index) => { const day = new Date(start); day.setDate(start.getDate() + index); return day; });
  }, [pickerMonth]);

  const sleepPickerCalendarDays = useMemo(() => {
    const first = new Date(sleepPickerMonth.getFullYear(), sleepPickerMonth.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    return Array.from({ length: 42 }, (_, index) => { const day = new Date(start); day.setDate(start.getDate() + index); return day; });
  }, [sleepPickerMonth]);

  const choiceOptions = useMemo(() => {
    if (!choiceField) return [] as { value: string; label: string; color?: TypeColor }[];
    if (choiceField === 'status') return [{ value: 'pending', label: 'PENDING · 等待行动' }, { value: 'inProgress', label: 'IN PROGRESS · 正在攻略' }, { value: 'completed', label: 'COMPLETED · 今日战果' }];
    if (choiceField === 'priority') return [{ value: 'must', label: 'MUST · 必须完成' }, { value: 'high', label: 'HIGH · 高优先级' }, { value: 'medium', label: 'MID · 中优先级' }, { value: 'low', label: 'LOW · 低优先级' }];
    if (choiceField === 'taskType') return sortedTaskTypes(settings.taskTypes).map((item) => ({ value: item.value, label: item.value, color: item.color }));
    if (choiceField === 'location') return settings.locations.map((item) => ({ value: item.value, label: item.value }));
    return [{ value: 'none', label: '不循环' }, { value: 'daily', label: '每天' }, { value: 'weekdays', label: '工作日' }, { value: 'weekly', label: '每周' }];
  }, [choiceField, settings]);

  const moveTask = (id: string, status: Status) => {
    const task = tasks.find((item) => item.id === id);
    if (!task || task.status === status) { setDraggingId(''); setDropTarget(''); return; }
    setTasks((current) => {
      const moving = current.find((item) => item.id === id);
      if (!moving) return current;
      const targetTasks = sortTasks(current.filter((item) => !item.isRecurrenceTemplate && item.status === status), status);
      const transitioned = transitionTask(moving, status);
      const manualTarget = status === 'pending' || targetTasks.some((item) => item.manualOrder !== null);
      if (!manualTarget || status === 'completed') return current.map((item) => item.id === id ? transitioned : item);
      const order = [transitioned, ...targetTasks];
      const ranks = new Map(order.map((item, index) => [item.id, index]));
      return current.map((item) => item.id === id ? { ...transitioned, manualOrder: 0 } : item.status === status ? { ...item, manualOrder: ranks.get(item.id) ?? null } : item);
    });
    setLandedId(id);
    setImpact(status === 'completed' ? { title: 'MISSION CLEAR!', subtitle: '任务完成 · 战果已记录', tier: 'action' } : status === 'inProgress' ? { title: 'MISSION START!', subtitle: '开始时间已自动记录', tier: 'action' } : { title: 'MISSION RESET', subtitle: '任务已返回等待区', tier: 'action' });
    setDropTarget('');
    setDraggingId('');
  };

  const reorderWithin = (status: Status, draggedId: string, targetId: string) => {
    if (status === 'completed' || (status === 'pending' && pendingSort !== 'custom') || draggedId === targetId) return;
    setTasks((current) => {
      const ordered = sortTasks(current.filter((task) => !task.isRecurrenceTemplate && task.status === status), status);
      const from = ordered.findIndex((task) => task.id === draggedId);
      const to = ordered.findIndex((task) => task.id === targetId);
      if (from < 0 || to < 0) return current;
      const [moved] = ordered.splice(from, 1);
      ordered.splice(to, 0, moved);
      const ranks = new Map(ordered.map((task, index) => [task.id, index]));
      return current.map((task) => task.status === status ? { ...task, manualOrder: ranks.get(task.id) ?? null } : task);
    });
    setLandedId(draggedId);
    setImpact({ title: 'ORDER LOCKED!', subtitle: '自定义任务顺序已保存' });
    setDraggingId('');
    setDropTarget('');
  };

  const reorderRepeaters = (draggedId: string, targetId: string) => {
    if (draggedId === targetId) return;
    const ordered = [...activeRecurringTasks];
    const from = ordered.findIndex((task) => task.id === draggedId);
    const to = ordered.findIndex((task) => task.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = ordered.splice(from, 1);
    ordered.splice(to, 0, moved);
    const orderedSeries = ordered.map((task) => task.seriesId || task.id);
    const ranks = new Map(orderedSeries.map((seriesId, index) => [seriesId, index]));
    setTasks((current) => {
      return current.map((task) => task.isRecurrenceTemplate && task.recurrence !== 'none' ? { ...task, manualOrder: ranks.get(task.seriesId || task.id) ?? null } : task);
    });
    setSettings((current) => ({ ...current, recurrenceOrder: orderedSeries }));
  };

  const saveDraft = (event: FormEvent) => {
    event.preventDefault();
    if (!draft || !draft.title.trim()) return;
    setTasks((current) => {
      const existing = current.find((task) => task.id === draft.id);
      const titleOverride = Boolean(existing && !draft.isRecurrenceTemplate && existing.recurrence !== 'none' && draft.title.trim() !== existing.title.trim());
      let saved = existing && existing.status !== draft.status
        ? transitionTask({ ...draft, status: existing.status }, draft.status)
        : !existing && draft.status === 'inProgress' && !draft.startedAt
          ? transitionTask({ ...draft, status: 'pending' }, 'inProgress')
          : draft;
      const savedRecurrence = titleOverride ? 'none' : saved.recurrence;
      const recurrenceStartTime = savedRecurrence === 'none'
        ? ''
        : existing && !saved.isRecurrenceTemplate
          ? existing.recurrenceStartTime
          : saved.status === 'pending' && saved.startedAt
          ? localTimeKey(saved.startedAt)
          : saved.recurrenceStartTime || localTimeKey(saved.startedAt);
      saved = { ...saved, status: saved.isRecurrenceTemplate ? 'pending' : saved.status, completedAt: saved.isRecurrenceTemplate ? '' : saved.completedAt, recurrence: savedRecurrence, seriesHead: saved.isRecurrenceTemplate && savedRecurrence !== 'none', recurrenceDays: savedRecurrence === 'weekly' && !saved.recurrenceDays.length ? [new Date().getDay()] : saved.recurrenceDays, recurrenceStartTime };
      const enteringBoard = !existing || existing.status !== saved.status;
      const targetTasks = sortTasks(current.filter((task) => !task.isRecurrenceTemplate && task.status === saved.status && task.id !== saved.id), saved.status);
      const shouldInsertManually = !saved.isRecurrenceTemplate && saved.status !== 'completed' && enteringBoard && (saved.status === 'pending' || targetTasks.some((task) => task.manualOrder !== null));
      let nextTasks: Task[];
      if (shouldInsertManually) {
        const order = [saved, ...targetTasks];
        const ranks = new Map(order.map((task, index) => [task.id, index]));
        const updated = current.map((task) => task.id === saved.id ? { ...saved, manualOrder: 0 } : !task.isRecurrenceTemplate && task.status === saved.status ? { ...task, manualOrder: ranks.get(task.id) ?? null } : task);
        nextTasks = existing ? updated : [...updated, { ...saved, manualOrder: 0 }];
      } else {
        nextTasks = existing ? current.map((task) => task.id === draft.id ? saved : task) : [...current, saved];
      }
      if (saved.isRecurrenceTemplate && saved.recurrence === 'none') nextTasks = nextTasks.map((task) => task.seriesId === saved.seriesId && !task.isRecurrenceTemplate ? { ...task, recurrence: 'none', recurrenceStartTime: '', seriesHead: false } : task);
      return saved.isRecurrenceTemplate ? processRecurring(nextTasks, settings.recurrenceEnabled) : ensureRecurrenceTemplates(nextTasks);
    });
    setDraft(null);
    setToast(draft.isRecurrenceTemplate ? '循环模板已保存' : '任务已保存');
  };

  const deleteDraft = async () => {
    if (!draft || !tasks.some((task) => task.id === draft.id)) return;
    if (!draft.isRecurrenceTemplate) {
      try {
        setTaskDeletionEvents(await recordTaskDeletionEvent(draft));
      } catch (error) {
        setToast(error instanceof Error ? error.message : '任务取消留痕失败');
        return;
      }
    }
    setTasks((current) => draft.isRecurrenceTemplate
      ? current.filter((task) => task.id !== draft.id).map((task) => task.seriesId === draft.seriesId ? { ...task, recurrence: 'none', recurrenceStartTime: '', seriesHead: false } : task)
      : current.filter((task) => task.id !== draft.id));
    setDraft(null);
    setToast(draft.isRecurrenceTemplate ? '循环模板已删除' : '任务已删除');
  };
  const removeCancellationEvent = async (id: number) => {
    try {
      setTaskDeletionEvents(await removeTaskDeletionEvent(id));
      setToast('取消留痕已移除');
    } catch (error) {
      setToast(error instanceof Error ? error.message : '取消留痕移除失败');
    }
  };

  const openNewTask = (status: Status = 'pending', dueAt = '') => setDraft({ ...newTask(settings, tasks.reduce((max, task) => Math.max(max, task.index), 0) + 1), status, dueAt });
  const openNewRecurringTask = () => setDraft({ ...newTask(settings, tasks.reduce((max, task) => Math.max(max, task.index), 0) + 1), recurrence: 'daily', recurrenceDays: [new Date().getDay()], isRecurrenceTemplate: true, seriesHead: true, lastGeneratedDate: '' });
  const stopRecurringTask = (seriesId: string) => {
    setTasks((current) => current.map((task) => task.seriesId === seriesId ? { ...task, recurrence: 'none', recurrenceStartTime: '', seriesHead: false } : task));
    setToast('循环任务已关闭');
  };

  const openDatePicker = (field: DateFieldName) => {
    if (!draft) return;
    const value = draft[field] ? new Date(draft[field]) : new Date();
    setPickerDate(localDateKey(value));
    setPickerTime(`${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`);
    setPickerMonth(new Date(value.getFullYear(), value.getMonth(), 1));
    setDateField(field);
  };

  const applyDatePicker = () => {
    if (!draft || !dateField || !pickerDate || !pickerTime) return;
    setDraft({ ...draft, [dateField]: new Date(`${pickerDate}T${pickerTime}`).toISOString() });
    setDateField(null);
  };

  const selectChoice = (value: string) => {
    if (!draft || !choiceField) return;
    if (choiceField === 'status') setDraft({ ...draft, status: value as Status });
    if (choiceField === 'priority') setDraft({ ...draft, priority: value as Priority });
    if (choiceField === 'taskType') setDraft({ ...draft, taskType: value });
    if (choiceField === 'location') setDraft({ ...draft, location: value });
    if (choiceField === 'recurrence') setDraft({ ...draft, recurrence: value as Recurrence, recurrenceDays: value === 'weekly' && !draft.recurrenceDays.length ? [new Date().getDay()] : draft.recurrenceDays, seriesHead: value !== 'none' });
    setChoiceField(null);
  };

  const choiceValue = draft && choiceField ? (choiceField === 'status' ? draft.status : choiceField === 'priority' ? draft.priority : choiceField === 'taskType' ? draft.taskType : choiceField === 'location' ? draft.location : draft.recurrence) : '';
  const [pickerHour = 0, pickerMinute = 0] = pickerTime ? pickerTime.split(':').map(Number) : [0, 0];
  const [sleepPickerHour = 0, sleepPickerMinute = 0] = sleepPickerTime ? sleepPickerTime.split(':').map(Number) : [0, 0];
  const closeMenu = () => {
    if (!menuOpen) return;
    setMenuOpen(false);
    setMenuClosing(true);
    window.setTimeout(() => setMenuClosing(false), 800);
  };
  const submitSleepRecord = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const startedAt = new Date(sleepStartedAt);
    const awakenedAt = new Date(wakeAt);
    if (Number.isNaN(startedAt.getTime()) || Number.isNaN(awakenedAt.getTime()) || awakenedAt <= startedAt) {
      setToast('WAKE TIME REQUIRED · 醒来时间必须晚于入睡时间');
      return;
    }
    setSleepSubmitting(true);
    try {
      const records = await createSleepRecord({ id: crypto.randomUUID(), sleepStartedAt: startedAt.toISOString(), wakeAt: awakenedAt.toISOString() });
      setSleepRecords(records);
      setToast('NIGHT LOG SAVED · 夜间状态已归档');
    } catch (error) {
      setToast(error instanceof Error ? error.message : '睡眠档案保存失败');
    } finally {
      setSleepSubmitting(false);
    }
  };
  const deleteSleepRecord = async (id: string) => {
    try {
      setSleepRecords(await removeSleepRecord(id));
      setToast('RECORD REMOVED · 睡眠记录已移除');
    } catch (error) {
      setToast(error instanceof Error ? error.message : '睡眠档案删除失败');
    }
  };
  const openSleepPicker = (field: 'sleepStartedAt' | 'wakeAt') => {
    const value = field === 'sleepStartedAt' ? sleepStartedAt : wakeAt;
    const [date = localDateKey(new Date()), time = '00:00'] = value.split('T');
    const selectedDate = new Date(`${date}T${time}`);
    setSleepPickerDate(date);
    setSleepPickerTime(time);
    setSleepPickerMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
    setSleepPickerField(field);
  };
  const applySleepPicker = () => {
    if (!sleepPickerField || !sleepPickerDate || !sleepPickerTime) return;
    const value = `${sleepPickerDate}T${sleepPickerTime}`;
    if (sleepPickerField === 'sleepStartedAt') setSleepStartedAt(value);
    else setWakeAt(value);
    setSleepPickerField(null);
  };
  const saveWorkshopType = (event: FormEvent) => {
    event.preventDefault();
    const value = customType.trim();
    if (!value || value === RETIRED_ROUTINE_TYPE) {
      setToast('请输入可用的任务类型名称');
      return;
    }
    const existingType = settings.taskTypes.find((item) => item.value === value);
    if (existingType) {
      setSettings((current) => ({
        ...current,
        taskTypes: sortedTaskTypes(current.taskTypes.map((item) => item.value === existingType.value ? { ...item, color: customTypeColor } : item)),
      }));
      setToast('任务类型颜色已调整');
      return;
    }
    setSettings((current) => ({ ...current, taskTypes: sortedTaskTypes([...current.taskTypes, { value, color: customTypeColor, custom: true }]) }));
    setCustomType('');
    setToast('任务类型已添加');
  };
  const saveWorkshopLocation = (event: FormEvent) => {
    event.preventDefault();
    const value = customLocation.trim();
    if (!value) {
      setToast('请输入可用的地点名称');
      return;
    }
    if (selectedWorkshopLocation) {
      if (value !== selectedWorkshopLocation && settings.locations.some((item) => item.value === value)) {
        setToast('该地点已经存在');
        return;
      }
      setTasks((current) => current.map((task) => (
        task.location === selectedWorkshopLocation ? { ...task, location: value } : task
      )));
      setSettings((current) => ({
        ...current,
        locations: current.locations.map((item) => (
          item.value === selectedWorkshopLocation ? { ...item, value } : item
        )),
        defaultLocation: current.defaultLocation === selectedWorkshopLocation ? value : current.defaultLocation,
      }));
      setSelectedWorkshopLocation(value);
      setCustomLocation(value);
      setToast('地点已调整');
      return;
    }
    if (settings.locations.some((item) => item.value === value)) {
      setToast('该地点已经存在');
      return;
    }
    setSettings((current) => ({ ...current, locations: [...current.locations, { value, custom: true }] }));
    setCustomLocation('');
    setSelectedWorkshopLocation('');
    setToast('地点已添加');
  };
  const navigateTo = (nextView: View, onArrive?: () => void, discardApproved = false) => {
    if (nextView !== view && signalDirty && !discardApproved) { setPendingSignalView(nextView); return; }
    setDayAgendaOpen(false);
    setDraft(null);
    setChoiceField(null);
    setDateField(null);
    if (nextView === view) { closeMenu(); onArrive?.(); return; }
    const currentIndex = navItems.findIndex((item) => item.id === view);
    const nextIndex = navItems.findIndex((item) => item.id === nextView);
    setPageDirection(nextIndex > currentIndex ? 'forward' : 'backward');
    setPageMotion('exit');
    closeMenu();
    window.setTimeout(() => {
      setView(nextView);
      setPageMotion('enter');
      onArrive?.();
      window.setTimeout(() => setPageMotion('idle'), 520);
    }, 420);
  };
  const openCalendarDay = (dayKey: string) => {
    const [year, month] = dayKey.split('-').map(Number);
    setCalendarMonth(new Date(year, month - 1, 1));
    setSelectedDay(dayKey);
    setLinkedScheduleTaskId('');
    navigateTo('calendar', () => setDayAgendaOpen(true));
  };
  const openCancellationLog = () => {
    navigateTo('settings', () => window.setTimeout(() => document.querySelector('.cancellation-log-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80));
  };
  const now = clock;
  const todayActionTasks = missionTasks.filter((task) => taskOccursInActionDay(task, localDateKey(now), now));
  const dashboardTasks: DashboardTask[] = missionTasks.map((task) => ({
    id: task.id,
    title: task.title,
    status: task.status,
    taskType: task.taskType,
    priority: task.priority,
    startedAt: task.startedAt,
    completedAt: task.completedAt,
    dueAt: task.dueAt,
    tone: typeColor(task.taskType, settings),
  }));
  const completedToday = todayActionTasks.filter((task) => task.completedAt && localDateKey(new Date(task.completedAt)) === localDateKey(now)).length;
  const selectedDayTasks = missionTasks.filter((task) => taskOccursInActionDay(task, selectedDay, now)).sort((a, b) => +new Date(calendarTaskDate(a, now)) - +new Date(calendarTaskDate(b, now)));
  const dayScheduleBlocks = useMemo(() => layoutDaySchedule(selectedDayTasks, selectedDay, now), [selectedDayTasks, selectedDay, now]);
  const dayTimelineEntries = useMemo(() => selectedDayTasks.flatMap((task) => {
    const window = taskWindowOnDay(task, selectedDay, now);
    return window ? [{ task, ...window, displayStartMinute: actionDayMinute(window.startMinute) }] : [];
  }).sort((a, b) => a.displayStartMinute - b.displayStartMinute), [selectedDayTasks, selectedDay, now]);
  const linkScheduleMapTask = (taskId: string) => {
    setLinkedScheduleTaskId(taskId);
    const timeline = scheduleTimelineRef.current;
    const entry = Array.from(timeline?.querySelectorAll<HTMLButtonElement>('button[data-schedule-task-id]') ?? [])
      .find((item) => item.dataset.scheduleTaskId === taskId);
    entry?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
  };
  const activeNav = navItems.find((item) => item.id === view)!;
  const activeCountdowns = missionTasks.flatMap((task) => countdownSignals(task, now)).sort(compareCountdownSignals);
  const visibleCountdowns = activeCountdowns.slice(0, 2);
  const sleepSummary = useMemo(() => {
    const latest = sleepRecords[0] ?? null;
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const currentMonth = sleepRecords.filter((record) => new Date(record.wakeAt).getTime() >= monthStart);
    const averageFor = (records: SleepRecord[]) => records.length
      ? Math.round(records.reduce((total, record) => total + (new Date(record.wakeAt).getTime() - new Date(record.sleepStartedAt).getTime()) / 60_000, 0) / records.length)
      : 0;
    return {
      latest,
      currentMonthCount: currentMonth.length,
      currentMonthAverageMinutes: averageFor(currentMonth),
      currentMonthLabel: `${new Intl.DateTimeFormat('en-US', { month: 'short' }).format(now).toUpperCase()} AVG`,
      overallAverageMinutes: averageFor(sleepRecords),
    };
  }, [sleepRecords, now]);
  const sleepTimelineRecords = useMemo(() => [...sleepRecords].sort((first, second) => new Date(second.wakeAt).getTime() - new Date(first.wakeAt).getTime()), [sleepRecords]);
  const sleepDistributionAverage = useMemo(() => ({
    sleep: circularMeanTime(sleepTimelineRecords, (record) => record.sleepStartedAt),
    wake: circularMeanTime(sleepTimelineRecords, (record) => record.wakeAt),
  }), [sleepTimelineRecords]);
  const displayedSleepTimelineRecords = sleepDisplayMode === 'standard' && !sleepStandardExpanded
    ? sleepTimelineRecords.slice(0, SLEEP_STANDARD_LIMIT)
    : sleepTimelineRecords;
  const sleepDistributionStyle = {
    '--mean-sleep': `${(sleepDistributionAverage.sleep ?? 0) / (24 * 60) * 100}%`,
    '--mean-wake': `${(sleepDistributionAverage.wake ?? 0) / (24 * 60) * 100}%`,
  } as CSSProperties;

  if (storageError) return <main className="app-shell boot-screen"><div className="boot-mark database-fault"><span>DATABASE OFFLINE</span><strong>LOCAL DATA<br />LINK LOST</strong><p>{storageError}</p><button type="button" onClick={() => { setStorageError(''); setLoadAttempt((current) => current + 1); }}>RETRY CONNECTION / 重试</button></div></main>;
  if (!viewRestored) return <main className="app-shell boot-screen boot-prime" aria-label="正在准备界面" />;
  if (introVisible) return <main className="app-shell opening-sequence" aria-label="Sword Art Online 启动画面">
    <div className="opening-broadcast" aria-hidden="true"><span className="opening-antenna" /><span className="opening-screen"><i /><b>CH 04</b></span><span className="opening-controls"><i /><i /><b /></span></div>
    <div className="opening-rays" aria-hidden="true" />
    <section className="opening-copy">
      <span>MIDNIGHT OPERATIONS NETWORK</span>
      <strong>SWORD ART<br /><em>ONLINE</em></strong>
      <p>DAILY MISSION SIGNAL · 本地作战频道</p>
      <div className="opening-load"><i style={{ width: `${introProgress}%` }} /></div>
      <small>{introProgress === 100 ? 'SIGNAL LOCKED · READY' : hydrated ? 'CALIBRATING CHANNEL' : 'LINKING LOCAL DATABASE'} <b>{String(introProgress).padStart(3, '0')}%</b></small>
    </section>
  </main>;
  if (!hydrated) return <main className="app-shell boot-screen boot-prime" aria-label={`正在恢复 ${activeNav.title} 页面`} />;

  return <main className={`app-shell view-${view} theme-${theme} page-motion-${pageMotion} page-direction-${pageDirection}`}>
    <div className="tv-noise" aria-hidden="true" />
    <div className="persona-fx" aria-hidden="true"><div className="background-tv"><span className="background-tv-antenna" /><span className="background-tv-screen"><i /><b>04</b></span><span className="background-tv-controls"><i /><i /><b /></span></div><span className="fx-rainbow" /><span className="fx-dots" /><strong>MOVE! / TRUTH / NOW!</strong></div>
    <button className={`menu-trigger ${menuOpen ? 'is-open' : ''}`} onClick={() => { if (menuOpen) closeMenu(); else { setMenuClosing(false); setMenuOpen(true); } }} aria-label={menuOpen ? '关闭主菜单' : '打开主菜单'}><span /><span /><span /><strong>MENU</strong></button>

    <aside className={`game-menu ${menuOpen ? 'is-open' : ''} ${menuClosing ? 'is-closing' : ''}`} aria-hidden={!menuOpen} data-active-title={activeNav.title}>
      <div className="menu-backdrop" aria-hidden="true"><span className="menu-rings" /><span className="menu-spectrum" /><span className="menu-stars"><i /><i /><i /></span></div>
      <button className="menu-close" onClick={closeMenu}>×</button>
      <div className="menu-title"><span>MAIN MENU</span><strong>SELECT<br />YOUR MOVE</strong></div>
      <nav>{navItems.map((item) => <button key={item.id} className={view === item.id ? 'active' : ''} aria-current={view === item.id ? 'page' : undefined} onClick={() => navigateTo(item.id)}><strong>{item.title}</strong></button>)}</nav>
      <footer>SWORD ART ONLINE · {settings.username}</footer>
      <button
        className={`theme-toggle theme-toggle-${theme}`}
        aria-label={theme === 'day' ? '切换到夜间模式' : '切换到白天模式'}
        onClick={() => setTheme((current) => current === 'day' ? 'night' : 'day')}
      >
        <span className="menu-theme-switch" aria-hidden="true">
          <span className="menu-theme-icon menu-theme-icon-day"><i /><b /></span>
          <span className="menu-theme-icon menu-theme-icon-night"><i /><b /></span>
        </span>
      </button>
    </aside>
    {(menuOpen || menuClosing) && <button className={`menu-scrim ${menuClosing ? 'is-closing' : ''}`} aria-label="关闭菜单" onClick={closeMenu} />}

    <div className="app-frame">
    <header className="hero">
      <BrandLockup sectionTitle={activeNav.title} sectionSubtitle={activeNav.subtitle} username={settings.username} />
      <div className="day-card" aria-label="今日日期"><span>{new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(now).toUpperCase()}</span><strong>{String(now.getDate()).padStart(2, '0')}</strong><em>{new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(now).toUpperCase()}</em></div>
      <div className="mission-summary"><span>TODAY&apos;S CLEAR</span><strong>{completedToday}<small> / {todayActionTasks.length}</small></strong><div className="summary-track"><i style={{ width: `${todayActionTasks.length ? Math.min(100, completedToday / todayActionTasks.length * 100) : 0}%` }} /></div></div>
      {view !== 'settings' && view !== 'sleep' && view !== 'signals' && <button className="add-task" onClick={() => openNewTask()}><span>＋</span><strong>NEW MISSION</strong><small>添加任务</small></button>}
    </header>

    {view === 'signals' && <SignalRoom signals={signals} taskTypes={settings.taskTypes.map((item) => item.value)} onDirtyChange={setSignalDirty} />}
    {view === 'dashboard' && <GoalRadar signals={signals} today={localDateKey(now)} onOpen={() => navigateTo('signals')} />}

    {view === 'dashboard' && <LifeDashboard
      username={settings.username}
      now={now}
      tasks={dashboardTasks}
      sleepRecords={sleepRecords}
      deadlineEvents={deadlineEvents}
      taskDeletionEvents={taskDeletionEvents}
      campaignScale={dashboardScale}
      selectedPeriodId={dashboardPeriodId}
      onCampaignWindowChange={(nextScale, nextPeriodId) => {
        setDashboardScale(nextScale);
        setDashboardPeriodId(nextPeriodId);
      }}
      onNavigate={(nextView) => navigateTo(nextView)}
      onOpenCalendarDay={openCalendarDay}
      onOpenCancellationLog={openCancellationLog}
    />}

    {view === 'board' && <div className="board-control-rack">
      <button type="button" className="daily-flow-shortcut" onClick={() => { setSelectedDay(localDateKey(now)); setLinkedScheduleTaskId(''); setDayAgendaOpen(true); }}><i aria-hidden="true">▥</i><strong>DAILY FLOW</strong><small>今日战线</small></button>
      <div className="board-density-control" role="group" aria-label="任务卡片显示方式">
        <button type="button" aria-pressed={boardDensity === 'standard'} onClick={() => { setBoardDensity('standard'); setShowAll({ pending: false, inProgress: false, completed: false }); }}><i aria-hidden="true">▦</i><strong>STANDARD</strong><small>标准</small></button>
        <button type="button" aria-pressed={boardDensity === 'compact'} onClick={() => { setBoardDensity('compact'); setShowAll({ pending: false, inProgress: false, completed: false }); }}><i aria-hidden="true">≡</i><strong>COMPACT</strong><small>缩略</small></button>
      </div>
    </div>}

    {view === 'board' && visibleCountdowns.length > 0 && <section className={`countdown-hud-stack ${visibleCountdowns.length === 1 ? 'is-single' : ''}`} aria-label="当前任务倒计时">{visibleCountdowns.map((signal) => <article key={`${signal.task.id}-${signal.kind}`} className={`countdown-alert countdown-${signal.kind} urgency-${signal.urgency}`}><span><b>{signal.kind === 'start' ? '▶ START' : '⊘ TABOO'}</b><small>{countdownSignalLabel(signal)}</small></span><div><strong>{signal.task.title}</strong><small>{formatTime(signal.targetAt, false)} · {signal.kind === 'start' ? 'MOVE TO IN PROGRESS' : 'DEADLINE LOCK'}</small></div><time>{countdownText(signal.targetAt, now)}</time><button type="button" onClick={() => signal.kind === 'start' ? moveTask(signal.task.id, 'inProgress') : setDraft(signal.task)}>{signal.kind === 'start' ? '▶ START' : 'OPEN ›'}</button></article>)}{activeCountdowns.length > visibleCountdowns.length && <div className="countdown-overflow">＋{activeCountdowns.length - visibleCountdowns.length} MORE SIGNALS / 更多倒计时</div>}</section>}

    {view === 'board' && <section className={`board is-${boardDensity}`} aria-label={`${boardDensity === 'compact' ? '缩略' : '标准'}任务看板`}>{boardMeta.map((board) => {
      const boardTasks = grouped[board.id];
      const visible = showAll[board.id] ? boardTasks : boardTasks.slice(0, VISIBLE_LIMIT[boardDensity][board.id]);
      const hiddenCount = boardTasks.length - visible.length;
      return <section className={`board-column ${dropTarget === board.id ? 'is-target' : ''}`} key={board.id}
        onDragOver={(event) => { event.preventDefault(); setDropTarget(board.id); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropTarget(''); }}
        onDrop={(event) => { event.preventDefault(); if (draggingId) moveTask(draggingId, board.id); }}>
        <header className="column-header"><span className="column-index">{board.index}</span><div><div className="column-titleline"><h2>{board.title}</h2>{board.id === 'pending' && <div className="pending-sort" ref={pendingSortRef}><button type="button" className="column-sort-trigger" aria-haspopup="menu" aria-expanded={pendingSortOpen} onClick={() => setPendingSortOpen((open) => !open)}><span>SORT</span><strong>{pendingSortLabel(pendingSort)}</strong><i>⌄</i></button>{pendingSortOpen && <div className="pending-sort-menu" role="menu" aria-label="等待行动排序方式">{([['custom', '自定义顺序'], ['priority', '优先级'], ['start', '开始时间'], ['deadline', '截止时间']] as [PendingSort, string][]).map(([value, label], index) => <button key={value} type="button" role="menuitemradio" aria-checked={pendingSort === value} className={pendingSort === value ? 'active' : ''} onClick={() => { setPendingSort(value); setPendingSortOpen(false); }}><span>{String(index + 1).padStart(2, '0')}</span><strong>{label}</strong><i>{pendingSort === value ? '●' : '○'}</i></button>)}</div>}</div>}</div><p>{board.subtitle}</p></div><strong>{String(boardTasks.length).padStart(2, '0')}</strong></header>
        <div className="task-stack">{visible.map((task) => <TaskCard key={task.id} task={task} color={typeColor(task.taskType, settings)} now={now} dragging={draggingId === task.id} landed={landedId === task.id}
          onStart={() => moveTask(task.id, 'inProgress')}
          onOpen={() => setDraft(task)} onDragStart={(event) => { setDraggingId(task.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', task.id); }} onDragEnd={() => { setDraggingId(''); setDropTarget(''); }}
          onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); if (!draggingId) return; const source = tasks.find((item) => item.id === draggingId); if (source?.status === task.status) reorderWithin(task.status, draggingId, task.id); else moveTask(draggingId, task.status); }} />)}
          {boardTasks.length === 0 && <button className={`empty-state empty-state-${board.id}`} onClick={() => openNewTask(board.id)}><span aria-hidden="true">{board.id === 'pending' ? '?' : board.id === 'inProgress' ? '!' : '★'}</span><strong>{board.id === 'pending' ? 'NEXT QUEST?' : board.id === 'inProgress' ? 'READY TO ENGAGE' : 'CLEAR THE STAGE!'}</strong></button>}
        </div>
        {(hiddenCount > 0 || showAll[board.id]) && <button className="reveal-button" onClick={() => setShowAll((current) => ({ ...current, [board.id]: !current[board.id] }))}>{showAll[board.id] ? '收起任务 ↑' : `显示其余 ${hiddenCount} 个任务 ↓`}</button>}
        {board.id === 'completed' && missionTasks.some((task) => task.status === 'completed' && task.completedAt && localDateKey(new Date(task.completedAt)) !== localDateKey(now)) && <button className="history-button" onClick={() => { setShowCompletedHistory((current) => !current); setShowAll((current) => ({ ...current, completed: false })); }}>{showCompletedHistory ? '只看今天完成 ✓' : '查看过去完成记录 ↗'}</button>}
      </section>;
    })}</section>}

    {view === 'table' && <section className="archive-page">
      <header className="page-banner"><span>02</span><div><p>COMPLETE MISSION DATABASE</p><h2>MISSION ARCHIVE</h2></div><strong>{filteredTable.length} RECORDS</strong></header>
      <div className="filter-deck"><label className="search-filter"><span>⌕</span><input value={tableQuery} onChange={(e) => setTableQuery(e.target.value)} placeholder="搜索标题、描述、类型或地点…" /></label>
        <ArchiveFilterMenu label="STATUS" mark="◈" value={tableStatus} onChange={(value) => setTableStatus(value as Status | 'all')} options={[{ value: 'all', label: '全部状态 / ALL' }, { value: 'inProgress', label: 'IN PROGRESS / 进行中', tone: 'inProgress' }, { value: 'pending', label: 'PENDING / 待处理', tone: 'pending' }, { value: 'completed', label: 'COMPLETED / 已完成', tone: 'completed' }]} />
        <ArchiveFilterMenu label="TYPE" mark="▦" value={tableType} onChange={setTableType} options={[{ value: 'all', label: '全部类型 / ALL' }, ...sortedTaskTypes(settings.taskTypes).map((type) => ({ value: type.value, label: type.value, tone: type.color }))]} />
        <ArchiveFilterMenu label="PRIORITY" mark="!" value={tablePriority} onChange={(value) => setTablePriority(value as Priority | 'all')} options={[{ value: 'all', label: '全部优先级 / ALL' }, { value: 'must', label: 'MUST / 必须', tone: 'must' }, { value: 'high', label: 'HIGH / 高', tone: 'high' }, { value: 'medium', label: 'MID / 中', tone: 'medium' }, { value: 'low', label: 'LOW / 低', tone: 'low' }]} />
        <ArchiveDateFilter value={tableDate} onChange={setTableDate} />
      </div>
      <div className="archive-table-wrap"><table className="archive-table"><thead><tr><th>INDEX</th><th>任务名称</th><th>任务描述</th><th>状态</th><th>任务类型</th><th>优先级</th><th>截止时间</th><th>开始时间</th><th>完成时间</th><th>地点</th></tr></thead><tbody>{filteredTable.map((task, rowIndex) => <tr key={task.id} onClick={() => setDraft(task)}><td className="table-index">{rowIndex + 1}</td><td><strong>{task.title}</strong>{task.recurrence !== 'none' && <span className="table-repeat">↻</span>}</td><td className="description-data">{descriptionToText(task.description) || '—'}</td><td><span className={`status-chip status-${task.status}`}>{statusLabel(task.status)}</span></td><td><span className={`type-chip type-${typeColor(task.taskType, settings)}`}><i />{task.taskType}</span></td><td><span className={`priority-chip priority-${task.priority}`}>{task.priority === 'must' ? 'MUST' : task.priority.toUpperCase()}</span></td><td className="time-data">{formatTime(task.dueAt)}</td><td className="time-data">{formatTime(task.startedAt)}</td><td className="time-data">{formatTime(task.completedAt)}</td><td>{task.location}</td></tr>)}</tbody></table>{!filteredTable.length && <div className="no-results">NO MATCHING MISSIONS / 没有匹配任务</div>}</div>
      <p className="sort-note">INDEX 是当前筛选结果的行号；任务先按行动状态编组，各状态内部会依照对应的行动规则自动编队。</p>
    </section>}

    {view === 'calendar' && <section className="calendar-page">
      <header className="page-banner"><span>04</span><div><p>MONTHLY OPERATION MAP</p><h2>CALENDAR</h2></div><div className="month-nav"><button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}>‹</button><strong>{calendarMonth.getFullYear()} / {String(calendarMonth.getMonth() + 1).padStart(2, '0')}</strong><button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}>›</button></div></header>
      <div className="calendar-layout"><div className="month-grid"><div className="weekday-row">{WEEKDAYS.map((day) => <span key={day}>周{day}</span>)}</div><div className="calendar-grid">{calendarDays.map((day) => {
        const key = localDateKey(day); const dayTasks = missionTasks.filter((task) => taskOccursOnCalendarDay(task, key, now));
        return <button key={key} className={`calendar-day ${day.getMonth() !== calendarMonth.getMonth() ? 'outside' : ''} ${key === localDateKey(now) ? 'today' : ''} ${key === selectedDay ? 'selected' : ''}`} onClick={() => { setSelectedDay(key); setDayAgendaOpen(true); }}><span className="day-number">{day.getDate()}</span><div className="day-missions">{dayTasks.slice(0, 3).map((task) => <span key={task.id} className={`calendar-task type-${typeColor(task.taskType, settings)}`}>{task.title}</span>)}{dayTasks.length > 3 && <em>+{dayTasks.length - 3} MORE</em>}</div></button>;
      })}</div></div>
      </div>
    </section>}

    {view === 'sleep' && <section className="sleep-page sleep-rhythm-page">
      <header className="sleep-rhythm-hero">
        <div className="sleep-rhythm-index"><span>03</span><small>MIDNIGHT<br />CHANNEL</small></div>
        <div className="sleep-rhythm-title"><p>PERSONAL REST TELEMETRY · 睡眠节律档案</p><h2>REST<br /><em>RHYTHM</em></h2></div>
        <div className="sleep-rhythm-summary" aria-label="睡眠数据摘要">
          <article><span>LATEST REST</span><strong>{sleepSummary.latest ? formatSleepDuration(sleepSummary.latest.sleepStartedAt, sleepSummary.latest.wakeAt) : '—'}</strong><small>{sleepSummary.latest ? `${formatTime(sleepSummary.latest.sleepStartedAt, false)} → ${formatTime(sleepSummary.latest.wakeAt, false)}` : 'NO LOG ON FILE'}</small></article>
          <article><span>{sleepSummary.currentMonthLabel.toUpperCase()}</span><strong>{sleepSummary.currentMonthCount ? formatSleepMinutes(sleepSummary.currentMonthAverageMinutes) : '—'}</strong><small>{sleepSummary.currentMonthCount ? `${sleepSummary.currentMonthCount} NIGHTS LOGGED` : 'AWAITING DATA'}</small></article>
          <article><span>ALL-TIME AVG</span><strong>{sleepRecords.length ? formatSleepMinutes(sleepSummary.overallAverageMinutes) : '—'}</strong><small>{sleepRecords.length ? `${sleepRecords.length} RECORDS` : 'NO RECORDS'}</small></article>
        </div>
      </header>
      <div className="sleep-rhythm-workbench">
        <section className={`sleep-rhythm-map is-${sleepDisplayMode}`} aria-label="全量睡眠时段分布" style={sleepDistributionStyle}>
          <header><div><span>ARCHIVE VIEW / 全量记录</span><h3>SLEEP DISTRIBUTION</h3></div><div className="sleep-rhythm-map-controls"><p>{sleepTimelineRecords.length} RECORDS</p><div className="sleep-display-switch" aria-label="睡眠分布显示模式"><button type="button" className={sleepDisplayMode === 'standard' ? 'active' : ''} aria-pressed={sleepDisplayMode === 'standard'} onClick={() => setSleepDisplayMode('standard')}><i>▤</i><span>STANDARD</span></button><button type="button" className={sleepDisplayMode === 'compact' ? 'active' : ''} aria-pressed={sleepDisplayMode === 'compact'} onClick={() => setSleepDisplayMode('compact')}><i>▥</i><span>COMPACT</span></button></div></div></header>
          <div className="sleep-rhythm-legend"><span><i /> SLEEP WINDOW</span><span className="sleep-mean-key mean-sleep"><b /> AVG SLEEP <strong>{formatClockMinutes(sleepDistributionAverage.sleep)}</strong></span><span className="sleep-mean-key mean-wake"><b /> AVG WAKE <strong>{formatClockMinutes(sleepDistributionAverage.wake)}</strong></span><small>FULL ARCHIVE</small></div>
          <div className="sleep-rhythm-axis" aria-hidden="true"><strong>00</strong><span>03</span><span>06</span><span>09</span><span>12</span><span>15</span><span>18</span><span>21</span><span>24</span></div>
          {sleepLoading ? <div className="sleep-rhythm-empty">LINKING LOCAL REST ARCHIVE…</div> : sleepTimelineRecords.length ? <><div className="sleep-rhythm-list"><div className="sleep-rhythm-mean-layer" aria-hidden="true"><b className="mean-sleep" /><b className="mean-wake" /></div>{displayedSleepTimelineRecords.map((record) => {
            const sleepStart = new Date(record.sleepStartedAt);
            const wakeTime = new Date(record.wakeAt);
            const startedAt = sleepDayPosition(record.sleepStartedAt);
            const awakenedAt = sleepDayPosition(record.wakeAt);
            const crossesMidnight = localDateKey(sleepStart) !== localDateKey(wakeTime);
            const archiveDate = formatSleepArchiveDate(record.wakeAt);
            const duration = formatSleepDuration(record.sleepStartedAt, record.wakeAt);
            const signalLabel = `${formatSleepDateTime(record.sleepStartedAt)} 至 ${formatSleepDateTime(record.wakeAt)}，共 ${duration}`;
            return <article key={record.id} className="sleep-rhythm-row" aria-label={signalLabel}>
              <time className="sleep-rhythm-date" dateTime={record.wakeAt}><span>{archiveDate.month}</span><strong>{archiveDate.day}</strong><em>{archiveDate.weekday}</em></time>
              <div className="sleep-rhythm-window"><span><i>↓</i> {formatTime(record.sleepStartedAt, false)}</span><strong>{duration}</strong><span><i>↑</i> {formatTime(record.wakeAt, false)}</span></div>
              <div className="sleep-rhythm-track" aria-hidden="true">{crossesMidnight ? <><i className="sleep-rhythm-block" style={{ left: `${startedAt}%`, width: `${100 - startedAt}%` }} /><i className="sleep-rhythm-block is-continuation" style={{ left: 0, width: `${awakenedAt}%` }} /></> : <i className="sleep-rhythm-block" style={{ left: `${startedAt}%`, width: `${Math.max(0, awakenedAt - startedAt)}%` }} />}</div>
              <button type="button" className="sleep-rhythm-remove" onClick={() => void deleteSleepRecord(record.id)} aria-label={`删除 ${formatSleepDateTime(record.wakeAt)} 的睡眠记录`}>×<span>REMOVE</span></button>
            </article>;
          })}</div>{sleepDisplayMode === 'standard' && sleepTimelineRecords.length > SLEEP_STANDARD_LIMIT && <button type="button" className="sleep-rhythm-expand" aria-expanded={sleepStandardExpanded} onClick={() => setSleepStandardExpanded((expanded) => !expanded)}><span>{sleepStandardExpanded ? '收起较早记录' : `展开其余 ${sleepTimelineRecords.length - SLEEP_STANDARD_LIMIT} 晚`}</span><strong>{sleepStandardExpanded ? 'COLLAPSE ↑' : 'REVEAL ARCHIVE ↓'}</strong></button>}</> : <div className="sleep-rhythm-empty"><i>☾</i><strong>NO REST SIGNALS YET</strong><span>记录第一晚睡眠后，完整节律会显示在这里。</span></div>}
        </section>
        <aside className="sleep-rhythm-log">
          <header><span>LOG ENTRY</span><h3>LOG<br />REST</h3><p>记录入睡与醒来时间。</p></header>
          <form onSubmit={submitSleepRecord}>
            <button type="button" className="sleep-rhythm-picker sleep-start-trigger" onClick={() => openSleepPicker('sleepStartedAt')}><span>01 · SLEEP START</span><strong>{sleepStartedAt.slice(11)}</strong><small>{sleepStartedAt.slice(0, 10).replaceAll('-', ' / ')} · SET TIME</small></button>
            <button type="button" className="sleep-rhythm-picker wake-trigger" onClick={() => openSleepPicker('wakeAt')}><span>02 · WAKE SIGNAL</span><strong>{wakeAt.slice(11)}</strong><small>{wakeAt.slice(0, 10).replaceAll('-', ' / ')} · SET TIME</small></button>
            <div className="sleep-rhythm-draft"><span>CURRENT WINDOW</span><strong>{formatSleepDuration(sleepStartedAt, wakeAt)}</strong></div>
            <button className="sleep-rhythm-submit" type="submit" disabled={sleepSubmitting}>{sleepSubmitting ? 'SAVING SIGNAL…' : 'ARCHIVE REST SIGNAL →'}</button>
          </form>
        </aside>
      </div>
    </section>}

    {view === 'settings' && <section className="settings-page">
      <header className="page-banner"><span>06</span><div><p>PERSONAL OPERATION RULES</p><h2>DESIGN</h2></div><strong>AUTO-SAVED</strong></header>
      <div className="settings-grid"><section className="settings-panel profile-panel"><header><span>00</span><div><h3>PLAYER IDENTITY</h3><p>同步更新标题上方与主菜单中的用户名</p></div></header><div className="profile-console"><div className="profile-badge"><span>ACTIVE PLAYER</span><strong>{settings.username}</strong><small>SWORD ART ONLINE · LOCAL PROFILE</small></div><label><span>USERNAME / 用户名</span><input maxLength={32} value={settings.username} onChange={(event) => setSettings({ ...settings, username: event.target.value })} onBlur={() => setSettings((current) => ({ ...current, username: current.username.trim() || DEFAULT_SETTINGS.username }))} placeholder="输入用户名" /><small>最多 32 个字符，修改后自动保存到本地 SQLite。</small></label></div></section><section className="settings-panel loadout-studio"><header><span>01</span><div><h3>NEW MISSION DEFAULTS</h3><p>只决定新建任务时自动填入的内容</p></div></header><div className="loadout-console"><div className={`loadout-preview type-${typeColor(settings.defaultTaskType, settings)}`}><span>PREVIEW</span><strong>下一项新任务</strong><p>{settings.defaultTaskType}</p><small>{settings.defaultLocation} · 中优先级</small></div><div className="loadout-controls"><label><span>TASK TYPE / 默认类型</span><SignalSelect value={settings.defaultTaskType} label="TASK TYPE / 默认类型" mark="◈" options={sortedTaskTypes(settings.taskTypes).map((type) => ({ value: type.value, label: type.value, tone: type.color }))} onChange={(defaultTaskType) => setSettings((current) => ({ ...current, defaultTaskType }))} /></label><label><span>LOCATION / 默认地点</span><SignalSelect value={settings.defaultLocation} label="LOCATION / 默认地点" mark="⌖" options={settings.locations.map((location) => ({ value: location.value, label: location.value }))} onChange={(defaultLocation) => setSettings((current) => ({ ...current, defaultLocation }))} /></label><p>优先级不设默认偏好，新任务统一从“中”开始，随后可在任务详情里调整。</p></div></div></section>
        <section className="settings-panel custom-panel">
          <header><span>02</span><div><h3>OPTION WORKSHOP</h3><p>输入新项目，或从候选项调整任务类型和地点</p></div></header>
          <div className="workshop-body">
            <form onSubmit={saveWorkshopType}>
              <label><span>任务类型</span><WorkshopCombobox value={customType} options={sortedTaskTypes(settings.taskTypes).map((type) => ({ value: type.value, label: type.value, tone: type.color }))} onChange={(value) => { setCustomType(value); const existingType = settings.taskTypes.find((type) => type.value === value.trim()); if (existingType) setCustomTypeColor(existingType.color); }} onOptionSelect={(value) => { const existingType = settings.taskTypes.find((type) => type.value === value); if (existingType) setCustomTypeColor(existingType.color); }} placeholder="输入新类型，或搜索现有类型" /></label>
              <div className="color-choices">{(['purple', 'blue', 'green', 'yellow'] as TypeColor[]).map((color) => <button type="button" aria-label={color} className={`${color} ${customTypeColor === color ? 'active' : ''}`} key={color} onClick={() => setCustomTypeColor(color)} />)}</div>
              <button className="settings-add" disabled={!customType.trim()}>{settings.taskTypes.some((type) => type.value === customType.trim()) ? '保存调整' : '＋ 添加类型'}</button>
            </form>
            <form onSubmit={saveWorkshopLocation}>
              <label><span>地点</span><WorkshopCombobox value={customLocation} options={settings.locations.map((location) => ({ value: location.value, label: location.value }))} onChange={(value) => { setCustomLocation(value); if (!value.trim()) setSelectedWorkshopLocation(''); }} onOptionSelect={setSelectedWorkshopLocation} placeholder="输入新地点，或搜索现有地点" /></label>
              <button className="settings-add" disabled={!customLocation.trim() || (!selectedWorkshopLocation && settings.locations.some((location) => location.value === customLocation.trim()))}>{selectedWorkshopLocation ? '保存调整' : settings.locations.some((location) => location.value === customLocation.trim()) ? '地点已存在' : '＋ 添加地点'}</button>
            </form>
          </div>
        </section>
        <section className="settings-panel recurrence-control-panel">
          <header><span>03</span><div><h3>REPEAT CONTROL</h3><p>循环任务的总控与活动队列</p></div><strong>{activeRecurringTasks.length} ACTIVE</strong></header>
          <div className="repeat-control-grid">
            <section className="repeat-master-card">
              <span>MASTER CONTROL / 总开关</span>
              <label className="recurrence-switch"><input type="checkbox" checked={settings.recurrenceEnabled} onChange={(event) => setSettings({ ...settings, recurrenceEnabled: event.target.checked })} /><span><i /></span><strong>{settings.recurrenceEnabled ? 'AUTO-GENERATE ON' : 'AUTO-GENERATE PAUSED'}</strong></label>
              <p>{settings.recurrenceEnabled ? '系统会根据每个循环任务自己的规则生成下一项 Pending 任务。' : '自动生成已暂停；已有循环规则仍保留，可继续编辑或单独关闭。'}</p>
              <small>新任务默认不循环。需要循环时，请在任务详情的 Repeat / 循环中单独设置。</small>
            </section>
            <section className="repeat-roster">
              <header><div><span>ACTIVE REPEATERS</span><strong>{activeRecurringTasks.length} 个循环任务</strong></div><div className="repeat-roster-actions"><button type="button" className="add-repeater" onClick={openNewRecurringTask}>＋ 添加循环任务</button>{activeRecurringTasks.length > 0 && <button type="button" className="toggle-repeaters" aria-expanded={repeatersExpanded} aria-controls="active-repeaters-list" onClick={() => setRepeatersExpanded((current) => !current)}>{repeatersExpanded ? '收起 ↑' : '展开 ↓'}</button>}</div></header>
              {repeatersExpanded && (activeRecurringTasks.length ? <div className="recurrence-series-list" id="active-repeaters-list">{activeRecurringTasks.map((task) => <article key={task.id} draggable className={`recurrence-series-item status-pending ${repeaterDraggingId === task.id ? 'is-dragging' : ''}`} onDragStart={(event) => { setRepeaterDraggingId(task.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', task.id); }} onDragEnd={() => setRepeaterDraggingId('')} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (repeaterDraggingId) reorderRepeaters(repeaterDraggingId, task.id); setRepeaterDraggingId(''); }}><span className="repeat-drag-handle" aria-hidden="true">⠿</span><i aria-hidden="true">↻</i><div><strong>{task.title}</strong><span>{recurrenceLabel(task)} · 模板 {task.startedAt ? formatTime(task.startedAt, false) : '未设置开始'} → {task.dueAt ? formatTime(task.dueAt, false) : '未设置截止'}</span></div><button type="button" onClick={() => setDraft(task)}>编辑模板</button><button type="button" className="stop-repeat" onClick={() => stopRecurringTask(task.seriesId)}>关闭循环</button></article>)}</div> : <div className="recurrence-empty"><strong>NO ACTIVE LOOPS</strong><span>尚无循环任务。创建后会在这里持续显示。</span></div>)}
            </section>
          </div>
        </section>
        <section className="settings-panel cancellation-log-panel">
          <header><span>04</span><div><h3>CANCELLATION LOG</h3><p>首页取消统计的数据来源与手动清理入口</p></div><strong>{taskDeletionEvents.length} EVENTS</strong></header>
          <div className="cancellation-log-body">
            <div className="cancellation-log-rule"><span>AUDIT RULE</span><strong>删除普通任务或循环实例时记录；删除循环模板不计入取消。</strong><small>移除留痕只影响统计，不会恢复原任务。</small></div>
            {visibleCancellationEvents.length ? <div className="cancellation-event-list">{visibleCancellationEvents.map((event, index) => {
              const missionMoment = event.dueAt || event.startedAt || event.completedAt;
              return <article key={event.id}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <div><strong>{event.title}</strong><small>{event.taskType} · {statusLabel(event.status)} · 原任务 {missionMoment ? formatTime(missionMoment) : '无日期'}</small></div>
                <time>{formatTime(event.deletedAt)}<small>DELETED</small></time>
                <button type="button" onClick={() => void removeCancellationEvent(event.id)} aria-label={`移除 ${event.title} 的取消留痕`}>×<span>REMOVE</span></button>
              </article>;
            })}</div> : <div className="cancellation-log-empty"><strong>NO CANCELLATION EVENTS</strong><span>删除任务后，取消留痕会出现在这里。</span></div>}
            {taskDeletionEvents.length > CANCELLATION_LOG_LIMIT && <button type="button" className="cancellation-log-toggle" aria-expanded={cancellationLogExpanded} onClick={() => setCancellationLogExpanded((current) => !current)}>{cancellationLogExpanded ? '收起记录 ↑' : `显示其余 ${taskDeletionEvents.length - CANCELLATION_LOG_LIMIT} 条 ↓`}</button>}
          </div>
        </section>
      </div>
    </section>}

    <footer className="app-footer"><span>{activeNav.title}</span><i /><span>自动时间戳已开启</span><i /><span>本机自动保存</span></footer>
    </div>

    <SignalTicker signals={signals} />
    {pendingSignalView && <DiscardSignalDialog onKeep={() => setPendingSignalView(null)} onDiscard={() => { setSignalDirty(false); navigateTo(pendingSignalView, undefined, true); setPendingSignalView(null); }} />}

    {impact && <div className={`impact-feedback impact-${impact.tier ?? 'action'}`}><div className="impact-rays" /><span>{impact.title}</span><strong>{impact.subtitle}</strong></div>}

    {dayAgendaOpen && <div className="modal-backdrop day-schedule-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setDayAgendaOpen(false); }}>
      <section className="day-schedule-modal" role="dialog" aria-modal="true" aria-labelledby="day-schedule-title">
        <header><div><span>SCHOOL LIFE / DAILY FLOW</span><h2 id="day-schedule-title">{selectedDay.replaceAll('-', ' / ')}</h2><p>{selectedDayTasks.length} MISSIONS · 今天如何度过？</p></div><button type="button" className="close-button" aria-label="关闭 DAILY FLOW" onClick={() => setDayAgendaOpen(false)}>×</button></header>
        <div className="day-schedule-body"><section className="schedule-map"><header><span>TIME DISTRIBUTION</span><strong>全天任务分布</strong></header><div className="schedule-stage">
          <div className="schedule-hours"><span>02</span><span>07</span><span>12</span><span>18</span><span>00</span><span>02</span><b>OFF<br />02—07</b></div>
          <div className="schedule-lanes">
            <div className="schedule-off-zone schedule-off-zone-midnight" aria-hidden="true" />
            <div className="schedule-off-zone schedule-off-zone-morning" aria-hidden="true" />
            {dayScheduleBlocks.map((block) => {
            const rawDuration = (block.endMinute - block.startMinute) / (ACTION_DAY_DISPLAY_MINUTES / 100);
            const duration = Math.max(block.variant === 'in-progress' ? 4.4 : 1.6, rawDuration);
            const crossDay = block.continuesBefore || block.continuesAfter;
            const laneWidth = 100 / block.laneCount;
            const hideLabel = duration < 2.8 || laneWidth < 13;
            const compactLabel = !hideLabel && (duration < 4.8 || laneWidth < 20);
            const blockLabel = `${scheduleTimeLabel(block.variant, block.labelStartMinute, block.labelEndMinute, block.terminal)} ${block.task.title}`;
            return <button key={block.id} aria-label={blockLabel} title={blockLabel} className={`schedule-block type-${typeColor(block.task.taskType, settings)} variant-${block.variant} ${hideLabel ? 'is-brief' : compactLabel ? 'is-compact' : ''} ${block.offline ? 'is-offline' : ''} ${crossDay ? 'is-cross-day' : ''} ${block.continuesBefore ? 'continues-before' : ''} ${block.continuesAfter ? 'continues-after' : ''} ${linkedScheduleTaskId === block.task.id ? 'is-linked-highlight' : ''}`} style={{ top: `${block.startMinute / (ACTION_DAY_DISPLAY_MINUTES / 100)}%`, height: `${duration}%`, left: `calc(${block.lane / block.laneCount * 100}% + 4px)`, width: `calc(${100 / block.laneCount}% - 8px)` }} onMouseEnter={() => linkScheduleMapTask(block.task.id)} onMouseLeave={() => setLinkedScheduleTaskId('')} onFocus={() => linkScheduleMapTask(block.task.id)} onBlur={() => setLinkedScheduleTaskId('')} onClick={() => setDraft(block.task)}><time>{scheduleTimeLabel(block.variant, block.labelStartMinute, block.labelEndMinute, block.terminal)}</time><strong>{block.task.title}</strong>{crossDay && <span className="schedule-cross-day">{block.continuesBefore && block.continuesAfter ? '↕ THROUGH' : block.continuesBefore ? '↳ FROM PREV' : '↘ NEXT DAY'}</span>}</button>;
          })}</div>
        </div></section><section className="schedule-list"><header><span>AFTER SCHOOL AGENDA</span><strong>当天任务表</strong></header><div className="timeline" ref={scheduleTimelineRef}>{dayTimelineEntries.map((entry) => <button key={entry.task.id} data-schedule-task-id={entry.task.id} className={linkedScheduleTaskId === entry.task.id ? 'is-linked-highlight' : ''} onMouseEnter={() => setLinkedScheduleTaskId(entry.task.id)} onMouseLeave={() => setLinkedScheduleTaskId('')} onFocus={() => setLinkedScheduleTaskId(entry.task.id)} onBlur={() => setLinkedScheduleTaskId('')} onClick={() => setDraft(entry.task)}><time>{scheduleTimeLabel(entry.variant, entry.startMinute, entry.endMinute, !entry.continuesAfter)}</time><i className={`type-${typeColor(entry.task.taskType, settings)}`} /><div><strong>{entry.task.title}</strong><span>{entry.task.taskType} · {entry.task.location}</span></div></button>)}{!dayTimelineEntries.length && <div className="agenda-empty"><strong>FREE DAY!</strong><span>这一天还没有安排任务</span></div>}</div><button className="schedule-add" onClick={() => openNewTask('pending', new Date(`${selectedDay}T12:00`).toISOString())}>＋ ADD MISSION / 添加任务</button></section></div>
      </section>
    </div>}

    {draft && <div className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setDraft(null); }}><form className="task-modal" onSubmit={saveDraft} role="dialog" aria-modal="true" aria-labelledby="task-dialog-title">
      <header className={`modal-header type-${typeColor(draft.taskType, settings)}`}><div><span>{draft.isRecurrenceTemplate ? 'REPEAT PROTOCOL' : 'MISSION DATA'}</span><h2 id="task-dialog-title">{draft.isRecurrenceTemplate ? '循环任务配置' : '任务详情'}</h2></div><button type="button" className="close-button" aria-label="关闭" onClick={() => setDraft(null)}>×</button></header>
      <div className="modal-body"><label className="field field-wide"><span>Title / 标题</span><input autoFocus value={draft.title} placeholder="这次要攻略什么？" onChange={(e) => setDraft({ ...draft, title: e.target.value })} required /></label><RichTextDescription value={draft.description} onChange={(description) => setDraft({ ...draft, description })} />
        <div className="form-grid">{!draft.isRecurrenceTemplate && <ChoiceField label="Status / 状态" value={statusLabel(draft.status)} onClick={() => setChoiceField('status')} />}<ChoiceField label="Priority / 优先级" value={priorityLabel(draft.priority)} onClick={() => setChoiceField('priority')} /><ChoiceField label="Task Type / 任务类型" value={draft.taskType} onClick={() => setChoiceField('taskType')} /><ChoiceField label="Location / 地点" value={draft.location} onClick={() => setChoiceField('location')} /><DateChoice label={draft.isRecurrenceTemplate ? 'Planned Start / 循环开始' : 'Start / 开始时间'} value={draft.startedAt} onClick={() => openDatePicker('startedAt')} /><DateChoice label={draft.isRecurrenceTemplate ? 'Planned Deadline / 循环截止' : 'Deadline / 截止时间'} value={draft.dueAt} onClick={() => openDatePicker('dueAt')} />{!draft.isRecurrenceTemplate && <DateChoice label="Complete / 完成时间" value={draft.completedAt} onClick={() => openDatePicker('completedAt')} />}{draft.isRecurrenceTemplate && <ChoiceField label="Repeat / 循环" value={recurrenceLabel(draft)} onClick={() => setChoiceField('recurrence')} />}</div>
        {draft.isRecurrenceTemplate && draft.recurrence === 'weekly' && <div className="weekly-picker"><span>REPEAT DAYS / 循环日（可多选）</span><div>{WEEKDAYS.map((day, index) => <button type="button" key={day} className={draft.recurrenceDays.includes(index) ? 'active' : ''} onClick={() => setDraft({ ...draft, recurrenceDays: draft.recurrenceDays.includes(index) ? draft.recurrenceDays.filter((item) => item !== index) : [...draft.recurrenceDays, index].sort() })}>周{day}</button>)}</div></div>}
        {draft.isRecurrenceTemplate && draft.recurrence !== 'none' && <p className="repeat-note"><span>↻</span> 这里保存独立循环模板；修改当天生成的任务不会改变本模板。</p>}
        {!draft.isRecurrenceTemplate && draft.recurrence !== 'none' && <p className="repeat-note"><span>↻</span> 本任务来自循环模板；临时修改时间不会影响循环属性或原始设置，修改标题则会让本次任务脱离循环。</p>}
      </div><footer className="modal-actions">{tasks.some((task) => task.id === draft.id) && <button type="button" className="delete-button" onClick={() => void deleteDraft()}>{draft.isRecurrenceTemplate ? '删除循环模板' : '删除任务'}</button>}<button type="button" className="cancel-button" onClick={() => setDraft(null)}>取消</button><button type="submit" className="save-button">{draft.isRecurrenceTemplate ? '保存循环模板' : '保存任务'} <span>→</span></button></footer>
    </form></div>}

    {sleepPickerField && <div className="selector-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setSleepPickerField(null); }}><section className="persona-selector time-selector sleep-time-selector" role="dialog" aria-modal="true" aria-label={sleepPickerField === 'sleepStartedAt' ? '设置入睡时间' : '设置醒来时间'}><header><span>NIGHT LOG TIME</span><strong>{sleepPickerField === 'sleepStartedAt' ? 'SET SLEEP START' : 'SET WAKE SIGNAL'}</strong><button type="button" className="selector-close-button" aria-label="关闭睡眠时间窗口" onClick={() => setSleepPickerField(null)}>×</button></header><div className="time-toolbelt"><button onClick={() => { const current = new Date(); setSleepPickerDate(localDateKey(current)); setSleepPickerTime(`${String(current.getHours()).padStart(2, '0')}:${String(current.getMinutes()).padStart(2, '0')}`); }}><strong>NOW</strong><span>设为现在</span></button></div><div className="custom-datetime"><section className="date-board"><header><button type="button" onClick={() => setSleepPickerMonth(new Date(sleepPickerMonth.getFullYear(), sleepPickerMonth.getMonth() - 1, 1))}>‹</button><strong>{sleepPickerMonth.getFullYear()} / {String(sleepPickerMonth.getMonth() + 1).padStart(2, '0')}</strong><button type="button" onClick={() => setSleepPickerMonth(new Date(sleepPickerMonth.getFullYear(), sleepPickerMonth.getMonth() + 1, 1))}>›</button></header><div className="picker-weekdays">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div><div className="picker-days">{sleepPickerCalendarDays.map((day) => { const key = localDateKey(day); return <button type="button" key={key} className={`${day.getMonth() !== sleepPickerMonth.getMonth() ? 'outside' : ''} ${sleepPickerDate === key ? 'active' : ''} ${key === localDateKey(new Date()) ? 'today' : ''}`} onClick={() => { setSleepPickerDate(key); setSleepPickerMonth(new Date(day.getFullYear(), day.getMonth(), 1)); }}>{day.getDate()}</button>; })}</div></section><section className="time-board"><span>SELECT TIME / 选择时间</span><label className="manual-time-input"><span>MANUAL INPUT / 手动输入</span><input type="time" step="60" value={sleepPickerTime} onChange={(event) => setSleepPickerTime(event.target.value)} aria-label="手动输入睡眠时间" /></label><strong>{String(sleepPickerHour).padStart(2, '0')}<i>:</i>{String(sleepPickerMinute).padStart(2, '0')}</strong><label>HOUR / 小时</label><div className="hour-grid">{Array.from({ length: 24 }, (_, hour) => <button type="button" key={hour} className={sleepPickerHour === hour ? 'active' : ''} onClick={() => setSleepPickerTime(`${String(hour).padStart(2, '0')}:${String(sleepPickerMinute).padStart(2, '0')}`)}>{String(hour).padStart(2, '0')}</button>)}</div><label>MINUTE / 分钟</label><div className="minute-grid">{[0, 15, 30, 45, 59].map((minute) => <button type="button" key={minute} className={sleepPickerMinute === minute ? 'active' : ''} onClick={() => setSleepPickerTime(`${String(sleepPickerHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`)}>{String(minute).padStart(2, '0')}</button>)}</div></section></div><button type="button" className="time-confirm" onClick={applySleepPicker}>CONFIRM · {sleepPickerDate.replaceAll('-', ' / ')} · {sleepPickerTime} <span>→</span></button></section></div>}

    {choiceField && draft && <div className="selector-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setChoiceField(null); }}><section className="persona-selector" role="dialog" aria-modal="true"><header><span>SELECT OPTION</span><strong>{choiceField === 'taskType' ? '任务类型' : choiceField === 'location' ? '地点' : choiceField === 'priority' ? '优先级' : choiceField === 'recurrence' ? '循环' : '状态'}</strong><button type="button" className="selector-close-button" aria-label="关闭选项窗口" onClick={() => setChoiceField(null)}>×</button></header><div className={`selector-options selector-${choiceField}`}>{choiceOptions.map((option, index) => <button key={option.value} className={`${option.value === choiceValue ? 'active' : ''} ${option.color ? `type-${option.color}` : ''}`} onClick={() => selectChoice(option.value)}><span>{String(index + 1).padStart(2, '0')}</span><strong>{option.label}</strong><i>{option.value === choiceValue ? '●' : '○'}</i></button>)}</div><footer>CHOOSE YOUR MOVE · 选择后自动返回任务详情</footer></section></div>}

    {dateField && draft && <div className="selector-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setDateField(null); }}><section className="persona-selector time-selector" role="dialog" aria-modal="true"><header><span>SET TIME</span><strong>{dateField === 'startedAt' ? '开始时间' : dateField === 'completedAt' ? '完成时间' : '截止时间'}</strong><button type="button" className="selector-close-button" aria-label="关闭时间窗口" onClick={() => setDateField(null)}>×</button></header><div className="time-toolbelt"><button onClick={() => { setDraft({ ...draft, [dateField]: new Date().toISOString() }); setDateField(null); }}><strong>NOW</strong><span>设为现在</span></button><button className="clear-time" onClick={() => { setDraft({ ...draft, [dateField]: '' }); setDateField(null); }}><strong>×</strong><span>清除时间</span></button></div><div className="custom-datetime"><section className="date-board"><header><button onClick={() => setPickerMonth(new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() - 1, 1))}>‹</button><strong>{pickerMonth.getFullYear()} / {String(pickerMonth.getMonth() + 1).padStart(2, '0')}</strong><button onClick={() => setPickerMonth(new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() + 1, 1))}>›</button></header><div className="picker-weekdays">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div><div className="picker-days">{pickerCalendarDays.map((day) => { const key = localDateKey(day); return <button key={key} className={`${day.getMonth() !== pickerMonth.getMonth() ? 'outside' : ''} ${pickerDate === key ? 'active' : ''} ${key === localDateKey(new Date()) ? 'today' : ''}`} onClick={() => { setPickerDate(key); setPickerMonth(new Date(day.getFullYear(), day.getMonth(), 1)); }}>{day.getDate()}</button>; })}</div></section><section className="time-board"><span>SELECT TIME / 选择时间</span><label className="manual-time-input"><span>MANUAL INPUT / 手动输入</span><input type="time" step="60" value={pickerTime} onChange={(event) => setPickerTime(event.target.value)} aria-label="手动输入时间" /></label><strong>{String(pickerHour).padStart(2, '0')}<i>:</i>{String(pickerMinute).padStart(2, '0')}</strong><label>HOUR / 小时</label><div className="hour-grid">{Array.from({ length: 24 }, (_, hour) => <button key={hour} className={pickerHour === hour ? 'active' : ''} onClick={() => setPickerTime(`${String(hour).padStart(2, '0')}:${String(pickerMinute).padStart(2, '0')}`)}>{String(hour).padStart(2, '0')}</button>)}</div><label>MINUTE / 分钟</label><div className="minute-grid">{[0, 15, 30, 45, 59].map((minute) => <button key={minute} className={pickerMinute === minute ? 'active' : ''} onClick={() => setPickerTime(`${String(pickerHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`)}>{String(minute).padStart(2, '0')}</button>)}</div></section></div><button className="time-confirm" onClick={applyDatePicker}>CONFIRM · {pickerDate.replaceAll('-', ' / ')} · {pickerTime} <span>→</span></button></section></div>}

    {toast && <div className="toast" role="status"><span>✓</span>{toast}</div>}
  </main>;
}
