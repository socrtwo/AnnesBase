import './style.css';
import { mountShell } from './ui/shell';
import { mountOfflineStatus } from './pwa/offline';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Application root is missing');
const shell = mountShell(root);
const offline = mountOfflineStatus(root, import.meta.env.PROD);
if (import.meta.hot) import.meta.hot.dispose(() => { offline.dispose(); shell.dispose(); });
