/* ===========================================================================
 * MCP Related-Items Renderer
 * Site-side renderer for Salesforce Marketing Cloud Personalization (MCP)
 * recommendation widgets — bypasses the MCP Template's Clientside Code and
 * the MCP-managed apply() flow entirely.
 *
 * Why this file exists
 * --------------------
 * The MCP Web Campaign Template's apply() flow was not reliably injecting
 * cards into our <div id="mcp-related-careers"> / <div id="mcp-related-blog">
 * targets — the server returned a full campaignResponses[].payload.items
 * array but the zone stayed empty (silent failure, no error). Even pasting
 * a registerTemplate(source) wrapper into the Template's Clientside Code
 * tab did not fix it, because the MCP runtime evaluates that bundle in a
 * sandbox we cannot inspect, and there is no guarantee it ever calls
 * registerTemplate when the Content Zone Action is misconfigured.
 *
 * This file ships with the Jekyll site. It hooks the browser's fetch() and
 * XMLHttpRequest BEFORE the MCP beacon loads, intercepts every MCP response
 * that contains `campaignResponses`, and renders the cards itself directly
 * into the target zones — completely independent of the Template Clientside
 * Code.
 *
 * Architecture
 * ------------
 * 1. Hooks are armed synchronously at script-evaluation time, in <head>,
 *    BEFORE the MCP beacon <script src="...evergage.min.js"> loads. This
 *    is the critical ordering — once the MCP beacon fires its first
 *    request, we need our hook in place to see the response.
 * 2. Both `window.fetch` and `XMLHttpRequest` are wrapped. The MCP SDK has
 *    historically used both depending on the version; covering both means
 *    we don't depend on internal SDK details.
 * 3. When a response body shaped like `{ campaignResponses: [...] }`
 *    arrives, we walk it and render each `payload.items[]` into the
 *    `payload.contentZone`'s target div.
 * 4. Cards are built with the same DOM contract as the .hbs in
 *    mcp/templates/ — so the CSS in assets/css/demo.css (.related-card,
 *    .related-grid, .is-blog modifier, the :has() reveal) keeps working
 *    unchanged.
 * 5. Tracking (impression + click) fires from here, NOT from the MCP
 *    Template's Clientside Code — same event names, same invariants:
 *    distinct names per widget, per-page-load impression de-dup,
 *    try/catch around every beacon.
 *
 * Versioning + edit rules
 * -----------------------
 * Edit this file in the repo, commit, push. GitHub Pages rebuilds and the
 * change goes live. NO copy-paste into the MCP UI is needed. The MCP
 * Template Clientside Code is intentionally left empty (or near-empty)
 * to avoid double-rendering — see mcp/templates/*.js and mcp/README.md.
 *
 * Browser support: ES5 only. The site has historically targeted older
 * browsers; no arrow functions, no const/let, no template literals, no
 * optional chaining.
 * ========================================================================= */

(function () {
    "use strict";

    var WIDGETS = {
        related_careers: {
            selector: "#mcp-related-careers",
            cardClick: "related_career_click",
            impressionName: "View Related Careers",
            clickName: "Click Related Career",
            impressionFlag: "__mcp_impressed_related_careers",
            renderedFlag: "__mcp_rendered_related_careers",
            build: buildCareerCard
        },
        related_blog: {
            selector: "#mcp-related-blog",
            cardClick: "related_blog_click",
            impressionName: "View Related Blog",
            clickName: "Click Related Blog",
            impressionFlag: "__mcp_impressed_related_blog",
            renderedFlag: "__mcp_rendered_related_blog",
            build: buildBlogCard
        }
    };

    var MONTHS_PTBR = [
        "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
        "Jul", "Ago", "Set", "Out", "Nov", "Dez"
    ];

    /* ----- detection: does this response look like an MCP campaign payload? ----- */

    function isMcpResponse(body) {
        return body && typeof body === "object" && body.campaignResponses
            && Object.prototype.toString.call(body.campaignResponses) === "[object Array]";
    }

    function looksLikeMcpUrl(url) {
        if (!url || typeof url !== "string") return false;
        return /evergage|evgnet|personalization|interactions/i.test(url);
    }

    /* ----- main dispatcher ----- */

    // Debug buffer — every intercepted MCP response is pushed here so it
    // can be inspected from the console:
    //
    //     window.__mcpResponses
    //         → array of { ts, zonesSeen, totalItems, body }
    //
    // Specifically useful for diagnosing the "first-load empty / cmd+r
    // populated" symptom: if window.__mcpResponses[0] has totalItems=0
    // but window.__mcpResponses[1] has totalItems>0, the cold-load fix
    // in renderZone() is what allows the second response to draw cards.
    if (!window.__mcpResponses) window.__mcpResponses = [];

    function handlePayload(body) {
        if (!isMcpResponse(body)) return 0;
        var list = body.campaignResponses;
        var totalRendered = 0;
        var zonesSeen = [];
        var totalItems = 0;
        for (var i = 0; i < list.length; i++) {
            var resp = list[i];
            var payload = resp && resp.payload;
            if (!payload) continue;
            var zoneName = payload.contentZone;
            var items = payload.items || [];
            var cfg = WIDGETS[zoneName];
            if (cfg) {
                zonesSeen.push(zoneName);
                totalItems += items.length;
                totalRendered += renderZone(cfg, items);
            }
        }
        if (zonesSeen.length > 0) {
            window.__mcpResponses.push({
                ts: Date.now(),
                zonesSeen: zonesSeen,
                totalItems: totalItems,
                rendered: totalRendered,
                body: body
            });
        }
        return totalRendered;
    }

    function renderZone(cfg, items) {
        // The DOM might not be ready yet if the MCP beacon fired before
        // DOMContentLoaded. Bail to a deferred retry instead of failing.
        var target = document.querySelector(cfg.selector);
        if (!target) {
            deferRender(cfg, items);
            return 0;
        }

        // EMPTY-RESPONSE PASS-THROUGH (cold-load fix). MCP frequently
        // returns an empty `items` array on the very first campaign
        // request of a session, because recipes like "Related Career
        // Experiences" need at least one prior catalog view to produce
        // recommendations. Without this guard we would set the
        // renderedFlag on that first empty response and ignore the
        // SECOND response (populated, fired right after the page-view
        // event lands) — which is exactly the "only works after cmd+r"
        // symptom we hit in production. So: only lock the zone once
        // we've actually drawn at least one card.
        if (!items || items.length === 0) {
            return 0;
        }

        // Idempotency — once we've rendered a non-empty payload, ignore
        // any subsequent MCP re-polls in the same page-load. This keeps
        // impressions de-duplicated and avoids the rate limiter.
        if (window[cfg.renderedFlag]) return 0;
        window[cfg.renderedFlag] = true;

        var html = [];
        for (var i = 0; i < items.length; i++) {
            html.push(cfg.build(items[i]));
        }
        target.innerHTML = html.join("");

        attachClickListeners(target, cfg);
        fireImpression(cfg, items.length);
        return items.length;
    }

    function deferRender(cfg, items) {
        // If DOM isn't ready, wait for DOMContentLoaded then retry. We
        // reset the renderedFlag so renderZone re-runs cleanly.
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", function () {
                renderZone(cfg, items);
            });
            return;
        }
        // DOM is ready but our selector still wasn't there — page layout
        // doesn't have the widget zone. Nothing to do.
    }

    /* ----- card builders (mirror the .hbs in mcp/templates/) ----- */

    function buildCareerCard(item) {
        var id = (item && (item._id || item.id)) || "";
        var a = (item && item.attributes) || {};
        var url = readAttr(a.url);
        var name = readAttr(a.name);
        var company = readAttr(a.company);
        var startDate = readAttr(a.startDate);
        var endDate = readAttr(a.endDate);
        var topics = readAttr(a.topics);

        var meta = formatMonth(startDate) +
            (endDate ? " \u2014 " + formatMonth(endDate) : " \u2014 ATUAL");

        var companyHtml = company
            ? '<p class="related-card-company">' + escapeHtml(company) + "</p>"
            : "";

        var topicsHtml = buildTopicChips(topics);

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

    function buildBlogCard(item) {
        var id = (item && (item._id || item.id)) || "";
        var a = (item && item.attributes) || {};
        var url = readAttr(a.url);
        var name = readAttr(a.name);
        // `published` is the registered System Attribute on the Article
        // item type; `publishDate` is not registered (see AGENTS.md) but
        // we accept it as a fallback for any legacy payload still in
        // flight while the catalog feed catches up.
        var published = readAttr(a.published) || readAttr(a.publishDate);
        var topics = readAttr(a.topics);

        var meta = formatDayMonthYear(published);
        var topicsHtml = buildTopicChips(topics);

        return '<a class="related-card is-blog" ' +
            'href="' + escapeAttr(url) + '" ' +
            'data-cy-track="related_blog_click" ' +
            'data-cy-target-id="' + escapeAttr(id) + '">' +
            '<div class="related-card-meta">' + escapeHtml(meta) + "</div>" +
            '<h4 class="related-card-title">' + escapeHtml(name) + "</h4>" +
            topicsHtml +
            "</a>";
    }

    function buildTopicChips(topics) {
        if (!topics || !topics.length) return "";
        var out = ['<div class="related-card-topics">'];
        for (var i = 0; i < topics.length; i++) {
            out.push('<span class="related-card-topic">' + escapeHtml(topics[i]) + "</span>");
        }
        out.push("</div>");
        return out.join("");
    }

    /* ----- attribute + date helpers ----- */

    function readAttr(attr) {
        if (!attr) return null;
        if (typeof attr === "object" && "value" in attr) return attr.value;
        return attr;
    }

    function formatMonth(value) {
        // Catalog dates arrive as Unix-ms numbers. Use UTC accessors so a
        // post tagged for Feb 2025 renders as "Fev 2025" regardless of
        // the viewer's timezone (using local accessors made early-of-
        // month posts shift by one day → wrong month label).
        var d = toDate(value);
        if (!d) return "";
        return MONTHS_PTBR[d.getUTCMonth()] + " " + d.getUTCFullYear();
    }

    function formatDayMonthYear(value) {
        var d = toDate(value);
        if (!d) return "";
        var dd = String(d.getUTCDate());
        if (dd.length < 2) dd = "0" + dd;
        return dd + " " + MONTHS_PTBR[d.getUTCMonth()] + " " + d.getUTCFullYear();
    }

    function toDate(value) {
        if (value === null || value === undefined || value === "") return null;
        var d = typeof value === "number"
            ? new Date(value)
            : new Date(Date.parse(value));
        if (isNaN(d.getTime())) return null;
        return d;
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

    /* ----- tracking ----- */

    function attachClickListeners(zone, cfg) {
        var cards = zone.querySelectorAll('[data-cy-track="' + cfg.cardClick + '"]');
        for (var i = 0; i < cards.length; i++) {
            (function (card) {
                card.addEventListener("click", function () {
                    try {
                        if (!window.SalesforceInteractions) return;
                        var titleEl = card.querySelector(".related-card-title");
                        window.SalesforceInteractions.sendEvent({
                            interaction: {
                                name: cfg.clickName,
                                widget: cfgWidgetName(cfg),
                                targetId: card.getAttribute("data-cy-target-id") || "",
                                targetName: titleEl ? (titleEl.innerText || "").trim() : "",
                                destination: card.getAttribute("href") || ""
                            }
                        });
                    } catch (e) {
                        // tracking is best-effort — never block the navigation
                    }
                });
            })(cards[i]);
        }
    }

    function fireImpression(cfg, itemCount) {
        if (window[cfg.impressionFlag]) return;
        window[cfg.impressionFlag] = true;
        try {
            if (!window.SalesforceInteractions) return;
            window.SalesforceInteractions.sendEvent({
                interaction: {
                    name: cfg.impressionName,
                    widget: cfgWidgetName(cfg),
                    itemCount: itemCount
                }
            });
        } catch (e) {
            // tracking is best-effort — never break the widget
        }
    }

    function cfgWidgetName(cfg) {
        // Derive widget name from the impressionFlag for log/event payloads
        // ("__mcp_impressed_related_careers" -> "related_careers")
        return cfg.impressionFlag.replace("__mcp_impressed_", "");
    }

    /* ----- fetch() hook ----- */

    if (typeof window.fetch === "function") {
        var origFetch = window.fetch;
        window.fetch = function () {
            var args = arguments;
            var url = "";
            try {
                url = (args[0] && (args[0].url || args[0])) || "";
            } catch (e) { /* ignore */ }

            var p = origFetch.apply(this, args);
            if (!looksLikeMcpUrl(url)) return p;

            return p.then(function (res) {
                try {
                    res.clone().json().then(function (body) {
                        try { handlePayload(body); } catch (e) { logError(e); }
                    }).catch(function () { /* not JSON, ignore */ });
                } catch (e) { logError(e); }
                return res;
            });
        };
    }

    /* ----- XMLHttpRequest hook ----- */

    if (typeof window.XMLHttpRequest === "function") {
        var XHR = window.XMLHttpRequest.prototype;
        var origOpen = XHR.open;
        var origSend = XHR.send;

        XHR.open = function (method, url) {
            try { this.__mcpUrl = url || ""; } catch (e) { /* ignore */ }
            return origOpen.apply(this, arguments);
        };

        XHR.send = function () {
            var xhr = this;
            try {
                if (looksLikeMcpUrl(xhr.__mcpUrl)) {
                    xhr.addEventListener("load", function () {
                        try {
                            // responseType might be "json" (already parsed) or
                            // "" / "text" (raw string we need to JSON.parse).
                            var body = null;
                            if (xhr.responseType === "json") {
                                body = xhr.response;
                            } else if (typeof xhr.responseText === "string" && xhr.responseText.charAt(0) === "{") {
                                body = JSON.parse(xhr.responseText);
                            }
                            if (body) handlePayload(body);
                        } catch (e) { logError(e); }
                    });
                }
            } catch (e) { logError(e); }
            return origSend.apply(this, arguments);
        };
    }

    /* ----- debug surface ----- */

    function logError(e) {
        if (window.console && window.console.error) {
            window.console.error("[mcp-related-renderer]", e);
        }
    }

    // Expose for manual smoke-testing from the console:
    //   window.__mcpRender({ campaignResponses: [...] })
    window.__mcpRender = handlePayload;
})();
