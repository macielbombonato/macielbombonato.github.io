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
 * Last published configVersion: 22  ← bump manually after each publish
 *
 * IMPORTANT — do NOT wrap initSitemap inside init().then(...)
 *   The Visual Editor's EXECUTE button runs the sitemap JS and inspects
 *   its results synchronously. Anything inside a Promise callback is
 *   missed by EXECUTE (you'd see only USER DATA populated, never PAGE
 *   TYPE / CATALOG DATA / CONTENT ZONES). Call init() and initSitemap
 *   at top level instead — they can be called in sequence; events sent
 *   before init() resolves are queued internally.
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
 * Content zones (rendered in career.html and blog.html layouts)
 *   - related_careers → #mcp-related-careers
 *   - related_blog    → #mcp-related-blog
 */

SalesforceInteractions.init({ cookieDomain: "bombonato.net" });

function csvAttr(selector, attr) {
  return function () {
    var el = document.querySelector(selector);
    if (!el) return [];
    var raw = el.getAttribute(attr) || "";
    return raw.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
  };
}

function tagsFromCsv(selector, attr) {
  return function () {
    var el = document.querySelector(selector);
    if (!el) return [];
    var raw = el.getAttribute(attr) || "";
    return raw.split(",").map(function (s) { return s.trim(); }).filter(Boolean).map(function (t) {
      return { type: "t", _id: t, name: t };
    });
  };
}

SalesforceInteractions.initSitemap({
  global: {
    contentZones: [
      { name: "related_careers", selector: "#mcp-related-careers" },
      { name: "related_blog",    selector: "#mcp-related-blog"    }
    ],
    listeners: []
  },

  pageTypes: [
    {
      name: "career_detail",
      isMatch: function () {
        return !!document.querySelector("article.post.career-detail");
      },
      interactions: [
        {
          name: "View Catalog Object",
          catalogObject: {
            type: "Article",
            id: SalesforceInteractions.resolvers.fromSelectorAttribute("article.post", "data-article-id"),
            categories: [{ type: "c", _id: "career", name: "Carreira" }],
            tags: tagsFromCsv("article.post", "data-article-tags"),
            attributes: {
              name:         SalesforceInteractions.resolvers.fromSelectorAttribute("article.post", "data-article-name"),
              url:          function () { return window.location.href; },
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
              topics:       csvAttr("article.post", "data-article-topics")
            }
          }
        }
      ]
    },

    {
      name: "blog_detail",
      isMatch: function () {
        return !!document.querySelector("article.post.blog-detail");
      },
      interactions: [
        {
          name: "View Catalog Object",
          catalogObject: {
            type: "Article",
            id: SalesforceInteractions.resolvers.fromSelectorAttribute("article.post", "data-article-id"),
            categories: [{ type: "c", _id: "blog", name: "Blog" }],
            tags: tagsFromCsv("article.post", "data-article-tags"),
            attributes: {
              name:        SalesforceInteractions.resolvers.fromSelectorAttribute("article.post", "data-article-name"),
              url:         function () { return window.location.href; },
              author:      SalesforceInteractions.resolvers.fromSelectorAttribute("article.post", "data-article-author"),
              publishDate: SalesforceInteractions.resolvers.fromSelectorAttribute("article.post", "data-article-publish-date"),
              description: SalesforceInteractions.resolvers.fromSelectorAttribute("article.post", "data-article-description"),
              topics:      csvAttr("article.post", "data-article-topics")
            }
          }
        }
      ]
    },

    {
      name: "career_list",
      isMatch: function () { return /^\/$/.test(location.pathname); },
      interactions: []
    },

    {
      name: "blog_list",
      isMatch: function () { return /^\/blog\/?$/.test(location.pathname); },
      interactions: []
    }
  ]
});
