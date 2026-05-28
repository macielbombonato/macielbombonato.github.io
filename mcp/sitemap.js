/**
 * Salesforce Marketing Cloud Personalization — Sitemap JS
 * ---------------------------------------------------------
 * MINIMAL DIAGNOSTIC VERSION
 *
 * Goal: bisect the 400 + CORS issue by stripping ALL catalog-object
 * interactions. Only declares pageTypes (so we still know what page
 * the visitor is on) but does NOT send any "View Catalog Object"
 * interaction — therefore no categories, no tags, no custom attrs.
 *
 * Test plan:
 *   1. Paste this into MCP Visual Editor → Sitemap → SAVE → PUBLISH
 *   2. Hard refresh https://www.bombonato.net
 *   3. Check DevTools Network for /api2/event/... requests
 *
 *   Expected: just page views going through (no interaction events)
 *   - If 400 CORS is GONE → the catalog object payload was the culprit;
 *     we restore catalog incrementally to find the offending piece.
 *   - If 400 CORS persists → it's a dataset/account-level issue,
 *     independent of the sitemap (talk to Salesforce support or
 *     re-check Settings carefully).
 */

SalesforceInteractions.init({ cookieDomain: "bombonato.net" }).then(() => {

  SalesforceInteractions.initSitemap({
    global: {
      contentZones: [],
      listeners: [],
    },

    pageTypes: [
      {
        name: "career_detail",
        isMatch: () => !!document.querySelector("article.post.career-detail"),
        interactions: [],
      },

      {
        name: "blog_detail",
        isMatch: () => !!document.querySelector("article.post.blog-detail"),
        interactions: [],
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
