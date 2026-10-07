/* =========================================
   ECB Recipe Blog — Application Logic
   ========================================= */

document.addEventListener('DOMContentLoaded', () => {
  initMobileMenu();
  initScrollAnimations();
  initStickyNav();
  initFooterYear();
});

/* --- Mobile Menu Toggle --- */
function initMobileMenu() {
  const toggle = document.querySelector('.mobile-menu-toggle');
  const navLinks = document.querySelector('.nav-links');

  if (toggle && navLinks) {
    toggle.addEventListener('click', () => {
      navLinks.classList.toggle('open');
      const icon = toggle.querySelector('i');
      if (icon) {
        icon.className = navLinks.classList.contains('open')
          ? 'fas fa-times'
          : 'fas fa-bars';
      }
    });

    // Close menu when clicking a link
    navLinks.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('open');
        const icon = toggle.querySelector('i');
        if (icon) icon.className = 'fas fa-bars';
      });
    });
  }
}

/* --- Scroll Animations --- */
function initScrollAnimations() {
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

  document.querySelectorAll('.animate-on-scroll').forEach(el => {
    observer.observe(el);
  });
}

/* --- Sticky Nav Shadow --- */
function initStickyNav() {
  const nav = document.querySelector('.main-nav');
  if (!nav) return;

  let ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        if (window.scrollY > 10) {
          nav.style.boxShadow = '0 4px 16px rgba(27, 42, 74, 0.25)';
        } else {
          nav.style.boxShadow = '0 2px 8px rgba(27, 42, 74, 0.2)';
        }
        ticking = false;
      });
      ticking = true;
    }
  });
}

/* --- Footer Year --- */
function initFooterYear() {
  const year = String(new Date().getFullYear());
  document.querySelectorAll('.footer-year').forEach(el => {
    el.textContent = year;
  });
}
