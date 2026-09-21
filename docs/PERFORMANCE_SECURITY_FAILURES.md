# ZARI performance, privacy and failure contract

Status: proposed targets and behavior, no measured app achievement. TEST_STRATEGY.md owns benchmark fixture execution; this document owns product failure/security policy. No backend or external AI is authorized by it.

## 1. Performance is measured by stage

Reference workload: 1 compartment, 100 eligible variants, ≤20 containers, 100 item instances in ≤20 groups, 4 obstacles, 1 established compartment floor plus applicable container floors. Domain cap200 item instances is also tested separately. A 20-variant/5-container/20-item small fixture establishes baseline; an adversarial near-fit/no-layout fixture tests exhaustion. Catalog row count alone does not characterize contents packing/path validation cost.

Targets (desktop p95 / mobile p95): WASM cold transfer+instantiate1000/2000ms; normalization20/50ms; candidate filtering30/100ms; first independently evaluated physically valid candidate1000/2000ms where fixture is known to have one within reference budget; validation/BOM/finalization30/100ms; JSON encode/decode20/50ms; messaging residual10/30ms; React receipt-to-visible commit32/50ms; small draft transaction50/150ms; snapshot save+reload200/500ms. Search step8/16ms. Normal foreground cancel acknowledgement100/200ms; hard-cancel fallback may start at250ms without acknowledgement. These are engineering targets, not guarantees. A no-solution fixture has no first-valid-result latency to report.

Measure release builds at20 cold starts and50 warm runs per fixture/environment, with p50/p95/max, explicit CPU/memory/OS/browser/power/network settings, fixture digest, profile/budget/work counts, WASM raw/compressed sizes, payload bytes and available memory indicators. Initial web transfer-size target: WASM≤2MiB compressed and initial JS+CSS≤500KiB compressed; exceeding these triggers analysis, not removed validation. JS heap/WASM pages/peak memory measurements are identified separately; unavailable metrics remain unknown. First display target and search quality are distinct.

Time WASM download separately from instantiate; normalization separately from filtering/search/validator/serialization; queue/structured message cost separately from computation; React commit separately from receipt; IDB commitment separately from queuing. Host timing cannot influence deterministic result choice. Clock subtraction between contexts needs aligned time origins or a measured round-trip decomposition; report estimated transport residual rather than fabricated precision.

Do not run a GPU experiment without a repeatable CPU bottleneck. Serialization experiments compare JSON vs another candidate using identical outputs/fixtures, complete copies+encoding cost, and memory. Solver experiments compare equal work scope, independent validity, first-result and quality, not elapsed speed at undisclosed smaller candidate count. Same-session local profiling comes first; INV/EXP sessions are conditional, cost-aware investigation.

## 2. Local-first and offline boundary

Manual measurement, rules, solver and local catalog need no remote account or AI API. At first online load, static application assets are required. Full offline revisit/reload is not claimed until Task009 adds and verifies versioned same-origin app-shell caching. A service worker cannot silently mix JS/WASM/schema generations: fetch/validate complete build manifest, stage assets, activate atomically after in-flight work is closed or user agrees to reload, retain last complete build for recovery. Database schema downgrade protection remains mandatory. Cache static assets, not private projects/photos or arbitrary merchant pages. No background sync/transmission.

Browser storage can be evicted/deleted; explicit export is the portable recovery path. No backend auth is built before accounts exist. No telemetry by default; local diagnostic export is opt-in and excludes names/photos/URLs unless explicitly included by the user.

## 3. Security and future boundary ownership

| Surface | v1 protection | Later activation gate |
|---|---|---|
| Home photos | Optional local attachment only in009; explicit selection, byte/dimension limits, JPEG/PNG/WebP only, reject SVG/HTML, decode/re-encode derivative to remove EXIF/location metadata, revoke object URLs, delete orphan bytes, never infer mm | External vision requires User-approved provider/privacy change and per-request preview/consent |
| Catalog/project JSON | File≤10MiB, message≤5MiB, depth32 and domain caps; reject duplicates/unknown fields/versions/cycles; parse inert data; Rust domain validation before transaction; fresh project ID import | Bulk service ingestion requires separate bounded importer, no trust upgrade |
| CSV | Explicit columns/units/source rows; no auto unit guessing; validate Rust DTO; preview import before commit | No scraper implied by CSV support |
| Malicious labels/notes | Render React text, no dangerouslySetInnerHTML; bounded lengths; reject control characters in IDs, surface bidi controls safely in imported labels | Rich HTML requires an explicit sanitizer policy and tests |
| CSV export | Quote/escape cells and prefix dangerous leading formula characters after leading whitespace/control normalization; preserve original string in JSON export; test `= + - @` and tab/CR/LF prefixes | No spreadsheet formula interpreted as input instruction |
| External URLs | HTTPS only for reference product/evidence links; reject javascript/data/file/blob schemes and credentials, restrict lengths; user action opens with noopener/noreferrer; no auto fetch/image preview from catalog strings | URL fetching requires SSRF defense independent of link validation |
| Future scraper | Absent | Allowlisted hosts, DNS/IP/private/link-local/metadata-address checks at every resolution and redirect, redirect count/content size/time limits, outbound egress policy, no ambient credentials, terms/licensing review |
| Future AI | Absent; suggestions never authority | Minimal selected data, consent, redaction/EXIF stripping, retention policy, secure server adapter, limits/cancel, schema validation + user confirmation; content instructions never system commands |
| Secrets | No secrets in static bundle/env-generated public assets/local exports/logs; repo/CI least privilege, no production credentials needed | Provider credentials only server-side after approval |
| Dependencies | Pinned compatible versions/lockfiles, inspect license/install scripts, current advisories and transitive Cargo feature tree | Paid/unexpected license or service requirement is consequential stop |
| CSP/static hosting | Production same-origin script/worker, no remote fonts or arbitrary frames; allow only the WASM compilation capability required by tested browsers; generated Ajv avoids runtime Function compilation | Hosting headers verified at deployment, which is separately authorized |

Photo cap:10MiB per original,≤20 million decoded pixels,≤10 attachments per project; downsample only a disclosed derivative for display, never claim the derivative is the original. Keep original only if explicitly selected, local and subject to the same deletion/export policy. Local photo inclusion must not enter deterministic solver context unless a user-confirmed measured fact changes. Synthetic fixtures only in repository/CI. Photo access and product links are real network/privacy actions the UI must describe accurately.

The compiler does not certify furniture safety, children’s access safety or hazardous material compatibility. Known unsupported safety constraints block an executable recommendation; missing evidence remains a condition with a concrete next step. This is truthfulness in the product, not a generic disclaimer substituted for validation.

## 4. Failure taxonomy and user actions

Errors have `code`, `scope`, `fieldRefs/entityIds`, `reasonCode`, `details`, `retryable`, and `actions`. Transport/system errors do not overwrite the last accepted snapshot. A plan condition (price unknown) is not a crashed application. Multiple relevant conditions may coexist.

| Code | Meaning | Korean user message / action |
|---|---|---|
| invalid_input | malformed/out-of-range raw value | “폭을 1mm 단위로 입력해 주세요.” Focus exact field; preserve text |
| measurement_missing | required geometric measurement absent | “안쪽 높이를 확인해 주세요.” Measure or continue explicitly conditional where allowed |
| input_limit_exceeded | supported workload cap exceeded | “이번 계획의 물건 수 한도를 넘었습니다.” Split group/problem; no silent truncation |
| catalog_empty | selected snapshot has zero variants | “선택한 카탈로그가 비어 있습니다.” Use demo/import or direct/owned-only path |
| no_candidate_matches | evaluated catalog has no supported matching physical candidate | Show filters/rejected reasons; change recipe/filter or reuse/direct |
| catalog_data_unknown | candidate exists but required fields missing | “제품 내경 확인이 필요합니다.” Add field-level evidence; no fake default |
| no_layout_found_within_search_scope | finite supported search exhausted without candidate | “지원하는 배치 방식에서 안을 찾지 못했습니다.” Show scope; adjust constraints/strategy |
| search_budget_exhausted | deterministic work limit reached | Show consumed/limit; keep completed candidates; narrow or choose larger explicit budget |
| search_cancelled | user cancelled current search | “계산을 취소했습니다.” Keep input/previous plan; retry |
| unsupported_geometry | shape/path/stack/primitive outside implemented model | “이 설치 방식은 아직 검증하지 않습니다.” Return to supported single compartment |
| validation_failed | known hard constraint or integrity failure | Highlight exact object/check; edit/re-measure; no accepted snapshot |
| stale_result | old identity or changed raw input | Drop old response; “입력이 바뀌어 재계산이 필요합니다.” Recompute |
| worker_crashed | trap, worker error or failed initialization | “계산을 다시 시작할 수 있습니다.” Recreate worker; input remains |
| worker_interrupted | hard cancel/watchdog | Identify interrupted work, no deterministic exhaustion claim; retry |
| persistence_failed | DB unavailable/quota/transaction failure | “이 기기에 저장하지 못했습니다.” Retry/export, no saved indicator |
| revision_conflict | another tab committed first | Open latest, save copy, export local draft; no silent overwrite |
| unsupported_schema | app cannot interpret file/DB version | Keep raw data read-only; update app/export |
| record_corrupt | digest/schema/reference mismatch | Recovery view, intact history or raw export; no speculative repair |
| price_unknown | one or more prices not observed | “확인된 상품 소계만 표시합니다.” Show missing lines/source |
| shipping_unknown | delivered total cannot be finalized | “배송비 확인이 필요합니다.” Seller reference; never label free |
| inventory_unknown | stock not observed/currently unverifiable | “판매처에서 재고를 확인해 주세요.” Not an available badge |
| inventory_unavailable | observed out-of-stock | Keep physical alternative, exclude purchase-ready; select offer/variant |
| operation_not_supported | capability absent in this build | Explain implemented scope; never return fabricated output |
| revision_exhausted / arithmetic_overflow | bounded exact arithmetic cannot proceed | Preserve project; export/duplicate or correct input; never wrap |

No-purchase paths can proceed when catalog_empty because they need no retailer variants, provided direct/owned data suffices. `no_candidate_matches` and `catalog_data_unknown` include diagnostics so users distinguish absent products from absent facts. A stale historical view remains inspectable and labeled; its BOM and diagram stay bound to that historical snapshot.

## 5. Stop vs recover

Recover locally from invalid inputs, cancellation, stale responses and transient save errors. Stop the affected computation on unsupported schema/geometry, arithmetic overflow, missing hard safety evidence or invariant violation. Stop implementation scope for a missing frozen contract, destructive migration or unapproved external/paid/privacy change. No retry policy quietly expands scope, changes strategy, discards objects or transmits private data.
