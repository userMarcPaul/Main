/* One source of truth for the security headers, applied by the dev server and
   mirrored in vercel.json for production. The app serves no inline scripts and
   no inline event handlers, so script-src can stay strict ('self'). Styles need
   'unsafe-inline' for the pages' inline <style> blocks and style attributes,
   plus Google Fonts and the Font Awesome CDN. */
export const securityHeaders = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "img-src 'self' data: blob:",
    "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
    "script-src 'self'",
    "connect-src 'self'",
    "form-action 'self'",
  ].join("; "),
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  "X-Frame-Options": "DENY",
};

export function applySecurityHeaders(res) {
  for (const [key, value] of Object.entries(securityHeaders)) res.setHeader(key, value);
}
