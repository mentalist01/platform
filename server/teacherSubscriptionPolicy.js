// Existing subscriptions switch to the new calendar policy from November 2026.
// Missing historical marks before this date must not become invented debt.
export const TEACHER_BILLING_START = '2026-11';
const monthKey = value => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || '')) ? String(value) : '';
const money = value => Math.round(Math.max(0, Number(value) || 0) * 100) / 100;

export function subscriptionDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = type => parts.find(p => p.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function subscriptionMonths(start, end) {
  if (!monthKey(start) || !monthKey(end) || start > end) return [];
  const months = [];
  let [year, month] = start.split('-').map(Number);
  while (`${year}-${String(month).padStart(2, '0')}` <= end) {
    months.push(`${year}-${String(month).padStart(2, '0')}`);
    if (++month > 12) { month = 1; year++; }
  }
  return months;
}

export function teacherSubscriptionPolicy(entry = {}, now = new Date(), requestedMonth = '') {
  const today = subscriptionDay(now), currentMonth = today.slice(0, 7);
  const billingStartMonth = monthKey(entry.billingStartMonth) || TEACHER_BILLING_START;
  const monthlyFee = money(entry.monthlyFee);
  const period = month => {
    const periodFee = Object.hasOwn(entry.monthlyFees || {}, month) ? money(entry.monthlyFees[month]) : monthlyFee;
    const payment = entry.payments?.[month];
    const paidAmount = money(payment?.amount), remaining = money(periodFee - paidAmount);
    return { month, periodFee, paidAmount, remaining, paidAt: payment?.paidAt || '', paymentSource: payment?.source || '',
      dueDate: `${month}-01`, graceUntil: `${month}-15`, blockDate: `${month}-16` };
  };
  const outstanding = monthlyFee > 0
    ? subscriptionMonths(billingStartMonth, currentMonth).map(period).filter(p => p.remaining > 0) : [];
  const overdue = outstanding.some(p => today >= p.blockDate);
  const selected = period(monthKey(requestedMonth) || outstanding[0]?.month || currentMonth);
  return {
    ...selected, monthlyFee, currentMonth, billingStartMonth, dueDay: 1, effectiveDueDay: 15,
    graceDays: 15, today, outstanding, totalRemaining: money(outstanding.reduce((sum, p) => sum + p.remaining, 0)),
    status: monthlyFee <= 0 ? 'disabled' : overdue ? 'overdue' : outstanding.length ? 'unpaid' : 'paid',
    accessAllowed: !overdue,
  };
}

// Freeze accrued months when the administrator changes the price or grants an exemption.
export function subscriptionPriceChange(entry, monthlyFee, now = new Date()) {
  const currentMonth = subscriptionDay(now).slice(0, 7);
  const billingStartMonth = Number(entry.monthlyFee) > 0
    ? monthKey(entry.billingStartMonth) || TEACHER_BILLING_START : currentMonth;
  const monthlyFees = { ...entry.monthlyFees };
  for (const month of subscriptionMonths(billingStartMonth, currentMonth)) {
    if (month < currentMonth && !Object.hasOwn(monthlyFees, month)) monthlyFees[month] = money(entry.monthlyFee);
  }
  return { billingStartMonth, monthlyFees, monthlyFee: money(monthlyFee), dueDay: 1 };
}
