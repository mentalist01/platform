const occurrenceKey = entry => entry?.groupId && entry?.date && entry?.time
  ? `${entry.groupId}|${entry.date}|${entry.time}|${Number(entry.durationMinutes) || 60}` : '';

// Imported Google rows and stored group sessions can name the same lesson
// differently. Resolve both through the session before calculating a debt,
// including the separate pass that generates historical overdue rows.
export function createStudentGroupPaymentEntryResolver(groupEntries, studentId, sourceIdsForStudent) {
  const byOccurrence = new Map();
  for (const entry of groupEntries) {
    const key = occurrenceKey(entry);
    if (!key) continue;
    // Do not choose between different sessions for an ambiguous occurrence.
    if (byOccurrence.has(key)) byOccurrence.set(key, null);
    else byOccurrence.set(key, { ...entry, paymentSourceIds: sourceIdsForStudent(entry, studentId) });
  }
  return entry => {
    if (entry?.studentId && entry.studentId !== studentId) return entry;
    const session = byOccurrence.get(occurrenceKey(entry));
    if (!session || (entry.teacherId && entry.teacherId !== session.teacherId)) return entry;
    return {
      ...entry,
      lessonId: session.lessonId,
      paymentSourceIds: [...new Set([
        entry.id, ...(entry.paymentSourceIds || []), ...session.paymentSourceIds,
      ].filter(Boolean))],
    };
  };
}
