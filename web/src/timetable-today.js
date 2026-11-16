const campusClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Karachi', weekday: 'short', hour: '2-digit',
  minute: '2-digit', hourCycle: 'h23',
});
const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function minutes(value) {
  if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return NaN;
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
}

export function campusTime(now) {
  const parts = Object.fromEntries(campusClock.formatToParts(now).map(({type,value})=>[type,value]));
  return {day: weekdays.indexOf(parts.weekday) + 1, minute: Number(parts.hour) * 60 + Number(parts.minute)};
}

export function todaySchedule(slots, now) {
  const {day, minute} = campusTime(now);
  const classes = slots.filter(slot=>slot.dayOfWeek===day);
  const timed = classes.map(slot=>({slot,start:minutes(slot.startTime),end:minutes(slot.endTime)}))
    .filter(({start,end})=>end>start).sort((a,b)=>a.start-b.start);
  const current = timed.find(({start,end})=>start<=minute&&end>minute)?.slot??null;
  const next = timed.find(({start})=>start>minute)?.slot??null;
  return {day, classes, current, next};
}
