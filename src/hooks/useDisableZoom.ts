import { useEffect } from 'react';

/**
 * Блокирует pinch-to-zoom и double-tap-to-zoom на мобильных устройствах.
 *
 * Использует несколько уровней защиты, потому что разные браузеры
 * поддерживают разные способы:
 *  - iOS Safari 13+ игнорирует `user-scalable=no` в viewport
 *  - `touch-action: pinch-zoom none` поддерживается в Chrome/Edge 90+, но НЕ в iOS Safari
 *  - жесты `gesturestart`/`gesturechange` работают только в iOS Safari
 *  - `touchmove` с preventDefault на multi-touch работает везде как fallback
 *
 * Слушаем `window` с `capture: true`, чтобы перехватывать события
 * раньше, чем framer-motion (который вешает свои pointer-handler'ы
 * на отдельные элементы). Это особенно важно для нижней части экрана,
 * где находится TabBar с активными pointer-down handler'ами.
 */
export function useDisableZoom() {
  useEffect(() => {
    // === 1. iOS Safari: ловим жесты ===
    const onGestureStart = (e: Event) => e.preventDefault();
    const onGestureChange = (e: Event) => e.preventDefault();
    const onGestureEnd = (e: Event) => e.preventDefault();

    // === 2. Универсально: блокируем touchmove при multi-touch (pinch) ===
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        e.preventDefault();
      }
    };

    // === 3. iOS Safari: блокируем double-tap (имитирует zoom) ===
    let lastTouchEnd = 0;
    const onTouchEnd = (e: TouchEvent) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) {
        e.preventDefault();
      }
      lastTouchEnd = now;
    };

    // Используем `window` + `capture: true`, чтобы перехватить события
    // ДО того, как framer-motion/любой другой обработчик сможет их обработать
    window.addEventListener('gesturestart', onGestureStart, { passive: false, capture: true });
    window.addEventListener('gesturechange', onGestureChange, { passive: false, capture: true });
    window.addEventListener('gestureend', onGestureEnd, { passive: false, capture: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false, capture: true });
    window.addEventListener('touchend', onTouchEnd, { passive: false, capture: true });

    return () => {
      window.removeEventListener('gesturestart', onGestureStart, { capture: true } as EventListenerOptions);
      window.removeEventListener('gesturechange', onGestureChange, { capture: true } as EventListenerOptions);
      window.removeEventListener('gestureend', onGestureEnd, { capture: true } as EventListenerOptions);
      window.removeEventListener('touchmove', onTouchMove, { capture: true } as EventListenerOptions);
      window.removeEventListener('touchend', onTouchEnd, { capture: true } as EventListenerOptions);
    };
  }, []);
}
