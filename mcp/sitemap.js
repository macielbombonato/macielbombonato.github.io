/**
 * Salesforce Marketing Cloud Personalization — Sitemap JS
 * ---------------------------------------------------------
 * This file is the SOURCE OF TRUTH for the sitemap that runs on
 * https://www.bombonato.net via the MCP beacon.
 *
 * Workflow when this file changes:
 *   1. Save & commit changes to this file in git
 *   2. Copy the ENTIRE contents below into the MCP Visual Editor:
 *        MCP UI → Web → Sitemap → tab "Sitemap JS"
 *   3. SAVE → EXECUTE (dry-run) → PUBLISH
 *
 * Catalog model — FIVE Item Types
 * -------------------------------
 *   Content types (the things users view):
 *     - `Article` (custom)       → career experience pages
 *         System attrs : name, url, description, published
 *         Custom attrs : company, startDate, endDate, location,
 *                        industry, seniority
 *     - `Blog` (native EVGBlog)  → blog post pages
 *         System attrs : name (=title), url, description, publishedDate
 *         No custom attrs
 *
 *   Reference types (describe & connect content):
 *     - `Topics`        (custom) → curated taxonomy from _data/topics.yml
 *     - `Technologies`  (custom) → stack/tools used in career experiences
 *     - `Tags`          (custom) → free-form labels on both Article + Blog
 *
 * `Article` and `Blog` connect to `Topics`, `Technologies`, and `Tags`
 * via `relatedCatalogObjects` (the SDK's relational primitive — see
 * https://developer.salesforce.com/docs/marketing/personalization/guide/sitemap-implementation.html
 * "CatalogConfig" section). Each entry is keyed by the related Item
 * Type's exact name and carries an array of IDs into that type. The
 * IDs must already exist in the target Item Type, so the CSV ETL
 * order matters: load topics.csv / technologies.csv / tags.csv
 * BEFORE articles.csv / blogs.csv (see tools/generate_catalog_feed.py).
 *
 * History — why we moved off custom attributes:
 *   v1 had `topics` (MultiString) and `technologies` (String) inside
 *   `attributes`. That made Recipes filter on string equality, which
 *   is fragile, and prevented "more by this Topic" Recipes because
 *   attribute values are not first-class catalog objects. Promoting
 *   them to their own Item Types lets Recipes filter via "Related
 *   Catalog Object membership", which is a graph query — robust and
 *   reusable across many Recipes (Topic detail pages, Topic-based
 *   recommendations, segmentation, etc.).
 *
 * `categories` (the built-in polymorphic slot) is also no longer sent
 * because the Item Type itself now discriminates Article vs Blog.
 *
 * `tags` (the built-in polymorphic Tag slot — `type: "t"`) is no
 * longer sent either. It used to coexist with `attributes.tags`, but
 * with `Tags` promoted to its own Item Type we have ONE source of
 * truth (`relatedCatalogObjects.Tags`). Legacy Tag polymorphic items
 * can be archived in the MCP UI after the migration completes.
 *
 * Notes / gotchas
 *   - The pageType-level interaction key is `interaction:` (singular),
 *     NOT `interactions:` (plural). Using the plural key silently
 *     causes the SDK to send events with `interaction: null`, which
 *     the MCP server rejects with 400. The browser then shows that
 *     as a CORS error. Singular is the only correct form.
 *   - `pageTypeDefault` provides a fallback interaction so we never
 *     send an event with `interaction: null`.
 *   - `isMatch` uses `matchWhenReady` for catalog pages to ensure the
 *     `<article>` element is in the DOM before testing.
 *   - `relatedCatalogObjects` keys are CASE-SENSITIVE and must match
 *     the Item Type names in MCP UI exactly: `Topics`, `Technologies`,
 *     `Tags`. Misspelling silently drops the relation.
 */

SalesforceInteractions.init({ cookieDomain: "bombonato.net" }).then(() => {

  SalesforceInteractions.log.level = "debug";

  // Reads a comma-separated `data-*` attribute and returns an array
  // of trimmed, non-empty values. Used for `relatedCatalogObjects.*`
  // payloads which expect `string[]`.
  const fromCsvAttr = (selector, attr) => () => {
    const el = document.querySelector(selector);
    if (!el) return [];
    const raw = el.getAttribute(attr) || "";
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  };

  const matchWhenReady = (selector) => () => new Promise((resolve) => {
    const check = () => resolve(!!document.querySelector(selector));
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", check);
      setTimeout(check, 1500);
    } else {
      check();
    }
  });

  SalesforceInteractions.initSitemap({
    global: {
      onActionEvent: (actionEvent) => {
        const params = new URLSearchParams(location.search);
        actionEvent.source = actionEvent.source || {};
        actionEvent.source.channel = "Web";
        actionEvent.source.referrer = document.referrer || "direct";
        actionEvent.source.utmSource = params.get("utm_source") || undefined;
        actionEvent.source.utmMedium = params.get("utm_medium") || undefined;
        actionEvent.source.utmCampaign = params.get("utm_campaign") || undefined;
        return actionEvent;
      },
      listeners: [
        SalesforceInteractions.listener(
          "click",
          "a[href^='mailto:'], a[href*='linkedin.com'], a[href*='github.com']",
          (event) => {
            const target = event.currentTarget || event.target;
            const href = target.getAttribute("href") || "";
            let kind = "Other";
            if (href.startsWith("mailto:")) kind = "Email";
            else if (href.includes("linkedin.com")) kind = "LinkedIn";
            else if (href.includes("github.com")) kind = "GitHub";
            SalesforceInteractions.sendEvent({
              interaction: {
                name: "Contact Click",
                destination: href,
                kind: kind,
              },
            });
          }
        ),
      ],
    },

    pageTypeDefault: {
      name: "default",
      interaction: { name: "Default Page View" },
    },

    pageTypes: [
      {
        name: "home",
        isMatch: () => location.pathname === "/" || location.pathname === "",
        interaction: { name: "Home Page View" },
        contentZones: [
          { name: "hero_banner",  selector: "header, .hero" },
          { name: "main_content", selector: "main, body" },
        ],
        listeners: [
          SalesforceInteractions.listener("click", "a, button", (event) => {
            const target = event.currentTarget || event.target;
            const text = (target.innerText || "").trim().toLowerCase();
            if (text === "mais detalhes" || text === "mais detalhe") {
              const card = target.closest("section, article, div");
              const heading = card?.querySelector("h2, h3, h4");
              const subheading = heading?.nextElementSibling;
              const experienceName = (heading?.innerText || "").trim();
              const company = (subheading?.innerText || "").trim();
              SalesforceInteractions.sendEvent({
                interaction: {
                  name: "View Experience Details",
                  role: experienceName,
                  company: company,
                },
              });
            }
          }),
        ],
      },

      {
        name: "career_detail",
        isMatch: matchWhenReady("article.post[data-article-category='career']"),
        interaction: {
          name: SalesforceInteractions.CatalogObjectInteractionName.ViewCatalogObject,
          catalogObject: {
            type: "Article",
            id: SalesforceInteractions.resolvers.fromSelectorAttribute("article.post", "data-article-id"),
            attributes: {
              name:        SalesforceInteractions.resolvers.fromSelectorAttribute("article.post", "data-article-name"),
              url:         SalesforceInteractions.resolvers.fromHref(),
              description: SalesforceInteractions.resolvers.fromSelectorAttribute("article.post", "data-article-description"),
              published:   SalesforceInteractions.resolvers.fromSelectorAttribute("article.post", "data-article-publish-date"),
              company:     SalesforceInteractions.resolvers.fromSelectorAttribute("article.post", "data-article-company"),
              startDate:   SalesforceInteractions.resolvers.fromSelectorAttribute("article.post", "data-article-start-date"),
              endDate:     SalesforceInteractions.resolvers.fromSelectorAttribute("article.post", "data-article-end-date"),
              location:    SalesforceInteractions.resolvers.fromSelectorAttribute("article.post", "data-article-location"),
              industry:    SalesforceInteractions.resolvers.fromSelectorAttribute("article.post", "data-article-industry"),
              seniority:   SalesforceInteractions.resolvers.fromSelectorAttribute("article.post", "data-article-seniority"),
            },
            relatedCatalogObjects: {
              Topics:       fromCsvAttr("article.post", "data-article-topics"),
              Technologies: fromCsvAttr("article.post", "data-article-technologies"),
              Tags:         fromCsvAttr("article.post", "data-article-tags"),
            },
          },
        },
        contentZones: [
          { name: "related_careers", selector: "#mcp-related-careers" },
          { name: "related_blog",    selector: "#mcp-related-blog"    },
        ],
      },

      {
        name: "blog_detail",
        isMatch: matchWhenReady("article.post[data-article-category='blog']"),
        interaction: {
          name: SalesforceInteractions.CatalogObjectInteractionName.ViewCatalogObject,
          catalogObject: {
            type: "Blog",
            id: SalesforceInteractions.resolvers.fromSelectorAttribute("article.post", "data-article-id"),
            attributes: {
              name:          SalesforceInteractions.resolvers.fromSelectorAttribute("article.post", "data-article-name"),
              url:           SalesforceInteractions.resolvers.fromHref(),
              description:   SalesforceInteractions.resolvers.fromSelectorAttribute("article.post", "data-article-description"),
              date: SalesforceInteractions.resolvers.fromSelectorAttribute("article.post", "data-article-publish-date"),
            },
            relatedCatalogObjects: {
              Topics: fromCsvAttr("article.post", "data-article-topics"),
              Tags:   fromCsvAttr("article.post", "data-article-tags"),
            },
          },
        },
        contentZones: [
          { name: "related_careers", selector: "#mcp-related-careers" },
          { name: "related_blog",    selector: "#mcp-related-blog"    },
        ],
      },
    ],
  });
});
