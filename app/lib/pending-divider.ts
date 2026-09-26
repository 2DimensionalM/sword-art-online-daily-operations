export function normalizePendingDividerBelowTaskIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return [...new Set(value.filter((id): id is string => typeof id === 'string' && id.length > 0))];
}

export function pendingDividerBelowTaskIdsFromRaw(
  raw: { pendingDividerBelowTaskIds?: unknown; pendingDividerIndex?: unknown } | null | undefined,
  pendingTaskIds: string[],
): string[] | null {
  if (raw && Object.prototype.hasOwnProperty.call(raw, 'pendingDividerBelowTaskIds')) {
    return raw.pendingDividerBelowTaskIds === null ? null : normalizePendingDividerBelowTaskIds(raw.pendingDividerBelowTaskIds);
  }
  const legacyIndex = raw?.pendingDividerIndex;
  if (typeof legacyIndex !== 'number' || !Number.isInteger(legacyIndex) || legacyIndex < 0) return null;
  return belowTaskIdsFromDividerIndex(pendingTaskIds, legacyIndex);
}

export function belowTaskIdsFromDividerIndex(pendingTaskIds: string[], index: number) {
  const clampedIndex = Math.max(0, Math.min(index, pendingTaskIds.length));
  return pendingTaskIds.slice(clampedIndex);
}

export function resolvePendingDividerIndex(pendingTaskIds: string[], belowTaskIds: string[] | null) {
  if (belowTaskIds === null) return null;
  const below = new Set(belowTaskIds);
  const index = pendingTaskIds.findIndex((id) => below.has(id));
  return index < 0 ? pendingTaskIds.length : index;
}

export function releasePendingDividerTask(belowTaskIds: string[] | null, taskId: string) {
  if (belowTaskIds === null || !belowTaskIds.includes(taskId)) return belowTaskIds;
  return belowTaskIds.filter((id) => id !== taskId);
}

export function belowTaskIdsAfterReorder(beforeIds: string[], belowTaskIds: string[], afterIds: string[], draggedId: string) {
  const below = new Set(belowTaskIds);
  const anchorId = afterIds.find((id) => id !== draggedId && below.has(id));
  const draggedIndex = afterIds.indexOf(draggedId);
  const landedBelow = anchorId
    ? draggedIndex >= afterIds.indexOf(anchorId)
    : below.has(draggedId) && draggedIndex === afterIds.length - 1;
  return afterIds.filter((id) => (id === draggedId ? landedBelow : below.has(id)));
}
