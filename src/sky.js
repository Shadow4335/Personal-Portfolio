// Moon phase from the mean synodic month. Good to within about a day, which is plenty for a footer.
const SYNODIC = 29.530588853;
const REF_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14); // 6 Jan 2000, 18:14 UTC

export function moonPhase(date = new Date()) {
  const age = ((((date - REF_NEW_MOON) / 864e5) % SYNODIC) + SYNODIC) % SYNODIC;
  const lit = (1 - Math.cos((2 * Math.PI * age) / SYNODIC)) / 2;
  const names = ['new moon', 'waxing crescent', 'first quarter', 'waxing gibbous', 'full moon', 'waning gibbous', 'last quarter', 'waning crescent'];
  const name = names[Math.floor(((age / SYNODIC) * 8 + 0.5)) % 8];
  return { age, lit, name };
}

export function skyLine(date = new Date()) {
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }).format(date);
  const m = moonPhase(date);
  return { time: `Faridabad ${time} IST`, moon: `Moon tonight: ${m.name}, ${Math.round(m.lit * 100)}% lit` };
}
