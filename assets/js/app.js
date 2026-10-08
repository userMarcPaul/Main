/* =========================================
   ECB Eats — Shared site chrome
   Imported by every page module: nav, animations, footer year, header search.
   ========================================= */

import { listRecipes } from "./api.js";
import { escapeHtml, recipeUrl } from "./render.js";

export function initChrome() {
  initMobileMenu();
  initScrollAnimations();
  initStickyNav();
  initFooterYear();
  initHeaderSearch();
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
