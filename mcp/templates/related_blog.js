/**
 * MCP Web Campaign — Related Blog Widget (Clientside Code)
 * --------------------------------------------------------
 * Target zone : related_blog
 * Page types  : career_detail, blog_detail
 *
 * Mirror of related_careers.js — same shape, different `WIDGET`
 * tag and click-selector so MCP reports can distinguish the two
 * widgets when they coexist on the same page.
 *
 * The card markup (related_blog.hbs) emits two data attributes
 * that this script reads:
 *     data-cy-track="related_blog_click"
 *     data-cy-target-id="{{_id}}"
 *
 * Paste this into the Clientside Code tab of the `related_blog`
 * template in MCP. Keep this file in sync after any edit there.
 *
 * See related_careers.js for the design notes that apply here too.
 */
(function () {
    "use strict";

    var WIDGET = "related_blog";
    var SELECTOR = '[data-cy-track="related_blog_click"]';

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
