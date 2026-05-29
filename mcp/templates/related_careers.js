/**
 * MCP Web Campaign — Related Careers Widget (Clientside Code)
 * -----------------------------------------------------------
 * Target zone : related_careers
 * Page types  : career_detail, blog_detail
 *
 * Runs in the browser AFTER Handlebars renders the markup. Fires:
 *   - one "View Recommendations" impression per render — so we can
 *     count how often the recipe actually surfaced anything to the
 *     visitor (separate from the page-level View Catalog Object).
 *   - one "Click Recommendation" event per card click — so MCP
 *     reports can attribute downstream activity back to the Recipe
 *     and compute CTR per Recommendation.
 *
 * The card markup (related_careers.hbs) emits two data attributes
 * that this script reads:
 *     data-cy-track="related_career_click"
 *     data-cy-target-id="{{_id}}"
 *
 * Paste this into the Clientside Code tab of the `related_careers`
 * template in MCP. Keep this file in sync after any edit there.
 *
 * Notes:
 *   - All work runs inside try/catch — a tracking failure must never
 *     break the rendered widget for the visitor.
 *   - `addEventListener` is attached per card; do NOT use a single
 *     document-level delegated listener, because MCP can re-render
 *     the same template multiple times in a session and the previous
 *     listener pool stays attached to detached DOM (harmless leak).
 *     Local listeners die with the card when it leaves the DOM.
 */
(function () {
    "use strict";

    var WIDGET = "related_careers";
    var SELECTOR = '[data-cy-track="related_career_click"]';

    try {
        SalesforceInteractions.sendEvent({
            interaction: {
                name: "View Recommendations",
                widget: WIDGET,
            },
        });
    } catch (e) {
        // tracking is best-effort — never break the widget
    }

    var cards = document.querySelectorAll(SELECTOR);
    Array.prototype.forEach.call(cards, function (card) {
        card.addEventListener("click", function () {
            try {
                var titleEl = card.querySelector(".related-card-title");
                SalesforceInteractions.sendEvent({
                    interaction: {
                        name: "Click Recommendation",
                        widget: WIDGET,
                        targetId: card.getAttribute("data-cy-target-id") || "",
                        targetName: titleEl ? (titleEl.innerText || "").trim() : "",
                        destination: card.getAttribute("href") || "",
                    },
                });
            } catch (e) {
                // tracking is best-effort — never block the navigation
            }
        });
    });
})();
