import { api } from './api';

export const TRIAL_LESSON_STARTED = 'ivan100:trial-lesson-started';

// The anchor opens Telemost in the original click gesture. Activation binds the
// recorder to the dated booking, never to whichever pupil happens to be selected.
export async function startTrialLesson(bookingId, {recording = true} = {}) {
  const result = await api.startTrialLesson(bookingId, recording);
  if (result.lesson) window.dispatchEvent(new CustomEvent(TRIAL_LESSON_STARTED, { detail: {
    ...result.lesson, ...(result.recording ? {callProvider: 'telemost', replayActive: true} : {}),
    recordingError: result.recordingError || '',
  } }));
  return result;
}
