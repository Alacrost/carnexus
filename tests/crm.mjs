import assert from 'node:assert/strict';
import { conversionRate, reportPeriod } from '../src/lib/crm.ts';

assert.equal(conversionRate(0,0),0);
assert.equal(conversionRate(1,3),33.3);
assert.deepEqual(reportPeriod('2026-09-01','2026-09-17'),{
  from:'2026-09-01',to:'2026-09-17',start:'2026-09-01T00:00:00Z',end:'2026-09-18T00:00:00.000Z',
});
assert.equal(reportPeriod('2026-09-18','2026-09-17'),null);
assert.equal(reportPeriod('2026-02-30','2026-03-01').from,'2026-03-01');
assert.equal(reportPeriod('2026-12-01','2026-12-31').end,'2027-01-01T00:00:00.000Z');
console.log('PASS: report dates, inclusive last day, invalid dates and zero-denominator conversion.');
