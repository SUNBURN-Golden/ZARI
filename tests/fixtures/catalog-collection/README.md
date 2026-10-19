# catalog-collection fixtures

Synthetic, minimal HTML written by hand for the parser and bot tests. They imitate
the *shape* the parsers read (structured data, spec rows, body text, links) and are
**not** recordings of the live sites: no real page was fetched to build them, no
image appears in them, and no real product text is reproduced. Whether the real
sites match these shapes is UNVERIFIED (see docs/CATALOG_COLLECTION.md).

- `robots/*.txt` — abridged robots.txt shapes matching the 2026-10-15 observations
  (29cm, IKEA root) plus an unreadable ohou case (HTML error page).
- `golden/` — a collection file and the bundle/manifest the Rust tool produces from it.
