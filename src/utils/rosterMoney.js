// Reuse the locale formatters across every card and background roster refresh.
// Integer and fractional amounts retain their existing display precision.
const whole = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', minimumFractionDigits: 0, maximumFractionDigits: 2 });
const fractional = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const formatRosterMoney = amount => (amount % 1 === 0 ? whole : fractional).format(amount);
