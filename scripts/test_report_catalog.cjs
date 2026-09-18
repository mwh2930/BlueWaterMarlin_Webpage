/* The checked-in catalog defines the reviewed U.S. website destination scope. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/report-destinations.json'), 'utf8'));
const expected = {
  atlantic: [
    'islamorada-fl', 'miami-fl', 'fort-lauderdale-fl', 'palm-beach-fl',
    'stuart-fl', 'fort-pierce-fl', 'port-canaveral-fl', 'mayport-fl',
    'savannah-ga', 'charleston-sc', 'murrells-inlet-sc', 'wrightsville-nc',
    'morehead-city-nc', 'hatteras-nc', 'oregon-inlet-nc', 'virginia-beach-va',
    'wachapreague-va', 'ocean-city-md', 'indian-river-de', 'cape-may-nj',
    'atlantic-city-nj', 'manasquan-nj', 'montauk-ny', 'point-judith-ri',
    'marthas-vineyard-ma', 'gloucester-ma', 'portland-me'
  ],
  gulf: [
    'key-west-fl', 'marco-naples-fl', 'fort-myers-beach-fl', 'clearwater-fl',
    'panama-city-fl', 'destin-fl', 'pensacola-fl', 'orange-beach-al',
    'biloxi-ms', 'venice-la', 'grand-isle-la', 'galveston-tx',
    'freeport-tx', 'port-oconnor-tx', 'port-aransas-tx', 'south-padre-tx'
  ],
  'west-coast': [
    'san-diego-ca', 'oceanside-ca', 'dana-point-ca', 'long-beach-ca',
    'channel-islands-ca', 'santa-barbara-ca', 'morro-bay-ca', 'monterey-ca',
    'half-moon-bay-ca', 'bodega-bay-ca', 'fort-bragg-ca', 'eureka-ca',
    'brookings-or', 'newport-or', 'ilwaco-wa', 'westport-wa', 'neah-bay-wa'
  ]
};

test('public catalog retains exactly the 60 reviewed U.S. destinations in order', () => {
  assert.equal(catalog.schemaVersion, 1);
  assert.deepEqual(catalog.destinations.map(place => place.id), Object.values(expected).flat());
  assert.equal(new Set(catalog.destinations.map(place => place.id)).size, 60);
  for (const [coast, ids] of Object.entries(expected)) {
    assert.deepEqual(catalog.destinations.filter(place => place.coast === coast).map(place => place.id), ids);
  }
});

test('catalog metadata does not claim report availability or contain another region', () => {
  const validStates = new Set(['FL', 'GA', 'SC', 'NC', 'VA', 'MD', 'DE', 'NJ', 'NY', 'RI', 'MA', 'ME', 'AL', 'MS', 'LA', 'TX', 'CA', 'OR', 'WA']);
  for (const place of catalog.destinations) {
    assert.deepEqual(Object.keys(place).sort(), ['admin', 'available', 'coast', 'id', 'name', 'timeZone']);
    assert.equal(place.available, false, `${place.id}: only the live API can establish availability`);
    assert.ok(validStates.has(place.admin), `${place.id}: expected a U.S. state`);
    assert.equal(place.id.endsWith(`-${place.admin.toLowerCase()}`), true);
    assert.ok(place.name.trim().length > 0);
    assert.ok(['America/New_York', 'America/Chicago', 'America/Los_Angeles'].includes(place.timeZone));
    assert.doesNotThrow(() => new Intl.DateTimeFormat('en-US', { timeZone: place.timeZone }));
  }
});

test('Washington destinations survive while similarly named Australian region is excluded', () => {
  assert.deepEqual(catalog.destinations.filter(place => place.admin === 'WA').map(place => place.id), ['ilwaco-wa', 'westport-wa', 'neah-bay-wa']);
  assert.equal(catalog.destinations.some(place => /-(?:mx|bs)$/.test(place.id) || place.coast === 'australia'), false);
});
