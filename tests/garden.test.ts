import assert from "node:assert/strict";
import { daylightAt, gardenHour, periodAt, vietnamHour } from "../lib/garden-time";

// Vietnam uses UTC+7 even when the browser or server is in another time zone.
for (const [utc, expectedHour, expectedPeriod] of [
  ["2026-10-30T22:00:00Z", 5, "dawn"],
  ["2026-10-31T00:00:00Z", 7, "day"],
  ["2026-10-31T10:00:00Z", 17, "dusk"],
  ["2026-10-31T12:00:00Z", 19, "night"],
  ["2026-10-31T17:00:00Z", 0, "night"],
] as const) {
  assert.equal(vietnamHour(new Date(utc)), expectedHour);
  assert.equal(periodAt(gardenHour("live", new Date(utc))), expectedPeriod);
}
assert.equal(gardenHour("night", new Date("2026-10-31T05:00:00Z")), 22);
assert.equal(gardenHour("live", new Date("2026-10-31T05:30:00Z")), 12.5);
assert.equal(daylightAt(6), 0.5);
assert.equal(daylightAt(18), 0.5);
assert.equal(daylightAt(0), 0);
assert.equal(daylightAt(12), 1);
console.log("Garden: Vietnam clock, midnight rollover, live/preview and gradual daylight passed.");
