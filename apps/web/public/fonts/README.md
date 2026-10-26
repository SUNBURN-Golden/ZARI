# Self-hosted OFL fonts

Adopted under D-redesign-20261026. Prepared mockup faces were regenerated for full page coverage from original fonts, with their OFL notices retained. No CDN, runtime download from an external host or Python build dependency.

- IBM Plex Sans KR SemiBold 600 and IBM Plex Mono Regular 400: original TTFs and OFL from `https://raw.githubusercontent.com/google/fonts/main/ofl/ibmplexsanskr/` and `https://raw.githubusercontent.com/google/fonts/main/ofl/ibmplexmono/`, retrieved 2026-10-26; exact inputs pinned below by SHA-256.
- Pretendard 1.3.9 Regular 400 / Medium 500: original OTFs from `https://raw.githubusercontent.com/orioncactus/pretendard/v1.3.9/packages/pretendard/dist/public/static/`. Licence reused from the owner-prepared fonts directory.
- Generated with fontTools subset/WOFF2: KS X 1001's 2,350 precomposed Korean syllables, Latin U+0020–00FF, general punctuation U+2000–206F and supported characters present in current TS/TSX/JSON UI source. Mono covers ASCII plus ×. FontTools intersects coverage with each original cmap; unsupported characters use the fallback stack.
- Pretendard has one base subset and six disjoint Korean blocks per weight; CSS unicode-range loads only matching blocks. Plex KR uses one heading weight. All faces use font-display: swap. All 16 WOFF2 files total **696,876 bytes**, above the design estimate because of block overhead and additional UI characters. `subsets.json` pins emitted byte sizes/hashes.
- Reproduction: use fontTools `subset.Subsetter` with the coverage above and original files below, `recalc_timestamp=False`, `font.flavor='woff2'`; Pretendard Korean blocks start at AC00 with 0800 codepoint increments through D7AF. Originals are development inputs and are not bundled. For a new UI character outside this coverage, regenerate the affected subset or retain explicit fallback.
- The production build manifest recursively includes every public font and licence, supporting offline revisit. Typography does not change any domain calculation or stored text.

| Original file | Version metadata | SHA-256 |
| --- | --- | --- |
| Pretendard-Regular.otf | Version 1.309;Glyphs 3.2 (3225) | `3ffbacde6ab8411f1d2db54bb9b1f0b3ee2a738932033722cf0388c06aed1c93` |
| IBMPlexMono-Regular.ttf | Version 2.3 | `6a3412f058c7d8dfd9170c41e85ade48e5156ecb89356110ca57a0a27734af46` |
| Pretendard-Medium.otf | Version 1.309;Glyphs 3.2 (3225) | `d39e50e4bb52b4993b6a4eeb821a171254745bd824446af01e1f616b89fface0` |
| IBMPlexSansKR-SemiBold.ttf | Version 1.001 | `823c1956adf56c27c06b062725dfce23f266e4fd1366290f2957c8407482a817` |

## Modified font names and notices

The OFL notices reserve “Plex” and “Pretendard”. These glyph subsets are Modified Versions, so embedded family/full/PostScript/unique names are renamed to **ZARI Draft Sans**, **ZARI Reading Sans** and **ZARI Dimension Mono**. Original copyrights, designer/source references and OFL licence/link metadata are retained. CFF family/full/PostScript names are renamed too. No glyph outlines or metrics are altered by this naming correction. CSS @font-face family strings remain application matching aliases for the approved source typefaces; they do not identify the embedded font menu names.

Authority: [OFL FAQ §§2.6 and 5.2–5.3](https://openfontlicense.org/ofl-faq/): subsetting is modification; reserved names are replaced internally, while matching/substitution is outside the licence scope. The CSS source names and this documentation acknowledge provenance and do not imply these subsets are unmodified upstream releases. All shipped PR-3 subsets use these modified names; use the current subsets.json for their byte hashes. Unrenamed preparation outputs are superseded before the first font branch can ship.

## Loading and weight policy

The heading subset is preloaded with a relative local URL in index.html. Body faces are 400/500 and the heading face is 600; body strong/b use 500 and all six heading levels use 600. Font synthesis is disabled so an unsupported weight cannot silently produce faux bold. No extra 700 file is fetched. Font-display remains swap for fallback while the local bytes load. Production CSS URL verification is recorded in docs/redesign/PR3.md.
