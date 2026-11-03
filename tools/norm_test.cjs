/* Unit tests for normalize() — the pure number normalizer in js/core.js.
   Covers the contact-book scenarios: explicit country codes with + or 00,
   bare codes, and local numbers with/without a trunk zero. */
const assert = require("assert");
const { normalize, state, COUNTRIES } = require("../js/core.js");

/* The selected country is Saudi Arabia (default) unless a test overrides it. */
state.country = "sa";

const sa = COUNTRIES.find(c => c.id === "sa");

/* +966… and 00966… → explicit international, KSA */
assert.deepStrictEqual(normalize("+966 50 123 4567"),
  { country: "sa", code: "966", local: "501234567", full: "966501234567" });
assert.deepStrictEqual(normalize("00966501234567"),
  { country: "sa", code: "966", local: "501234567", full: "966501234567" });

/* 966… without prefix → still KSA via the country-code loop */
assert.deepStrictEqual(normalize("966501234567"),
  { country: "sa", code: "966", local: "501234567", full: "966501234567" });

/* Local KSA mobile with trunk zero → zero stripped, code applied */
assert.deepStrictEqual(normalize("0559871234"),
  { country: "sa", code: "966", local: "559871234", full: "966559871234" });

/* Same digits without the zero → identical result */
assert.deepStrictEqual(normalize("559871234"),
  { country: "sa", code: "966", local: "559871234", full: "966559871234" });

/* Local number resolves even when another country is selected:
   order prefers the selected country first, then any matching country. */
state.country = "eg"; /* Egypt +20 */
assert.deepStrictEqual(normalize("0559871234"),
  { country: "sa", code: "966", local: "559871234", full: "966559871234" });

/* Egypt local number while Egypt is selected → stays Egypt */
assert.deepStrictEqual(normalize("01012345678"),
  { country: "eg", code: "20", local: "1012345678", full: "201012345678" });

/* Unmatchable garbage → null (caller falls back to raw digits) */
assert.strictEqual(normalize("12345"), null);
assert.strictEqual(normalize(""), null);

state.country = "sa"; /* restore for any other consumer in the same process */

console.log("normalize: all assertions passed");
