# SpaceFit PR-F: catalog price, pack quantity and image counts

All numbers below were measured on 2026-11-11 at 08:45 KST (측정함). Sources were read only: R2 `catalog/v1/latest.json` → `b-c8fb29299e687ad0/bundle.json` (createdAt 2026-11-10T09:04:27Z = 18:04 KST, generator `zari-catalog-crawler-bot` v1) and the crawler code in `tools/catalog-crawler-bot`.

| Item | Count | Notes |
|---|---|---|
| Total items | 38 | daiso 29, muji 9. Storage-type categories (bin/cabinet/table) 33, `other` 5 |
| (a) Seller listing price (`priceText`) | **38/38** | All parse under the strict grammar (`2000 KRW` and similar). Prices run from 1,000 to 39,900 won |
| (b) Pack quantity | **0/38 as a field** | The bundle schema has no pack-quantity field. Only 3 names hint at a pack count (`5P`, `2개입`×2), and these hints are not used (추정, the name grammar is not trusted) |
| (c) Product image URL | **0/38** | The manifest sets `noImages: true`. `catalog_bundle.rs` rejects image keys, image-extension strings and `data:image` (`image_refused`), and the crawler tests check this too |

## What this means for the screen
- The Rust contract (`space_fit.rs::block_price`) already returns `Known { packPriceKrw, packQuantity: null, unitPriceKrw: null, basis: reference }` when there is a listing price but no pack quantity. Its test `unit_price_needs_a_known_exact_pack_quantity` covers this, so no contract change is needed.
- Until now the UI dropped this case into `가격은 파는 곳에서 봐 주세요`, so the live catalog showed no prices at all. PR-F shows the listing price for every one of the 38 items, without inventing a per-unit price.

## Image licensing
- Product photos belong to each seller (Daiso, Muji). We do not collect them, keep them, put them in the bundle, or ship them, and the code blocks all of these.
- Illustrations: we may only ship our own new hand-drawn illustration made with a photo as reference. Even then, no logos, brand marks or text, and the result must not look like a copy of the photo. Collecting photo URLs would need a separate crawler/bundle change, which is outside this PR. It would also need the sellers' terms of use and robots checked first (추정, legal review not done).
