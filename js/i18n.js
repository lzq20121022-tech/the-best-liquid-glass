/* =====================================================================
 *  i18n：中文 / English
 *  优先级：?lang=xx  >  localStorage  >  浏览器语言
 * ===================================================================== */
(function () {
  const LG = (window.LG = window.LG || {});
  let lang = 'en';
  try {
    const q = new URLSearchParams(location.search).get('lang');
    const saved = localStorage.getItem('lg-lang');
    lang = q || saved || ((navigator.language || 'en').toLowerCase().startsWith('zh') ? 'zh' : 'en');
  } catch (e) {
    lang = (navigator.language || 'en').toLowerCase().startsWith('zh') ? 'zh' : 'en';
  }
  if (lang !== 'zh') lang = 'en';
  LG.lang = lang;
  LG.t = (zh, en) => (lang === 'zh' ? zh : en);
  LG.setLang = (l) => {
    try { localStorage.setItem('lg-lang', l); } catch (e) { /* noop */ }
    const u = new URL(location.href);
    u.searchParams.set('lang', l);
    location.href = u.toString();
  };
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  // 静态 DOM 文案
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-zh]').forEach((el) => {
      const v = lang === 'zh' ? el.getAttribute('data-zh') : el.getAttribute('data-en');
      if (v !== null) el.innerHTML = v;
    });
    document.title = LG.t('液态玻璃实验室 · The Best Liquid Glass', 'The Best Liquid Glass · Lab');
  });
})();
