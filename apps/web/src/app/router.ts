import { useEffect, useState } from 'react';

export function currentHash(): string {
  return location.hash || '#/projects';
}

/** Hash routing: `#/projects`, `#/project/<id>`, `#/probe`. */
export function useHashRoute(): string {
  const [hash, setHash] = useState(currentHash);
  useEffect(() => {
    const onChange = () => setHash(currentHash());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash;
}

export function navigate(hash: string): void {
  if (location.hash === hash) return;
  location.hash = hash;
}
