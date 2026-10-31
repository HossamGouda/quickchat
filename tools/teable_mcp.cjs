/* Minimal reusable Teable MCP client.
   Usage: node tools/teable_mcp.cjs <tool> '<json-args>'
   Token comes from the TEABLE_TOKEN env var only — never from disk. */
const URL_MCP = "https://mcp.teable.ai/mcp";
const token = process.env.TEABLE_TOKEN;
const [tool, argsJson] = process.argv.slice(2);
if (!token || !tool) { console.error("usage: TEABLE_TOKEN=... node teable_mcp.cjs <tool> '<args>'"); process.exit(2); }

let sessionId = null;
async function rpc(method, params) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    Authorization: `Bearer ${token}`,
  };
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;
  const res = await fetch(URL_MCP, {
    method: "POST", headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: Math.floor(Math.random() * 1e9), method, params }),
  });
  sessionId = res.headers.get("mcp-session-id") || sessionId;
  const text = await res.text();
  if (res.headers.get("content-type")?.includes("text/event-stream")) {
    const line = text.split("\n").find(l => l.startsWith("data:"));
    return JSON.parse(line.slice(5));
  }
  return JSON.parse(text);
}

(async () => {
  await rpc("initialize", {
    protocolVersion: "2025-03-26", capabilities: {},
    clientInfo: { name: "quickchat", version: "0.1" },
  });
  const out = await rpc("tools/call", { name: tool, arguments: JSON.parse(argsJson || "{}") });
  if (out.error) { console.error("MCP ERROR:", JSON.stringify(out.error)); process.exit(1); }
  for (const c of out.result.content) console.log(c.text || JSON.stringify(c));
})().catch(e => { console.error("FAILED:", e.message); process.exit(1); });
