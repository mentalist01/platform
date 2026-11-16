import { lazy, Suspense } from 'react';

const Profile = lazy(() => import('./StudentLeaderboardProfileModal.jsx'));
const ChestOpening = lazy(() => import('./MockChestOpeningOverlay.jsx'));
const WeeklyRecap = lazy(() => import('./StudentWeeklyRecap.jsx'));

// Each optional window has its own boundary: downloading it must not suspend
// the cabinet, editor or an ongoing call mounted above it.
export function DeferredStudentProfile(props) {
  if (!props.open) return null;
  return <Suspense fallback={null}><Profile {...props} /></Suspense>;
}

export function DeferredChestOpening(props) {
  return <Suspense fallback={null}><ChestOpening {...props} /></Suspense>;
}

export function DeferredWeeklyRecap(props) {
  return <Suspense fallback={null}><WeeklyRecap {...props} /></Suspense>;
}
