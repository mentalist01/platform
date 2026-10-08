// One synchronous wallet reconciliation gets one view of its supporting stores.
// Prepare availability/lifecycle before creating this context. In particular,
// subscription lookups need raw lessons, while participation needs resolved ones.
export function createStudentBalanceReadContext({
  readSubscriptions,
  reconcileSubscriptions,
  readLessons,
  readResolvedLessons,
  readGroups,
  readStudents,
  readPaymentNotifications,
}) {
  const snapshots = new Map();
  const once = (name, reader) => {
    if (!snapshots.has(name)) snapshots.set(name, reader());
    return snapshots.get(name);
  };
  const context = {
    subscriptions: () => once('subscriptions', readSubscriptions),
    lessons: () => once('lessons', readLessons),
    resolvedLessons: () => once('resolvedLessons', () => readResolvedLessons(context.lessons())),
    groups: () => once('groups', readGroups),
    students: () => once('students', readStudents),
    paymentNotifications: () => once('paymentNotifications', readPaymentNotifications),
    reconciledSubscriptions: () => once('reconciledSubscriptions', () => {
      const data = reconcileSubscriptions(context.lessons(), context.subscriptions());
      snapshots.set('subscriptions', data);
      return data;
    }),
  };
  return context;
}
