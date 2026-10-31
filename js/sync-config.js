/* sync-config.js — Teable cloud-sync targets.
   These IDs are not secrets (they identify tables/fields, like URLs); the personal
   access token itself lives only in the app's on-device settings (IndexedDB). */
export const TEABLE_API = 'https://app.teable.ai/api';

export const TEABLE_BASE_ID = 'bseFic1XljL6STITEdM';

/* Records are addressed by field NAME (fieldKeyType=name), so only table IDs are needed. */
export const TEABLE_TABLES = {
  contacts: 'tbl6RVbTbEYB4qK5wu1',   // Number(primary,unique), Code, Local, Country, Label, Status(select), Due(date), DueTime, Value, Note, FuMsg, At, Log, UpdatedAt
  templates: 'tblEzLuJ5UevMxVrzPm',  // TplId(primary,unique), Title, Body, Pinned, UpdatedAt
  syncMeta: 'tblj31XkIwCPVMSTLTw'    // Key(primary,unique), Value
};

/* Field IDs used as upsert match keys (must stay unique=true in Teable). */
export const TEABLE_MATCH_FIELDS = {
  contacts: 'fldiPPw5VRUivc4vgiF',   // Number
  templates: 'fld8qmvyV5KyU9FAReS'   // TplId
};
