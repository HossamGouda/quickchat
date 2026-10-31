/* Headless boot smoke test: stub the DOM just enough to evaluate every module
   and run main.js's boot sequence, surfacing ReferenceError/TDZ/missing-export bugs. */
const stubEl = () => ({
  innerHTML: "", textContent: "", value: "", hidden: false, className: "",
  style: {}, dataset: {}, readOnly: false, placeholder: "", href: "",
  classList: { add() {}, remove() {}, contains: () => false },
  addEventListener() {}, removeEventListener() {}, setAttribute() {}, getAttribute: () => null,
  click() {}, focus() {}, select() {}, scrollIntoView() {}, appendChild() {}, remove() {},
  querySelector: () => null, querySelectorAll: () => [], closest: () => null,
  parentElement: null, onkeydown: null,
});

globalThis.window = globalThis;
globalThis.document = {
  getElementById: () => stubEl(),
  querySelector: () => stubEl(),
  querySelectorAll: () => [],
  createElement: () => stubEl(),
  createTreeWalker: () => ({ nextNode: () => null }),
  documentElement: stubEl(),
  body: stubEl(),
  fonts: undefined,
  addEventListener() {}, removeEventListener() {},
  hidden: false, visibilityState: "visible",
};
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.navigator = { userAgent: "", clipboard: undefined };
globalThis.location = { search: "", hash: "", pathname: "/", origin: "http://localhost", href: "" };
globalThis.history = { replaceState() {} };
globalThis.addEventListener = () => {};
globalThis.MutationObserver = class { observe() {} disconnect() {} };
globalThis.NodeFilter = { SHOW_TEXT: 4 };
globalThis.scrollTo = () => {};
globalThis.setTimeout = setTimeout;
globalThis.queueMicrotask = queueMicrotask;

/* Minimal fake IndexedDB: one database, one 'kv' store, cursor over seeded rows. */
const fakeRows = new Map([
  ["qc_lang", "ar"],
  ["qc_recents", [{ full: "966500000001", code: "966", local: "500000001", country: "sa", at: 1730000000000, label: "Test Contact" }]],
]);
globalThis.indexedDB = {
  open() {
    const req = { onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null,
      result: {
        objectStoreNames: { contains: () => true },
        transaction: () => ({ objectStore: () => ({
          openCursor: () => {
            const cur = { onsuccess: null, onerror: null, result: null };
            const entries = [...fakeRows.entries()];
            let i = 0;
            setTimeout(function advance() {
              if (!cur.onsuccess) return setTimeout(advance, 0);
              if (i < entries.length) {
                const [k, v] = entries[i++];
                cur.result = { key: k, value: v, continue: () => setTimeout(advance, 0) };
              } else cur.result = null;
              cur.onsuccess();
            }, 0);
            return cur;
          },
          put(k, v) { fakeRows.set(k, v); },
        }) }),
      } };
    setTimeout(() => req.onsuccess && req.onsuccess(), 0);
    return req;
  },
};

import("file:///D:/Gouda Projects/direct-whatsapp/quickchat/js/main.js")
  .then(async () => {
    const { state } = await import("file:///D:/Gouda Projects/direct-whatsapp/quickchat/js/core.js");
    /* boot is async: poll until hydration lands (max 2 s) */
    for (let i = 0; i < 40 && !(state.lang === "ar" && state.recents.length === 1); i++)
      await new Promise(r => setTimeout(r, 50));
    const ok = state.lang === "ar" && state.recents.length === 1 && state.recents[0].label === "Test Contact";
    console.log(ok
      ? "BOOT OK: IDB hydrated (lang=ar, 1 recent restored), boot sequence ran"
      : `BOOT ran but hydration mismatch: lang=${state.lang} recents=${state.recents.length}`);
    process.exit(ok ? 0 : 1);
  })
  .catch(e => { console.error("BOOT FAILED:", e.message, "\n", e.stack.split("\n").slice(0, 4).join("\n")); process.exit(1); });
