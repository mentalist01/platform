import React, { useEffect, useState } from 'react';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import { recordingHealthWarning } from '../utils/recordingHealth';

export default function RecordingHealthWarning({ recorder, active }) {
  const [activeSince, setActiveSince] = useState(0);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setActiveSince(active ? Date.now() : 0);
    if (!active) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 2500);
    return () => clearInterval(timer);
  }, [active]);
  const warning = recordingHealthWarning({ ...recorder, active, activeSince, now });
  if (!warning) return null;
  return <aside role="alert" className="fixed right-5 top-20 z-[200] flex max-w-sm gap-3 rounded-2xl border border-rose-200 bg-white p-4 text-slate-900 shadow-xl">
    <AlertTriangle size={22} className="mt-0.5 shrink-0 text-rose-600" />
    <div><p className="font-bold text-rose-700">{warning.title}</p><p className="mt-1 text-sm leading-5 text-slate-600">{warning.detail}</p>
      <a href="http://127.0.0.1:18765/" target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">Открыть пульт <ExternalLink size={15} /></a>
    </div>
  </aside>;
}
