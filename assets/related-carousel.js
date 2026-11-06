(function (root) {
  'use strict';
  var MIN_PEERS = 3;
  var AUTO_INTERVAL_MS = 5000;
  var AUTO_MIN_ITEMS = 4;

  function valueText(value) { return String(value == null ? '' : value).toLowerCase().replace(/[\s_-]/g, ''); }
  function isPublicProduct(product) {
    if (!product || typeof product !== 'object') return false;
    return !Object.keys(product).some(function (key) {
      var k = valueText(key), v = valueText(product[key]);
      if (!/(availability|status|visibility|public|publish|flag)/.test(k)) return false;
      if (/(soldout|hold|private|hidden|nonpublic|unpublished|draft|inactive)/.test(v)) return true;
      return /(public|publish|visibility|flag)/.test(k) && /^(false|no|0)$/.test(v);
    });
  }
  function isSafePath(path, kind) {
    if (typeof path !== 'string' || !path || /[?#]/.test(path) || path.indexOf('..') !== -1 || /^[\\/]|:/.test(path)) return false;
    var expression = kind === 'product'
      ? /^product\/[\p{L}\p{N}._-]+\.html$/u
      : /^images\/[\p{L}\p{N}._/-]+\.(?:avif|gif|jpe?g|png|webp)$/iu;
    return expression.test(path);
  }
  function taxon(product) {
    var name = String(product && product.name || '').trim();
    var model = String(product && product.model || '').trim();
    var at = model ? name.indexOf(model) : -1;
    if (at > 0) return name.slice(0, at).replace(/\([^)]*\)|\[[^\]]*\]/g, '').replace(/[·•,;:()\[\]]+\s*$/g, '').trim();
    var match = name.match(/^(.+?)\s+\d{4,}(?:\s|$)/);
    return (match ? match[1] : name.split(/[·•]/)[0]).trim();
  }
  function validProduct(product) { return isPublicProduct(product) && isSafePath(product.url, 'product') && isSafePath(product.image, 'image') && !!taxon(product); }
  function newestByTaxon(products) {
    var grouped = new Map();
    products.forEach(function (product) { if (validProduct(product)) grouped.set(taxon(product), product); });
    return Array.from(grouped.values());
  }
  function recommendations(products, current) {
    var currentTaxon = taxon(current);
    var all = newestByTaxon(products).filter(function (product) { return taxon(product) !== currentTaxon; });
    var peers = all.filter(function (product) { return product.category === current.category; });
    if (peers.length >= MIN_PEERS) return { heading: '같은 ' + current.category + ' 다른 품종', products: peers, fallback: false };
    return { heading: '다른 풍란 둘러보기', products: all, fallback: true };
  }
  function visibleCount(width) { return width <= 430 ? 2 : 3; }
  function pageItems(products, offset, count) { return products.length ? Array.from({ length: Math.min(count, products.length) }, function (_, index) { return products[(offset + index) % products.length]; }) : []; }
  function pageAdvance(products, offset, count, direction) { return products.length ? (offset + (direction * count) + products.length) % products.length : 0; }
  function currentProduct(products, pathname) {
    var basename = decodeURIComponent(String(pathname || '').split('/').pop() || '');
    return products.find(function (product) { return isSafePath(product.url, 'product') && product.url.split('/').pop() === basename; });
  }
  function createCard(document, product) {
    var link = document.createElement('a'), image = document.createElement('img'), body = document.createElement('div'), name = document.createElement('h3');
    link.className = 'related-card'; link.href = '../' + product.url;
    image.className = 'related-card__image'; image.src = '../' + product.image; image.loading = 'lazy'; image.alt = product.name;
    body.className = 'related-card__body'; name.className = 'related-card__name'; name.textContent = product.name;
    body.appendChild(name);
    if (product.price) { var price = document.createElement('span'); price.className = 'related-card__price'; price.textContent = product.price; body.appendChild(price); }
    link.append(image, body); return link;
  }
  function mount(document, selection) {
    var main = document.querySelector('main'); if (!main || !selection.products.length) return;
    var section = document.createElement('section'), top = document.createElement('div'), heading = document.createElement('h2'), controls = document.createElement('div'), viewport = document.createElement('div'), cards = document.createElement('div');
    section.className = 'related-carousel'; section.setAttribute('aria-label', '관련 상품'); top.className = 'related-carousel__top'; heading.className = 'related-carousel__title'; heading.textContent = selection.heading;
    controls.className = 'related-carousel__controls'; viewport.className = 'related-carousel__viewport'; cards.className = 'related-carousel__cards'; viewport.appendChild(cards);
    var offset = 0, timer = null, paused = false, touchStart = null;
    function count() { return visibleCount(root.innerWidth || 1024); }
    function render() { cards.replaceChildren.apply(cards, pageItems(selection.products, offset, count()).map(function (product) { return createCard(document, product); })); }
    function move(direction) { offset = pageAdvance(selection.products, offset, count(), direction); render(); }
    function button(label, direction) { var item = document.createElement('button'); item.className = 'related-carousel__button'; item.type = 'button'; item.setAttribute('aria-label', label); item.textContent = direction < 0 ? '←' : '→'; item.addEventListener('click', function () { move(direction); }); return item; }
    controls.append(button('이전 관련 상품', -1), button('다음 관련 상품', 1)); top.append(heading, controls); section.append(top, viewport);
    var footer = document.querySelector('footer'); main.insertBefore(section, footer && footer.parentNode === main ? footer : null);
    function stop() { if (timer) root.clearInterval(timer); timer = null; }
    function start() { stop(); if (!paused && !document.hidden && !root.matchMedia('(prefers-reduced-motion: reduce)').matches && selection.products.length >= AUTO_MIN_ITEMS) timer = root.setInterval(function () { move(1); }, AUTO_INTERVAL_MS); }
    section.addEventListener('mouseenter', function () { paused = true; stop(); }); section.addEventListener('mouseleave', function () { paused = false; start(); });
    section.addEventListener('focusin', function () { paused = true; stop(); }); section.addEventListener('focusout', function () { paused = false; start(); });
    section.addEventListener('touchstart', function (event) { paused = true; stop(); touchStart = event.touches[0].clientX; }, { passive: true });
    section.addEventListener('touchend', function (event) { var end = event.changedTouches[0].clientX; if (touchStart != null && Math.abs(end - touchStart) > 30) move(end < touchStart ? 1 : -1); touchStart = null; paused = false; start(); }, { passive: true });
    document.addEventListener('visibilitychange', start); root.addEventListener('resize', render); render(); start();
  }
  var api = { MIN_PEERS: MIN_PEERS, AUTO_INTERVAL_MS: AUTO_INTERVAL_MS, AUTO_MIN_ITEMS: AUTO_MIN_ITEMS, isPublicProduct: isPublicProduct, isSafePath: isSafePath, taxon: taxon, newestByTaxon: newestByTaxon, recommendations: recommendations, visibleCount: visibleCount, pageItems: pageItems, pageAdvance: pageAdvance, currentProduct: currentProduct };
  root.RelatedCarousel = api;
  if (!root.document || !root.fetch) return;
  root.fetch('../products.json').then(function (response) { if (!response.ok) throw new Error('products.json request failed'); return response.json(); }).then(function (data) { var products = Array.isArray(data.products) ? data.products : []; var current = currentProduct(products, root.location.pathname); if (!current) throw new Error('current product missing from products.json'); var selection = recommendations(products, current); if (selection.products.length) mount(root.document, selection); }).catch(function (error) { root.console.warn('Related carousel unavailable:', error.message); });
}(typeof window !== 'undefined' ? window : globalThis));
