import { useEffect, useState } from 'react';
import { Home } from './pages/Home.tsx';
import { SessionPage } from './pages/SessionPage.tsx';

export function navigate(path: string): void {
  history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function usePath(): string {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const on = () => setPath(location.pathname);
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);
  return path;
}

export function App() {
  const path = usePath();
  const m = path.match(/^\/s\/([\w-]+)\/?$/);
  if (m) return <SessionPage key={m[1]} sessionId={m[1]} />;
  return <Home />;
}
