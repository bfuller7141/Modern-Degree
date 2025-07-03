const faqItems = document.querySelectorAll('.faq-item');
faqItems.forEach((faqItem) => {
const button = faqItem.querySelector('.question-button');
const answer = faqItem.querySelector('.answer-wrapper');
const icon   = faqItem.querySelector('.faq-icon');
if (!button || !answer || !icon) return;

// start closed
answer.style.height = '0px';

button.addEventListener('click', () => {
    const isExpanded = button.getAttribute('aria-expanded') === 'true';

    // close all others
    faqItems.forEach((other) => {
    const otherBtn  = other.querySelector('.question-button');
    const otherAns  = other.querySelector('.answer-wrapper');
    const otherIcon = other.querySelector('.faq-icon');
    if (otherBtn && otherAns && otherIcon && other !== faqItem) {
        otherBtn.setAttribute('aria-expanded', 'false');
        otherAns.style.height = '0px';
        otherIcon.style.transform = 'rotate(0deg)';
    }
    });

    if (isExpanded) {
    // collapse this one
    button.setAttribute('aria-expanded', 'false');
    answer.style.height = '0px';
    icon.style.transform = 'rotate(0deg)';
    } else {
    // expand this one
    button.setAttribute('aria-expanded', 'true');
    answer.style.height = `${answer.scrollHeight}px`;
    icon.style.transform = 'rotate(45deg)';
    }
});
});