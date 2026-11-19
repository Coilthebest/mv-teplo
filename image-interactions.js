'use strict';
for (const action of ['contextmenu', 'dragstart']) {
  document.addEventListener(action, event => {
    if (event.target instanceof Element && event.target.closest('img, canvas, svg image')) {
      event.preventDefault();
    }
  });
}
