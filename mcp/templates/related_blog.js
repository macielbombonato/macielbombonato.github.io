/**
 * MCP Web Campaign — Related Blog Widget (Clientside Code)
 * --------------------------------------------------------
 * Target zone : related_blog
 * Target DOM  : #mcp-related-blog (declared in _layouts/career.html
 *               and _layouts/blog.html)
 * Page types  : career_detail, blog_detail
 *
 * STRATEGY: MANUAL RENDERING — see related_careers.js for the full
 * design notes. This file is the blog mirror with:
 *
 *   - DIFFERENT WIDGET name and distinct interaction names
 *     (`View Related Blog`, `Click Related Blog`) so the client-side
 *     rate limiter does not collapse impressions when both widgets
 *     render on the same detail page.
 *   - DIFFERENT card markup: `<a class="related-card is-blog">` —
 *     the `.is-blog` modifier flips the topic chips to the blog
 *     palette (purple, see `assets/css/demo.css`).
 *   - DIFFERENT meta line: blog cards show the post date as
 *     `DD MMM YYYY` (not the start–end range used by career cards).
 *     We read the system attribute `published` (NOT `publishDate` —
 *     `publishDate` is not registered on the Article item type, see
 *     `AGENTS.md`); we fall back to `publishDate` defensively in
 *     case any legacy payload still ships it.
 *   - NO company line — blog posts do not have a company.
 *
 * Paste this into the Clientside Code tab of the `related_blog`
 * template in MCP. Keep this file in sync after any edit there.
 */
(function () {
    "use strict";

    var WIDGET = "related_blog";
    var TARGET_SELECTOR = "#mcp-related-blog";
    var CARD_SELECTOR = '[data-cy-track="related_blog_click"]';
    var IMPRESSION_NAME = "View Related Blog";
    var CLICK_NAME = "Click Related Blog";
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
        var published = readAttr(attrs.published) || readAttr(attrs.publishDate);
        var topics = readAttr(attrs.topics);

        var meta = formatDateLong(published);

        var topicsHtml = "";
        if (Array.isArray(topics) && topics.length > 0) {
            topicsHtml = '<div class="related-card-topics">' +
                topics.map(function (t) {
                    return '<span class="related-card-topic">' + escapeHtml(t) + "</span>";
                }).join("") +
                "</div>";
        }

        return '<a class="related-card is-blog" ' +
            'href="' + escapeAttr(url) + '" ' +
            'data-cy-track="related_blog_click" ' +
            'data-cy-target-id="' + escapeAttr(id) + '">' +
            '<div class="related-card-meta">' + escapeHtml(meta) + "</div>" +
            '<h4 class="related-card-title">' + escapeHtml(name) + "</h4>" +
            topicsHtml +
            "</a>";
    }

    function readAttr(attr) {
        if (!attr) return null;
        return typeof attr === "object" && "value" in attr ? attr.value : attr;
    }

    function formatDateLong(value) {
        if (value === null || value === undefined || value === "") return "";
        try {
            var d = typeof value === "number"
                ? new Date(value)
                : new Date(Date.parse(value));
            if (isNaN(d.getTime())) return "";
            var dd = String(d.getDate()).padStart(2, "0");
            return dd + " " + MONTHS_PTBR[d.getMonth()] + " " + d.getFullYear();
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
