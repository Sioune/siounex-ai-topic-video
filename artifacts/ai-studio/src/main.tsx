import { createRoot } from 'react-dom/client';
import App from './App';
import './content/base.css';
import './content/site.css';

createRoot(document.getElementById('root')!).render(<App />);
