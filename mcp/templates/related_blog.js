/**
 * MCP Web Campaign — Related Blog Widget (Clientside Code)
 * --------------------------------------------------------
 * Target zone : related_blog
 * Page types  : career_detail, blog_detail
 *
 * Mirror of related_careers.js — same shape, different `WIDGET`
 * tag, distinct event names, and a different click-selector so
 * MCP reports can distinguish the two widgets when they coexist
 * on the same page AND so the client-side rate limiter does not
 * collapse their impressions.
 *
 * The card markup (related_blog.hbs) emits two data attributes
 * that this script reads:
 *     data-cy-track="related_blog_click"
 *     data-cy-target-id="{{_id}}"
 *
 * Paste this into the Clientside Code tab of the `related_blog`
 * template in MCP. Keep this file in sync after any edit there.
 *
 * See related_careers.js for the full design notes — they apply
 * here verbatim.
 */
(function () {
    "use strict";

    var WIDGET = "related_blog";
    var SELECTOR = '[data-cy-track="related_blog_click"]';
    var IMPRESSION_NAME = "View Related Blog";
    var CLICK_NAME = "Click Related Blog";
    var IMPRESSION_FLAG = "__mcp_impressed_" + WIDGET;

    var cards = document.querySelectorAll(SELECTOR);

    if (cards.length > 0 && !window[IMPRESSION_FLAG]) {
        window[IMPRESSION_FLAG] = true;
        try {
            SalesforceInteractions.sendEvent({
                interaction: {
                    name: IMPRESSION_NAME,
                    widget: WIDGET,
                    itemCount: cards.length,
                },
            });
        } catch (e) {
            // tracking is best-effort — never break the widget
        }
    }

    Array.prototype.forEach.call(cards, function (card) {
        card.addEventListener("click", function () {
            try {
                var titleEl = card.querySelector(".related-card-title");
                SalesforceInteractions.sendEvent({
                    interaction: {
                        name: CLICK_NAME,
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
