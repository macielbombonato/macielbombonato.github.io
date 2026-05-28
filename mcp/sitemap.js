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
 *   3. Click SAVE in the Visual Editor
 *   4. Optionally click EXECUTE to dry-run against the current page
 *   5. Click PUBLISH to make it live (this increments configVersion)
 *
 * Last published configVersion: 22
 *
 * Catalog model
 *   - Item Type: Article
 *   - Categories (polymorphic): "career" or "blog"
 *   - Tags: free-form, populated from data-article-tags (CSV)
 *   - Custom attributes for career: company, startDate, endDate, location,
 *       industry, seniority, technologies, topics
 *   - Custom attributes for blog: topics
 *   - `topics` is a MultiString (string array) on both
 *
 * Content zones (placeholders kept for forward-compat; site does not
 * currently render related-items widgets):
 *   - hero_banner   → #hero-banner-zone
 *   - main_content  → #main-content-zone
 */

SalesforceInteractions.init({ cookieDomain: "bombonato.net" }).then(() => {
  const fromCsvAttr = (selector, attr) => () => {
    const el = document.querySelector(selector);
    if (!el) return [];
    const raw = el.getAttribute(attr) || "";
    return raw.split(",").map(s => s.trim()).filter(Boolean);
  };

  const tagsFromCsv = (selector, attr) => () => {
    const el = document.querySelector(selector);
    if (!el) return [];
    const raw = el.getAttribute(attr) || "";
    return raw.split(",").map(s => s.trim()).filter(Boolean).map(t => ({
      type: "t",
      _id: t,
      name: t,
    }));
  };

  SalesforceInteractions.initSitemap({
    global: {
      contentZones: [
        { name: "hero_banner",  selector: "#hero-banner-zone" },
        { name: "main_content", selector: "#main-content-zone" },
      ],
      listeners: [],
    },

    pageTypes: [
      {
        name: "career_detail",
        isMatch: () => !!document.querySelector("article.post.career-detail"),
        interactions: [
          {
            name: "View Catalog Object",
            catalogObject: {
              type: "Article",
              id:   SalesforceInteractions.resolvers.fromSelectorAttribute("article.post", "data-article-id"),
              categories: [{
                type: "c",
                _id:  "career",
                name: "Carreira",
              }],
              tags: tagsFromCsv("article.post", "data-article-tags"),
              attributes: {
                name:         SalesforceInteractions.resolvers.fromSelectorAttribute("article.post", "data-article-name"),
                url:          () => window.location.href,
                author:       SalesforceInteractions.resolvers.fromSelectorAttribute("article.post", "data-article-author"),
                publishDate:  SalesforceInteractions.resolvers.fromSelectorAttribute("article.post", "data-article-publish-date"),
                description:  SalesforceInteractions.resolvers.fromSelectorAttribute("article.post", "data-article-description"),
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
        ],
      },

      {
        name: "blog_detail",
        isMatch: () => !!document.querySelector("article.post.blog-detail"),
        interactions: [
          {
            name: "View Catalog Object",
            catalogObject: {
              type: "Article",
              id:   SalesforceInteractions.resolvers.fromSelectorAttribute("article.post", "data-article-id"),
              categories: [{
                type: "c",
                _id:  "blog",
                name: "Blog",
              }],
              tags: tagsFromCsv("article.post", "data-article-tags"),
              attributes: {
                name:        SalesforceInteractions.resolvers.fromSelectorAttribute("article.post", "data-article-name"),
                url:         () => window.location.href,
                author:      SalesforceInteractions.resolvers.fromSelectorAttribute("article.post", "data-article-author"),
                publishDate: SalesforceInteractions.resolvers.fromSelectorAttribute("article.post", "data-article-publish-date"),
                description: SalesforceInteractions.resolvers.fromSelectorAttribute("article.post", "data-article-description"),
                topics:      fromCsvAttr("article.post", "data-article-topics"),
              },
            },
          },
        ],
      },

      {
        name: "career_list",
        isMatch: () => /^\/$/.test(location.pathname),
        interactions: [],
      },

      {
        name: "blog_list",
        isMatch: () => /^\/blog\/?$/.test(location.pathname),
        interactions: [],
      },
    ],
  });
});
