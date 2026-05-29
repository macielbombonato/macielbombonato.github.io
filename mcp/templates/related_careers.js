/**
 * MCP Web Campaign — Related Careers Widget (Clientside Code)
 * -----------------------------------------------------------
 * Target zone : related_careers
 * Target DOM  : #mcp-related-careers (declared in _layouts/career.html
 *               and _layouts/blog.html)
 * Page types  : career_detail, blog_detail
 *
 * STRATEGY: MANUAL RENDERING
 * --------------------------
 * This Clientside Code renders the recommendation cards DIRECTLY into
 * the DOM, bypassing the MCP-managed `apply()` flow that uses the
 * Handlebars template.
 *
 * Why we bypass apply():
 *   - On Rule Based Test campaigns the Content Zone Action could not
 *     be configured to reliably inject into our `<div id="mcp-related-
 *     careers" class="related-grid"></div>` target. The server kept
 *     returning a full `campaignResponses[].payload.items` array but
 *     `#mcp-related-careers.children.length` stayed at 0.
 *   - Manual rendering removes that single point of failure. As long
 *     as MCP delivers the bundle (which it always does — that is the
 *     transport mechanism), we control the rest.
 *
 * How the hook works:
 *
 *   The bundle MCP delivers has this shape (paraphrased):
 *
 *       function registerTemplate(source) {
 *           return TemplateService.registerTemplate(
 *               Object.assign({}, source, {
 *                   name: 'related_careers',
 *                   handlebars: <compiled .hbs>,
 *               })
 *           );
 *       }
 *
 *       try { <this Clientside Code IIFE> } catch(e) { ... }
 *
 *   `function registerTemplate(...)` is hoisted, so it exists in our
 *   IIFE's scope. We reassign it to a wrapper that grabs `source.items`
 *   and renders the cards ourselves. When MCP later invokes
 *   `registerTemplate(source)` (which is when items are bound), our
 *   wrapper fires and the cards land in `#mcp-related-careers`.
 *
 *   We INTENTIONALLY do NOT chain the original implementation —
 *   calling it would let MCP's apply() also fire (whenever it eventually
 *   works) and we'd risk a duplicate render.
 *
 * The companion `.hbs` file is kept as the visual source-of-truth for
 * the card markup. The `buildCardHtml` function below MUST render the
 * same DOM the `.hbs` would produce — same classes, same data-attrs —
 * because the CSS (`.related-card`, `.related-grid`, etc. in
 * `assets/css/demo.css`) and the impression/click tracking selectors
 * depend on that contract.
 *
 * Other invariants preserved from the previous version:
 *
 *   - DISTINCT event names per widget (`View Related Careers` vs
 *     `View Related Blog`) to avoid the client-side rate limiter.
 *   - RENDER-GUARD: impression only fires when at least one card
 *     was actually rendered.
 *   - PER-PAGE-LOAD DE-DUP via `window.__mcp_impressed_<widget>`.
 *   - try/catch around every beacon — tracking failures must never
 *     break the widget or block navigation.
 *   - Per-card `addEventListener` (not delegated) — listeners die
 *     cleanly with the cards on re-render.
 *
 * Paste this into the Clientside Code tab of the `related_careers`
 * template in MCP. Keep this file in sync after any edit there.
 */
(function () {
    "use strict";

    var WIDGET = "related_careers";
    var TARGET_SELECTOR = "#mcp-related-careers";
    var CARD_SELECTOR = '[data-cy-track="related_career_click"]';
    var IMPRESSION_NAME = "View Related Careers";
    var CLICK_NAME = "Click Related Career";
    var IMPRESSION_FLAG = "__mcp_impressed_" + WIDGET;
    var MONTHS_PTBR = [
        "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
        "Jul", "Ago", "Set", "Out", "Nov", "Dez"
    ];

    if (typeof registerTemplate === "function") {
        registerTemplate = function (source) {
            try {
                var items = (source && source.items) || [];
                renderCards(items);
            } catch (e) {
                if (window.Evergage && Evergage.log) {
                    Evergage.log.error(e);
                }
            }
        };
    }

    function renderCards(items) {
        var zone = document.querySelector(TARGET_SELECTOR);
        if (!zone) return;
        if (!Array.isArray(items) || items.length === 0) {
            zone.innerHTML = "";
            return;
        }
        zone.innerHTML = items.map(buildCardHtml).join("");
        attachClickListeners(zone);
        fireImpression(items.length);
    }

    function buildCardHtml(item) {
        var id = item && (item._id || item.id) || "";
        var attrs = (item && item.attributes) || {};
        var url = readAttr(attrs.url);
        var name = readAttr(attrs.name);
        var company = readAttr(attrs.company);
        var startDate = readAttr(attrs.startDate);
        var endDate = readAttr(attrs.endDate);
        var topics = readAttr(attrs.topics);

        var meta = formatDateMonth(startDate) +
            (endDate ? " — " + formatDateMonth(endDate) : " — ATUAL");

        var companyHtml = company
            ? '<p class="related-card-company">' + escapeHtml(company) + "</p>"
            : "";

        var topicsHtml = "";
        if (Array.isArray(topics) && topics.length > 0) {
            topicsHtml = '<div class="related-card-topics">' +
                topics.map(function (t) {
                    return '<span class="related-card-topic">' + escapeHtml(t) + "</span>";
                }).join("") +
                "</div>";
        }

        return '<a class="related-card" ' +
            'href="' + escapeAttr(url) + '" ' +
            'data-cy-track="related_career_click" ' +
            'data-cy-target-id="' + escapeAttr(id) + '">' +
            '<div class="related-card-meta">' + escapeHtml(meta) + "</div>" +
            '<h4 class="related-card-title">' + escapeHtml(name) + "</h4>" +
            companyHtml +
            topicsHtml +
            "</a>";
    }

    function readAttr(attr) {
        if (!attr) return null;
        return typeof attr === "object" && "value" in attr ? attr.value : attr;
    }

    function formatDateMonth(value) {
        if (value === null || value === undefined || value === "") return "";
        try {
            var d = typeof value === "number"
                ? new Date(value)
                : new Date(Date.parse(value));
            if (isNaN(d.getTime())) return "";
            return MONTHS_PTBR[d.getMonth()] + " " + d.getFullYear();
        } catch (e) {
            return "";
        }
    }

    function escapeHtml(s) {
        if (s === null || s === undefined) return "";
        return String(s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function escapeAttr(s) {
        return escapeHtml(s);
    }

    function attachClickListeners(zone) {
        var cards = zone.querySelectorAll(CARD_SELECTOR);
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
    }

    function fireImpression(itemCount) {
        if (window[IMPRESSION_FLAG]) return;
        window[IMPRESSION_FLAG] = true;
        try {
            SalesforceInteractions.sendEvent({
                interaction: {
                    name: IMPRESSION_NAME,
                    widget: WIDGET,
                    itemCount: itemCount,
                },
            });
        } catch (e) {
            // tracking is best-effort — never break the widget
        }
    }
})();
