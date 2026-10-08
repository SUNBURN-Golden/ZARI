# ZARI persistence and versioning contract

Status: architecture proposal for implementation; no persistence code or migration has been executed. Architecture target: `46082a909c9210c7dbd0ee9946386dc18246108e` on `BeautifulMind-JT/ZARI`. This document governs browser storage; [DOMAIN_MODEL.md](DOMAIN_MODEL.md) governs serialized domain values and [WASM_PROTOCOL.md](WASM_PROTOCOL.md) governs in-flight work.

## Contents

1. State boundaries and version identities
2. Dexie object stores and ownership
3. Save, normalization, acceptance, and concurrency transactions
4. Snapshot identity and stale detection
5. Undo history and retention
6. Migration and corruption recovery
7. Import, export, duplication, and deletion
8. Failure behavior and verification gates

## 1. State boundaries

IndexedDB, accessed through one Dexie repository adapter, is the initial persistence mechanism. No account, backend, sync provider, or database service is required. TypeScript owns storage transactions and presentation state. Rust owns normalized input, semantic digests, domain validation, snapshot construction, BOM, and canonical content hashing. The persistence adapter must not repair geometry or recompute a BOM.

All durable input/catalog/snapshot integrity checks use the `verifyRecord` operation in WASM_PROTOCOL; imported catalogs use its `validateCatalog` boundary. A verified hash does not certify physical correctness or turn a historical plan into a current one. Project import stages bounded records through these operations before its single commit transaction; no Worker call occurs inside that transaction.

Keep five separate values:

- **Raw editing draft:** exact input strings, selected display units, explicit unknown selections, incomplete edits, requested user operations, and bounded undo history. It can be saved even when invalid.
- **Normalized input:** immutable, validated Rust DTO at one `inputRevision`; incomplete but structurally valid domain inputs can retain unknown measurements. A syntactically invalid edit never replaces this value.
- **Search state:** Worker-owned handles, cursors, candidate queues, and provisional search results. Never persisted as resumable solver state in v1.
- **PlanSnapshot:** immutable Rust-evaluated result, including checks, placements, item assignments, BOM, warnings, and guide. `accepted` describes a user selection, not an all-checks-pass certificate.
- **Persisted project:** pointers and metadata linking the above durable records. It is not a serialized React component tree.

Hover, focus, open menus, dragged pixel positions, pending request promises, Worker handles, DOM nodes, viewport size, and transient error stacks are not durable project state. A project may retain a display unit and last workflow step as explicit preferences; their preservation must not change physical semantics.

### Version registry

| Field | Encoding | Changes when | Authority / persistence |
|---|---|---|---|
| `schemaVersion` | bounded positive integer | DTO shape or interpretation changes | Rust contract; in every durable domain envelope |
| `dbVersion` | Dexie integer version | object stores/indexes change | Storage adapter; distinct from DTO version |
| `projectRevision` | canonical unsigned decimal `u64` string | any successful persisted project mutation | Atomic project CAS; never parse as JS Number |
| `inputRevision` | canonical unsigned decimal `u64` string | normalized semantic input digest changes | Rust determines semantic equality; repository commits next revision |
| `editorEpoch` | session-local counter | any raw edit that may affect a plan, including an invalid edit | UI only; never rehydrated as live identity |
| `inputDigest` | Rust-generated SHA-256 identifier | normalized input semantics change | Stored with normalized input |
| `catalogVersion` | publisher-defined nonempty identifier | publisher releases a catalog revision | Pinned input and snapshot context |
| `catalogDigest` | Rust-generated content hash | normalized catalog content changes | Exact local catalog key; not proof of provenance |
| `ruleVersion` | exact immutable implementation identifier | rules or their interpretation change | Snapshot context; never silently updated |
| `solverVersion` | exact immutable implementation identifier | search semantics, ordering, or budget interpretation change | Snapshot context |
| `searchProfile` | versioned id/version object | selected supported search mode changes | Input/request/snapshot context |
| `searchBudget` | explicit deterministic work limits | requested search scope changes | Input/request/snapshot context |
| `seed` | optional canonical decimal string | a supported seeded profile chooses a seed | Explicit null for the initial nonrandom reference profile |
| `planSnapshotId` | content hash | canonical snapshot content changes | Rust-generated; excludes execution telemetry and project binding |
| `workerSessionId` | unique opaque identifier | Worker is created/recreated | Transient only |
| `projectActivationId` | unique opaque identifier | project activated, even A→B→A | Transient only |

Revision strings are compared for exact CAS equality; if history needs numeric ordering, use checked integer comparison, not lexicographic IndexedDB string order (`"10"` sorts before `"2"`). Counters never wrap. `u64::MAX` produces a structured revision-exhausted failure; export or duplicate into a fresh project rather than resetting a live revision. TypeScript may use checked `BigInt` only for persistence CAS counters and envelope comparisons; this is storage bookkeeping, not physical business logic. Serialize it back as a decimal string.

A raw save, project rename, plan acceptance, or action completion increments `projectRevision` but need not increment `inputRevision`. Equivalent inputs `60 cm` and `600 mm` preserve `inputRevision` after Rust normalization, although the raw draft and `projectRevision` change. Changing a catalog pin, strategy selection, known measurement evidence/uncertainty, owned-container availability, or hard constraint is semantic input change. Editing labels used in the plan explanation is also semantic if those labels are embedded in snapshot content; purely project-list title changes are not.

## 2. Object stores

Database name: `zari-local`. Initial `dbVersion = 1` is introduced by Task 005, not by documentation or Task 001. `dbVersion` 2 (ZARI-009) adds the `attachments` store for optional local photo derivatives. The upgrade writes a migration journal and does not rewrite snapshot bytes. `dbVersion` 3 (z-inventory-lifecycle) adds `inventoryLedgers`. The current `DB_VERSION` is 3. All rows include `schemaVersion`; generic metadata keys have their own tagged payload version. Use explicit key and index declarations, not indexes on arbitrary content.

| Store | Primary key / indexes | Stored content | Decision |
|---|---|---|---|
| `projects` | `projectId`; indexes `updatedAt`, `status` | project name, `projectRevision`, `currentInputRevision`, `currentInputDigest`, full accepted-snapshot binding or null, last workflow step, created/updated timestamps, recovery flags | Small mutable coordination record; every project write touches it |
| `inputs` | `[projectId+inputRevision]`; index `projectId` | immutable ProjectInput and digest (including catalogPin, SearchSelection and owned-container copies); normalization engine version as record metadata | Separate immutable rows enable reproducibility and history; no independently mutable catalog/search duplicate |
| `drafts` | `projectId` | raw form DTO, draft generation, originating editor-session ID, base input revision/digest, validation status, last completed edit command, bounded undo/redo record | One embedded draft per project; no random component state |
| `snapshots` | `[projectId+inputRevision+planSnapshotId]`; indexes `projectId`, `planSnapshotId` | immutable snapshot body, full binding, `acceptedAt`, evaluation engine context | One complete payload per binding; no cross-project dedup service |
| `ownedContainers` | `ownedContainerId`; index `updatedAt` | user-maintained inventory definition, revision, evidence, available quantity | Global reusable inventory library; projects explicitly copy/pin selected revision |
| `catalogs` | `catalogDigest`; indexes `catalogVersion`, `origin` | immutable normalized catalog DTO, ingestion metadata, field evidence, synthetic flag, observation metadata | Atomic snapshot; never mutate in place |
| `actionProgress` | `[projectId+inputRevision+planSnapshotId+stepId]`; index `projectId` | user status, required arrival/verification acknowledgments, updated timestamp | Outside snapshot; progress is user state, not solver output |
| `metadata` | `key` | active storage generation, migration journal, app preferences, quarantined-record envelopes | Bounded operational state; never secrets or user transcript logs |
| `inventoryLedgers` | `ledgerId`; index `updatedAt` | project life ledger returned by Rust | z-inventory-lifecycle. Not a PlanSnapshot and not part of exportVersion 1 |

A binding is `{projectId, inputRevision, planSnapshotId}`. Include `inputRevision` in action-progress keys because an identical content hash can recur after intervening edits. Completing steps on an old binding must not silently complete steps on a later binding. Same-binding accept again retains progress. Carrying progress across different bindings requires an explicit user operation with displayed matching steps; v1 does not offer automatic carry-forward.

Snapshot bodies may repeat across bindings. At v1 scale this is simpler and safer than refcounted global content tables. A later measured storage problem can justify deduplication without changing the logical binding contract.

Embed small item groups, space geometry, preferences, measurement evidence references, and input-owned inventory copies in `inputs`; they are one consistency unit and are not independently queried as database entities. Embed raw command history in `drafts`. Do not split every Rust struct into a store. User-owned library edits do not mutate existing project inputs: show an explicit update-available action, then create a new normalized input revision if applied.

Photos are excluded from the first saved slice. Task 009 may add a separate `attachments` Blob store through a versioned migration when optional local attachment UX is implemented. Do not store base64 photos inside every input/snapshot or pre-create the store before that task. Photo bytes and metadata stay local; attachment removal must remove orphan bytes.

## 3. Transaction boundaries

### 3.1 Raw draft save

1. Capture raw form state plus the locally expected `projectRevision`, local draft generation, unique editor-session ID, and current project activation. A restored draft gets a new editor session and new transient epoch; recorded prior epochs are historical data, never live request identity.
2. In a short `rw` transaction over `projects` and `drafts`, read the current project row. Compare the expected revision exactly. If it differs, abort with `revision_conflict`; never last-write-wins overwrite.
3. Write the raw draft, increment `projectRevision` once, and update project timestamp. A successfully saved invalid draft remains invalid. Do not claim its last accepted plan is current.
4. Only after transaction commitment display **이 기기에 저장됨**. Broadcast `{projectId, projectRevision}` as an invalidation hint, not a data-transfer or locking mechanism.

Autosave may debounce keystrokes (target 400 ms) and save immediately on form commit / workflow navigation. Keep the in-memory dirty draft until confirmed commit. `beforeunload` is not a durable-save guarantee; closing while dirty may lose unsaved work. Explicit save and visible saved/error state remain available.

### 3.2 Normalization commit

1. Outside any DB transaction, send captured raw state to Rust with full Worker request context.
2. Rust returns normalized domain input, semantic digest, diagnostics, and the exact context. Reject stale context before using it. Invalid raw text returns diagnostics; save its raw draft without overwriting `inputs`.
3. Open a short `rw` transaction over `projects`, `drafts`, and `inputs`. Re-read expected `projectRevision`, originating editor-session ID, and the raw draft generation. If either changed, abort; re-evaluate against current draft before retrying.
4. If the Rust digest equals current semantic digest, retain `inputRevision`. Otherwise checked-increment `inputRevision`, insert a new immutable `inputs` row, and update current pointers. Commit the corresponding raw draft and `projectRevision` together. Do not increment twice when draft and normalized changes are one transaction.
5. The old accepted snapshot remains available as history. It is stale for current input; never relabel it as newly computed.

No `await Worker`, fetch, timer, or WASM initialization inside an IndexedDB transaction. Resolve computation first, then compare-and-swap. Dexie documents both transaction completion and the risk of unrelated asynchronous work allowing a transaction to become inactive. This design deliberately uses short transactions. [Dexie transaction documentation](https://dexie.org/docs/Dexie/Dexie.transaction%28%29)

After that transaction commits, the controller uses activateProject with a fresh activation ID and the committed normalized revision to install the immutable Rust context, as WASM_PROTOCOL specifies. Only its matching acknowledgement enables search. If context installation fails, the save is still real but computation is unavailable; retry Worker activation without incrementing inputRevision again. Engine version metadata on an input row is not a user-selected field and is excluded from inputDigest; engine changes independently stale old snapshot contexts.

### 3.3 Snapshot acceptance

Rust evaluation may produce an evaluated candidate with explicit unknown/conditional checks. An acceptance action pins that candidate; acceptance does not convert unknown to pass. Known hard violations or structurally invalid snapshots cannot be accepted as executable plans.

Outside the transaction, verify DTO shape, Rust snapshot hash, binding context, validation report, referenced catalog and input digest. Inside one `rw` transaction over `projects`, `inputs`, `snapshots`, `catalogs`, and `actionProgress`:

- CAS `projectRevision`; check exact current input binding and draft semantic compatibility.
- Require all referenced durable input/catalog rows to exist and match digests.
- Insert the immutable snapshot if absent; if the key exists but content differs, fail as integrity corruption.
- Set the accepted binding on the project and increment its revision once.
- Create no fake completed action steps. Preserve progress only for the exact same binding.

After commitment render saved status. The UI can render an evaluated candidate before acceptance, but it must label it as a candidate and not promise it is saved. Do not persist every incremental search result or every drag preview.

### 3.4 Action progress and project metadata

Action completion, title changes, and draft-only edits still CAS the project row and increment its `projectRevision`. A purchase-dependent step cannot be completed merely because a plan was generated; require the recorded prerequisite, such as item arrival or user confirmation. Progress never modifies snapshot BOM, quantities, checks, or physical coordinates.

### 3.5 Multiple tabs

One per-tab save queue serializes writes originating in that tab. IndexedDB transactions and CAS protect against other tabs; BroadcastChannel is only a prompt to refresh. Two tabs based on revision `r` cannot both silently commit revision `r+1` for the same project.

On a remote revision notification or CAS failure, retain the local dirty draft, mark a conflict, stop automatic overwrites, and offer:

- **저장된 최신 버전 열기:** discard local changes only after explicit user choice.
- **내 변경을 새 프로젝트로 저장:** create a fresh project ID and preserve the user's current raw draft.
- **JSON으로 내 변경 내보내기:** available if saving a copy also fails.

No automatic field merge in v1. An action-progress write can conflict with a measurement write; correctness takes priority over avoiding a rare prompt. Conflicts on library owned-container rows use their own revision CAS; applying a library update to a project remains explicit.

## 4. Snapshot identity and currentness

Rust emits canonical JSON using the rules in DOMAIN_MODEL.md: fixed field encodings, deterministic ordering of set-like collections, no floating authoritative numeric values, explicit unknown/null conventions, and stable evidence identities. Hash the canonical logical body. Do not calculate a different JS hash from a view model.

The content hash covers normalized input digest, catalog digest/version, rule/solver versions, profile and deterministic budget, placements, assignments, checks, BOM, guide, and semantic warnings. Runtime `requestId`, elapsed time, worker/session identity, wall-clock completion time, project ID, input revision binding, and user acceptance timestamps are outside the body. Observation times that qualify catalog facts remain semantic content and therefore are included.

Two equal `planSnapshotId` values claim equal logical content under the same canonicalization version, not authentic source data or physically safe furniture. A separate Rust-generated physical-plan signature is used only to deduplicate alternatives with the same placement/assignment meaning. It can omit commercial observations for that specific comparison and must never replace the full snapshot ID for persistence or historical quotation identity.

A current display requires all of the following:

1. Selected project and activation still match.
2. No unresolved raw semantic edit remains since the evaluated input (`editorEpoch` currentness); a half-entered number makes the plan visibly stale immediately.
3. Normalized input digest and bound `inputRevision` match the current persisted/project input.
4. Active catalog pin, rules/solver version, profile/budget and schema match the evaluation context.
5. The snapshot body and references passed integrity checks.

A Worker response matching an old `inputRevision` but a newer raw-invalid edit must still be rejected. Equal normalization of a later raw edit can restore semantic currentness only after Rust acknowledges that edit. Do not use a render timestamp as a freshness test.

Application upgrade does not mutate historical snapshots. If the engine context differs, open the old result as **이전 버전에서 계산한 계획** and offer recomputation. Changing price/catalog data creates a new catalog pin and plan; the historical BOM keeps its original observed values and times.

## 5. History and retention

Undo/redo consists of validated domain edit commands plus bounded raw-form states; not serialized closures or event objects. Task 007 owns command semantics. Persist the last 100 committed user edit commands or 1 MiB of serialized history, whichever comes first. Coalesce one text-edit transaction and one completed drag into one command. Cutting off older undo does not delete accepted plans.

Input-edit undo uses the Rust normalize/evaluate path and increments inputRevision only for changed normalized semantics. Layout-only undo uses validateEdit/RestoreLayout, retains inputRevision, advances editorEpoch and advances projectRevision when accepted durably; it yields an evaluated immutable snapshot as DOMAIN_MODEL specifies. Revisions never decrement, old Worker requests never regain validity, and no immutable snapshot is directly edited.

Retain all user-accepted snapshot bindings and their referenced inputs/catalogs until explicit project/history deletion. Automatically evict only unaccepted in-memory candidates and unreferenced draft history beyond the limit. Retain the current input plus the last 20 unaccepted input revisions for recovery, in addition to every revision referenced by accepted snapshots or undo. Cleanup uses reference checks in a transaction; never delete a referenced row to make quota errors disappear.

If accepted history becomes large, present storage usage and explicit export/delete choices. `navigator.storage.estimate()` and a persistence request may inform the UX, but availability differs by browser and user/browser deletion remains possible. Local browser storage is not backup. [MDN storage quotas and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)

## 6. Migrations and recovery

There is no legacy application data at this architecture target. Task 005 starts at schema/database version 1 and includes a synthetic upgrade fixture proving the mechanism; it must not claim to have migrated real users.

### Structural database migration

Use ordered Dexie `version(n).stores(...).upgrade(...)` migrations for short, deterministic structure changes. Keep the historical declarations needed to open supported databases. On versionchange, another open tab closes its DB connection and displays a reload prompt. If an old tab blocks the upgrade, explain **다른 ZARI 탭을 닫고 다시 시도하세요**; do not delete the database. Dexie exposes an upgrade callback with the transaction. [Dexie upgrade documentation](https://dexie.org/docs/Version/Version.upgrade%28%29)

### Semantic DTO migration

Never rewrite immutable snapshots in place to make their contents appear computed by a newer engine. Keep supported old snapshots read-only with a version-specific decoder, or mark them unsupported and allow raw export. Recompute creates a new snapshot and preserves `migratedFrom`/source binding outside the original immutable content.

For input migrations requiring Rust work, stage transformations outside transactions, validate with Rust, then CAS insert new-schema rows and switch pointers only after all records in the project migration validate. A migration journal in `metadata` records source schema, target schema, state, and candidate IDs. Interrupted staging is resumable or discardable; old active pointers remain valid until commit. Do not call WASM from a Dexie version upgrade callback.

Unsupported newer schema: reject writes, preserve bytes, and explain that an updated app is required. Unsupported unknown enum values are errors, not defaults. A destructive migration requires user decision and an export opportunity before execution.

### Corruption

Validate envelopes on read, then ask Rust to verify domain integrity and hashes. A bad snapshot does not prove every project row is bad. Isolate the damaged record and affected pointers, retain the last coherent project revision if one exists, and show a recovery view. Store an exact quarantined envelope in `metadata` if possible, with a maximum of 10 quarantined records and 10 MiB total; when that bound is reached, offer raw export and leave the original untouched rather than evicting evidence; leave original bytes untouched if quarantine writes fail. Offer a raw recovery export clearly labeled unvalidated. Do not attempt speculative field repairs or silently substitute defaults.

A structurally corrupted draft can fall back to a validated normalized input for viewing, with the draft's lost/invalid fields disclosed. A corrupted catalog remains unavailable for recomputation; existing snapshot evidence remains readable without fetching a replacement. Never label a recomputation using another catalog as reproduction of the damaged plan.

## 7. Export, import, duplicate, delete

### Project export

Export one JSON envelope with `exportVersion`, producer/schema identifiers, exported timestamp, project metadata, raw draft, required normalized inputs, accepted snapshot bindings, action progress, referenced owned-container copies, and pinned catalogs needed for reproduction. Include per-record digests and a manifest; digests detect corruption, not authorship. By default include current draft and accepted history, excluding transient logs and quarantine. Let the user explicitly export recovery data separately.

The basic JSON export excludes optional photo bytes and clearly lists excluded attachments. When attachment export is implemented, use a separate documented bundle format; do not silently create incomplete photo backups. Export files contain home inventory data and are the user's responsibility once downloaded; no automatic upload.

### Import

Limits for the initial JSON path: 10 MiB raw file size, depth 32, bounded collection/string limits from DOMAIN_MODEL.md, supported schema/export versions only. Reject oversized or unsupported inputs before retaining full duplicate graphs. Parse as data, never evaluate scripts/HTML. Decode allowed fields and reject unknown tagged variants. Do not fetch imported URLs.

Outside DB transactions, validate shape with generated schema, validate domain in Rust, verify IDs/digests, reject duplicate IDs, cyclic parents, dangling references, and tampered snapshot bodies. Historical accepted status may be imported as a user choice from the file, but label source as imported and revalidate before describing current applicability. Field evidence is preserved without upgrading trust.

Show a review summary including synthetic vs real catalogs, missing attachments, unknown measurements, and imported historical plans. Commit the entire imported project and required catalogs atomically under a fresh project ID; keep source IDs in import provenance. Default import never overwrites an existing project or mutates the global owned-container library. A failure inserts no half-project. Unsupported schema offers no default coercion path.

### Duplication

Create a fresh project ID with revision counters starting at `1`, copied current normalized input and draft, and newly bound selected snapshot only if its normalized input/context still matches. Preserve snapshot content hashes; project binding is outside content. Reset action progress to incomplete and disclose that duplication does not transfer physical inventory ownership. Owned containers are reusable library references, not reservations across projects; show that using one container in two different planned spaces is not globally scheduled by v1.

### Deletion

Project deletion removes its project, draft, inputs, snapshot bindings, action progress, and life ledger in one transaction. Shared catalogs and library owned containers remain unless separately selected for deletion. Cleanup removes unreferenced catalogs only after computing live references. Attachment deletion removes bytes when no remaining local reference exists. Confirm irreversible project deletion at the UI action, not every ordinary save. Do not claim deletion from exported files or OS/browser storage backups.

## 8. Failure semantics and gate

| Failure | Preserved state | User action |
|---|---|---|
| `persistence_failed:quota` | dirty in-memory draft and last committed project | export, free space, retry |
| `persistence_failed:unavailable` | current session calculation remains usable | export; explain this session is not saved |
| `revision_conflict` | latest durable project plus local dirty draft | open latest, save copy, or export |
| `migration_blocked` | old database untouched | close other tabs / reload |
| `unsupported_schema` | raw data preserved read-only | update app or export |
| `record_corrupt` | coherent unrelated records | recovery view / raw export |
| `snapshot_integrity_failed` | last intact snapshot and input | inspect warning; recompute explicitly |
| `catalog_missing` | historical snapshot still readable | re-import exact catalog or choose new catalog and recompute |

Persistence Gate requires: real browser save/reload; malformed draft preservation; two-tab CAS race; atomic transaction rollback; quota/unavailable failure injection; same-content/new-binding action progress isolation; large-counter round-trip; schema rejection; imported digest tamper rejection; deletion-reference checks; and no Worker wait in DB transactions. Fake IndexedDB unit tests are useful for repository behavior but do not replace actual browser evidence. [TEST_STRATEGY.md](TEST_STRATEGY.md) defines commands and fixtures. Green tests alone do not prove storage is permanent, data is factually correct, or migration is safe for an untested schema.

## 9. SP-012 history, CAS, and decoding

Adopted by [D012](../design/DECISIONS.md). No `dbVersion` change and no migration run in this delivery. schemaVersion 1 records stay readable. Unknown fields still fail closed. A downgrade write is refused when a future schema appears; this node does not introduce schema 2.

Action progress stays outside the snapshot. `done` does not rewrite checks, facts, or BOM. `setActionStep` commits only when `projectRevision`, the accepted binding, and the current input revision and digest match, and it refuses a step whose `requiredConfirmations` is non-empty. SP-013 also matches catalog digest and version, rule version, solver version, schema version, canonical version, build id, search profile, and the progress-row identity inside the transaction. The editor epoch and worker identity are rechecked by the session around the worker call. A mismatch rejects the write and leaves the previous done row. The Worker call stays outside the transaction.

Offer, owned-library, and evidence edits do not mutate an old snapshot or its progress. The next accepted binding starts with its own progress. Duplicate still resets progress. Quota, conflict, and rollback do not report a fake save or a half-written project. Corruption is not rewritten into a valid plan. Missing photo bytes stay missing.

A snapshot whose `ruleVersion` is older than the engine's current rule is historical: readable, not completable, not rewritten. SP-013 makes `zari-domain-v1` historical and `zari-domain-v2` current. There is no automatic progress migration. The decoding matrix is `docs/oracles/product-completion/decoding-matrix.json`.

SP-014 does not change `dbVersion` or schemaVersion. A new project's search profile is `default` version 2. Snapshots from profile version 1 keep `zari-solver-v1`. The progress CAS still rejects a solver-version mismatch and does not move done rows onto the other profile.

## 10. SP-015 lifecycle

Adopted by [D015](../design/DECISIONS.md). No `dbVersion` change and no migration. A progress put also refuses when the stored draft generation is newer than the generation observed before the worker call, or when the synchronous in-memory fence is false. That fence does not call the worker. The previous done row stays.

`commitNormalizedInput` writes a new input row only when both the digest and the normalized input are present and the digest differs. An invalid draft stores the raw form and leaves the previous digest.

`duplicateVerifiedProject` calls `verifyRecord` for the input, accepted snapshot, and pinned catalog, then `commitDuplicate` inserts the new project in one transaction. The insert does not call the worker, does not copy action progress, and does not copy photo bytes. The caller lists the excluded attachment ids. Import already verified before its transaction; that order is unchanged.

The same catalog digest with a different body is refused. An empty catalogue is stored as origin `empty-real` without a new source-kind value. A hard cancel or a stalled search drops the activation lease. The next search waits for a fresh activation. A cooperative cancel keeps the lease.

## 11. z-product-contract migration and export

Adopted by [Dz-product-contract](../design/DECISIONS.md). No `dbVersion` change and no migration in that delivery. That node's recorded dbVersion is 2. exportVersion stays 1. The JSON envelope in `apps/web/src/persistence/export.ts` remains the export canonical. Photo bytes stay excluded and named. A later portable bundle is `z-portable-project`, not a silent rewrite of this envelope. Owned-library edits still do not rewrite snapshot bytes. The inventory event log is the next section, not a rewrite of this paragraph's export.

## 12. z-inventory-lifecycle ledger store

Adopted by [Dz-inventory-lifecycle](../design/DECISIONS.md). Live `DB_VERSION` is 3. The new store is `inventoryLedgers`, keyed by the project id. Row `schemaVersion` stays 1. The v2 to v3 upgrade writes `migration:2->3` and does not read or rewrite snapshots, inputs, or owned containers. A fresh database still records the earlier journal. Saves use the same revision CAS as the owned library. The worker call stays outside the transaction. `deleteProject` removes that project's ledger row in the project transaction and leaves the shared owned library. exportVersion 1 does not include the ledger. Opening a stored plan does not write this store.

## 13. z-catalog-provenance catalog rows

Adopted by [Dz-catalog-provenance](../design/DECISIONS.md). There is no new store and no dbVersion change. A reviewed snapshot is inserted with `putCatalog` only when Rust returns one. The same digest with a different body is still refused. A quarantine does not call `putCatalog`. Photo bytes are not stored. exportVersion 1 is unchanged. The review reply itself is not a row.

## 14. z-offer-bundles quote

Adopted by [Dz-offer-bundles](../design/DECISIONS.md). There is no new store and no dbVersion change. The quote reply is not a row, not an export field, and not part of a PlanSnapshot hash. A preview writes nothing. Applying a sold-out replacement persists only through the existing layout-edit snapshot. exportVersion 1 is unchanged.
