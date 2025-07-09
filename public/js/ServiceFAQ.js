// src/scripts/ServiceFAQ.js
document.addEventListener('DOMContentLoaded', () => {
  const faqItems = document.querySelectorAll('.faq-item');

  faqItems.forEach((faqItem) => {
    const question = faqItem.querySelector('.question-wrapper');
    const answer   = faqItem.querySelector('.answer-wrapper');
    const icon     = faqItem.querySelector('.faq-icon');

    if (!question || !answer || !icon) return;

    // Initialize
    question.setAttribute('role', 'button');
    question.setAttribute('tabindex', '0');
    question.setAttribute('aria-expanded', 'false');
    answer.style.height = '0px';

    const toggle = () => {
      const isOpen = question.getAttribute('aria-expanded') === 'true';

      // Close all others
      faqItems.forEach((other) => {
        if (other === faqItem) return;
        const oQ = other.querySelector('.question-wrapper');
        const oA = other.querySelector('.answer-wrapper');
        const oI = other.querySelector('.faq-icon');
        if (oQ && oA && oI) {
          oQ.setAttribute('aria-expanded', 'false');
          oA.style.height = '0px';
          oI.style.transform = 'rotate(0deg)';
        }
      });

      // Toggle this one
      if (isOpen) {
        question.setAttribute('aria-expanded', 'false');
        answer.style.height = '0px';
        icon.style.transform = 'rotate(0deg)';
      } else {
        question.setAttribute('aria-expanded', 'true');
        answer.style.height = `${answer.scrollHeight}px`;
        icon.style.transform = 'rotate(45deg)';
      }
    };

    question.addEventListener('click', toggle);
    question.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });
  });
});
