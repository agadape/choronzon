// The god's true name: a pure function of the 64-hex render_hash. Two machines with the same hash say the same
// name; a different hash gives a visibly different name. No randomness: hash bytes index fixed syllable tables.
"use strict";

const NAME_ONSETS = ["", "K", "T", "R", "N", "M", "S", "Z", "ZH", "KH", "TH", "V", "L", "D", "G", "SH"];   // 16
const NAME_NUCLEI = ["A", "E", "I", "O", "U", "AI", "OR", "UN"];                                            // 8
const NAME_CODAS = ["", "", "N", "R", "TH", "L", "M", "S"];                                                  // 8

function trueName(renderHash) {
  if (!/^[0-9a-f]{64}$/i.test(renderHash || "")) return "";
  const b = [];
  for (let i = 0; i < 32; i++) b.push(parseInt(renderHash.slice(2 * i, 2 * i + 2), 16));
  const count = 3 + (b[0] & 1);                 // 3 or 4 syllables
  const breath = 1 + ((b[0] >> 1) % (count - 1));   // where the apostrophe falls (never first, never last)
  let name = "";
  for (let i = 0; i < count; i++) {
    const x = b[1 + 2 * i], y = b[2 + 2 * i];
    let syl = NAME_ONSETS[x >> 4] + NAME_NUCLEI[x & 7];
    if (i === count - 1) syl += NAME_CODAS[y & 7];           // only the last syllable may close
    if (i === breath) name += "'";
    name += syl;
  }
  return name;
}

if (typeof module !== "undefined") module.exports = { trueName };
if (typeof window !== "undefined") window.trueName = trueName;
