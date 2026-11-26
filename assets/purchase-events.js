/* CSFART: count only deliberate TalkTalk activations, no customer fields. */
(function () {
  'use strict';
  if (location.hostname !== 'gomire-csfart.github.io' ||
      !/^\/csfart-catalog\/product\/[^/]+\.html$/.test(location.pathname)) return;
  document.addEventListener('click', function (event) {
    var a = event.target instanceof Element && event.target.closest('a[data-csfart-action="talktalk"]');
    if (!a || a.href !== 'https://talk.naver.com/W4Q5FL' || !a.closest('.csfart-purchase-row')) return;
    if (typeof window.gtag !== 'function') return;
    window.gtag('event', 'talktalk_click', {
      product_slug: location.pathname.split('/').pop().replace(/\.html$/, ''),
      purchase_area: Array.from(document.querySelectorAll('.csfart-purchase-row')).indexOf(a.closest('.csfart-purchase-row')) + 1
    });
  }, true);
}());
