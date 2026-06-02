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

    // Maximum cards rendered per zone. Mirrors `.restrictMaxResults(3)`
    // in mcp/templates/related_careers.ts and related_blog.ts as
    // defense-in-depth: if the marketer ever raises the cap in the
    // Campaign editor or someone forgets to re-paste the .ts into MCP,
    // the renderer still trims to this number. Bump in BOTH places.
    var MAX_PER_ZONE = 3;

    // Bounded retry poll (cold-load fix, part 2). The reactive interceptor
    // renders the moment a populated campaign response is seen — but on a
    // FIRST click-navigation (no prior catalog view registered yet) the
    // first response is empty and the populated one arrives only AFTER the
    // page-view event fires from mcp/sitemap.js. That populated response can
    // land while document.readyState is "interactive" and the
    // #mcp-related-* div hasn't been parsed into the DOM yet. It IS still
    // buffered in window.__mcpResponses, though, so this poll re-evaluates the
    // buffer after the DOM is ready (via onDomReady, which fires immediately
    // when readyState is already interactive/complete) and paints any zone
    // that is still empty. RETRY_INTERVAL_MS * RETRY_MAX_ATTEMPTS sets
    // the ceiling (~5s) the user asked for, but we stop as soon as the
    // populated response lands and renders — we never blind-sleep the full 5s.
    var RETRY_INTERVAL_MS = 500;
    var RETRY_MAX_ATTEMPTS = 10;

    // Bounded re-query budget for deferRender when the DOM is ALREADY
    // interactive/complete but the target element wasn't found on the first
    // try. A "complete" readyState means the element either exists now or
    // never will, so a short re-query over a few ticks (covers a late layout
    // pass / a zone injected by a slightly-later script) is the right
    // behavior; after this many misses we give up quietly.
    var DEFER_MAX_ATTEMPTS = 5;

    // Cold-load ACTIVE recovery (the part that actually fixes "first visit
    // empty / refresh works"). The bounded poll above can only re-read
    // responses that ALREADY landed in window.__mcpResponses. But on a TRUE
    // first visit the related-items recipe ("Related Career Experiences" /
    // "Related Blog") has no "current item" in the visitor profile yet — the
    // ViewCatalogObject event for THIS page is still in flight — so the only
    // campaign response of the load comes back with items: []. Unlike a
    // refresh (where the prior view is already on the profile), NO populated
    // follow-up response arrives on its own during the first load, so there
    // is nothing for the poll to find. The fix: once we've captured the exact
    // campaign request the beacon issued (URL + method + headers + body), we
    // REPLAY it after a short delay. By then the ViewCatalogObject event has
    // registered server-side, so the replayed request returns populated
    // items, which handlePayload() renders straight into the zone — same
    // load, no manual refresh. We deliberately do NOT invent an SDK re-trigger
    // (e.g. a hypothetical reinit()): replaying the captured request is the
    // only mechanism we can guarantee exists, because we observed it work.
    //
    // REPLAY_AFTER_ATTEMPTS: ticks to wait before the first replay (~1s) so
    //   the view event has time to land server-side before we re-ask.
    // REPLAY_SPACING: ticks between replays (~1.5s) in case the first replay
    //   still raced the view registration.
    // MAX_REPLAYS: hard cap on re-requests (defense against a recipe that is
    //   genuinely empty — e.g. an item with no related siblings — so we don't
    //   hammer the endpoint forever).
    var REPLAY_AFTER_ATTEMPTS = 2;
    var REPLAY_SPACING = 3;
    var MAX_REPLAYS = 2;

    // Set by the fetch/XHR hooks to a zero-arg function that re-issues the
    // most recent request whose response was an MCP campaign payload, feeding
    // the fresh response back through handlePayload(). Stays null until we've
    // actually seen (and can reproduce) a campaign request.
    var capturedReplay = null;

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

    // Extract every campaign payload (each carrying `contentZone` + `items`)
    // from whatever shape the MCP response arrives in. MCP does NOT use a
    // single canonical envelope: the heavy bundle/apply endpoint wraps each
    // decision in `{ campaignResponses: [ { payload: {...} } ] }`, but the
    // lightweight `?event=` GET (the one that actually fires on a catalog
    // view and returns the recommendation) surfaces the decision as a FLAT
    // single-campaign object — `{ experienceId, state, userGroup,
    // templateNames, payload: { contentZone, items } }` — with NO
    // `campaignResponses` wrapper. The previous gate keyed exclusively on
    // `body.campaignResponses` being an array, so the flat shape was silently
    // dropped (`return 0`, no console error) even though `payload.items` was
    // fully populated — exactly the "response is populated but no card
    // renders, no error logged" symptom. This walker probes every shape we
    // have observed and returns only payloads whose `contentZone` maps to a
    // known widget, de-duplicated by reference.
    //
    // Shapes handled:
    //   1. { campaignResponses: [ { payload: {...} }, ... ] }   (bundle/apply)
    //   2. { payload: { contentZone, items } }                  (flat single — the live ?event= shape)
    //   3. [ { payload: {...} }, ... ]                          (bare array of responses)
    //   4. { contentZone, items }                               (payload promoted to top level)
    //   5. { campaignResponses: [ { contentZone, items } ] }    (payload inlined in the element)
    function collectPayloads(body) {
        var out = [];
        if (!body || typeof body !== "object") return out;

        var list = body.campaignResponses;
        if (isArrayLike(list)) {
            for (var i = 0; i < list.length; i++) pushPayload(out, list[i]);
        }

        // The body may itself be (4) a payload or (2) a response wrapping one.
        pushPayload(out, body);

        // (3) the body is a bare array of response elements.
        if (isArrayLike(body)) {
            for (var j = 0; j < body.length; j++) pushPayload(out, body[j]);
        }

        return out;
    }

    // Given a "response-ish" node, pull out a usable payload and push it.
    // A node may BE the payload (it has a `contentZone`) or WRAP it (it has a
    // `.payload`). We only keep payloads whose zone maps to a known widget,
    // and we de-dup by object identity so the same payload reached via two
    // probes (e.g. top-level + array scan) is not rendered twice.
    function pushPayload(out, node) {
        if (!node || typeof node !== "object") return;
        var payload = null;
        if (typeof node.contentZone === "string") {
            payload = node;
        } else if (node.payload && typeof node.payload === "object") {
            payload = node.payload;
        }
        if (!payload || typeof payload.contentZone !== "string") return;
        if (!WIDGETS[payload.contentZone]) return;
        for (var k = 0; k < out.length; k++) {
            if (out[k] === payload) return;
        }
        out.push(payload);
    }

    function isMcpResponse(body) {
        return collectPayloads(body).length > 0;
    }

    function looksLikeMcpUrl(url) {
        if (!url || typeof url !== "string") return false;
        // Host almost always matches `evgnet`/`evergage` (beacon CDN is
        // cdn.evgnet.com and the data-collection host is on evgnet.com).
        // `\/api2\/event` is added as belt-and-suspenders for the event
        // endpoint specifically — it's an Evergage-only path token, so it
        // widens coverage without matching unrelated analytics/ad requests.
        // The real safety net is the body-shape check (collectPayloads): a
        // hooked non-MCP response simply yields zero payloads and is ignored.
        return /evergage|evgnet|personalization|interactions|\/api2\/event/i.test(url);
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
        var payloads = collectPayloads(body);
        if (!payloads.length) return 0;
        var totalRendered = 0;
        var zonesSeen = [];
        var totalItems = 0;
        for (var i = 0; i < payloads.length; i++) {
            var payload = payloads[i];
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

        // Trim to MAX_PER_ZONE — defense-in-depth in case the marketer
        // raised maxResults in the Campaign editor above the cap our
        // Serverside Code intends.
        var cards = items.length > MAX_PER_ZONE
            ? items.slice(0, MAX_PER_ZONE)
            : items;

        // Build FIRST, then lock. A throw inside one card build must not
        // abort the whole zone, so each build is isolated in try/catch and a
        // failing item is skipped. We only set the renderedFlag (the lock)
        // AFTER we know we have at least one usable card — never on an empty
        // or all-failed payload — so a later populated/healthy response can
        // still paint the zone (preserves the cold-load "no lock until >=1
        // card drawn" invariant).
        var html = [];
        for (var i = 0; i < cards.length; i++) {
            try {
                var built = cfg.build(cards[i]);
                if (built) html.push(built);
            } catch (e) {
                logError(e);
            }
        }
        if (html.length === 0) return 0;

        window[cfg.renderedFlag] = true;
        target.innerHTML = html.join("");

        attachClickListeners(target, cfg);
        fireImpression(cfg, html.length);
        return html.length;
    }

    // Single readiness helper. Every place that needs to wait for the DOM
    // routes through here so the already-ready states are handled uniformly:
    //   - "loading"                  → wait for DOMContentLoaded
    //   - "interactive" / "complete" → run fn asynchronously on the next tick
    //     (setTimeout, not inline) so we never re-enter during script eval and
    //     so callers behave the same whether the DOM was ready or not.
    // This is the core of the "readyState already complete" fix: when an MCP
    // campaign response is buffered while the DOM is already interactive or
    // complete, the DOMContentLoaded listener would never fire again — so we
    // must run the render path now instead of waiting for an event that has
    // already passed.
    function onDomReady(fn) {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", fn);
        } else {
            setTimeout(fn, 0);
        }
    }

    function deferRender(cfg, items) {
        // If DOM isn't ready yet, wait for it (DOMContentLoaded) then retry.
        if (document.readyState === "loading") {
            onDomReady(function () {
                renderZone(cfg, items);
            });
            return;
        }
        // DOM is already interactive/complete but our selector wasn't found on
        // the first pass. Rather than give up immediately, re-query on the
        // next few ticks: the element may still be landing from a late parse /
        // layout pass. We only call renderZone once the element is actually
        // present, so this never recurses back into deferRender. After
        // DEFER_MAX_ATTEMPTS misses we give up quietly — the page layout
        // genuinely has no widget zone.
        var attempts = 0;
        function retry() {
            if (document.querySelector(cfg.selector)) {
                renderZone(cfg, items);
                return;
            }
            attempts++;
            if (attempts >= DEFER_MAX_ATTEMPTS) return;
            setTimeout(retry, RETRY_INTERVAL_MS);
        }
        setTimeout(retry, 0);
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
        var topics = readRelated(item, "Topics", a.topics);

        // Minimal items are real: recsConfig.includeNullCustomAttributes is
        // false, so MCP strips any null attribute from the payload. The
        // observed Brasilprev item carried ONLY { company } — no name, url
        // or dates. Derive a printable title and a working href from
        // whatever is present, falling back through company and finally the
        // id, so the card always renders instead of producing an empty <h4>.
        var title = name || company || id;
        var href = url || reconstructUrl(id) || "#";

        // Meta is optional — only emit the period line when a start date is
        // actually present (no date -> no empty meta box).
        var meta = startDate
            ? formatMonth(startDate) +
                (endDate ? " \u2014 " + formatMonth(endDate) : " \u2014 ATUAL")
            : "";
        var metaHtml = meta
            ? '<div class="related-card-meta">' + escapeHtml(meta) + "</div>"
            : "";

        // Only print the company line when it adds something the title isn't
        // already showing (avoids "Brasilprev / Brasilprev" when company had
        // to stand in as the title).
        var companyHtml = (company && company !== title)
            ? '<p class="related-card-company">' + escapeHtml(company) + "</p>"
            : "";

        var topicsHtml = buildTopicChips(topics);

        return '<a class="related-card" ' +
            'href="' + escapeAttr(href) + '" ' +
            'data-cy-track="related_career_click" ' +
            'data-cy-target-id="' + escapeAttr(id) + '">' +
            metaHtml +
            '<h4 class="related-card-title">' + escapeHtml(title) + "</h4>" +
            companyHtml +
            topicsHtml +
            "</a>";
    }

    function buildBlogCard(item) {
        var id = (item && (item._id || item.id)) || "";
        var a = (item && item.attributes) || {};
        var url = readAttr(a.url);
        var name = readAttr(a.name);
        // Blog uses the native System Attribute `publishedDate` (per
        // MCP docs: "publishedDate must be exclusively used for
        // articles and blogs"). We fall back to `published` and
        // `publishDate` for any legacy payload still in flight from
        // before the Article/Blog split. The fallbacks become dead
        // code once the feed and beacon are fully migrated.
        var published = readAttr(a.publishedDate)
            || readAttr(a.published)
            || readAttr(a.publishDate);
        var topics = readRelated(item, "Topics", a.topics);

        // Same minimal-item defense as the career card: title falls back to
        // the id, href reconstructs from the id when `url` was stripped.
        var title = name || id;
        var href = url || reconstructUrl(id) || "#";

        var meta = formatDayMonthYear(published);
        var metaHtml = meta
            ? '<div class="related-card-meta">' + escapeHtml(meta) + "</div>"
            : "";
        var topicsHtml = buildTopicChips(topics);

        return '<a class="related-card is-blog" ' +
            'href="' + escapeAttr(href) + '" ' +
            'data-cy-track="related_blog_click" ' +
            'data-cy-target-id="' + escapeAttr(id) + '">' +
            metaHtml +
            '<h4 class="related-card-title">' + escapeHtml(title) + "</h4>" +
            topicsHtml +
            "</a>";
    }

    // Reconstruct a detail-page URL from the catalog id when the item's
    // `url` attribute is absent (includeNullCustomAttributes:false strips
    // null system attributes from minimal payloads). Catalog ids are built
    // as "{YYYYMM}-{slug}" (tools/generate_catalog_feed.py) and BOTH career
    // and blog posts publish under the Jekyll permalink
    // "/:year/:month/:title/" (see _config.yml). So "201901-Brasilprev"
    // becomes "/2019/01/Brasilprev/". Returns "" when the id doesn't match
    // that shape so the caller can fall back to "#".
    function reconstructUrl(id) {
        if (!id || typeof id !== "string") return "";
        var m = /^(\d{4})(\d{2})-(.+)$/.exec(id);
        if (!m) return "";
        return "/" + m[1] + "/" + m[2] + "/" + m[3] + "/";
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

    /**
     * Read a related-catalog-object set from a Recipe payload item.
     *
     * Background: in the current MCP architecture (v4), Topics and
     * Tags are their own Item Types connected to Article / Blog via
     * `relatedCatalogObjects`. (`Technologies` was a third reference
     * Item Type in v3 — collapsed into Tags in v4. See mcp/sitemap.js
     * for the full migration history.) On the Recipe response side,
     * those relations are surfaced as `item.dimensions` (per the
     * official "Advanced Dynamic Message Content Cheatsheet" —
     * `${item.dimensions}` is described as an Array of "All related
     * Catalog Objects"). Different runtime contexts have historically
     * exposed this either as a dict keyed by Item Type name or as a
     * flat array of objects each carrying a `type`/`itemType`, so we
     * probe both shapes defensively.
     *
     * Fallback (`legacyAttr`) handles any in-flight item from the v2
     * architecture where `topics` was still a MultiString attribute
     * inside `attributes`. Safe to remove once the catalog has been
     * fully reingested under v4.
     *
     * Returns: array of human-readable label strings (e.g.
     * ["Desenvolvimento", "Tooling"]). Empty array when no relation
     * is found — caller decides whether to render the chip strip.
     */

    function readRelated(item, typeName, legacyAttr) {
        if (!item) return readAttr(legacyAttr) || [];

        var dims = item.dimensions || item.relatedCatalogObjects;
        if (dims) {
            // Shape A: { Topics: [...], Technologies: [...] }
            if (typeof dims === "object" && !isArrayLike(dims)) {
                var bucket = dims[typeName];
                if (bucket && bucket.length) return mapToLabels(bucket);
            }
            // Shape B: [ { type: "Topics", _id, name }, { type: "Tags", ... } ]
            if (isArrayLike(dims)) {
                var bucketArr = [];
                for (var i = 0; i < dims.length; i++) {
                    var entry = dims[i];
                    if (!entry) continue;
                    var entryType = entry.type || entry.itemType
                        || (entry.catalogObject && entry.catalogObject.type);
                    if (entryType === typeName) bucketArr.push(entry);
                }
                if (bucketArr.length) return mapToLabels(bucketArr);
            }
        }

        return readAttr(legacyAttr) || [];
    }

    function isArrayLike(v) {
        return Object.prototype.toString.call(v) === "[object Array]";
    }

    function mapToLabels(bucket) {
        var out = [];
        for (var i = 0; i < bucket.length; i++) {
            var entry = bucket[i];
            if (entry === null || entry === undefined) continue;
            // Each related-catalog-object entry can arrive as a plain
            // ID string OR as an object with { name, _id, id }. Prefer
            // the human-readable name; fall back to id; finally to the
            // raw string itself.
            if (typeof entry === "string") {
                out.push(entry);
            } else if (typeof entry === "object") {
                var label = entry.name || entry._id || entry.id || "";
                if (label) out.push(label);
            }
        }
        return out;
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

    /* ----- request replay (cold-load active recovery) ----- */

    // Record the function that can reproduce the campaign request. Only the
    // MOST RECENT campaign request is kept — that is the one whose response we
    // want to refresh once the view event has registered. Exposed on
    // window.__mcpReplay for console smoke-testing.
    function rememberReplay(fn) {
        capturedReplay = fn;
        window.__mcpReplay = fn;
    }

    // Build a replay closure for a fetch() campaign request. `arg0`/`arg1`
    // are the original fetch arguments. When arg0 is a Request object its body
    // is single-use, so we keep an unconsumed clone and re-clone it per replay
    // (a Request can be cloned repeatedly as long as the clone is never read).
    // When arg0 is a string URL, arg1.body is a reusable string and we replay
    // the args as-is. We call origFetch directly (not the wrapped fetch) and
    // pump the result through handlePayload ourselves to avoid re-wrapping.
    function makeFetchReplay(origFetch, arg0, arg1, reqClone) {
        return function () {
            var a0 = arg0;
            try {
                if (reqClone && typeof reqClone.clone === "function") {
                    a0 = reqClone.clone();
                }
            } catch (e) { a0 = arg0; }
            var pr;
            try {
                pr = origFetch(a0, arg1);
            } catch (e) { logError(e); return; }
            pr.then(function (res) {
                try {
                    res.clone().json().then(function (body) {
                        try { handlePayload(body); } catch (e) { logError(e); }
                    }).catch(function () { /* not JSON, ignore */ });
                } catch (e) { logError(e); }
            }).catch(function () { /* network error, ignore */ });
        };
    }

    // Build a replay closure for an XHR campaign request. We issue a fresh
    // XMLHttpRequest; because the prototype hook below is already installed,
    // the new request's response is intercepted and routed through
    // handlePayload automatically — so this closure only has to re-open with
    // the captured method/url/headers and re-send the captured body.
    function makeXhrReplay(method, url, headers, body) {
        return function () {
            try {
                var x = new XMLHttpRequest();
                x.open(method || "POST", url, true);
                if (headers) {
                    for (var h in headers) {
                        if (headers.hasOwnProperty(h)) {
                            try { x.setRequestHeader(h, headers[h]); } catch (e) { /* forbidden header, skip */ }
                        }
                    }
                }
                x.send(body);
            } catch (e) { logError(e); }
        };
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

            // Capture enough to replay this request later. If arg0 is a
            // Request, keep an unconsumed clone for re-cloning at replay time.
            var arg0 = args[0];
            var arg1 = args[1];
            var reqClone = null;
            try {
                if (arg0 && typeof arg0 === "object" && typeof arg0.clone === "function") {
                    reqClone = arg0.clone();
                }
            } catch (e) { /* clone unsupported, fall back to raw args */ }

            return p.then(function (res) {
                try {
                    res.clone().json().then(function (body) {
                        try {
                            if (isMcpResponse(body)) {
                                rememberReplay(makeFetchReplay(origFetch, arg0, arg1, reqClone));
                            }
                            handlePayload(body);
                        } catch (e) { logError(e); }
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
        var origSetRequestHeader = XHR.setRequestHeader;

        XHR.open = function (method, url) {
            try {
                this.__mcpUrl = url || "";
                this.__mcpMethod = method || "GET";
                this.__mcpHeaders = {};
            } catch (e) { /* ignore */ }
            return origOpen.apply(this, arguments);
        };

        // Capture request headers so a replay carries the same auth/content
        // headers as the original campaign request.
        XHR.setRequestHeader = function (name, value) {
            try {
                if (looksLikeMcpUrl(this.__mcpUrl)) {
                    if (!this.__mcpHeaders) this.__mcpHeaders = {};
                    this.__mcpHeaders[name] = value;
                }
            } catch (e) { /* ignore */ }
            return origSetRequestHeader.apply(this, arguments);
        };

        XHR.send = function (sendBody) {
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
                            if (body) {
                                if (isMcpResponse(body)) {
                                    rememberReplay(makeXhrReplay(xhr.__mcpMethod, xhr.__mcpUrl, xhr.__mcpHeaders, sendBody));
                                }
                                handlePayload(body);
                            }
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

    /* ----- bounded retry poll (re-renders from the buffered responses) ----- */

    // Scan window.__mcpResponses newest-first and return the most recent
    // POPULATED items array buffered for the given zone, or null. We read the
    // buffer (not re-call handlePayload) so we don't re-push entries on every
    // tick and don't disturb the reactive path.
    function findBufferedItems(zoneName) {
        var buf = window.__mcpResponses;
        if (!buf || !buf.length) return null;
        for (var i = buf.length - 1; i >= 0; i--) {
            var entry = buf[i];
            var body = entry && entry.body;
            var payloads = collectPayloads(body);
            for (var j = 0; j < payloads.length; j++) {
                if (payloads[j].contentZone !== zoneName) continue;
                var items = payloads[j].items || [];
                if (items.length > 0) return items;
            }
        }
        return null;
    }

    function hasRenderedCards(target) {
        return !!(target && target.children && target.children.length > 0);
    }

    // One poll pass. Returns the number of zones still PENDING — present on
    // this page, not yet rendered, and with no populated response buffered
    // yet (i.e. we're still waiting for MCP). When this hits 0 we can stop.
    function renderFromBufferOnce() {
        var pending = 0;
        for (var key in WIDGETS) {
            if (!WIDGETS.hasOwnProperty(key)) continue;
            var cfg = WIDGETS[key];
            var target = document.querySelector(cfg.selector);
            // Zone not on this page → nothing to wait for.
            if (!target) continue;
            // Already drawn (reactive path or a prior tick) → done.
            if (window[cfg.renderedFlag] || hasRenderedCards(target)) continue;
            var items = findBufferedItems(key);
            if (items && items.length) {
                // renderZone re-applies the MAX_PER_ZONE cap, the renderedFlag
                // lock, the impression de-dup and the click listeners.
                renderZone(cfg, items);
            } else {
                pending++;
            }
        }
        return pending;
    }

    function startRetryPoll() {
        // Render whatever is already buffered right away, then poll for the
        // late populated response on a bounded schedule.
        if (renderFromBufferOnce() === 0) return;
        var attempts = 0;
        var replaysFired = 0;
        var lastReplayAttempt = -REPLAY_SPACING - 1;
        var timer = setInterval(function () {
            attempts++;
            var pending = renderFromBufferOnce();
            if (pending === 0) {
                clearInterval(timer);
                return;
            }

            // ACTIVE recovery: a zone is still empty and we never got a
            // populated response. If we captured the campaign request, replay
            // it — by now the ViewCatalogObject event has registered so the
            // recipe can recommend. handlePayload() renders the fresh response
            // directly; the next poll tick confirms pending dropped to 0. We
            // wait REPLAY_AFTER_ATTEMPTS ticks before the first replay (give
            // the view event time to land) and cap at MAX_REPLAYS.
            if (capturedReplay
                && replaysFired < MAX_REPLAYS
                && attempts >= REPLAY_AFTER_ATTEMPTS
                && (attempts - lastReplayAttempt) >= REPLAY_SPACING) {
                replaysFired++;
                lastReplayAttempt = attempts;
                try { capturedReplay(); } catch (e) { logError(e); }
            }

            if (attempts >= RETRY_MAX_ATTEMPTS) {
                clearInterval(timer);
            }
        }, RETRY_INTERVAL_MS);
    }

    // Bootstrap. The reactive fetch/XHR hooks already render the moment a
    // populated response arrives WHILE the DOM is ready. This bootstrap covers
    // the other case the user hit: the DOM was already "interactive"/"complete"
    // when the campaign response was buffered, so DOMContentLoaded never fires
    // again and the in-memory data would otherwise never be drawn.
    //
    // onDomReady runs startRetryPoll immediately (next tick) when readyState is
    // already interactive/complete, or on DOMContentLoaded when still loading.
    // startRetryPoll's first action is renderFromBufferOnce(), which scans
    // window.__mcpResponses newest-first and calls renderZone for any zone that
    // is present in the DOM but still empty — i.e. it draws the cards straight
    // from the in-memory buffer. It then polls (bounded) for any late populated
    // response and fires the captured replay if the buffer stays empty.
    //
    // No double-render: renderZone keeps the existing __mcp_rendered_<zone>
    // lock and the empty-response pass-through (the lock is only ever set
    // AFTER drawing >=1 card), so the reactive path and this buffer replay are
    // idempotent against each other.
    onDomReady(startRetryPoll);

    // Expose for manual smoke-testing from the console:
    //   window.__mcpRender({ campaignResponses: [...] })
    window.__mcpRender = handlePayload;
})();
