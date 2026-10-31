/* Minimal MCP streamable-HTTP client: initialize + tools/list against Teable. */
const fs = require("fs"), path = require("path");

const cred = { accessToken: process.env.TEABLE_TOKEN };  /* PAT used as OAuth bearer */

const URL_MCP = "https://mcp.teable.ai/mcp";
let sessionId = null;

async function rpc(method, params) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    Authorization: `Bearer ${cred.accessToken}`,
  };
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;
  const res = await fetch(URL_MCP, {
    method: "POST", headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: Math.floor(Math.random() * 1e9), method, params }),
  });
  sessionId = res.headers.get("mcp-session-id") || sessionId;
  const text = await res.text();
  if (res.headers.get("content-type")?.includes("text/event-stream")) {
    const dataLine = text.split("\n").find(l => l.startsWith("data:"));
    return JSON.parse(dataLine.slice(5));
  }
  return JSON.parse(text);
}

(async () => {
  const init = await rpc("initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "quickchat-probe", version: "0.1" },
  });
  console.log("server:", JSON.stringify(init.result?.serverInfo));
  const tools = await rpc("tools/list", {});
  for (const t of tools.result?.tools || [])
    console.log("-", t.name, "::", (t.description || "").slice(0, 100));
})().catch(e => { console.error("PROBE FAILED:", e.message); process.exit(1); });
