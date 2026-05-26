## Learned User Preferences

- When asked to commit changes in this repo, default to committing AND pushing in the same step — that is the recurring ask.
- Run the site locally with a vendored bundle (`bundle config set --local path vendor/bundle && bundle install`, then `bundle exec jekyll serve`) before pushing; do not try to install gems globally on this machine.
- In this workspace, "Personalization" means Marketing Cloud Personalization (formerly Interaction Studio / Evergage); do not recommend Personalization-on-Core tools like the Sitemap Converter.
- Sitemap configuration for Personalization is done in the MCP Visual Editor, not in code; the Jekyll `jekyll-sitemap` plugin only governs the SEO XML sitemap.

## Learned Workspace Facts

- Repo is the Jekyll personal portfolio published at `bombonato.net` via GitHub Pages (`macielbombonato.github.io`); local toolchain is Ruby 2.6.10 + Bundler 1.17.2 with `vendor/`, `.bundle/`, `_site/`, `.jekyll-cache/` gitignored.
- Personalization beacon is loaded from `_includes/head.html` and `_includes/head-noads.html`, pointing to dataset `bombonato_prd`.
- Personalization content model: standard MCP `article` entity with two article types — `career` (career experiences) and `blog` (blog posts).
- Career content lives in `career/_posts/`, renders through `_layouts/career.html` + `_layouts/career-layout.html`, and is fed to MCP via `catalog/experiences.json`.
- Blog content lives in `blog/_posts/YYYY-MM-DD-Title.md`, renders through `_layouts/blog.html`, and is fed to MCP via `catalog/blog.json`; the index page `blog.html` uses `permalink: /blog/` so it appears in the Jekyll sitemap.
- MCP catalog feed URLs configured inside the Personalization console must point to the production domain (`https://www.bombonato.net/catalog/*.json`), not the localhost build.
- DOM data attributes (`data-article-id|name|category|url|author|publish-date|description|company|start-date|end-date|location`) on `_layouts/career.html` and `_layouts/blog.html` carry per-page item context; `View Article` events fire from a sitemap JS hosted in the MCP Visual Editor, which reads those attributes and calls `Evergage.sendEvent` (avoid `Evergage.DisplayUtils.pageType` — not available in this MCP version).
