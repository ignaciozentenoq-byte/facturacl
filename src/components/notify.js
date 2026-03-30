// src/components/notify.js
// Sistema de notificaciones toast (success | error | info | warn)

let _container = null;
let _idCounter  = 0;

function getContainer() {
  if (!_container) {
    _container = document.getElementById('notif-container');
  }
  return _container;
}

/**
 * Muestra una notificación toast.
 * @param {string} message
 * @param {'success'|'error'|'info'|'warn'} type
 * @param {number} duration - ms antes de desaparecer (0 = manual)
 */
export function notify(message, type = 'info', duration = 4000) {
  const container = getContainer();
  if (!container) return;

  const id = ++_idCounter;
  const el = document.createElement('div');
  el.className = `notif notif-${type}`;
  el.id        = `notif-${id}`;

  const icons = { success: '✓', error: '✕', info: 'ℹ', warn: '⚠' };
  el.innerHTML = `
    <span class="notif-icon">${icons[type] ?? 'ℹ'}</span>
    <span class="notif-msg">${escHtml(message)}</span>
    <button class="notif-close" aria-label="Cerrar">×</button>
  `;

  el.querySelector('.notif-close').addEventListener('click', () => dismiss(id));
  container.appendChild(el);

  // Animar entrada
  requestAnimationFrame(() => el.classList.add('notif-show'));

  if (duration > 0) {
    setTimeout(() => dismiss(id), duration);
  }

  return id;
}

export function dismiss(id) {
  const el = document.getElementById(`notif-${id}`);
  if (!el) return;
  el.classList.remove('notif-show');
  setTimeout(() => el.remove(), 300);
}

function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
