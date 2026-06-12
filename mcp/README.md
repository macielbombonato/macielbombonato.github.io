# MCP — Marketing Cloud Personalization assets

Source-of-truth for everything we deploy into Salesforce Marketing Cloud
Personalization for `https://www.bombonato.net`.

## Layout

```
mcp/
├── README.md                          ← this file
├── sitemap.js                         ← Sitemap JS (paste into MCP Visual Editor → Sitemap)
└── templates/
    ├── related_careers.hbs            ← Handlebars markup — design-only mirror
    ├── related_careers.js             ← Clientside Code — INTENTIONAL NO-OP
    ├── related_careers.ts             ← Serverside Code — recs binding (Item Type Article)
    ├── related_blog.hbs               ← Handlebars markup — design-only mirror
    ├── related_blog.js                ← Clientside Code — INTENTIONAL NO-OP
    └── related_blog.ts                ← Serverside Code — recs binding (Item Type Blog)

assets/js/mcp-related-renderer.js      ← SITE-SIDE RENDERER (actual render path)
                                         loaded synchronously from
                                         _includes/head.html and head-noads.html
                                         BEFORE the MCP beacon
catalog/articles.csv                   ← Article feed (career)         — served at /catalog/articles.csv
catalog/blogs.csv                      ← Blog feed (native)             — served at /catalog/blogs.csv
catalog/topics.csv                     ← Topics feed (reference items)  — served at /catalog/topics.csv
catalog/tags.csv                       ← Tags feed (reference items)    — served at /catalog/tags.csv
catalog/technologies.csv               ← DRAIN-only — all rows archived=true (v3 → v4 deprecation)
tools/generate_catalog_feed.py         ← Regenerates ALL FIVE CSVs from Jekyll _posts
tools/migrate_technologies_to_tags.py  ← One-shot v3 → v4 source migration (already executed)
tools/audit_taxonomy.py                ← Vocabulary lint: cross-field collisions + near-duplicates
```

Each Web Campaign template in MCP has 4 tabs (`Handlebars`, `CSS`,
`Clientside Code`, `Serverside Code`). We version three of them but
since rendering moved out of MCP (see "Render path" below) only
the Serverside Code is actually live:

| Tab               | Versioned file | Role                                              |
|-------------------|----------------|---------------------------------------------------|
| `Serverside Code` | `.ts`          | Binds the marketer-selected Recipe → returns `items`. **Live.** |
| `Clientside Code` | `.js`          | **Intentional no-op.** All rendering and tracking moved to `assets/js/mcp-related-renderer.js`. Leaving code here would risk a double-render. |
| `Handlebars`      | `.hbs`         | Design-only mirror of the card DOM the site renderer produces. Kept in the repo for reviewability; not in the runtime path. |
| `CSS`             | —              | Not versioned. The `.related-card` styles live in `assets/css/demo.css` and ship with the Jekyll site |

The Recipe itself is **selected by the marketer in the Campaign
editor**, not hardcoded — so the same template can power both the
careers and the blog widget if you reassign the recipe.

## Render path

```
┌────────────┐    request    ┌───────────┐   campaignResponses    ┌──────────────┐
│  Browser   │ ─────────────▶│ MCP beacon│ ─────────────────────▶│ MCP server   │
└────────────┘               └───────────┘                       └──────────────┘
       ▲                                                                 │
       │ fetch/XHR                                                       │
       │ response intercepted                                            │
       │ BEFORE MCP can apply()                                          │
       │                                                                 │
       │     ┌──────────────────────────────────────┐                    │
       └─────│  assets/js/mcp-related-renderer.js   │◀───────────────────┘
             │  • fetch + XHR hooks armed in <head> │
             │  • walks campaignResponses[]         │
             │  • renders cards into                │
             │    #mcp-related-careers              │
             │    #mcp-related-blog                 │
             │  • fires impression + click events   │
             └──────────────────────────────────────┘
```

Why we bypass MCP's `apply()` entirely (and don't even use the Template's
Clientside Code anymore): on Rule Based Test campaigns the Content Zone
Action could not be configured to inject into our custom
`<div id="mcp-related-careers" class="related-grid">` — the server kept
returning a full `payload.items` array but the zone stayed empty, with
no error. A previous attempt to override `registerTemplate` from inside
the Template's Clientside Code also failed silently (the MCP runtime
sandboxes the bundle). The site-side renderer removes that single point
of failure: as long as MCP returns a `campaignResponses` payload (which
it does on every detail page-load), we intercept and render.

## Workflow

1. **Edit** the relevant file in this folder (e.g. `sitemap.js`).
2. **Commit** the change so we have history of what was deployed.
3. **Apply** in MCP:
   - Open MCP UI → Web → Sitemap → tab "Sitemap JS"
   - Paste full file contents
   - SAVE → EXECUTE (dry-run) → PUBLISH

## Why we version this

- MCP UI has version history but it's painful to diff.
- Local files give us git blame, code review, and the ability to roll
  back instantly.
- The agent (Cursor) can edit `sitemap.js` directly and only ask the
  human to copy/paste into MCP.

## Catalog model

**FOUR Item Types** (v4), split into two roles:

```mermaid
graph LR
    A[Article<br/>career, ~28 items]
    B[Blog<br/>posts, ~25 items]
    T[Topics<br/>~10 items]
    TG[Tags<br/>~240 items]

    A -. relatedCatalogObjects.Topics .-> T
    A -. relatedCatalogObjects.Tags .-> TG
    B -. relatedCatalogObjects.Topics .-> T
    B -. relatedCatalogObjects.Tags .-> TG

    style A fill:#bfdbfe
    style B fill:#bfdbfe
    style T fill:#fef3c7
    style TG fill:#fef3c7
```

- **Content types** — the things the visitor actually views and that
  Recipes recommend:
  - `Article` (custom) — career experiences
  - `Blog` (native `EVGBlog`) — blog posts
- **Reference types** — describe content and let Recipes filter by
  related-catalog-object membership (a graph filter, NOT string match):
  - `Topics` (custom) — curated PT-BR taxonomy from `_data/topics.yml`
  - `Tags` (custom) — free-form flat vocabulary on both Article + Blog

> **v3 → v4**: `Technologies` was a third reference Item Type until
> v4. The audit (`tools/audit_taxonomy.py`) found that the same slug
> (`java`, `aws`, `docker` …) was a Technology on career posts and a
> Tag on blog posts — single concept split across two Item Types. v4
> collapses Technologies into Tags. The Item Type is being drained
> from MCP via `catalog/technologies.csv` (every row `archived=true`)
> and the Item Type itself can be deleted from the MCP UI once the
> ingest completes.

### `Article` Item Type (custom config — career experiences only)

- **System attributes** (already on the Item Type by default): `name`,
  `url`, `imageUrl`, `description`, `promotable`, `archived`,
  `numRatings`, `rating`, `published`, `expiration`, `categories`.
- **Custom attributes** we register: `company` (String), `startDate`
  (Date), `endDate` (Date), `location` (String), `industry` (String),
  `seniority` (String).
- **Related catalog objects** (multi-object relationships):
  - `Topics` — was the `topics` MultiString attribute (v2)
  - `Tags` — built-in polymorphic Tag slot in v1+v2, dedicated Item
    Type in v3+; in v4 it absorbed everything that was previously
    in the `Technologies` Item Type.
- **Categories** (polymorphic `type: "c"`): no longer used — the legacy
  `career` Category can be archived/deleted after migration.

### `Blog` Item Type (native — `EVGBlog`, blog posts only)

- **System attributes** (already on the native `Blog` Item Type):
  - `name` — used as the **post title** ("Use Item `name` for title")
  - `url`, `imageUrl`, `description`
  - `subtitle` (Blog-specific), `modifiedTime` (Blog-specific)
  - `date` — the Blog-native Date attr in this dataset's config. The
    native attribute is `publishedDate` per MCP docs but the Item
    Type in `bombonato_prd` registers it as `date`; keep both
    `tools/generate_catalog_feed.py` and `mcp/sitemap.js` in sync
    with whatever the MCP UI shows.
  - `expiration`, `promotable`, `archived`, `numRatings`, `rating`,
    `categories`
- **No custom attributes**. `topics` and `tags` were attributes in v2
  and are now connected via `relatedCatalogObjects` (see below).
- **Related catalog objects**:
  - `Topics` — was the `topics` MultiString custom attribute (v2)
  - `Tags` — was the built-in polymorphic Tag slot (v1+v2)

### `Topics`, `Tags` (custom Item Types — reference)

Both are minimal — just the two system fields:

- `id` — slug. Examples: `consulting`, `marketing-cloud`, `git`.
- `name` — human-readable label. Examples: `Consultoria`,
  `Marketing Cloud`, `Git`. Stored separately so the MCP Catalog UI
  shows friendly labels even though the relation key is the slug.

No custom attributes are registered. They exist purely to anchor the
relations from Article/Blog.

> `Technologies` was a third reference Item Type in v3. It is being
> retired in v4 — the CSV feed still emits it but every row is
> `attribute:archived=true` so the MCP ETL archives all items on
> upload. Delete the Item Type from the MCP UI (Settings → Catalog →
> Item Types) once the drain ingest completes.

### How the relations are wired

Beacon (sitemap) — `mcp/sitemap.js` sends:

```js
catalogObject: {
  type: "Article",                       // or "Blog"
  id: "202602-Salesforce",
  attributes: { /* name, url, ... */ },
  relatedCatalogObjects: {
    Topics: ["consulting", "marketing-tech"],
    Tags:   ["salesforce", "marketing-cloud", "agentforce", "consulting", "agile"]
  }
}
```

Keys are CASE-SENSITIVE and must match the Item Type names in MCP UI
exactly. The IDs in each array must already exist in the referenced
Item Type — feed-ingestion order matters (see "Catalog Feeds" below).

CSV ETL — `tools/generate_catalog_feed.py` emits:

```csv
id,catalogObjectType,...,relatedCatalogObject:Topics,relatedCatalogObject:Tags
202602-Salesforce,Article,...,consulting|marketing-tech,salesforce|marketing-cloud|agentforce|consulting|agile
```

Column prefix is `relatedCatalogObject:` (SINGULAR), values are
PIPE-separated IDs. Same convention as the built-in `categories`
column.

### Vocabulary lint

`tools/audit_taxonomy.py` walks every career + blog post and reports:

- **Cross-field collisions** — same slug used as `topics` and `tags`
  on the same post, or as `topics` here / `tags` there. Exit code 1.
- **Near-duplicates** — slugs likely meaning the same thing
  (`micro-services` vs `microservices`). Warning only.
- **Asymmetry** — slugs present only in career or only in blog. Info.

Run before committing post edits:

```bash
python3 tools/audit_taxonomy.py
```

### Why we promoted Topics / Tags to Item Types — and collapsed Technologies

The codebase went through four architectures before landing here:

| Version | Layout                                | Failure mode |
|---------|---------------------------------------|--------------|
| **v1**  | One `Article` Item Type + polymorphic `categories=career\|blog` | Behavioral Recipes (Item Affinity / Co-View) apply Include Rules as a POST-rank filter; career has ~3× the views of blog, the top N comes back full of career, the filter drops everything, and the engine falls back to a "popular items" bucket that IGNORES the Include Rule. Net effect: blog Recipes silently returned career items. |
| **v2**  | Split into `Article` (career) + native `Blog` (posts); `topics`/`technologies` still custom attributes | Item Type mismatch fixed, BUT Recipes filtering "by topic" still had to do string equality on a MultiString — fragile (any whitespace / casing difference broke it) and impossible to build "more by this Topic" landing pages because attribute values are not catalog objects. |
| **v3**  | `Article` + `Blog` + `Topics` + `Technologies` + `Tags` all as Item Types; relations via `relatedCatalogObjects` | Recipes filter via first-class graph queries. BUT `Technologies` was career-only, while the SAME slug (`java`, `aws`, `docker` …) was a Tag on blog posts — split single concept across two Item Types, blocking cross-content affinity ranking. Caught by `audit_taxonomy.py`. |
| **v4** (current) | `Article` + `Blog` + `Topics` + `Tags`. `Technologies` drained via CSV `archived=true` and removed from MCP UI manually. Source `technologies:` front-matter folded into `tags:` by `tools/migrate_technologies_to_tags.py` | Single flat vocabulary for free-form labels. Cross-content (career ↔ blog) affinity Recipes can now correlate on the SAME Tags Item Type. |

The Item Type discriminator (`restrictItemType("Article")` /
`restrictItemType("Blog")`) plus the new related-catalog filters
combined replace ALL prior attribute-string-match Include Rules.

## Sitemap architecture

```mermaid
flowchart TD
    A[init - cookieDomain] --> B[initSitemap]
    B --> C[global]
    B --> D[pageTypeDefault]
    B --> E[pageTypes]
    C --> C1[onActionEvent<br/>enriches every event with<br/>channel, referrer, UTMs]
    C --> C2[listeners<br/>track clicks on contact links]
    D --> D1[Default Page View<br/>fallback so interaction is never null]
    E --> E1[home<br/>Home Page View + zones + listeners]
    E --> E2[career_detail<br/>View Catalog Object + View Career Detail]
    E --> E3[blog_detail<br/>View Catalog Object + View Blog Detail]
```

## Custom interactions sent by the sitemap

| Name                      | When                                           | Extra fields                  |
|---------------------------|------------------------------------------------|-------------------------------|
| `Default Page View`       | Any page that doesn't match a defined pageType | —                             |
| `Home Page View`          | URL is `/`                                     | —                             |
| `View Catalog Object`     | Career or blog detail pages                    | full catalogObject            |
| `View Career Detail`      | Career detail page load (once/page)            | —                             |
| `View Blog Detail`        | Blog detail page load (once/page)              | —                             |
| `View Experience Details` | Click on "Mais detalhes" on home cards         | `role`, `company`             |
| `Contact Click`           | Click on mailto / linkedin / github links      | `destination`, `kind`         |

## Custom interactions sent by the template Clientside Code

These fire from `mcp/templates/related_*.js`, **not** from the sitemap.
They run inside the rendered Campaign so the impression is only counted
when the template actually drew cards on the page.

Each widget uses a **distinct event name** — sharing a single name
across both widgets trips the MCP beacon's client-side rate limiter
when both render on the same detail page (see the gotcha below).

| Name                    | When                                                    | Extra fields                                       |
|-------------------------|---------------------------------------------------------|----------------------------------------------------|
| `View Related Careers`  | `related_careers` widget rendered ≥1 card, once/page    | `widget`, `itemCount`                              |
| `Click Related Career`  | Visitor clicked a card in `related_careers`             | `widget`, `targetId`, `targetName`, `destination`  |
| `View Related Blog`     | `related_blog` widget rendered ≥1 card, once/page       | `widget`, `itemCount`                              |
| `Click Related Blog`    | Visitor clicked a card in `related_blog`                | `widget`, `targetId`, `targetName`, `destination`  |

## Gotchas (lessons learned)

### `interaction:` (singular) — NOT `interactions:` (plural)

The pageType-level interaction key is **singular** (`interaction`). If
you write `interactions: [{...}]` (plural array form), the SDK
silently ignores it and sends events with `interaction: null`. The
MCP server then rejects those events with **400 Bad Request**, and
because the 400 response lacks CORS headers, the browser surfaces it
as a **CORS error** in the console.

Diagnosis tip: if you see "CORS blocked" + 400 on `/api2/event/...`,
the smoking gun is `"interaction": null` in the decoded payload of the
failing request. The fix is renaming the key, not anything related to
the dataset's allowed domains or auth.

### Always provide `pageTypeDefault`

Without a `pageTypeDefault.interaction`, any page view that doesn't
match a pageType ends up with `interaction: null`, triggering the
same 400 + CORS pattern as above.

### `topics` / `tags` are NOT attributes anymore

They were custom attributes in v2 but are now full Item Types
connected via `relatedCatalogObjects`. The sitemap MUST send them at
the top of `catalogObject`, NOT inside `attributes`:

```js
catalogObject: {
  type: "Article",
  attributes: { /* ... */ },           // ← NO topics/tags here
  relatedCatalogObjects: {             // ← here, keyed by Item Type name
    Topics: [...],
    Tags:   [...]
  }
}
```

Each value is `string[]` of IDs into the referenced Item Type. Use the
`fromCsvAttr` helper to convert the comma-separated `data-article-*`
attributes on the DOM into the right shape. If a value lands inside
`attributes` instead of `relatedCatalogObjects` the MCP server stores
it as a stringified opaque attribute and no Recipe filter will match.

> v3 also had `Technologies` here. Removed in v4 — `tags` absorbed
> it. Do not re-add `Technologies:` to `relatedCatalogObjects` even
> if the Item Type still appears in the MCP UI during the drain.

### Handlebars helpers in MCP are limited — no `gt`, `lt`, `eq`, etc.

MCP's Handlebars engine only ships the built-in helpers (`#if`,
`#each`, `#with`, `#unless`, `lookup`, `log`) plus a few MCP-specific
ones (`formatDate`, `formatCurrency`). Comparison helpers like `gt`,
`lt`, `eq`, `and`, `or` are **not registered** and throw
`ReferenceError: gt is not defined` at render time.

For "is the array non-empty?" use `{{#if items.length}}` — an empty
array has `length: 0`, which Handlebars treats as falsy.

### `isMatch` runs early — use `matchWhenReady` for DOM-based matches

`SalesforceInteractions.initSitemap` may run before the `<article>`
element is in the DOM on the first navigation. A synchronous
`document.querySelector(...)` returns `null` in that window. The
`matchWhenReady` helper returns a Promise that resolves either on
`DOMContentLoaded` or after a 1.5s safety timeout.

## Content zones currently declared

| Zone              | Defined on                      | Selector                  |
|-------------------|---------------------------------|---------------------------|
| `hero_banner`     | `home`                          | `header, .hero`           |
| `main_content`    | `home`                          | `main, body`              |
| `related_careers` | `career_detail`, `blog_detail`  | `#mcp-related-careers`    |
| `related_blog`    | `career_detail`, `blog_detail`  | `#mcp-related-blog`       |

The `related_*` zones are rendered as hidden `<aside>` blocks in
`_layouts/career.html` and `_layouts/blog.html`. They appear once
an MCP Web Campaign injects items into the inner `.related-grid`
(CSS rule `.related-articles:has(.related-grid:not(:empty))`).

## Recipes & Campaigns (managed in MCP UI)

| Recipe                       | Item Type | Filters                                          | Target Zone        |
|------------------------------|-----------|--------------------------------------------------|--------------------|
| `Related Career Experiences` | `Article` | "Share ≥1 related Topic OR Tag with current item" (Include Rule on related catalog object membership — graph filter) | `related_careers`  |
| `Related Blog Articles`      | `Blog`    | "Share ≥1 related Topic OR Tag with current item" (same kind of Include Rule) | `related_blog`     |

> **v4 migration note**: any Include Rule still referencing the
> `Technologies` related catalog object will silently match zero items
> once the drain ingest completes (every Technologies item becomes
> `archived=true`). Edit each affected Recipe in MCP UI and replace
> the Technologies filter with the equivalent Tags filter.

The Item Type itself scopes the candidate pool. The Include Rule on
**related catalog object membership** is the new way to refine the
list — it's a first-class graph query, NOT a string match on a
MultiString attribute, so it does not hit the v1 "behavioral recipe
silently drops the Include Rule" footgun.

Each Recipe is consumed by a Web Campaign that:
1. Targets pages matching `career_detail` OR `blog_detail`
2. Renders into its respective zone
3. The site-side renderer (`assets/js/mcp-related-renderer.js`)
   intercepts the response and renders `.related-card` markup
   (styles in `assets/css/demo.css`)

### Catalog Feeds — 5 CSVs

Beacon events update item attributes and increment view counts, but
they do **not** auto-populate the Item Types themselves and do **not**
auto-link Articles/Blogs to their related Topics / Technologies / Tags.
Without an initial bulk load, Recipes have no eligible pool and any
related-items campaign renders empty.

We bulk-load via **five** CSV catalog feeds — two for content
(`articles.csv`, `blogs.csv`) and three for reference items
(`topics.csv`, `technologies.csv`, `tags.csv`). Beacon events keep
handling behavioral signals and attribute updates on top.

**Workflow**

1. Edit posts in `career/_posts/` or `blog/_posts/` as usual.
2. From the repo root, regenerate all CSVs:
   ```bash
   python3 tools/generate_catalog_feed.py
   ```
   Output:
     - `catalog/topics.csv`        — ~10 rows, `catalogObjectType=Topics`
     - `catalog/technologies.csv`  — ~96 rows, `catalogObjectType=Technologies`
     - `catalog/tags.csv`          — ~171 rows, `catalogObjectType=Tags`
     - `catalog/articles.csv`      — ~28 career rows, `catalogObjectType=Article`
     - `catalog/blogs.csv`         — ~25 blog rows, `catalogObjectType=Blog`
3. Commit all CSVs (and any post edits).
4. Push to GitHub Pages. Jekyll serves them at
   `https://www.bombonato.net/catalog/<filename>.csv`.
5. In MCP UI → Feeds Dashboard, **upload in this order**:

   ```mermaid
   flowchart LR
       T[1. topics.csv] --> AB
       TC[1. technologies.csv] --> AB
       TG[1. tags.csv] --> AB
       AB[2. articles.csv + blogs.csv<br/>references the IDs above]
   ```

   The reference feeds MUST land first because the Article/Blog rows
   carry `relatedCatalogObject:Topics`, `relatedCatalogObject:Technologies`,
   and `relatedCatalogObject:Tags` columns that reference IDs by string.
   The ETL rejects any row whose related-catalog-object reference points
   to an item that does not yet exist — uploading articles.csv before
   topics.csv will return "Related catalog object not found" and drop
   the whole batch.

   Per feed: Validate → Commit. Production filename pattern MUST start
   with `catalog-object-` (e.g. `catalog-object-topics-YYYYMMDD.csv`)
   to match the regex; the Gear Editor /testing/ path is dry-run only
   and never persists. ETL = `Catalog Object ETL` on all five.

**Reference-feed schema** (`topics.csv`, `technologies.csv`, `tags.csv`)

Three columns, identical layout — only `catalogObjectType` differs:

| Column              | Notes                                                |
|---------------------|------------------------------------------------------|
| `id`                | Slug. Used as the relation key from Article/Blog.    |
| `catalogObjectType` | `Topics`, `Technologies`, or `Tags`                  |
| `attribute:name`    | Human-readable label (PT-BR for topics; humanized slug for technologies and tags). The generator applies a `NAME_OVERRIDES` table for known acronyms (`J2EE` → `Java EE`, `dotnet` → `.NET`, etc.); edit `tools/generate_catalog_feed.py` to add more. |
| `attribute:archived` | System Boolean — always `false`. See "archived = false on every row" below. |

**`articles.csv` schema** (Item Type `Article`, career)

| Column                                  | Notes                                              |
|-----------------------------------------|----------------------------------------------------|
| `id`                                    | `YYYYMM-slug`, matches `data-article-id`           |
| `catalogObjectType`                     | Always `Article`                                   |
| `attribute:name`                        | Plain title — **no `[Carreira]` prefix**           |
| `attribute:url`                         | Absolute URL                                       |
| `attribute:description`                 | Front matter `description:` or first ~200 chars    |
| `attribute:company`                     | Custom String                                      |
| `attribute:startDate`                   | Custom Date — ISO `YYYY-MM-DD`                     |
| `attribute:endDate`                     | Custom Date — empty if "ATUAL"                     |
| `attribute:location`                    | Custom String                                      |
| `attribute:industry`                    | Custom String                                      |
| `attribute:seniority`                   | Custom String                                      |
| `attribute:published`                   | System Date — Article uses `published`             |
| `attribute:archived`                    | System Boolean — always `false`. See "archived = false on every row" below. |
| `relatedCatalogObject:Topics`           | Pipe-separated IDs into Item Type `Topics`         |
| `relatedCatalogObject:Technologies`     | Pipe-separated IDs into Item Type `Technologies`   |
| `relatedCatalogObject:Tags`             | Pipe-separated IDs into Item Type `Tags`           |

**`blogs.csv` schema** (Item Type `Blog`, native)

| Column                                  | Notes                                              |
|-----------------------------------------|----------------------------------------------------|
| `id`                                    | `YYYYMM-slug`, matches `data-article-id`           |
| `catalogObjectType`                     | Always `Blog`                                      |
| `attribute:name`                        | Plain title — **no `[Blog]` prefix** ("Use Item `name` for title") |
| `attribute:url`                         | Absolute URL                                       |
| `attribute:description`                 | Front matter `description:` or first ~200 chars    |
| `attribute:date`                        | System Date — the Blog Item Type in this dataset registers the publish date under the attribute name `date` (NOT `publishedDate`). Update both this column and `tools/generate_catalog_feed.py` if you rename it in the MCP UI. |
| `attribute:archived`                    | System Boolean — always `false`. See "archived = false on every row" below. |
| `relatedCatalogObject:Topics`           | Pipe-separated IDs into Item Type `Topics`         |
| `relatedCatalogObject:Tags`             | Pipe-separated IDs into Item Type `Tags`           |

**archived = false on every row**

Every row in every feed carries `attribute:archived,false`. Sending
this explicitly (rather than leaving the column out) is intentional:
the ETL respects the `archived` flag as a per-row state and, without
the column, items that were previously archived in the MCP UI stay
archived and remain invisible to Recipes. With `false` hard-coded the
feed always reactivates anything that appears in the source data,
which matches our mental model — if a post exists in `_posts/`, it
should be live in the catalog. To intentionally archive an item,
archive it in the MCP UI AND drop the corresponding row from the
source `_posts/` directory (or the generator will keep re-emitting
it with `archived=false` and resurrect it on the next ingest).

**Why no SFTP**

MCP also supports SFTP-based feed delivery. We use the HTTP variant
because GitHub Pages already hosts the site over HTTPS, so the CSVs
ship with the regular Jekyll build pipeline — no extra infrastructure
required. If a feed grows or needs scheduling, swap to SFTP without
changing the upstream generator.

### Template Serverside Code (`recs` module)

MCP Personalization exposes the Recommendations API via the `recs`
module. Templates that need recipe-driven items follow this pattern:

```ts
import { RecommendationsConfig, recommend } from "recs";

export class RelatedCareersTemplate implements CampaignTemplateComponent {
    @title("Recommendation Settings")
    recsConfig: RecommendationsConfig = new RecommendationsConfig()
        .restrictItemType("Article");

    run(context: CampaignComponentContext) {
        try {
            return { items: recommend(context, this.recsConfig) };
        } catch (e) {
            return { items: [] };
        }
    }
}
```

Key points:

- **`.restrictItemType("Article")` is required**, not optional. Without
  it the picker in the Campaign editor exposes an `Item Type` dropdown
  that defaults to `"Product"` (the MCP placeholder Item Type). Our
  catalog only ships `Article`, so the Recipe dropdown then shows
  **"No options"**, the marketer can't pick a Recipe, and at runtime
  `recommend()` is called with `recipeId: null` and throws the
  "System service exception" — see the gotcha below.
- The `@title`/`@subtitle` decorators expose the recipe picker in the
  Campaign editor — the marketer chooses which Recipe runs.
- `recommend(context, recsConfig)` returns an array of catalog items
  shaped like `{ _id, type, attributes: { ... } }`, which the
  Handlebars template iterates with `{{#each items}}`.
- The `try/catch` is **defensive** — see the gotcha below.
- For programmatic / hardcoded recipes (no marketer picker), use
  `context.services.recommendations.recommend({ recipeId, ... })`
  inside `run()` instead.

### `recommend()` may throw a System Service Exception — wrap it

When `recommend(context, this.recsConfig)` runs and any of these is
true, MCP throws at the call site:

```
Server: System service exception via
  [recommend : context.services.recommendations.recommend(request)]
```

Common triggers:

1. **No Recipe picked in the Campaign yet** (or the picker shows
   "No options" because the Item Type was left as the default
   "Product" — see the previous bullet about `.restrictItemType`).
   Either way, `recommend()` has no `recipeId` to execute and throws.
2. **Recipe pool empty because the CSV ETL hasn't run.** Without
   `catalog/articles.csv` (and `catalog/blogs.csv`) ingested, the
   Item Type has no eligible items and the Recipe throws instead of
   returning empty. Bulk-load first, then publish the Recipe.
3. **Recipe references an attribute that is not registered on the
   Item Type** (e.g. `author`, `publishDate` on Article — both
   unregistered; use the System Attribute `published` on Article and
   `date` on Blog instead — this dataset registers the Blog publish
   date under the attribute name `date`, not the doc-default
   `publishedDate`).
4. **Strict Catalog Security is ON.** Toggle OFF at
   `Settings → Catalog and Profile Objects → Catalog Settings →
   Security → Enable Strict Catalog Security` — when ON the beacon
   only registers item IDs and Recipes that read attributes fail.
5. **Recipe expects "related to current item" but the page has no
   active catalog object in context** (e.g. testing the campaign on
   `/` or any page without a `ViewCatalogObject` event).

The unhandled exception kills the entire campaign render — the user
sees a broken zone. Wrapping `recommend()` in `try/catch` returns an
empty `items` array, and the Handlebars guard `{{#if items.length}}`
+ the CSS rule `.related-articles:has(.related-grid:not(:empty))`
hide the widget cleanly.

Diagnosis recipe:

1. Open the Template Editor → **TEST** panel → check the
   **Recommendation Settings** card. `Item Type` should be locked to
   `Article` (for `related_careers`) or `Blog` (for `related_blog`);
   the `Recipe` dropdown must list at least one option. If it shows
   "No options" the cause is almost always a missing
   `.restrictItemType("Article" | "Blog")` in the Serverside Code.
2. In MCP UI → Campaigns → the affected campaign → open the
   template settings → confirm a Recipe is selected.
3. Open the page in an incognito window with the Chrome
   "Salesforce Interactions SDK Launcher" extension; check that
   `View Catalog Object` fires with the correct `catalogObject.id`
   and `catalogObject.type` (`Article` for career, `Blog` for blog).
4. In MCP UI → Recipes → open that Recipe → run **Test/Preview**
   with a real Profile ID; if it errors here, the Recipe (not the
   template) is the cause.

### Site-side renderer — `assets/js/mcp-related-renderer.js`

**This is where the actual rendering happens.** The file ships with the
Jekyll site, is loaded synchronously from `_includes/head.html` and
`_includes/head-noads.html` BEFORE the MCP beacon, and:

1. Arms `window.fetch` and `XMLHttpRequest` hooks at script-evaluation
   time, so any MCP request fired by the beacon afterwards is observed.
2. When a response body has `{ campaignResponses: [{ payload: { contentZone, items } }] }`,
   the renderer walks it and dispatches to a per-zone builder
   (`buildCareerCard` / `buildBlogCard`).
3. The cards are injected directly into `#mcp-related-careers` /
   `#mcp-related-blog` — the same DOM contract the `.hbs` files mirror,
   so the CSS in `assets/css/demo.css` (`.related-card`, `.related-grid`,
   `.is-blog`, the `:has(.related-grid:not(:empty))` reveal) keeps
   working unchanged.
4. Tracking (impression + click) fires from here with the same event
   names the previous Clientside Code used — `View Related Careers` /
   `Click Related Career` for the careers widget, `View Related Blog` /
   `Click Related Blog` for the blog widget.

```js
(function () {
    "use strict";

    var WIDGETS = {
        related_careers: { selector: "#mcp-related-careers", build: buildCareerCard, impressionName: "View Related Careers", clickName: "Click Related Career", /* ... */ },
        related_blog:    { selector: "#mcp-related-blog",    build: buildBlogCard,    impressionName: "View Related Blog",    clickName: "Click Related Blog",    /* ... */ }
    };

    function handlePayload(body) {
        if (!body || !body.campaignResponses) return;
        for (var i = 0; i < body.campaignResponses.length; i++) {
            var p = body.campaignResponses[i].payload;
            var cfg = WIDGETS[p && p.contentZone];
            if (cfg) renderZone(cfg, (p.items) || []);
        }
    }

    // fetch hook
    var origFetch = window.fetch;
    window.fetch = function () {
        var p = origFetch.apply(this, arguments);
        // ...filter MCP URLs, clone response, JSON-parse, handlePayload
        return p;
    };

    // XHR hook
    var origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function () {
        this.addEventListener("load", function () { /* parse + handlePayload */ });
        return origSend.apply(this, arguments);
    };

    // Exposed for manual smoke-testing from the console
    window.__mcpRender = handlePayload;
})();
```

See the file itself for the full implementation, including:

- **Card builders** that mirror the `.hbs` markup exactly (`.related-card`
  with `data-cy-track` / `data-cy-target-id`, plus the `.is-blog`
  modifier for blog cards).
- **`readAttr(attr)`** — defensive accessor for the MCP attribute shape
  (`{value, metadata}`), returns `null` on missing.
- **`formatMonth`** / **`formatDayMonthYear`** — PT-BR date formatting
  using **UTC accessors** (`d.getUTCMonth()`, etc.). Catalog dates arrive
  as Unix-ms numbers; using local accessors made early-of-month posts
  shift by one day → wrong month label for viewers west of UTC.
- **`escapeHtml`** / **`escapeAttr`** — all injected strings are
  escaped because we build innerHTML manually.
- **Idempotency via `window.__mcp_rendered_<zone>`** — only render
  each zone once per page-load AFTER we have drawn at least one card.
  Empty MCP responses (which happen on the very first request of a
  cold session because recipes like `Related Career Experiences`
  need at least one prior catalog view to recommend anything) DO NOT
  set the flag — otherwise the second response (populated, fired
  after the page-view event lands) would be ignored and the widget
  would only render after a manual reload. Once a non-empty payload
  has rendered, subsequent MCP re-polls are ignored so impressions
  don't replay.
- **Debug buffer `window.__mcpResponses`** — every intercepted MCP
  response that targets one of our zones is pushed here as
  `{ ts, zonesSeen, totalItems, rendered, body }`. Use this to verify
  the empty-first / populated-second hypothesis: in production you
  should see `__mcpResponses[0].totalItems === 0` followed by
  `__mcpResponses[1].totalItems > 0`.
- **Deferred render via `DOMContentLoaded`** — if the MCP response
  arrives before the page DOM is parsed (rare but possible with a
  fast CDN response), we wait and retry instead of failing.
- **Per-card `addEventListener`** re-attached on every render, NOT a
  document-level delegated listener.

**Smoke test from the console**:

```js
window.__mcpRender({
    campaignResponses: [{
        payload: {
            contentZone: "related_careers",
            items: [{
                id: "SMOKE-1",
                attributes: {
                    url:       { value: "https://www.bombonato.net/2025/02/Salesforce/" },
                    name:      { value: "[Carreira] Smoke test" },
                    company:   { value: "ACME" },
                    startDate: { value: 1738368000000 },
                    endDate:   { value: 1769817600000 },
                    topics:    { value: ["consulting"] }
                }
            }]
        }
    }]
});
```

If the card appears in the "Experiências profissionais relacionadas"
section, the renderer is wired up correctly.

### Why we abandoned the Template Clientside Code path

Two earlier attempts failed silently and are documented here so they
are not retried:

1. **Native MCP `apply()` injecting `.hbs`-rendered output into the
   Content Zone.** On Rule Based Test campaigns the Content Zone Action
   could not be configured to reliably inject into our custom
   `<div id="mcp-related-careers" class="related-grid">` target — the
   server returned a full `payload.items` array but the zone stayed
   empty, no error in the console.

2. **Overriding `registerTemplate(source)` from inside the Template's
   Clientside Code** to capture `source.items` and render manually.
   The MCP runtime sandboxes the bundle in a way that didn't reliably
   surface our override to the caller — sometimes the hook fired,
   sometimes it didn't, with no observable pattern.

The site-side renderer sidesteps both problems by intercepting at the
HTTP layer (the only layer guaranteed to fire on every detail
page-load).

### Invariants preserved across the move

- **Distinct event names per widget** (`View Related Careers` vs
  `View Related Blog`, same for clicks). Sharing one name trips the
  MCP beacon's client-side rate limiter — see the gotcha below.
- **Per-page-load impression de-dup** via
  `window.__mcp_impressed_<widget>`.
- **`try/catch` around every beacon** — tracking failures must never
  break the rendered widget or block the user's click.
- **Per-card `addEventListener`**, not a document-level delegated
  listener — listeners die cleanly with the cards on re-render.
- `Click Related *` events are **not** the same as the page-level
  `View Catalog Object` that the sitemap fires on the destination
  page — both should be present for attribution to work.

### `Client: Event Rate Limiter triggered` — distinct names + de-dup

The MCP beacon ships with a client-side throttle that drops bursts
of identically named `sendEvent` calls. When it kicks in, the SDK
logs:

```
Client: Event Rate Limiter triggered
```

…and the offending event never reaches the server, silently
under-counting your dashboard.

Three patterns we hit (now all fixed in `related_*.js`):

1. **Two widgets sharing one `interaction.name`.** On career and
   blog detail pages both widgets render in quick succession; if
   they both dispatch `{name: "View Recommendations"}` back-to-back,
   the second fires the limiter. Fix: give each widget its own
   event name — `View Related Careers`, `View Related Blog`,
   `Click Related Career`, `Click Related Blog`.
2. **Impression fires on Campaign re-render.** MCP can re-execute
   the Clientside Code (Auto Render in the editor, MCP refreshing
   decisions). Same `name`, microseconds apart → throttled. Fix:
   set a `window.__mcp_impressed_<widget>` flag on first dispatch
   and skip subsequent ones in the same page load.
3. **Impression fires on zero-card render.** When the Recipe
   returns nothing, the Handlebars output is empty but the
   Clientside Code still runs and dispatches. Fix: render-guard
   on `cards.length > 0`.

Diagnosis: open the Chrome console with the SDK Launcher extension
on; if you see `Client: Event Rate Limiter triggered`, look at the
preceding events — you'll find two with the same `name` in <1s.
That's your duplicate.
