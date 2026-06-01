/**
 * MCP Web Campaign — Related Blog Widget (Serverside Code)
 * --------------------------------------------------------
 * Target zone : related_blog
 * Page types  : career_detail, blog_detail
 * Recipe      : Related Blog Articles (selected per Campaign in the UI)
 * Item Type   : Blog (native MCP EVGBlog)
 *
 * Mirror of related_careers.ts in structure — separate class name and
 * a different `restrictItemType` because the two widgets recommend
 * across different catalogs:
 *
 *   - related_careers  →  Item Type `Article`  (career experiences)
 *   - related_blog     →  Item Type `Blog`     (native MCP blog posts)
 *
 * Paste this into the Serverside Code tab of the `related_blog`
 * template in MCP. Keep this file in sync after any edit there.
 *
 * `.restrictItemType("Blog")` is REQUIRED, not optional. It does two
 * things: (1) at design-time it locks the Item Type field in the
 * Campaign editor so the Recipe dropdown lists only Recipes built on
 * the `Blog` Item Type, and (2) at runtime it scopes `recommend()` to
 * candidates of type `Blog`, which is what completely fixes the old
 * "blog widget returns career items" bug — under the previous
 * `restrictItemType("Article")` + `Include Rule Category=blog`
 * layout, behavioral recipes applied the Include Rule as a POST-rank
 * filter and silently fell back to a popular-Article bucket
 * (overwhelmingly career, since career has more views), so the
 * filter dropped everything and the fallback returned career items.
 * Splitting blog into its own native Item Type removes the failure
 * mode at the root.
 *
 * Recipe filtering — `Topics` and `Tags` are now their own Item Types
 * connected to `Blog` via `relatedCatalogObjects` (see mcp/sitemap.js
 * and the v3 catalog model in mcp/README.md). The Recipe's Include
 * Rule should filter on "items that share at least one Topic with
 * the currently viewed item" — a robust graph filter, NOT a string
 * match on a MultiString attribute. Build the Include Rule in the
 * Recipe editor; this template doesn't need to thread the filter
 * through.
 *
 * Defensive `try/catch`: even with the Item Type locked, the marketer
 * can still publish the Campaign before selecting a Recipe, the
 * selected Recipe can reference missing catalog data (e.g. the
 * `catalog/blogs.csv` ETL hasn't run yet), or Strict Catalog Security
 * may be toggled on. In all of those cases the runtime throws
 * "System service exception via [recommend :
 * context.services.recommendations.recommend(request)]" and the
 * entire campaign fails to render. Catching here keeps the page
 * clean (empty zone) and lets the CSS rule
 * `.related-articles:has(.related-grid:not(:empty))` hide the widget
 * naturally.
 *
 * `.restrictMaxResults(3)` caps the recommendation list at 3 cards.
 * Same rationale as related_careers.ts — keep the related aside tight
 * under the article footer. The site-side renderer
 * (`assets/js/mcp-related-renderer.js`, `MAX_PER_ZONE`) enforces the
 * same cap as defense-in-depth, so changing this number in one place
 * without the other will be capped to the smaller of the two.
 */
import { RecommendationsConfig, recommend } from "recs";

export class RelatedBlogTemplate implements CampaignTemplateComponent {

    @title("Recommendation Settings")
    @subtitle("Pick the recipe (e.g. Related Blog Articles) and limits")
    recsConfig: RecommendationsConfig = new RecommendationsConfig()
        .restrictItemType("Blog")
        .restrictMaxResults(3);

    run(context: CampaignComponentContext) {
        try {
            return {
                items: recommend(context, this.recsConfig),
            };
        } catch (e) {
            return { items: [] };
        }
    }

}
