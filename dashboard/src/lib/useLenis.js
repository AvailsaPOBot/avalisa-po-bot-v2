import { useEffect } from 'react';

export function useLenis() {
  useEffect(() => {
    const root = document.documentElement;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const previousBehavior = root.style.scrollBehavior;

    const syncBehavior = () => {
      root.style.scrollBehavior = reduceMotion.matches ? 'auto' : 'smooth';
    };

    syncBehavior();
    reduceMotion.addEventListener('change', syncBehavior);

    return () => {
      root.style.scrollBehavior = previousBehavior;
      reduceMotion.removeEventListener('change', syncBehavior);
    };
  }, []);
}
