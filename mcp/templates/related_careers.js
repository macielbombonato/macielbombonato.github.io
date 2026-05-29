/**
 * MCP Web Campaign — Related Careers Widget (Clientside Code)
 * -----------------------------------------------------------
 * Target zone : related_careers
 * Page types  : career_detail, blog_detail
 *
 * Runs in the browser AFTER Handlebars renders the markup. Fires:
 *   - one "View Related Careers" impression per page load, ONLY if
 *     the widget actually drew cards (so empty renders don't pollute
 *     impression counts and don't trip the rate limiter).
 *   - one "Click Related Career" event per card click — so MCP
 *     reports can attribute downstream activity back to the Recipe
 *     and compute CTR per recommended item.
 *
 * The card markup (related_careers.hbs) emits two data attributes
 * that this script reads:
 *     data-cy-track="related_career_click"
 *     data-cy-target-id="{{_id}}"
 *
 * Paste this into the Clientside Code tab of the `related_careers`
 * template in MCP. Keep this file in sync after any edit there.
 *
 * Design notes:
 *
 *   - DISTINCT event names per widget. Do NOT share the same
 *     `interaction.name` across the careers and blog templates —
 *     the MCP beacon's client-side rate limiter ("Client: Event
 *     Rate Limiter triggered") throttles bursts of identically
 *     named events. Two widgets rendering on the same detail page
 *     would dispatch back-to-back impressions with the same name
 *     and one of them would be dropped silently.
 *
 *   - PER-PAGE-LOAD DE-DUP via window flag. MCP can re-execute the
 *     Clientside Code when a Campaign re-renders (e.g. with
 *     `Auto Render` on in the Template Editor, or when MCP
 *     refreshes decision data mid-session). Without the flag we
 *     fire duplicate impressions on every re-render.
 *
 *   - RENDER-GUARD: only fire the impression if cards were actually
 *     drawn. The Clientside Code runs whether or not the Handlebars
 *     produced output, so without this guard we'd count an
 *     impression even when the recipe returned zero items.
 *
 *   - try/catch around every beacon — a tracking failure must never
 *     break the rendered widget or block the user's click.
 *
 *   - Per-card `addEventListener`, NOT a document-level delegated
 *     listener — per-card listeners die cleanly with the DOM when
 *     MCP re-renders the widget, so stale handlers don't accumulate.
 */
(function () {
    "use strict";

    var WIDGET = "related_careers";
    var SELECTOR = '[data-cy-track="related_career_click"]';
    var IMPRESSION_NAME = "View Related Careers";
    var CLICK_NAME = "Click Related Career";
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
