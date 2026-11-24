/* Run after editing product copy or cart prices: node scripts/build-seo.cjs */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const products = require('../seo/catalog.cjs');
const pricing = require('../cart-pricing.js');
const origin = 'https://mv-teplo.ru';
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const json = value => JSON.stringify(value).replace(/</g, '\\u003c');
const url = p => `${origin}/podarki/${p.slug}/`;
const links = current => products.filter(p => p !== current).map(p => `<a href="/podarki/${p.slug}/">${esc(p.short)}</a>`).join('\n');
const logo = '<svg viewBox="112 372 1030 740" role="img" aria-label="Teplo — мастерская воспоминаний"><image href="/assets/teplo-photo-garland.png" width="1254" height="1254"/></svg>';
for (const p of products) {
  const variants = p.product === 'garland' ? ['5','10'] : [p.format || ''];
  const offers = variants.map(format => ({'@type':'Offer',url:url(p),name:p.product === 'garland' ? `${format} иллюстраций` : p.name,priceCurrency:'RUB',price:pricing.unitPrice({...p,format})/100,seller:{'@id':`${origin}/#organization`}}));
  const schema = {'@context':'https://schema.org','@graph':[
    {'@type':'Organization','@id':`${origin}/#organization`,name:'Teplo',url:`${origin}/`},
    {'@type':'Product','@id':`${url(p)}#product`,name:p.name,description:p.description,image:[`${origin}/assets/${p.image}`],brand:{'@type':'Brand',name:'Teplo'},offers},
    {'@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:'Teplo',item:`${origin}/`},{'@type':'ListItem',position:2,name:p.short,item:url(p)}]}
  ]};
  const priceHtml = offers.map((o,i) => `<p class="price">${esc(pricing.money(o.price*100))}<small>${p.product === 'garland' ? `${variants[i]} иллюстраций` : p.product === 'magnet' ? 'за магнит 6 × 9 см' : p.product === 'digital' ? 'за отдельную HD-версию' : 'за штуку'}</small></p>`).join('');
  const params = new URLSearchParams({product:p.product});
  if (p.material) params.set('material',p.material);
  if (p.format) params.set('format',p.format);
  const order = `/?${params}#constructor`;
  const delivery = p.product === 'digital'
    ? '<p>Это электронный файл: доставка и пункт выдачи не нужны. Скачать HD-версию можно после оплаты заказа.</p>'
    : '<p>Бесплатная доставка по России до ПВЗ Яндекс Маркета, кроме дальневосточных регионов. Доступность и ориентировочный срок проверьте после выбора пункта выдачи в корзине.</p><p>Для физического заказа нужно от 3 любых изделий или одна арт-гирлянда. Обычная упаковка бесплатна; подарочную можно выбрать в корзине.</p>';
  const html = `<!doctype html>
<html lang="ru"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p.title)}</title><meta name="description" content="${esc(p.description)}">
<link rel="canonical" href="${url(p)}"><meta name="robots" content="index,follow,max-image-preview:large">
<meta name="theme-color" content="#fff8ec">
<meta property="og:type" content="website"><meta property="og:site_name" content="Teplo"><meta property="og:locale" content="ru_RU">
<meta property="og:title" content="${esc(p.title)}"><meta property="og:description" content="${esc(p.description)}"><meta property="og:url" content="${url(p)}">
<meta property="og:image" content="${origin}/assets/${p.image}"><meta property="og:image:alt" content="${esc(p.alt)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.png?v=teplo2" sizes="120x120" type="image/png"><link rel="icon" href="/favicon.ico?v=teplo2" sizes="16x16 32x32 48x48" type="image/x-icon">
<link rel="stylesheet" href="/catalog.css?v=seo1"><script type="application/ld+json">${json(schema)}</script>
</head><body>
<a class="skip" href="#product">Перейти к подарку</a>
<header class="site-header"><div class="wrap header-inner"><a class="brand" href="/" aria-label="Teplo — на главную">${logo}</a><nav class="site-nav" aria-label="Основная навигация"><a href="/#collection">Все подарки</a><a href="/#feedback">Отзывы</a><a href="/#questions">Вопросы</a></nav></div></header>
<main id="product" class="wrap">
<nav class="breadcrumbs" aria-label="Хлебные крошки"><a href="/">Главная</a><span aria-hidden="true">/</span><a href="/#collection">Подарки</a><span aria-hidden="true">/</span><span aria-current="page">${esc(p.short)}</span></nav>
<section class="product-hero" aria-labelledby="product-title">
<figure class="product-photo ${p.product === 'digital' ? 'is-digital' : p.product === 'garland' ? 'is-garland' : ''}"><img src="/assets/${p.image}" width="${p.width}" height="${p.height}" alt="${esc(p.alt)}" fetchpriority="high"><figcaption>Пример оформления. В вашем подарке будет ваша история.</figcaption></figure>
<div class="product-info"><p class="eyebrow">Teplo · мастерская воспоминаний</p><h1 id="product-title">${esc(p.name)}</h1><p class="lead">${esc(p.lead)}</p><ul class="specs">${p.specs.map(s=>`<li>${esc(s)}</li>`).join('')}</ul><div class="prices">${priceHtml}</div><a class="button" href="${esc(order)}">${p.product === 'garland' ? 'Собрать свою гирлянду' : 'Создать свой подарок'}</a><p class="purchase-note">${p.product === 'digital' ? 'Можно заказать отдельно, без физических изделий.' : 'HD-копия иллюстрации — в подарок. '}<a href="#delivery">${p.product === 'digital' ? 'Как получить файл' : 'Условия заказа и доставки'}</a></p></div>
</section>
<section class="story" aria-labelledby="story-title"><h2 id="story-title">${esc(p.heading)}</h2><div class="prose">${p.paragraphs.map(t=>`<p>${esc(t)}</p>`).join('')}</div></section>
</main>
<section class="how" aria-labelledby="how-title"><div class="wrap"><h2 id="how-title">От фотографии — к вашей истории</h2><div class="steps"><article><h3>Выберите фотографию</h3><p>Загрузите чёткий снимок в формате JPG, PNG или WebP до 15 МБ.</p></article><article><h3>Добавьте личные слова</h3><p>Создайте иллюстрацию, укажите название и год. Проверьте результат в конструкторе.</p></article><article><h3>Сохраните свой момент</h3><p>Выберите изделие и его настройки, добавьте в корзину и проверьте заказ перед оплатой.</p></article></div></div></section>
<div class="wrap"><section class="details"><div class="detail-grid"><div id="delivery"><h2>${p.product === 'digital' ? 'Получение HD-файла' : 'Заказ и доставка'}</h2>${delivery}</div><div><h2>Перед заказом</h2>${p.faq.map(([q,a])=>`<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</div></div></section><section class="final-cta"><h2>У вас есть фотография с историей?</h2><a class="button" href="${esc(order)}">Открыть конструктор</a></section></div>
<footer class="site-footer"><div class="wrap"><h2>Другие подарки из ваших фото</h2><nav class="catalog-links" aria-label="Другие подарки">${links(p)}</nav><div class="footer-line"><p>© Teplo, 2026 · Мастерская воспоминаний</p><p><a href="/#feedback">Отзывы и предложения</a> · <a href="/#questions">Вопросы</a></p></div></div></footer>
</body></html>\n`;
  const dir = path.join(root,'podarki',p.slug);
  fs.mkdirSync(dir,{recursive:true}); fs.writeFileSync(path.join(dir,'index.html'),html);
}
// No guessed lastmod timestamps: only canonical public landing pages belong here.
const locations = [`${origin}/`, ...products.map(url)];
fs.writeFileSync(path.join(root,'sitemap.xml'),`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${locations.map(loc=>`  <url><loc>${loc}</loc></url>`).join('\n')}\n</urlset>\n`);
fs.writeFileSync(path.join(root,'robots.txt'),`User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`);
console.log(`Generated ${products.length} product pages and sitemap (${locations.length} URLs).`);
