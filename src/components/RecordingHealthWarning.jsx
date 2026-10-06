import React, { useEffect, useState } from 'react';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import { recordingHealthWarning } from '../utils/recordingHealth';

export default function RecordingHealthWarning({ recorder, active }) {
  return active ? <ActiveRecordingWarning recorder={recorder} /> : null;
}

function ActiveRecordingWarning({ recorder }) {
  const [activeSince] = useState(Date.now);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 2500);
    return () => clearInterval(timer);
  }, []);
  const warning = recordingHealthWarning({ ...recorder, active: true, activeSince, now });
  const warningKey = warning ? JSON.stringify([activeSince, warning.title, warning.detail, (recorder?.settings?.jobs || []).filter(job => job.desired === 'record' && job.cutoffAt > now).map(job => job.id).sort()]) : null;
  return warning ? <RecordingWarningNotice key={warningKey} warning={warning} /> : null;
}

function RecordingWarningNotice({ warning }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return <aside role="alert" className="fixed right-3 top-20 z-[200] flex w-[calc(100vw-24px)] max-w-sm gap-3 rounded-2xl border border-rose-200 bg-white p-4 text-left text-slate-900 shadow-xl sm:right-5">
    <AlertTriangle size={22} className="mt-0.5 shrink-0 text-rose-600" />
    <div><p className="font-bold text-rose-700">{warning.title}</p><p className="mt-1 text-sm leading-5 text-slate-600">{warning.detail}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a href="http://127.0.0.1:18765/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">Открыть пульт <ExternalLink size={15} /></a>
        <button type="button" onClick={() => setDismissed(true)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-500">Понятно</button>
      </div>
    </div>
  </aside>;
}
