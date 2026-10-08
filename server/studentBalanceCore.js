// The wallet journal is authoritative. Its legacy calendar/finance projection
// must survive normalization, or every read recreates it and emits another SSE.
export function retainWalletPaymentProjections(paymentAllocations, balances, legacyLimit = 2000) {
  if (!Number.isSafeInteger(legacyLimit) || legacyLimit < 0) throw new TypeError('Invalid legacy projection limit');
  const normalized = paymentAllocations || {};
  const entries = Object.entries(normalized);
  if (entries.length <= legacyLimit) return normalized;
  const accounts = balances?.accounts || {};
  const managed = new Set();
  const legacy = [];
  for (const [key, allocation] of entries) {
    const walletAllocations = accounts[allocation.studentId]?.allocations;
    const belongsToWallet = walletAllocations && [key, allocation.originMarkKey, allocation.currentMarkKey]
      .some(markKey => markKey && Object.hasOwn(walletAllocations, markKey));
    if (belongsToWallet) managed.add(key);
    else legacy.push(key);
  }
  const retainedLegacy = new Set(legacy.slice(Math.max(0, legacy.length - legacyLimit)));
  return Object.fromEntries(entries.filter(([key]) => managed.has(key) || retainedLegacy.has(key)));
}

// Read-side reconciliation for one pupil must not recalculate every other
// pupil. Migration and teacher-wide previews still inspect the complete class.
export function selectBalanceReconciliationStudents(students, teacherId, {
  studentId = '', enable = false, preview = false,
} = {}) {
  const scope = enable || preview ? '' : String(studentId || '').trim();
  return (Array.isArray(students) ? students : []).filter(student => student?.teacherId === teacherId
    && (!scope || student.id === scope));
}
