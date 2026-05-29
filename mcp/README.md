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
    ├── related_careers.ts             ← Serverside Code — recs binding
    ├── related_blog.hbs               ← Handlebars markup — design-only mirror
    ├── related_blog.js                ← Clientside Code — INTENTIONAL NO-OP
    └── related_blog.ts                ← Serverside Code — recs binding

assets/js/mcp-related-renderer.js      ← SITE-SIDE RENDERER (actual render path)
                                         loaded synchronously from
                                         _includes/head.html and head-noads.html
                                         BEFORE the MCP beacon
catalog/articles.csv                   ← Catalog feed (generated, served at /catalog/articles.csv)
tools/generate_catalog_feed.py         ← Regenerates the CSV from Jekyll _posts
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

- **Item Type**: `Article`
- **Categories** (polymorphic, `type: "c"`):
  - `career` → Carreira
  - `blog` → Blog
- **Tags** (polymorphic, `type: "t"`): free-form, from `data-article-tags`
  CSV on the `<article>` element
- **Attributes (all articles)**: `name`, `url`, `author`, `publishDate`,
  `description`, `topics` (MultiString — array of strings)
- **Attributes (career only)**: `company`, `startDate`, `endDate`,
  `location`, `industry`, `seniority`, `technologies`

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
    E --> E2[career_detail<br/>View Catalog Object]
    E --> E3[blog_detail<br/>View Catalog Object]
```

## Custom interactions sent by the sitemap

| Name                      | When                                           | Extra fields                  |
|---------------------------|------------------------------------------------|-------------------------------|
| `Default Page View`       | Any page that doesn't match a defined pageType | —                             |
| `Home Page View`          | URL is `/`                                     | —                             |
| `View Catalog Object`     | Career or blog detail pages                    | full catalogObject            |
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

### `topics` is MultiString

The MCP catalog attribute `topics` is configured as MultiString
(array of strings). We send it via `fromCsvAttr`, which returns an
array. Do not switch to `fromSelectorAttribute` (which returns a CSV
string) unless you also change the catalog attribute back to String.

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

| Recipe                       | Type    | Filter                  | Target Zone        |
|------------------------------|---------|-------------------------|--------------------|
| `Related Career Experiences` | Article | `categories._id=career` | `related_careers`  |
| `Related Blog Articles`      | Article | `categories._id=blog`   | `related_blog`     |

Each recipe is consumed by a Web Campaign that:
1. Targets pages matching `career_detail` OR `blog_detail`
2. Renders into its respective zone
3. Uses a Handlebars template producing `.related-card` markup
   (already styled in `assets/css/demo.css`)

### Catalog Feed (`catalog/articles.csv`)

Beacon events update Article attributes and increment Category view
counts, but they do **not** auto-populate the `Article.categories`
relation. Without that relation, recipes filtering on `Category =
career` (or `Category = blog`) return zero items, and any related-
items campaign renders empty.

The fix is to bulk-load Articles via a CSV catalog feed. The feed is
the **source of truth** for the relation between Articles and
Categories; beacon events keep handling behavioral signals and
attributes.

**Workflow**

1. Edit posts in `career/_posts/` or `blog/_posts/` as usual.
2. From the repo root, regenerate the CSV:
   ```bash
   python3 tools/generate_catalog_feed.py
   ```
   Output: `catalog/articles.csv`, one row per post, 15 columns.
3. Commit `catalog/articles.csv` (and any post edits).
4. Push to GitHub Pages. Jekyll serves the CSV at
   `https://www.bombonato.net/catalog/articles.csv`.
5. In MCP UI → Feeds Dashboard → upload or point at the URL → ETL =
   `Catalog Object ETL` → Validate → Commit.

**CSV schema**

| Column                       | Notes                                             |
|------------------------------|---------------------------------------------------|
| `id`                         | `YYYYMM-slug`, matches the value the sitemap sends |
| `categories`                 | `career` or `blog` (one value per Article)        |
| `attribute:name`             | `[Carreira] …` or `[Blog] …` prefix               |
| `attribute:url`              | Absolute URL                                      |
| `attribute:author`           | Hardcoded to site author                          |
| `attribute:publishDate`      | Post date (YYYY-MM-DD)                            |
| `attribute:description`      | Front matter `description:` or first ~200 chars   |
| `attribute:company`          | Career only                                       |
| `attribute:startDate`        | Career only                                       |
| `attribute:endDate`          | Career only — empty if "ATUAL"                    |
| `attribute:location`         | Career only                                       |
| `attribute:industry`         | Career only                                       |
| `attribute:seniority`        | Career only                                       |
| `attribute:topics`           | MultiString — pipe-separated (`a|b|c`)            |
| `attribute:technologies`     | Career only — pipe-separated                      |

**Why no SFTP**

MCP also supports SFTP-based feed delivery. We use the HTTP variant
because GitHub Pages already hosts the site over HTTPS, so the CSV is
deployed as part of the regular Jekyll build pipeline — no extra
infrastructure required. If the feed grows or needs scheduling, swap
to SFTP without changing the upstream generator.

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
2. **Recipe filters on Categories before the CSV ETL has run.**
   The beacon does not populate `Article.categories`. Without
   `catalog/articles.csv` ingested, a Recipe filtering on
   `Category = career` (or `blog`) finds no eligible items and
   throws instead of returning empty.
3. **Recipe references an attribute that is not registered on the
   Item Type** (e.g. `author`, `publishDate` — both unregistered;
   use the System Attribute `published` instead).
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
   `Article`; the `Recipe` dropdown must list at least one option.
   If it shows "No options" the cause is almost always a missing
   `.restrictItemType("Article")` in the Serverside Code.
2. In MCP UI → Campaigns → the affected campaign → open the
   template settings → confirm a Recipe is selected.
3. Open the page in an incognito window with the Chrome
   "Salesforce Interactions SDK Launcher" extension; check that
   `View Catalog Object` fires with the correct `catalogObject.id`
   and `categories: [...]`.
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
  each zone once per page-load. MCP can re-poll mid-session and we
  don't want to replay impressions.
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
