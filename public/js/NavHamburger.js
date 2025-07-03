const btn = document.querySelector('.navbar-hamburger');
const mobileMenu = document.getElementById('mobile-menu');

btn.addEventListener('click', () => {
    const isExpanded = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', String(!isExpanded));
    btn.classList.toggle('is-active');

    if (isExpanded) {
    mobileMenu.classList.remove('mobile-menu-open');
    mobileMenu.setAttribute('aria-hidden', 'true');
    } else {
    mobileMenu.classList.add('mobile-menu-open');
    mobileMenu.setAttribute('aria-hidden', 'false');
    mobileMenu.focus();
    }
});

// close on outside click or Escape...
document.addEventListener('click', e => {
    if (
    mobileMenu.classList.contains('mobile-menu-open') &&
    !mobileMenu.contains(e.target) &&
    !btn.contains(e.target)
    ) {
    btn.classList.remove('is-active');
    mobileMenu.classList.remove('mobile-menu-open');
    mobileMenu.setAttribute('aria-hidden', 'true');
    btn.setAttribute('aria-expanded', 'false');
    }
});
document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && mobileMenu.classList.contains('mobile-menu-open')) {
    btn.click();
    }
});

// mobile dropdown toggles
document
    .querySelectorAll('.mobile-dropdown-toggle')
    .forEach(toggle => {
    toggle.addEventListener('click', () => {
        const expanded = toggle.getAttribute('aria-expanded') === 'true';
        toggle.setAttribute('aria-expanded', String(!expanded));
        toggle.nextElementSibling.classList.toggle('mobile-dropdown-open');
    });
});