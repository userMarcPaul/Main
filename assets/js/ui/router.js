/* Client-side router (SPA-style navigation).
 *
 * Intercepts clicks on internal page links and swaps the document in place
 * instead of doing a full browser reload, so the CSS, fonts and shared JS
 * modules stay in memory and are never re-downloaded or re-parsed. The target
 * page's own entry module is re-run on the fresh DOM so the page initialises
 * exactly as it would on a normal load.
 *
 * Safety: anything it can't handle cleanly — a cross-origin link, a download, a
 * modified click, a fetch/parse/script error — falls back to a normal full
 * navigation, so the worst case is identical to the pre-router behaviour.
 *
 * Booted once from chrome.js (imported by every page), so no HTML changes are
 * needed. Its listeners live on `document`/`window`, so they survive body swaps.
 */

if (!window.__ecbRouterBooted) {
  window.__ecbRouterBooted = true;

  // Bumped on each navigation so a revisited page's module re-executes: ES
  // modules are cached by URL, so re-importing the same src would be a no-op.
  let navToken = 0;

  /** The resolved URL if this click should be handled in-page, else null. */
  function routableTarget(anchor, event) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
    if (!anchor || !anchor.getAttribute("href")) return null;
    if (anchor.target && anchor.target !== "_self") return null;
    if (anchor.hasAttribute("download")) return null;
    if ((anchor.getAttribute("rel") || "").includes("external")) return null;

    const url = new URL(anchor.href, location.href);
    if (url.origin !== location.origin) return null;
    // In-page anchor (same page, just a #hash) — let the browser scroll to it.
    if (url.hash && url.pathname === location.pathname && url.search === location.search) return null;
    // Only real page documents — not assets (.webp/.pdf/…) or mailto:/tel: etc.
    if (!(url.pathname === "/" || url.pathname.endsWith(".html"))) return null;
    return url;
  }

  document.addEventListener("click", (event) => {
    if (event.defaultPrevented) return;
    const anchor = event.target.closest?.("a[href]");
    const url = routableTarget(anchor, event);
    if (!url) return;

    event.preventDefault();
    if (url.href !== location.href) navigate(url.href, true);
  });

  window.addEventListener("popstate", () => navigate(location.href, false));

  async function navigate(url, push) {
    try {
      const response = await fetch(url, { headers: { "X-Requested-With": "router" } });
      if (!response.ok) throw new Error(`status ${response.status}`);

      const doc = new DOMParser().parseFromString(await response.text(), "text/html");
      const script = doc.querySelector('body script[type="module"][src]');
      // A page with no entry module can't be re-initialised in place — let the
      // browser load it normally.
      if (!script) return location.assign(url);

      // Carry over the title and meta description; keep <head> (same stylesheet,
      // fonts) so nothing in it is re-fetched.
      document.title = doc.title;
      const description = doc.querySelector('meta[name="description"]')?.getAttribute("content");
      if (description != null) {
        document.querySelector('meta[name="description"]')?.setAttribute("content", description);
      }

      // Swap the body. Inline/module scripts in the parsed body do NOT execute on
      // insertion, which is why the entry module is imported explicitly below.
      document.body.replaceWith(document.importNode(doc.body, true));

      if (push) history.pushState({}, "", url);
      window.scrollTo(0, 0);

      const src = new URL(script.getAttribute("src"), url).href;
      await import(`${src}?v=${++navToken}`);
    } catch {
      location.assign(url); // Fall back to a normal, full navigation.
    }
  }
}
