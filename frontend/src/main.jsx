import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import './index.css';
import App from './App.jsx';
import { cargarMarca } from './lib/marca';

// Nombre, contacto y logo de la corredora configurados en /admin/setup (antes del primer render)
cargarMarca(import.meta.env.VITE_API_URL || '').finally(() => {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  );
});
