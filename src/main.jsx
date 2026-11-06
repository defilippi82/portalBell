import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// 🔑 REGISTRO OBLIGATORIO DEL SERVICE WORKER PARA PUSH NOTIFICATIONS
/*if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/firebase-messaging-sw.js')
      .then((registration) => {
        console.log('Service Worker registrado exitosamente con scope:', registration.scope);
      })
      .catch((error) => {
        console.error('Fallo al registrar el Service Worker:', error);
      });
  });
}*/

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)