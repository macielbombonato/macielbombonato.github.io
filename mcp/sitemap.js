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
 * Catalog model — FOUR Item Types (v4)
 * ------------------------------------
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
 *     - `Topics`  (custom) → curated taxonomy from _data/topics.yml
 *     - `Tags`    (custom) → free-form labels on both Article + Blog
 *
 * `Article` and `Blog` connect to `Topics` and `Tags` via
 * `relatedCatalogObjects` (the SDK's relational primitive — see
 * https://developer.salesforce.com/docs/marketing/personalization/guide/sitemap-implementation.html
 * "CatalogConfig" section). Each entry is keyed by the related Item
 * Type's exact name and carries an array of IDs into that type. The
 * IDs must already exist in the target Item Type, so the CSV ETL
 * order matters: load topics.csv / tags.csv BEFORE articles.csv /
 * blogs.csv (see tools/generate_catalog_feed.py).
 *
 * History — why this is v4
 *   v1  Single `Article` Item Type, polymorphic `categories` split
 *       career vs blog. Behavioral Recipes silently bypassed Include
 *       Rules — "Related Blog Articles" kept returning careers.
 *   v2  Split into Article + native Blog. Topics/Technologies were
 *       still String/MultiString attributes — fragile.
 *   v3  Promoted Topics, Technologies, Tags to their own Item Types
 *       with `relatedCatalogObjects`. Worked, but `technologies` was
 *       career-only and the same slug (`java`, `aws`, `docker` …)
 *       was a Tech on career posts and a Tag on blog posts — single
 *       concept split across two Item Types. See audit_taxonomy.py.
 *   v4  Collapsed Technologies into Tags. One flat free-form
 *       vocabulary for both content types. `Technologies` is being
 *       drained via the CSV feed and removed from MCP UI manually
 *       once all rows ingest as archived=true.
 *
 * `categories` (the built-in polymorphic slot) is not sent — the
 * Item Type itself now discriminates Article vs Blog.
 *
 * `tags` (the built-in polymorphic Tag slot — `type: "t"`) is not
 * sent either. `Tags` Item Type via `relatedCatalogObjects.Tags`
 * is the single source of truth. Any legacy Tag polymorphic items
 * can be archived in the MCP UI after v4 ingest completes.
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
 *     the Item Type names in MCP UI exactly: `Topics`, `Tags`.
 *     Misspelling silently drops the relation. `Technologies` is
 *     DEPRECATED in v4 — do not re-add it here.
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

        const normalize = (v) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
        const identityStorageKey = "mcp_customer_id";
        const identityCookieName = "mcp_customer_id";
        const identityCookieMaxAgeSeconds = 60 * 60 * 24 * 365 * 5;

        const readCookie = (name) => {
          try {
            const cookiePrefix = `${name}=`;
            const cookies = (document.cookie || "").split(";").map((item) => item.trim());
            const cookieEntry = cookies.find((item) => item.startsWith(cookiePrefix));
            if (!cookieEntry) return undefined;
            return normalize(decodeURIComponent(cookieEntry.slice(cookiePrefix.length)));
          } catch (_error) {
            return undefined;
          }
        };

        const writeCookie = (name, value) => {
          const normalizedValue = normalize(value);
          if (!normalizedValue) return undefined;
          try {
            const parts = [
              `${name}=${encodeURIComponent(normalizedValue)}`,
              `Max-Age=${identityCookieMaxAgeSeconds}`,
              "Path=/",
              "SameSite=Lax",
            ];
            if (location.protocol === "https:") {
              parts.push("Secure");
            }
            document.cookie = parts.join("; ");
            return normalizedValue;
          } catch (_error) {
            return undefined;
          }
        };

        const syncLocalCustomerId = (value) => {
          const normalizedValue = normalize(value);
          if (!normalizedValue) return undefined;
          try {
            window.localStorage?.setItem(identityStorageKey, normalizedValue);
          } catch (_error) {
            // Ignore storage failures and keep cookie-first identity.
          }
          return normalizedValue;
        };

        const readSdkIdentityCookie = () => {
          try {
            const cookies = (document.cookie || "").split(";").map((item) => item.trim());
            const cookieEntry = cookies.find((item) =>
              item.startsWith("_evga_") || item.startsWith("_sfid_") || item.startsWith("evg_")
            );
            if (!cookieEntry) return undefined;
            const separator = cookieEntry.indexOf("=");
            if (separator < 0) return undefined;
            return normalize(decodeURIComponent(cookieEntry.slice(separator + 1)));
          } catch (_error) {
            return undefined;
          }
        };

        const generateCustomerId = () => {
          try {
            if (window.crypto?.randomUUID) return window.crypto.randomUUID();
            if (window.crypto?.getRandomValues) {
              const bytes = new Uint8Array(16);
              window.crypto.getRandomValues(bytes);
              bytes[6] = (bytes[6] & 0x0f) | 0x40;
              bytes[8] = (bytes[8] & 0x3f) | 0x80;
              const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
              return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
            }
          } catch (_error) {
            // Continue to deterministic fallback.
          }
          return `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        };

        const getOrCreateStableCustomerId = (seedValue) => {
          const cookieId = readCookie(identityCookieName);
          if (cookieId) return syncLocalCustomerId(cookieId);

          let storageId;
          try {
            storageId = normalize(window.localStorage?.getItem(identityStorageKey));
          } catch (_error) {
            storageId = undefined;
          }
          if (storageId) return writeCookie(identityCookieName, storageId) || storageId;

          const seededId = normalize(seedValue) || readSdkIdentityCookie();
          const generatedId = seededId || generateCustomerId();
          const persistedCookieId = writeCookie(identityCookieName, generatedId) || generatedId;
          syncLocalCustomerId(persistedCookieId);
          return persistedCookieId;
        };

        actionEvent.user = actionEvent.user || {};
        actionEvent.user.identities = actionEvent.user.identities || {};

        const identities = actionEvent.user.identities;
        const existingCustomerId = normalize(identities.customerId);
        const identitySeed =
          existingCustomerId ||
          normalize(identities.sfmcContactKey) ||
          normalize(identities._sfUserId) ||
          normalize(identities.profileId) ||
          normalize(identities.anonymousId) ||
          normalize(actionEvent.user.id) ||
          normalize(actionEvent.user.anonymousId);
        const stableCustomerId = getOrCreateStableCustomerId(identitySeed);

        if (!existingCustomerId && stableCustomerId) {
          identities.customerId = stableCustomerId;
        }
        if (!normalize(identities.sfmcContactKey) && stableCustomerId) {
          identities.sfmcContactKey = stableCustomerId;
        }

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
              imageUrl:    SalesforceInteractions.resolvers.fromSelectorAttribute("article.post", "data-article-image"),
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
              imageUrl:      SalesforceInteractions.resolvers.fromSelectorAttribute("article.post", "data-article-image"),
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

  // Dedicated named actions on detail page-load so user-segments can
  // target career vs blog interest by action NAME. The generic
  // ViewCatalogObject interaction above only differs by
  // catalogObject.type, which the segment Actions criteria cannot key
  // off. The PageType API exposes no page-load callback (supported keys
  // are name / isMatch / interaction / contentZones / listeners — there
  // is NO `action`), so we fire these imperatively once the detail
  // <article> is in the DOM, reusing the same ready-gate timing as the
  // matchWhenReady helper. One-shot window flags guard against a
  // double-fire; the names are distinct from each other and from
  // ViewCatalogObject, so the client-side rate limiter (same-name <1s
  // throttle) is not tripped. ViewCatalogObject is KEPT — the
  // catalog/recommendations engine still needs it.
  const fireDetailAction = () => {
    if (!window.__mcp_action_career_detail &&
        document.querySelector("article.post[data-article-category='career']")) {
      window.__mcp_action_career_detail = true;
      SalesforceInteractions.sendEvent({ interaction: { name: "View Career Detail" } });
    }
    if (!window.__mcp_action_blog_detail &&
        document.querySelector("article.post[data-article-category='blog']")) {
      window.__mcp_action_blog_detail = true;
      SalesforceInteractions.sendEvent({ interaction: { name: "View Blog Detail" } });
    }
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", fireDetailAction);
    setTimeout(fireDetailAction, 1500);
  } else {
    fireDetailAction();
  }
});
