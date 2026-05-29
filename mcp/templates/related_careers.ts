/**
 * MCP Web Campaign — Related Careers Widget (Serverside Code)
 * ----------------------------------------------------------
 * Target zone : related_careers
 * Page types  : career_detail, blog_detail
 * Recipe      : Related Career Experiences (selected per Campaign in the UI)
 *
 * This template exposes a `RecommendationsConfig` picker so the marketer
 * picks the Recipe in the Campaign editor. The companion Handlebars file
 * (`related_careers.hbs`) consumes the `items` array we return below.
 *
 * Paste this into the Serverside Code tab of the `related_careers`
 * template in MCP. Keep this file in sync after any edit there.
 *
 * `.restrictItemType("Article")` is REQUIRED, not optional. Without it
 * the picker in the Campaign editor defaults to the placeholder
 * "Product" Item Type — and since our catalog only ships "Article",
 * the Recipe dropdown becomes empty ("No options"), forcing
 * `recommend()` to run with `recipeId: null` and throwing the runtime
 * "System service exception". Restricting here locks the picker to
 * "Article" so the dropdown always lists our Recipes.
 *
 * Defensive `try/catch`: even with the Item Type locked, the marketer
 * can still publish the Campaign before selecting a Recipe, the
 * selected Recipe can reference missing catalog data, or Strict
 * Catalog Security may be toggled on. In all of those cases the
 * runtime throws "System service exception via [recommend :
 * context.services.recommendations.recommend(request)]" and the
 * entire campaign fails to render. Catching here keeps the page
 * clean (empty zone) and lets the Handlebars `{{#if items.length}}`
 * guard hide the widget naturally.
 */
import { RecommendationsConfig, recommend } from "recs";

export class RelatedCareersTemplate implements CampaignTemplateComponent {

    @title("Recommendation Settings")
    @subtitle("Pick the recipe (e.g. Related Career Experiences) and limits")
    recsConfig: RecommendationsConfig = new RecommendationsConfig().restrictItemType("Article");

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
