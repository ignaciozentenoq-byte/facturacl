// src/components/modal.js

let _bg, _title, _body;

function init() {
  _bg    = document.getElementById('modal-bg');
  _title = document.getElementById('modal-title');
  _body  = document.getElementById('modal-body');

  _bg.addEventListener('click', e => {
    if (e.target === _bg) close();
  });
  document.getElementById('modal-close-btn')
    ?.addEventListener('click', close);
}

export function open(title, htmlContent) {
  if (!_bg) init();
  _title.textContent  = title;
  _body.innerHTML     = htmlContent;
  _bg.classList.add('open');
  document.body.style.overflow = 'hidden';
}

export function close() {
  if (!_bg) return;
  _bg.classList.remove('open');
  document.body.style.overflow = '';
}

export { init as initModal };
