/**
 * Pure exam-deadline policy. `now` is always passed in; this module never reads
 * the browser clock and has no React dependency.
 */

export const EXAM_ARRIVAL_BUFFER_MINUTES = 15;
export const EXAM_URGENT_SLACK_MINUTES = 20;
export const EXAM_WINDOW_MIN_MINUTES = 30;
export const EXAM_WINDOW_MAX_MINUTES = 120;

/** A student is on time only when ETA plus the 15-minute buffer is within the deadline. */
export function isExamOnTime(
  examStartMin: number,
  now: number,
  etaMinutes: number,
): boolean {
  return now + etaMinutes + EXAM_ARRIVAL_BUFFER_MINUTES <= examStartMin;
}

/** Positive means spare minutes after the arrival buffer; negative means late. */
export function examSlackMinutes(
  examStartMin: number,
  now: number,
  etaMinutes: number,
): number {
  return examStartMin - (now + etaMinutes + EXAM_ARRIVAL_BUFFER_MINUTES);
}

export function minutesUntilExam(examStartMin: number, now: number): number {
  return Math.max(0, examStartMin - now);
}

export type ExamTone = 'green' | 'amber' | 'red';

export function examTone(status: 'on_time' | 'at_risk' | 'missed' | 'unassigned'): ExamTone {
  if (status === 'on_time') return 'green';
  if (status === 'at_risk') return 'amber';
  return 'red';
}
