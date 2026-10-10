import type { SaveAnswerInput } from './services/attempt-service'

const PREFIX = 'testo:offline-answers:'

function storageKey(attemptId: string, sessionId: string) {
  return `${PREFIX}${attemptId}:${sessionId}`
}

export function readQueuedAnswers(attemptId: string, sessionId: string): SaveAnswerInput[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey(attemptId, sessionId)) ?? '[]')
    return Array.isArray(value) ? value.filter((item): item is SaveAnswerInput =>
      item?.attempt_id === attemptId && item?.session_id === sessionId && typeof item?.question_id === 'string') : []
  } catch { return [] }
}

export function queueAnswer(answer: SaveAnswerInput) {
  const queue = readQueuedAnswers(answer.attempt_id, answer.session_id)
  const next = queue.filter(({ question_id }) => question_id !== answer.question_id)
  next.push(answer)
  localStorage.setItem(storageKey(answer.attempt_id, answer.session_id), JSON.stringify(next))
}

export function removeQueuedAnswer(attemptId: string, sessionId: string, questionId: string) {
  const queue = readQueuedAnswers(attemptId, sessionId).filter(({ question_id }) => question_id !== questionId)
  if (queue.length) localStorage.setItem(storageKey(attemptId, sessionId), JSON.stringify(queue))
  else localStorage.removeItem(storageKey(attemptId, sessionId))
}
