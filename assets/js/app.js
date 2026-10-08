/* =========================================
   ECB Eats — Shared site chrome
   Imported by every page module: nav, animations, footer year, header search.
   ========================================= */

import { listRecipes, me, logout } from "./api.js";
import { escapeHtml, recipeUrl } from "./render.js";

export function initChrome() {
  initMobileMenu();
  initScrollAnimations();
  initStickyNav();
  initFooterYear();
  initHeaderSearch();
  initAuthArea();
}

/**
 * A `next` target is only safe if it is a path on this site: it must start with
 * a single slash. "//evil.com" and "https://evil.com" are rejected, so the
 * ?next= parameter cannot be used as an open redirect.
 */
export function safeNext(value, fallback = "index.html") {
  if (typeof value === "string" && value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }
  return fallback;
}

/* --- Header auth area ---
   Asks /api/auth/me who is logged in, then shows either a "Log in" link that
   remembers the current page, or the display name with a small menu. */
async function initAuthArea() {
  const area = document.getElementById("auth-area");
  if (!area) return;

  const user = await me().catch(() => null);

  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    area.innerHTML = `<a class="auth-login-link" href="login.html?next=${next}">Log in</a>`;
    area.hidden = false;
    return;
  }

  const initial = escapeHtml(user.displayName.charAt(0).toUpperCase());
  // Only links to pages that exist today. Submit a Recipe and Admin join this
  // menu in Phase 6, when those pages are real.
  area.innerHTML = `
    <div class="auth-menu">
      <button type="button" class="auth-trigger" aria-haspopup="true" aria-expanded="false">
        <span class="auth-avatar">${initial}</span>
        <span class="auth-name">${escapeHtml(user.displayName)}</span>
        <i class="fas fa-chevron-down" aria-hidden="true"></i>
      </button>
      <div class="auth-dropdown" hidden>
        <a href="saved.html"><i class="fas fa-heart" aria-hidden="true"></i> Saved Recipes</a>
        <button type="button" class="auth-logout">Log out</button>
      </div>
    </div>`;
  area.hidden = false;

  const trigger = area.querySelector(".auth-trigger");
  const dropdown = area.querySelector(".auth-dropdown");

  const close = () => { dropdown.hidden = true; trigger.setAttribute("aria-expanded", "false"); };
  const open = () => { dropdown.hidden = false; trigger.setAttribute("aria-expanded", "true"); };

  trigger.addEventListener("click", () => (dropdown.hidden ? open() : close()));
  document.addEventListener("click", (event) => { if (!area.contains(event.target)) close(); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") close(); });

  area.querySelector(".auth-logout").addEventListener("click", async () => {
    try {
      await logout();
    } finally {
      // Reload so every page element re-reads the now-signed-out state.
      location.reload();
    }
  });
}

/* --- Mobile Menu Toggle --- */
function initMobileMenu() {
  const toggle = document.querySelector('.mobile-menu-toggle');
  const navLinks = document.querySelector('.nav-links');
  if (!toggle || !navLinks) return;

  const setOpen = (open) => {
    navLinks.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
    const icon = toggle.querySelector('i');
    if (icon) icon.className = open ? 'fas fa-times' : 'fas fa-bars';
  };

  toggle.setAttribute('aria-expanded', 'false');
  toggle.addEventListener('click', () => setOpen(!navLinks.classList.contains('open')));

  navLinks.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => setOpen(false));
  });
}

/* --- Scroll Animations --- */
export function initScrollAnimations(root = document) {
  const targets = root.querySelectorAll('.animate-on-scroll:not(.visible)');
  if (!targets.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
  );

  targets.forEach(el => observer.observe(el));
}

/* --- Sticky Nav Shadow --- */
function initStickyNav() {
  const nav = document.querySelector('.main-nav');
  if (!nav) return;

  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    window.requestAnimationFrame(() => {
      nav.style.boxShadow = window.scrollY > 10
        ? '0 4px 16px rgba(27, 42, 74, 0.25)'
        : '0 2px 8px rgba(27, 42, 74, 0.2)';
      ticking = false;
    });
    ticking = true;
  });
}

/* --- Footer Year --- */
function initFooterYear() {
  const year = String(new Date().getFullYear());
  document.querySelectorAll('.footer-year').forEach(el => { el.textContent = year; });
}

/* --- Header Search ---
   Enter (or the button) goes to the results page; typing shows the top 5
   matches in a dropdown after a 300 ms pause. */
function initHeaderSearch() {
  const bar = document.querySelector('.search-bar');
  const input = document.getElementById('search-input');
  if (!bar || !input) return;

  const submit = () => {
    const q = input.value.trim();
    if (q) location.href = `results.html?q=${encodeURIComponent(q)}`;
  };

  bar.querySelector('button')?.addEventListener('click', submit);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); submit(); }
    if (event.key === 'Escape') closeDropdown();
  });

  // Prefill from the URL so the box matches what is on screen.
  const current = new URLSearchParams(location.search).get('q');
  if (current) input.value = current;

  const dropdown = document.createElement('div');
  dropdown.className = 'search-suggestions';
  dropdown.hidden = true;
  bar.appendChild(dropdown);

  function closeDropdown() {
    dropdown.hidden = true;
    dropdown.innerHTML = '';
  }

  let timer;
  let sequence = 0;

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();

    if (q.length < 2) return closeDropdown();

    timer = setTimeout(async () => {
      const mine = ++sequence;
      try {
        const { recipes } = await listRecipes({ q, limit: 5 });
        // A slower earlier request must not overwrite a newer result.
        if (mine !== sequence) return;

        if (!recipes.length) {
          dropdown.innerHTML = '<p class="search-suggestion-empty">No recipes match</p>';
        } else {
          dropdown.innerHTML = recipes.map(r => `
            <a href="${escapeHtml(recipeUrl(r.slug))}" class="search-suggestion">
              <img src="${escapeHtml(r.imageUrl)}" alt="" loading="lazy">
              <span>
                <strong>${escapeHtml(r.title)}</strong>
                <small>${escapeHtml(r.category)}</small>
              </span>
            </a>`).join('');
        }
        dropdown.hidden = false;
      } catch {
        closeDropdown();  // Suggestions are a convenience; stay quiet on failure.
      }
    }, 300);
  });

  document.addEventListener('click', (event) => {
    if (!bar.contains(event.target)) closeDropdown();
  });
}
