/**
 * MCP Web Campaign — Related Blog Widget (Serverside Code)
 * --------------------------------------------------------
 * Target zone : related_blog
 * Page types  : career_detail, blog_detail
 * Recipe      : Related Blog Articles (selected per Campaign in the UI)
 *
 * Mirror of related_careers.ts — same structure, separate class name so
 * MCP can publish two distinct templates targeting different zones. The
 * companion Handlebars file (`related_blog.hbs`) consumes `items`.
 *
 * Paste this into the Serverside Code tab of the `related_blog`
 * template in MCP. Keep this file in sync after any edit there.
 */
import { RecommendationsConfig, recommend } from "recs";

export class RelatedBlogTemplate implements CampaignTemplateComponent {

    @title("Recommendation Settings")
    @subtitle("Pick the recipe (e.g. Related Blog Articles) and limits")
    recsConfig: RecommendationsConfig = new RecommendationsConfig().restrictItemType("Article");

    run(context: CampaignComponentContext) {
        return {
            items: recommend(context, this.recsConfig),
        };
    }

}
