export type Goal = { id: string; taskType: string; title: string; description: string; date: string };
export type PersonalMessage = { id: string; mood: string; title: string; description: string; date: string };
export type SignalState = { revision: number; goals: Goal[]; messages: PersonalMessage[] };

const URL = 'http://127.0.0.1:43110/v1/signals';

export async function loadSignals(): Promise<SignalState> {
  const response = await fetch(URL, { cache: 'no-store' });
  if (!response.ok) throw new Error('放送室暂时无法连接，请重试。');
  return response.json();
}

export async function saveSignals(state: SignalState) {
  const response = await fetch(URL, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...state, expectedRevision: state.revision }),
  });
  if (!response.ok && response.status !== 409) {
    const body = await response.json() as { error?: string };
    throw new Error(body.error || '保存失败，请重试。');
  }
  return { state: await response.json() as SignalState, conflicted: response.status === 409 };
}
