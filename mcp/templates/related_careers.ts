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
 */
import { RecommendationsConfig, recommend } from "recs";

export class RelatedCareersTemplate implements CampaignTemplateComponent {

    @title("Recommendation Settings")
    @subtitle("Pick the recipe (e.g. Related Career Experiences) and limits")
    recsConfig: RecommendationsConfig = new RecommendationsConfig();

    run(context: CampaignComponentContext) {
        return {
            items: recommend(context, this.recsConfig),
        };
    }

}
