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
 * Catalog model — TWO Item Types, the Item Type itself discriminates.
 *   - Item Type `Article` (custom)  →  career_detail pages
 *       System attrs : name, url, description, published
 *       Custom attrs : company, startDate, endDate, location, industry,
 *                      seniority, technologies, topics (MultiString)
 *       Tags         : polymorphic, type "t", from data-article-tags CSV
 *   - Item Type `Blog` (native EVGBlog)  →  blog_detail pages
 *       System attrs : name (=title), url, description, publishedDate
 *       Custom attrs : topics (MultiString) — the ONLY custom on Blog
 *       Tags         : polymorphic, type "t", from data-article-tags CSV
 *                      (Author/Keyword Tag types are also natively
 *                      supported on Blog but we don't populate them
 *                      from the beacon yet — see mcp/README.md)
 *
 * `categories` are no longer sent because the Item Type is the
 * discriminator. The legacy career/blog Category catalog objects can
 * be archived/deleted after migration; recipes no longer reference
 * them.
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
 *   - `topics` is MultiString in the MCP catalog config, so we send
 *     it as an array (via `fromCsvAttr`). Do NOT switch to
 *     `fromSelectorAttribute` unless you also change the catalog
 *     attribute type back to String.
 */

SalesforceInteractions.init({ cookieDomain: "bombonato.net" }).then(() => {

  SalesforceInteractions.log.level = "debug";

  const fromCsvAttr = (selector, attr) => () => {
    const el = document.querySelector(selector);
    if (!el) return [];
    const raw = el.getAttribute(attr) || "";
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  };

  const fromCsvAttrAsTags = (selector, attr) => () => {
    const el = document.querySelector(selector);
    if (!el) return [];
    const raw = el.getAttribute(attr) || "";
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((t) => ({ type: "t", _id: t, name: t }));
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
            tags: fromCsvAttrAsTags("article.post", "data-article-tags"),
            attributes: {
              name:         SalesforceInteractions.resolvers.fromSelectorAttribute("article.post", "data-article-name"),
              url:          SalesforceInteractions.resolvers.fromHref(),
              description:  SalesforceInteractions.resolvers.fromSelectorAttribute("article.post", "data-article-description"),
              published:    SalesforceInteractions.resolvers.fromSelectorAttribute("article.post", "data-article-publish-date"),
              company:      SalesforceInteractions.resolvers.fromSelectorAttribute("article.post", "data-article-company"),
              startDate:    SalesforceInteractions.resolvers.fromSelectorAttribute("article.post", "data-article-start-date"),
              endDate:      SalesforceInteractions.resolvers.fromSelectorAttribute("article.post", "data-article-end-date"),
              location:     SalesforceInteractions.resolvers.fromSelectorAttribute("article.post", "data-article-location"),
              industry:     SalesforceInteractions.resolvers.fromSelectorAttribute("article.post", "data-article-industry"),
              seniority:    SalesforceInteractions.resolvers.fromSelectorAttribute("article.post", "data-article-seniority"),
              technologies: SalesforceInteractions.resolvers.fromSelectorAttribute("article.post", "data-article-technologies"),
              topics:       fromCsvAttr("article.post", "data-article-topics"),
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
            tags: fromCsvAttrAsTags("article.post", "data-article-tags"),
            attributes: {
              name:          SalesforceInteractions.resolvers.fromSelectorAttribute("article.post", "data-article-name"),
              url:           SalesforceInteractions.resolvers.fromHref(),
              description:   SalesforceInteractions.resolvers.fromSelectorAttribute("article.post", "data-article-description"),
              publishedDate: SalesforceInteractions.resolvers.fromSelectorAttribute("article.post", "data-article-publish-date"),
              topics:        fromCsvAttr("article.post", "data-article-topics"),
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
