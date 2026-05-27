# MCP — Marketing Cloud Personalization assets

Source-of-truth for everything we deploy into Salesforce Marketing Cloud
Personalization for `https://www.bombonato.net`.

## Layout

```
mcp/
├── README.md           ← this file
├── sitemap.js          ← Sitemap JS (paste into MCP Visual Editor → Sitemap)
└── templates/          ← (future) Handlebars templates for Web Campaigns
```

## Workflow

1. **Edit** the relevant file in this folder (e.g. `sitemap.js`).
2. **Commit** the change so we have history of what was deployed.
3. **Apply** in MCP:
   - For `sitemap.js`: open MCP UI → Web → Sitemap → tab "Sitemap JS" →
     paste full file contents → SAVE → EXECUTE to dry-run → PUBLISH.
   - For campaign templates: open the campaign in MCP UI → Template tab
     → paste template contents → Save & Publish.
4. **Bump version note** in the header comment of the file when relevant
   (e.g. `Last published configVersion: 22`).

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

## Content zones

| Zone name         | Selector                  | Lives on            |
|-------------------|---------------------------|---------------------|
| `related_careers` | `#mcp-related-careers`    | career & blog detail |
| `related_blog`    | `#mcp-related-blog`       | career & blog detail |

## Einstein Recipes (configured in MCP UI)

| Recipe                       | Type    | Filter                 | Used by                  |
|------------------------------|---------|------------------------|--------------------------|
| `Related Career Experiences` | Article | `categories._id=career`| Campaign → `related_careers` |
| `Related Blog Articles`      | Article | `categories._id=blog`  | Campaign → `related_blog`    |

## Web Campaigns (configured in MCP UI)

| Campaign                  | Target Zone        | Recipe                       |
|---------------------------|--------------------|------------------------------|
| `Related Careers Widget`  | `related_careers`  | `Related Career Experiences` |
| `Related Blog Widget`     | `related_blog`     | `Related Blog Articles`      |
