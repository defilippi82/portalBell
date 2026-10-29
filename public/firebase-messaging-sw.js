// public/firebase-messaging-sw.js
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
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/favicon.ico'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});