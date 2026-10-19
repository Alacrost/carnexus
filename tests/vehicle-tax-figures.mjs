import assert from 'node:assert/strict';
import {calcVehicleTax,docFigures} from '../src/lib/deals.ts';
import {computeDeal} from '../src/lib/finance.ts';

const included=calcVehicleTax(12300,'standard',23,1000,'included');
assert.equal(included.vat,2300);assert.equal(included.net,10000);assert.equal(included.vatBase,12300);
const excluded=calcVehicleTax(12300,'standard',23,1000,'excluded');
assert.equal(excluded.vat,2113.01);assert.equal(excluded.net,10186.99);assert.equal(excluded.vatBase,11300);
assert.equal(calcVehicleTax(12100,'standard',21).vat,2100);
assert.equal(calcVehicleTax(12300,'standard',0).vat,0);
assert.equal(calcVehicleTax(12300,'none',23,1000).vat,0);
assert.equal(calcVehicleTax(12300,'margin',23,1000).vat,0,'customer figures never disclose margin VAT');
const cents=calcVehicleTax(12300.01,'standard',23,1000.01,'excluded');
assert.equal(cents.vatBase,11300);assert.equal(cents.vat,2113.01);assert.equal(cents.net,10187);
for(const treatment of ['included','excluded']){
  const figures=docFigures({scheme:'standard',sale:12300,retail:12300,siv:2000,deposits:300,vatRate:23,vrtAmount:1000,vrtVatTreatment:treatment});
  assert.equal(figures.invoiceTotal,12300,'VRT included in customer price is never added a second time');
  assert.equal(figures.balanceInvoice,10000);assert.equal(figures.balanceAgreement,10000);
}
const fractional=docFigures({scheme:'standard',sale:12300.01,retail:12300.01,siv:2300.01,deposits:100.01,vatRate:23,vrtAmount:1000.01,vrtVatTreatment:'excluded'});
assert.equal(fractional.balanceInvoice,9899.99);assert.equal(fractional.balanceAgreement,9899.99);
const acquisition=computeDeal({purchasePrice:8000,costs:200,salePrice:12300,vatScheme:'standard',vatRate:23,vrtAmount:1000,vrtVatTreatment:'included'});
assert.equal(acquisition.totalCost,9200,'VRT is counted once in acquisition cost');assert.equal(acquisition.grossMargin,3100);assert.equal(acquisition.vat,2300);assert.equal(acquisition.netProfit,800);
const acquisitionExcluded=computeDeal({purchasePrice:8000,costs:200,salePrice:12300,vatScheme:'standard',vatRate:23,vrtAmount:1000,vrtVatTreatment:'excluded'});
assert.equal(acquisitionExcluded.totalCost,9200);assert.equal(acquisitionExcluded.grossMargin,3100);assert.equal(acquisitionExcluded.vat,2113.01);assert.equal(acquisitionExcluded.netProfit,986.99);
console.log('PASS vehicle tax figures: configurable rate, VRT inclusion/exclusion, cents, balances and margin disclosure');
