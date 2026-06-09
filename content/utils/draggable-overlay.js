// Makes Super LTC overlay panels draggable by their header.
// Auto-attaches via MutationObserver so vanilla + Preact overlays work
// without per-component wiring.

const DRAG_THRESHOLD = 5;
const VIEWPORT_MARGIN = 8;

const INTERACTIVE_SELECTOR = 'button, input, select, textarea, a, [data-no-drag]';

/**
 * Overlay panels to make draggable.
 * @type {Array<{ container: string, handle: string, skip?: string }>}
 */
export const DRAGGABLE_OVERLAY_TARGETS = [
  { container: '.super-popover', handle: '.super-popover-header' },
  { container: '.super-panel', handle: '.super-panel-header' },
  { container: '.cc-pop', handle: '.cc-pop__header' },
  { container: '.super-modal__container', handle: '.super-modal__header' },
  { container: '.mds-cc__modal', handle: '.mds-cc__header', skip: '.mds-cc__modal--fullscreen' },
  { container: '.pdpm-an__modal', handle: '.pdpm-an__header' },
  { container: '.pdpm-an__panel', handle: '.pdpm-an__header' },
  { container: '.ftp__modal', handle: '.ftp__header' },
  { container: '.ftp-srcmodal__panel', handle: '.ftp-srcmodal__head' },
  { container: '.thr__panel', handle: '.thr__header' },
  { container: '.qmb__modal', handle: '.qmb__header' },
  { container: '.cpc__modal', handle: '.cpc__header' },
  { container: '.dx-confirm__dialog', handle: '.dx-confirm__header' },
  { container: '.super-chat-overlay__panel', handle: '.super-chat-overlay__header' },
  { container: '.icd10-viewer-modal__container', handle: '.icd10-viewer-modal__header' },
  {
    container: '.icd10-query-flow__sheet',
    handle: '.icd10-query-flow__sheet-header, .icd10-query-flow__loading-title',
  },
  { container: '.super-admin-modal__container', handle: '.super-admin-modal__header' },
  { container: '.super-note-modal__container', handle: '.super-note-modal__header' },
  { container: '.super-therapy-modal__container', handle: '.super-therapy-modal__header' },
  { container: '.super-pdf-modal__container', handle: '.super-pdf-modal__header' },
  { container: '.super-query-modal__container', handle: '.super-query-modal__header' },
  { container: '.super-uda-modal__container', handle: '.super-uda-modal__header' },
  { container: '.cpas-modal__container', handle: '.cpas-modal__header' },
  { container: '.cpas-libbrowser', handle: '.cpas-libbrowser__header' },
  { container: '.cpas-libcfg', handle: '.cpas-libcfg__header' },
  { container: '#ard-estimator-overlay > div', handle: '.ard-est__header' },
  { container: '.dqm__modal', handle: '.dqm__header' },
  { container: '.super-incident-modal__container', handle: '.super-incident-modal__header' },
  { container: '.cm', handle: '.cm__header' },
];

const attached = new WeakMap();

function pinElement(element) {
  if (element.dataset.superDraggablePinned) return;

  const rect = element.getBoundingClientRect();
  element.style.position = 'fixed';
  element.style.left = `${rect.left}px`;
  element.style.top = `${rect.top}px`;
  element.style.right = 'auto';
  element.style.bottom = 'auto';
  element.style.margin = '0';
  element.style.transform = 'none';
  element.dataset.superDraggablePinned = 'true';
}

function clampPosition(element, left, top) {
  const width = element.offsetWidth;
  const height = element.offsetHeight;
  const maxX = window.innerWidth - width - VIEWPORT_MARGIN;
  const maxY = window.innerHeight - height - VIEWPORT_MARGIN;

  return {
    left: Math.max(VIEWPORT_MARGIN, Math.min(left, maxX)),
    top: Math.max(VIEWPORT_MARGIN, Math.min(top, maxY)),
  };
}

/**
 * @param {HTMLElement} element
 * @param {HTMLElement} handle
 * @returns {() => void}
 */
export function setupDraggableOverlay(element, handle) {
  if (!element || !handle || attached.has(element)) {
    return () => {};
  }

  let isDragging = false;
  let hasDragged = false;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    if (e.target.closest(INTERACTIVE_SELECTOR)) return;

    pinElement(element);

    const rect = element.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;
    startX = e.clientX;
    startY = e.clientY;
    isDragging = true;
    hasDragged = false;

    handle.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  };

  const onPointerMove = (e) => {
    if (!isDragging) return;

    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;

    if (Math.abs(deltaX) > DRAG_THRESHOLD || Math.abs(deltaY) > DRAG_THRESHOLD) {
      hasDragged = true;
      element.classList.add('super-draggable--dragging');
    }

    const next = clampPosition(element, startLeft + deltaX, startTop + deltaY);
    element.style.left = `${next.left}px`;
    element.style.top = `${next.top}px`;
  };

  const onPointerUp = (e) => {
    if (!isDragging) return;
    isDragging = false;
    element.classList.remove('super-draggable--dragging');

    if (handle.hasPointerCapture?.(e.pointerId)) {
      handle.releasePointerCapture(e.pointerId);
    }
  };

  const onClickCapture = (e) => {
    if (!hasDragged) return;
    e.preventDefault();
    e.stopPropagation();
    hasDragged = false;
  };

  handle.classList.add('super-draggable-handle');
  handle.addEventListener('pointerdown', onPointerDown);
  handle.addEventListener('click', onClickCapture, true);
  document.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerup', onPointerUp);
  document.addEventListener('pointercancel', onPointerUp);

  const cleanup = () => {
    handle.classList.remove('super-draggable-handle');
    handle.removeEventListener('pointerdown', onPointerDown);
    handle.removeEventListener('click', onClickCapture, true);
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('pointercancel', onPointerUp);
    attached.delete(element);
  };

  attached.set(element, { cleanup });
  return cleanup;
}

function shouldSkipContainer(element, target) {
  if (!element?.isConnected) return true;
  if (target.skip && element.matches(target.skip)) return true;
  if (element.closest('#super-mds-mode-root')) return true;
  return false;
}

function tryAttachTarget(root, target) {
  root.querySelectorAll(target.container).forEach((element) => {
    if (shouldSkipContainer(element, target) || attached.has(element)) return;

    const handle = element.querySelector(target.handle);
    if (!handle) return;

    setupDraggableOverlay(element, handle);
  });
}

function scanNode(node) {
  if (node.nodeType !== Node.ELEMENT_NODE) return;

  for (const target of DRAGGABLE_OVERLAY_TARGETS) {
    if (node.matches?.(target.container)) {
      if (!shouldSkipContainer(node, target) && !attached.has(node)) {
        const handle = node.querySelector(target.handle);
        if (handle) setupDraggableOverlay(node, handle);
      }
    }
    tryAttachTarget(node, target);
  }
}

function scanTree(root = document.body) {
  if (!root) return;
  scanNode(root);
  root.querySelectorAll?.('*').forEach((child) => scanNode(child));
}

/**
 * Start auto-attaching draggable behavior to overlays as they appear.
 */
export function initDraggableOverlays() {
  scanTree(document.body);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) scanNode(node);
      });

      mutation.removedNodes.forEach((node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;

        const selectors = DRAGGABLE_OVERLAY_TARGETS.map((t) => t.container).join(',');
        const elements = [];

        for (const target of DRAGGABLE_OVERLAY_TARGETS) {
          if (node.matches?.(target.container)) elements.push(node);
        }
        node.querySelectorAll?.(selectors).forEach((el) => elements.push(el));

        elements.forEach((el) => attached.get(el)?.cleanup?.());
      });
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  return observer;
}
