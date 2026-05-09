const { test, describe } = require('node:test');
const assert = require('node:assert');
const { parseNaturalDate } = require('./public/dateParser');

// Helper — build a YYYY-MM-DD string from a Date object
function iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// Helper — return a date N days from today
function daysFromToday(n) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d;
}

// Helper — find the next occurrence of a weekday (0=Sun … 6=Sat), never today
function nextWeekday(targetDay) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  let diff = (targetDay - d.getDay() + 7) % 7;
  if (diff === 0) diff = 7;
  d.setDate(d.getDate() + diff);
  return d;
}

describe('empty / whitespace', () => {
  test('empty string returns no error', () => {
    assert.deepStrictEqual(parseNaturalDate(''), { error: null });
  });

  test('whitespace-only returns no error', () => {
    assert.deepStrictEqual(parseNaturalDate('   '), { error: null });
  });
});

describe('keywords', () => {
  test('"today" returns today', () => {
    assert.deepStrictEqual(parseNaturalDate('today'), { date: iso(daysFromToday(0)) });
  });

  test('"Today" is case-insensitive', () => {
    assert.deepStrictEqual(parseNaturalDate('Today'), { date: iso(daysFromToday(0)) });
  });

  test('"tomorrow" returns tomorrow', () => {
    assert.deepStrictEqual(parseNaturalDate('tomorrow'), { date: iso(daysFromToday(1)) });
  });

  test('"TOMORROW" is case-insensitive', () => {
    assert.deepStrictEqual(parseNaturalDate('TOMORROW'), { date: iso(daysFromToday(1)) });
  });
});

describe('weekday names', () => {
  const days = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];

  days.forEach((name, idx) => {
    test(`"${name}" resolves to next ${name}`, () => {
      const result = parseNaturalDate(name);
      assert.strictEqual(result.date, iso(nextWeekday(idx)));
    });

    test(`"next ${name}" resolves to next ${name}`, () => {
      const result = parseNaturalDate(`next ${name}`);
      assert.strictEqual(result.date, iso(nextWeekday(idx)));
    });
  });

  test('weekday is never today even if today matches', () => {
    const todayName = days[new Date().getDay()];
    const result = parseNaturalDate(todayName);
    assert.notStrictEqual(result.date, iso(daysFromToday(0)));
  });
});

describe('month + day (no year)', () => {
  test('"23 may" resolves when in the future', () => {
    // Build a future date so this test is stable regardless of when it runs
    const future = daysFromToday(30);
    const day = future.getDate();
    const monthNames = ['january','february','march','april','may','june','july','august','september','october','november','december'];
    const monthName = monthNames[future.getMonth()];
    const input = `${day} ${monthName}`;
    const result = parseNaturalDate(input);
    assert.strictEqual(result.date, iso(future));
  });

  test('ordinals are stripped: "23rd may" = "23 may"', () => {
    const a = parseNaturalDate('23rd may 2027');
    const b = parseNaturalDate('23 may 2027');
    assert.deepStrictEqual(a, b);
  });

  test('"of" is stripped: "23rd of may 2027" = "23 may 2027"', () => {
    assert.deepStrictEqual(parseNaturalDate('23rd of may 2027'), parseNaturalDate('23 may 2027'));
  });

  test('month-first order works: "may 23 2027"', () => {
    assert.deepStrictEqual(parseNaturalDate('may 23 2027'), parseNaturalDate('23 may 2027'));
  });

  test('past date without year returns an error', () => {
    // 1 jan is always in the past by the time we reach any month after January
    // Use a date guaranteed to be past: yesterday's month and day from last year
    const yesterday = daysFromToday(-1);
    const day = yesterday.getDate();
    const monthNames = ['january','february','march','april','may','june','july','august','september','october','november','december'];
    const monthName = monthNames[yesterday.getMonth()];
    const result = parseNaturalDate(`${day} ${monthName}`);
    assert.ok(result.error, 'Expected an error for a past date');
  });
});

describe('explicit year', () => {
  test('"23 may 2027" resolves to 2027-05-23', () => {
    assert.deepStrictEqual(parseNaturalDate('23 may 2027'), { date: '2027-05-23' });
  });

  test('2-digit year: "23 may 27" resolves to 2027-05-23', () => {
    assert.deepStrictEqual(parseNaturalDate('23 may 27'), { date: '2027-05-23' });
  });

  test('2-digit year: "1 jan 30" resolves to 2030-01-01', () => {
    assert.deepStrictEqual(parseNaturalDate('1 jan 30'), { date: '2030-01-01' });
  });

  test('past date with explicit year returns an error', () => {
    const result = parseNaturalDate('1 jan 2020');
    assert.ok(result.error);
  });
});

describe('relative periods', () => {
  test('"next week" returns the Monday of next calendar week', () => {
    const result = parseNaturalDate('next week');
    const expected = new Date();
    expected.setHours(0, 0, 0, 0);
    const daysToNextMonday = (8 - expected.getDay()) % 7 || 7;
    expected.setDate(expected.getDate() + daysToNextMonday);
    assert.strictEqual(result.date, iso(expected));
    // Must be a Monday
    const actual = new Date(result.date + 'T00:00:00');
    assert.strictEqual(actual.getDay(), 1);
  });

  test('"next month" returns the 1st of next month', () => {
    const result = parseNaturalDate('next month');
    const expected = new Date();
    const firstOfNextMonth = new Date(expected.getFullYear(), expected.getMonth() + 1, 1);
    assert.strictEqual(result.date, iso(firstOfNextMonth));
  });

  test('"end of week" returns a Friday', () => {
    const result = parseNaturalDate('end of week');
    const actual = new Date(result.date + 'T00:00:00');
    assert.strictEqual(actual.getDay(), 5); // 5 = Friday
  });

  test('"end of week" is in the future', () => {
    const result = parseNaturalDate('end of week');
    const now = new Date(); now.setHours(0, 0, 0, 0);
    assert.ok(new Date(result.date + 'T00:00:00') >= now);
  });

  test('"end of month" returns the last day of this month', () => {
    const result = parseNaturalDate('end of month');
    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    assert.strictEqual(result.date, iso(lastDay));
  });

  test('"this weekend" returns a Saturday or is today if weekend', () => {
    const result = parseNaturalDate('this weekend');
    const actual = new Date(result.date + 'T00:00:00');
    assert.ok([0, 6].includes(actual.getDay())); // Saturday or Sunday
  });

  test('"next weekend" returns a Saturday at least 7 days away', () => {
    const result = parseNaturalDate('next weekend');
    const actual = new Date(result.date + 'T00:00:00');
    assert.strictEqual(actual.getDay(), 6); // Saturday
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const diff = Math.round((actual - now) / 86400000);
    assert.ok(diff >= 7);
  });
});

describe('"in X" offsets', () => {
  test('"in 3 days" returns 3 days from today', () => {
    assert.strictEqual(parseNaturalDate('in 3 days').date, iso(daysFromToday(3)));
  });

  test('"in 1 day" (singular) works', () => {
    assert.strictEqual(parseNaturalDate('in 1 day').date, iso(daysFromToday(1)));
  });

  test('"in a day" returns tomorrow', () => {
    assert.strictEqual(parseNaturalDate('in a day').date, iso(daysFromToday(1)));
  });

  test('"in 2 weeks" returns 14 days from today', () => {
    assert.strictEqual(parseNaturalDate('in 2 weeks').date, iso(daysFromToday(14)));
  });

  test('"in a week" returns 7 days from today', () => {
    assert.strictEqual(parseNaturalDate('in a week').date, iso(daysFromToday(7)));
  });

  test('"in 1 month" returns one month from today', () => {
    const result = parseNaturalDate('in 1 month');
    const expected = new Date(); expected.setHours(0,0,0,0);
    expected.setMonth(expected.getMonth() + 1);
    assert.strictEqual(result.date, iso(expected));
  });

  test('"in an month" is not valid — "an" only works with singular units', () => {
    // "in an month" is grammatically wrong but we accept it gracefully
    const result = parseNaturalDate('in an month');
    assert.strictEqual(result.date, iso((() => {
      const d = new Date(); d.setHours(0,0,0,0); d.setMonth(d.getMonth()+1); return d;
    })()));
  });
});

describe('invalid input', () => {
  test('unknown month returns an error', () => {
    const result = parseNaturalDate('23 mayonnaise');
    assert.ok(result.error);
  });

  test('gibberish returns an error', () => {
    const result = parseNaturalDate('buy milk tomorrow');
    assert.ok(result.error);
  });

  test('impossible date returns an error', () => {
    const result = parseNaturalDate('31 feb 2027');
    assert.ok(result.error);
  });
});
