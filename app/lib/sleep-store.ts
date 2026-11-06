const SLEEP_RECORDS_URL = 'http://127.0.0.1:43110/v1/sleep-records';

export type SleepRecord = {
  id: string;
  sleepStartedAt: string;
  wakeAt: string;
  createdAt: string;
  updatedAt: string;
};

async function request<T extends object>(url = SLEEP_RECORDS_URL, init?: RequestInit) {
  const response = await fetch(url, {
    cache: 'no-store',
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const body = await response.json() as T | { error: string };
  if (!response.ok) throw new Error('error' in body ? body.error : `Sleep database request failed (${response.status})`);
  return body as T;
}

export function loadSleepRecords() {
  return request<SleepRecord[]>();
}

export function createSleepRecord(record: Pick<SleepRecord, 'id' | 'sleepStartedAt' | 'wakeAt'> & { confirmSameWakeDay?: boolean }) {
  return request<SleepRecord[]>(SLEEP_RECORDS_URL, { method: 'POST', body: JSON.stringify(record) });
}

export function removeSleepRecord(id: string) {
  return request<SleepRecord[]>(`${SLEEP_RECORDS_URL}/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
