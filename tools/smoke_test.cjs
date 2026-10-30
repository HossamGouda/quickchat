/* Smoke test: start a local server, verify every PRECACHE entry serves 200, then kill it. */
const fs = require("fs");
const { spawn, execSync } = require("child_process");

const sw = fs.readFileSync("sw.js", "utf8");
const m = sw.match(/const PRECACHE = (\[[\s\S]*?\]);/);
if (!m) { console.error("PRECACHE not found in sw.js"); process.exit(1); }
const precache = JSON.parse(m[1].replace(/'/g, '"'));

const server = spawn(
  "python",
  ["-m", "http.server", "8932", "--bind", "127.0.0.1"],
  { stdio: "ignore", detached: true }
);

(async () => {
  try {
    await new Promise((r) => setTimeout(r, 3000));
    let bad = 0;
    for (const p of precache) {
      const url = "http://127.0.0.1:8932/" + p.replace(/^\.\//, "");
      let ok = false;
      for (let attempt = 0; attempt < 3 && !ok; attempt++) {
        try {
          const res = await fetch(url, { method: "HEAD" });
          ok = res.ok;
          if (!ok) await new Promise((r) => setTimeout(r, 500));
        } catch (e) {
          if (attempt === 2) { console.log("ERR", p, e.message); bad++; }
          await new Promise((r) => setTimeout(r, 500));
        }
      }
    }
    console.log(bad ? `${bad} FAILURES` : `ALL ${precache.length} precache assets serve 200`);
    process.exitCode = bad ? 1 : 0;
  } finally {
    try { process.kill(-server.pid); } catch (e) {}
    try { execSync(`taskkill //F //PID ${server.pid} 2>NUL`, { shell: "cmd.exe" }); } catch (e) {}
  }
})();
