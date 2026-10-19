import assert from 'node:assert/strict';
import { doneDealVehicleUrl, publicVehicleUrl } from '../src/lib/vehicle-public-links.ts';

const car = '/s/example-motors/car/123e4567-e89b-12d3-a456-426614174000';
assert.equal(publicVehicleUrl('https://autonexus.ie', car), `https://autonexus.ie${car}`);
assert.equal(publicVehicleUrl('http://localhost:3000', car), null);
assert.equal(publicVehicleUrl('https://autonexus.ie', '/inventory/private'), null);
assert.equal(doneDealVehicleUrl('https://www.donedeal.ie/cars-for-sale/ford-fiesta/12345678'), 'https://www.donedeal.ie/cars-for-sale/ford-fiesta/12345678');
assert.equal(doneDealVehicleUrl('https://donedeal.ie/dealer/example'), null);
assert.equal(doneDealVehicleUrl('https://donedeal.ie.evil.example/car/123'), null);
assert.equal(doneDealVehicleUrl('javascript:alert(1)'), null);
console.log('PASS: QR destinations require a hosted public car page or a vehicle-specific DoneDeal URL.');
