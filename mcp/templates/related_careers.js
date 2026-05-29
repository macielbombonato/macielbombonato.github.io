/**
 * MCP Web Campaign — Related Careers Widget (Clientside Code)
 * -----------------------------------------------------------
 * Target zone : related_careers
 * Target DOM  : #mcp-related-careers
 * Page types  : career_detail, blog_detail
 *
 * INTENTIONAL NO-OP
 * -----------------
 * All rendering and tracking for this widget now lives in the Jekyll
 * site, NOT in this Template's Clientside Code:
 *
 *     assets/js/mcp-related-renderer.js
 *         └─ loaded synchronously from _includes/head.html and
 *            _includes/head-noads.html, BEFORE the MCP beacon
 *         └─ hooks window.fetch and XMLHttpRequest
 *         └─ intercepts every MCP response that ships
 *            `campaignResponses[].payload.items`
 *         └─ builds the cards itself and injects them into
 *            #mcp-related-careers / #mcp-related-blog
 *         └─ fires impression ("View Related Careers") and click
 *            ("Click Related Career") events
 *
 * Why we moved out of the Template Clientside Code:
 *
 *   - The MCP-managed apply() flow could not be configured to inject
 *     into our custom <div id="mcp-related-careers" class="related-grid">
 *     target on Rule Based Test campaigns (the Content Zone Action
 *     never wired up, the zone stayed empty, no error in the console).
 *   - A registerTemplate(source) override attempted here did not fire
 *     reliably either — the MCP runtime evaluates this bundle in a
 *     sandbox we cannot inspect, and there is no guarantee it ever
 *     invokes registerTemplate when the Content Zone Action is broken.
 *   - The site-side renderer is independent of all of that. As long
 *     as the MCP server returns a campaignResponses payload — which
 *     it does on every page-load of a detail page — the renderer
 *     catches it and draws the cards. The MCP Template (Handlebars +
 *     Serverside Code) still needs to exist because that is what binds
 *     the Recipe and triggers the response, but its Clientside Code
 *     and its Handlebars are no longer in the render path.
 *
 * Leaving rendering code here would risk a double-render:
 *
 *   - If MCP's apply() ever starts working, the .hbs would render into
 *     the same div, on top of whatever the site renderer drew.
 *   - If a registerTemplate hook ever fired, it would also race the
 *     site renderer for the same target.
 *
 * So this tab MUST stay empty (or contain only this docblock). The
 * Handlebars tab (.hbs) is also irrelevant to runtime now, but is
 * kept in the repo as a design-only mirror of the card DOM so the
 * markup contract is reviewable in version control.
 */
