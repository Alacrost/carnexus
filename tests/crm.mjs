import assert from 'node:assert/strict';
import { conversionRate, reportPeriod } from '../src/lib/crm.ts';
import { computeDeal } from '../src/lib/finance.ts';
import { dealMoney } from '../src/lib/deals.ts';
import { csvFromRows } from '../src/lib/csv.ts';

assert.equal(conversionRate(0,0),0);
assert.equal(conversionRate(1,3),33.3);
assert.deepEqual(reportPeriod('2026-09-01','2026-09-17'),{
  from:'2026-09-01',to:'2026-09-17',start:'2026-09-01T00:00:00Z',end:'2026-09-18T00:00:00.000Z',
});
assert.equal(reportPeriod('2026-09-18','2026-09-17'),null);
assert.equal(reportPeriod('2026-02-30','2026-03-01').from,'2026-03-01');
assert.equal(reportPeriod('2026-12-01','2026-12-31').end,'2027-01-01T00:00:00.000Z');
console.log('PASS: report dates, inclusive last day, invalid dates and zero-denominator conversion.');
assert.deepEqual(computeDeal({purchasePrice:10000,costs:500,salePrice:12300,vatScheme:'margin'}),{totalCost:10500,grossMargin:1800,vat:430.08,netProfit:1369.92});
assert.equal(dealMoney({retailPrice:15000,sivTotal:-1000,paid:500}).balance,15500);
console.log('PASS: preparation costs do not reduce margin-scheme VAT; negative equity raises the balance.');
const csv=csvFromRows([{key:'name',label:'Name'},{key:'note',label:'Note'}],[{name:'=HYPERLINK("bad")',note:'Dealer, "quoted"'}]);
assert.match(csv,/"'=HYPERLINK\(""bad""\)"/);assert.match(csv,/"Dealer, ""quoted"""/);
const moneyCsv=csvFromRows([{key:'amount',label:'Amount'}],[123.4,'123.40',-12.34,'-12.34',0].map(amount=>({amount})));
assert.equal(moneyCsv,'"Amount"\r\n"123.4"\r\n"123.40"\r\n"-12.34"\r\n"-12.34"\r\n"0"');
for(const formula of ['=1+1','+SUM(A1:A2)','-SUM(A1:A2)','@SUM(A1:A2)',' =1+1','\t=1+1']) {
  assert.equal(csvFromRows([{key:'value',label:'Value'}],[{value:formula}]),`"Value"\r\n"'${formula}"`);
}
console.log('PASS: CSV quoting and spreadsheet-formula injection protection.');
