importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyAUtKiM6DwmpzCGg708kGMDSQT42YKcGWg",
  authDomain: "portalbell.firebaseapp.com",
  projectId: "portalbell",
  storageBucket: "portalbell.firebasestorage.app",
  messagingSenderId: "219626476677",
  appId: "1:219626476677:web:05ca1561b1f5a235ca45ec"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Mensaje recibido en segundo plano: ', payload);
  
  // Extraemos los datos enviados por la Cloud Function
  const titulo = payload.data?.title || "🔔 ¡Están tocando el timbre!";
  const cuerpo = payload.data?.body || "Tenés una visita esperando en la puerta.";
  const linkUrl = payload.data?.click_action || '/residente';

  const options = {
    body: cuerpo,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    vibrate: [200, 100, 200, 100, 200],
    requireInteraction: true,
    data: { url: linkUrl }
  };

  self.registration.showNotification(titulo, options);
});

// Evento para abrir la app al hacer clic en la notificación
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || '/residente';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (let client of windowClients) {
        if (client.url.includes('/residente') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});