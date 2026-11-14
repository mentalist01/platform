import { Pencil } from 'lucide-react';
import './GroupPreparationRoster.css';

export function GroupPreparationCount({ students, compact = false }) {
  if (!students?.length) return null;
  return (
    <span className={`group-preparation-badge inline-flex shrink-0 items-center rounded-full font-semibold ${compact ? 'gap-0.5 px-1 text-[9px] leading-tight' : 'gap-1 px-2 py-0.5 text-[11px]'}`}
      title={`На предподготовке · ${students.map(student => student.name).join(', ')}`}>
      <Pencil size={11} aria-hidden="true" />
      +{students.length}{compact ? <span className="sr-only"> на предподготовке</span> : ' на предподготовке'}
    </span>
  );
}

export default function GroupPreparationRoster({ students }) {
  if (!students?.length) return null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {students.map(student => (
        <li key={student.id} className="group-preparation-badge inline-flex min-w-0 items-center gap-1.5 rounded-xl border border-dashed px-2.5 py-1.5 text-xs">
          <Pencil size={13} className="shrink-0" aria-hidden="true" />
          <span className="min-w-0 break-words"><strong>{student.name}</strong> · На предподготовке</span>
        </li>
      ))}
    </ul>
  );
}
