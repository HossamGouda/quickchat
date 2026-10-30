/* Cross-check: every name imported from a relative module must be exported there. */
const fs = require("fs"), path = require("path");
const dir = "js";
let bad = 0;

const exportedNames = (src) => {
  const names = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function|class)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  // multi-declarator exports: capture the whole statement, then split top-level commas
  for (const m of src.matchAll(/export\s+(?:const|let|var)\s+([^;]+);/gs)) {
    let depth = 0, seg = "", segs = [];
    for (const ch of m[1]) {
      if (ch === "(" || ch === "[" || ch === "{") depth++;
      if (ch === ")" || ch === "]" || ch === "}") depth--;
      if (ch === "," && depth === 0) { segs.push(seg); seg = ""; } else seg += ch;
    }
    segs.push(seg);
    for (const s of segs) {
      const mm = s.match(/^\s*([A-Za-z_$][\w$]*)/);
      if (mm) names.add(mm[1]);
    }
  }
  for (const m of src.matchAll(/export\s*\{([^}]+)\}/g))
    m[1].split(",").forEach(p => { const n = p.trim().split(/\s+as\s+/).pop().trim(); if (n) names.add(n); });
  return names;
};

for (const f of fs.readdirSync(dir).filter(f => f.endsWith(".js"))) {
  const src = fs.readFileSync(path.join(dir, f), "utf8");
  for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*'\.\/([\w-]+)\.js'/g)) {
    const target = path.join(dir, m[2] + ".js");
    if (!fs.existsSync(target)) { console.log(`${f}: MISSING MODULE ./${m[2]}.js`); bad++; continue; }
    const exps = exportedNames(fs.readFileSync(target, "utf8"));
    for (const raw of m[1].split(",")) {
      const name = raw.trim().split(/\s+as\s+/)[0].trim();
      if (name && !exps.has(name)) { console.log(`${f}: '${name}' not exported by ${m[2]}.js`); bad++; }
    }
  }
}
console.log(bad ? `${bad} import/export mismatches` : "ALL imports resolve to real exports");
process.exit(bad ? 1 : 0);
