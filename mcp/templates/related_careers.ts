/**
 * MCP Web Campaign — Related Careers Widget (Serverside Code)
 * ----------------------------------------------------------
 * Target zone : related_careers
 * Page types  : career_detail, blog_detail
 * Recipe      : Related Career Experiences (selected per Campaign in the UI)
 * Item Type   : Article (custom-configured for career experiences)
 *
 * This template exposes a `RecommendationsConfig` picker so the marketer
 * picks the Recipe in the Campaign editor. The companion Handlebars file
 * (`related_careers.hbs`) consumes the `items` array we return below.
 *
 * Paste this into the Serverside Code tab of the `related_careers`
 * template in MCP. Keep this file in sync after any edit there.
 *
 * `.restrictItemType("Article")` is REQUIRED, not optional. It does
 * two things: (1) at design-time it locks the Item Type field in the
 * Campaign editor so the Recipe dropdown lists only Recipes built on
 * the `Article` Item Type, and (2) at runtime it scopes `recommend()`
 * to candidates of type `Article` (which on this dataset means only
 * career experiences — blog posts live in the native `Blog` Item
 * Type, see related_blog.ts). Without this restriction the picker
 * defaults to the placeholder "Product" Item Type, the Recipe
 * dropdown shows "No options", and at runtime `recommend()` is
 * called with `recipeId: null` and throws the "System service
 * exception".
 *
 * Recipe filtering — `Topics`, `Technologies`, and `Tags` are now
 * their own Item Types connected to `Article` via
 * `relatedCatalogObjects` (see mcp/sitemap.js and the v3 catalog
 * model in mcp/README.md). That means the Recipe's Include Rule
 * can filter on "related catalog object membership" — e.g. "items
 * that share at least one Topic with the currently viewed item" —
 * which is a robust graph filter, NOT a fragile string match on a
 * MultiString attribute. Build the Include Rule in the Recipe
 * editor; this template doesn't need to thread the filter through.
 *
 * Defensive `try/catch`: even with the Item Type locked, the marketer
 * can still publish the Campaign before selecting a Recipe, the
 * selected Recipe can reference missing catalog data (e.g. the
 * `catalog/articles.csv` ETL hasn't run yet), or Strict Catalog
 * Security may be toggled on. In all of those cases the runtime
 * throws "System service exception via [recommend :
 * context.services.recommendations.recommend(request)]" and the
 * entire campaign fails to render. Catching here keeps the page
 * clean (empty zone) and lets the CSS rule
 * `.related-articles:has(.related-grid:not(:empty))` hide the widget
 * naturally.
 *
 * `.restrictMaxResults(3)` caps the recommendation list at 3 cards.
 * The site is small and the related-items aside sits below the
 * Disqus block; long lists scroll the user away from the article
 * footer and dilute attribution. 3 is also the limit the site-side
 * renderer enforces as a defense-in-depth slice
 * (`assets/js/mcp-related-renderer.js`, `MAX_PER_ZONE`), so changing
 * this number in one place without the other will be capped to the
 * smaller of the two.
 */
import { RecommendationsConfig, recommend } from "recs";

export class RelatedCareersTemplate implements CampaignTemplateComponent {

    @title("Recommendation Settings")
    @subtitle("Pick the recipe (e.g. Related Career Experiences) and limits")
    recsConfig: RecommendationsConfig = new RecommendationsConfig()
        .restrictItemType("Article")
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
