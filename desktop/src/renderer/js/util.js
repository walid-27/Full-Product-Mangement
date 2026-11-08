/* Shared formatting + DOM helpers */
(function () {
  'use strict';

  const App = (window.App = window.App || {});

  const numberFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  const numberFmt2 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

  function esc(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** Escape a value for use inside a double-quoted HTML attribute. */
  function attr(value) {
    return esc(value).replace(/`/g, '&#96;');
  }

  function num(value) {
    const n = Number(value);
    return Number.isFinite(n) ? numberFmt.format(n) : '—';
  }

  function num2(value) {
    const n = Number(value);
    return Number.isFinite(n) ? numberFmt2.format(n) : '—';
  }

  function money(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return `${numberFmt.format(Math.round(n))} DZD`;
  }

  function moneyShort(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    const abs = Math.abs(n);
    if (abs >= 1e9) return `${numberFmt2.format(n / 1e9)} B DZD`;
    if (abs >= 1e6) return `${numberFmt2.format(n / 1e6)} M DZD`;
    if (abs >= 1e4) return `${numberFmt.format(Math.round(n / 1e3))} K DZD`;
    return `${numberFmt.format(Math.round(n))} DZD`;
  }

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function toDate(value) {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  /** "12 Oct 2026" */
  function date(value) {
    const d = toDate(value);
    if (!d) return '—';
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  }

  /** "12 Oct" */
  function dateShort(value) {
    const d = toDate(value);
    if (!d) return '—';
    return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  }

  /** "12 Oct 2026, 14:32" */
  function dateTime(value) {
    const d = toDate(value);
    if (!d) return '—';
    if (d.getFullYear() === new Date().getFullYear()) {
      return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    return `${date(d)}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function time(value) {
    const d = toDate(value);
    if (!d) return '—';
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function timeAgo(value) {
    const d = toDate(value);
    if (!d) return '—';
    const diff = Date.now() - d.getTime();
    if (diff < 0) return dateShort(d);
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} d ago`;
    if (days < 365) return dateShort(d);
    return date(d);
  }

  function startOfDay(value) {
    const d = value ? new Date(value) : new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function dayKey(value) {
    const d = toDate(value);
    if (!d) return '';
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function initials(name) {
    const text = String(name || '').trim();
    if (!text) return '?';
    const parts = text.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }

  const AVATAR_COLORS = [
    ['#34d399', '#0f766e'],
    ['#818cf8', '#4338ca'],
    ['#fbbf24', '#b45309'],
    ['#f472b6', '#9d174d'],
    ['#38bdf8', '#0369a1'],
    ['#a78bfa', '#6d28d9'],
    ['#fb923c', '#c2410c'],
    ['#4ade80', '#15803d']
  ];

  function colorFor(seed) {
    const text = String(seed || '');
    let hash = 0;
    for (let index = 0; index < text.length; index += 1) {
      hash = (hash * 31 + text.charCodeAt(index)) % 100000;
    }
    return AVATAR_COLORS[hash % AVATAR_COLORS.length];
  }

  function debounce(fn, wait) {
    let timer = null;
    const debounced = function debounced(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), wait);
    };
    debounced.cancel = () => clearTimeout(timer);
    return debounced;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function uid(prefix) {
    return `${prefix || 'id'}-${Math.random().toString(36).slice(2, 9)}`;
  }

  /** Tiny hyperscript helper. */
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [key, value] of Object.entries(attrs)) {
        if (value === undefined || value === null || value === false) continue;
        if (key === 'class') node.className = value;
        else if (key === 'html') node.innerHTML = value;
        else if (key === 'text') node.textContent = value;
        else if (key === 'dataset') Object.assign(node.dataset, value);
        else if (key.startsWith('on') && typeof value === 'function') {
          node.addEventListener(key.slice(2).toLowerCase(), value);
        } else if (key in node && key !== 'list' && typeof value !== 'object') {
          node[key] = value;
        } else {
          node.setAttribute(key, String(value));
        }
      }
    }
    const list = children === undefined ? [] : Array.isArray(children) ? children : [children];
    for (const child of list) {
      if (child === null || child === undefined || child === false) continue;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return node;
  }

  function qs(selector, root) {
    return (root || document).querySelector(selector);
  }

  function qsa(selector, root) {
    return Array.from((root || document).querySelectorAll(selector));
  }

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function capitalize(value) {
    const text = String(value || '');
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function plural(count, singular, pluralForm) {
    return count === 1 ? singular : pluralForm || `${singular}s`;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  App.util = {
    esc,
    attr,
    num,
    num2,
    money,
    moneyShort,
    date,
    dateShort,
    dateTime,
    time,
    timeAgo,
    startOfDay,
    dayKey,
    initials,
    colorFor,
    debounce,
    clamp,
    uid,
    el,
    qs,
    qsa,
    cssVar,
    capitalize,
    plural,
    sleep,
    toDate
  };
})();
