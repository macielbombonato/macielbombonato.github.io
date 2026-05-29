/**
 * MCP Web Campaign — Related Blog Widget (Clientside Code)
 * --------------------------------------------------------
 * Target zone : related_blog
 * Target DOM  : #mcp-related-blog
 * Page types  : career_detail, blog_detail
 *
 * INTENTIONAL NO-OP — see mcp/templates/related_careers.js for the full
 * rationale. The blog widget mirrors the same architecture:
 *
 *     assets/js/mcp-related-renderer.js
 *         └─ also handles `related_blog` contentZone
 *         └─ renders cards with the `.is-blog` modifier
 *         └─ fires "View Related Blog" / "Click Related Blog" events
 *
 * This tab MUST stay empty (or contain only this docblock) to avoid
 * double-rendering with the site renderer. The .hbs and the
 * Serverside Code (.ts, which binds the Recipe) are kept; only the
 * Clientside Code is gutted.
 */
