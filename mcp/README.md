# MCP — Marketing Cloud Personalization assets

Source-of-truth for everything we deploy into Salesforce Marketing Cloud
Personalization for `https://www.bombonato.net`.

## Layout

```
mcp/
├── README.md           ← this file
└── sitemap.js          ← Sitemap JS (paste into MCP Visual Editor → Sitemap)
```

## Workflow

1. **Edit** the relevant file in this folder (e.g. `sitemap.js`).
2. **Commit** the change so we have history of what was deployed.
3. **Apply** in MCP:
   - Open MCP UI → Web → Sitemap → tab "Sitemap JS"
   - Paste full file contents
   - SAVE → EXECUTE (dry-run) → PUBLISH
4. **Bump version note** in the header comment of `sitemap.js` when
   relevant (e.g. `Last published configVersion: 22`).

## Why we version this

- MCP UI has version history but it's painful to diff.
- Local files give us git blame, code review, and the ability to roll
  back instantly.
- The agent (Cursor) can edit `sitemap.js` directly and only ask the
  human to copy/paste into MCP.

## Catalog model (current)

- **Item Type**: `Article`
- **Categories** (polymorphic, `type: "c"`):
  - `career` → Carreira
  - `blog` → Blog
- **Tags** (polymorphic, `type: "t"`): free-form, from `data-article-tags`
  CSV on the `<article>` element
- **Custom attributes**:
  - All articles: `name`, `url`, `author`, `publishDate`, `description`,
    `topics` (MultiString)
  - Career only: `company`, `startDate`, `endDate`, `location`,
    `industry`, `seniority`, `technologies`

## Content zones (currently declared in sitemap)

| Zone name      | Selector              | Note                                  |
|----------------|-----------------------|---------------------------------------|
| `hero_banner`  | `#hero-banner-zone`   | Placeholder — site does not yet render this zone |
| `main_content` | `#main-content-zone`  | Placeholder — site does not yet render this zone |

> Note: the site's `_layouts/career.html` and `_layouts/blog.html` still
> contain `#mcp-related-careers` and `#mcp-related-blog` divs from an
> earlier exploration of related-items widgets. They are currently
> hidden by CSS (`:has(.related-grid:not(:empty))`) and have no
> matching content zone declaration. Either re-add the zones + recipes
> + campaigns in MCP to use them, or strip the divs from the layouts
> if you don't plan to revisit that feature.
