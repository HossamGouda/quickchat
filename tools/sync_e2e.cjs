/* End-to-end sync test against the live Teable base (token via env).
   Seeds one local contact + one local template, runs syncNow(), verifies the
   rows landed in Teable; then plants a remote-only contact, syncs again, and
   verifies it was pulled into local state. Cleans up its test rows at the end. */
const stubEl = () => ({
  innerHTML: "", textContent: "", value: "", hidden: false, className: "",
  style: {}, dataset: {}, classList: { add() {}, remove() {}, contains: () => false },
  addEventListener() {}, setAttribute() {}, getAttribute: () => null,
  click() {}, focus() {}, scrollIntoView() {}, appendChild() {}, remove() {},
  querySelector: () => null, querySelectorAll: () => [], closest: () => null,
  parentElement: null, onkeydown: null,
});
globalThis.window = globalThis;
globalThis.document = {
  getElementById: () => stubEl(), querySelector: () => stubEl(), querySelectorAll: () => [],
  createElement: () => stubEl(), createTreeWalker: () => ({ nextNode: () => null }),
  documentElement: stubEl(), body: stubEl(), fonts: undefined,
};
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, key: () => null, length: 0 };
globalThis.navigator = { userAgent: "", onLine: true };
globalThis.location = { search: "", hash: "", pathname: "/", origin: "http://localhost", href: "" };
globalThis.history = { replaceState() {} };
globalThis.addEventListener = () => {};
globalThis.MutationObserver = class { observe() {} disconnect() {} };
globalThis.NodeFilter = { SHOW_TEXT: 4 };
globalThis.scrollTo = () => {};
globalThis.prompt = () => null;

const BASE = "https://app.teable.ai/api";
const T = process.env.TEABLE_TOKEN;
const AUTH = { Authorization: `Bearer ${T}`, "Content-Type": "application/json" };

(async () => {
  const core = await import("file:///D:/Gouda Projects/direct-whatsapp/quickchat/js/core.js");
  await core.store.ready;
  core.store.set("qc_teable_token", T);
  const sync = await import("file:///D:/Gouda Projects/direct-whatsapp/quickchat/js/sync.js");

  const testFull = "966500000098";
  core.state.recents.push({ full: testFull, code: "966", local: "500000098", country: "sa", at: Date.now(), label: "E2E Local Contact", log: [] });
  core.state.tpls.push({ id: "e2e_tpl", title: "E2E Template", body: "E2E body {name}", pinned: false });

  /* 1. push local -> remote */
  const ok1 = await sync.syncNow();
  const res = await fetch(`${BASE}/table/tbl6RVbTbEYB4qK5wu1/record?pageSize=100`, { headers: AUTH }).then(r => r.json());
  const pushed = (res.records || []).find(r => String(r.fields.Number) === testFull);
  const resT = await fetch(`${BASE}/table/tblEzLuJ5UevMxVrzPm/record?pageSize=100`, { headers: AUTH }).then(r => r.json());
  const pushedTpl = (resT.records || []).find(r => String(r.fields.TplId) === "e2e_tpl");
  console.log("push sync ok:", ok1, "| contact in Teable:", !!pushed, "| template in Teable:", !!pushedTpl);

  /* 2. plant a remote-only contact, sync, expect it pulled locally */
  await fetch(`${BASE}/table/tbl6RVbTbEYB4qK5wu1/record`, {
    method: "POST", headers: AUTH,
    body: JSON.stringify({ records: [{ fields: { Number: "966500000097", Code: "966", Local: "500000097", Country: "sa", Label: "E2E Remote Contact", At: Date.now(), UpdatedAt: Date.now() } }], typecast: true }),
  });
  await sync.syncNow();
  const pulled = core.state.recents.find(r => r.full === "966500000097");
  console.log("remote-only contact pulled locally:", !!pulled, pulled && pulled.label);

  /* 3. tombstone propagation: delete locally, sync, expect remote Deleted=true */
  const { addTombstone } = await import("file:///D:/Gouda Projects/direct-whatsapp/quickchat/js/tombstones.js");
  core.state.recents = core.state.recents.filter(r => r.full !== testFull);
  addTombstone("c", testFull);
  await sync.syncNow();
  const res3 = await fetch(`${BASE}/table/tbl6RVbTbEYB4qK5wu1/record?pageSize=100`, { headers: AUTH }).then(r => r.json());
  const tombRow = (res3.records || []).find(r => String(r.fields.Number) === testFull);
  console.log("tombstone propagated to Teable:", !!tombRow && tombRow.fields.Deleted === true);

  /* 4. resurrection: remote edit lands after our delete -> contact comes back */
  await fetch(`${BASE}/table/tbl6RVbTbEYB4qK5wu1/record`, {
    method: "PATCH", headers: AUTH,
    body: JSON.stringify({ records: [{ id: tombRow.id, fields: { Deleted: false, Label: "E2E Resurrected", UpdatedAt: Date.now() } }] }),
  });
  await sync.syncNow();
  const res4 = await fetch(`${BASE}/table/tbl6RVbTbEYB4qK5wu1/record?pageSize=100`, { headers: AUTH }).then(r => r.json());
  const liveRow = (res4.records || []).find(r => String(r.fields.Number) === testFull);
  const resurrected = core.state.recents.find(r => r.full === testFull);
  console.log("resurrection: local copy back:", !!resurrected, "| remote still live:", !!liveRow && liveRow.fields.Deleted !== true);

  /* 5. cleanup test rows */
  const del = async (table, id) => fetch(`${BASE}/table/${table}/record/${id}`, { method: "DELETE", headers: AUTH });
  if (liveRow) await del("tbl6RVbTbEYB4qK5wu1", liveRow.id);
  if (pushedTpl) await del("tblEzLuJ5UevMxVrzPm", pushedTpl.id);
  const res2 = await fetch(`${BASE}/table/tbl6RVbTbEYB4qK5wu1/record?pageSize=100`, { headers: AUTH }).then(r => r.json());
  const remote2 = (res2.records || []).find(r => String(r.fields.Number) === "966500000097");
  if (remote2) await del("tbl6RVbTbEYB4qK5wu1", remote2.id);
  core.state.recents = core.state.recents.filter(r => r.full !== "966500000097");
  console.log("cleanup done");
  process.exit(ok1 && pushed && pushedTpl && pulled && tombRow && tombRow.fields.Deleted === true && resurrected && liveRow && liveRow.fields.Deleted !== true ? 0 : 1);
})().catch(e => { console.error("E2E FAILED:", e.message); process.exit(1); });
