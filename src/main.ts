import './style.css';
import { mountShell } from './ui/shell';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Application root is missing');
mountShell(root);
