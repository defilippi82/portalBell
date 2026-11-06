//chatgpt

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

import { getMessaging, getToken, isSupported, onMessage} from "firebase/messaging";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_API_KEY,
  authDomain: import.meta.env.VITE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_DATABASE_URL,
  projectId: import.meta.env.VITE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_APP_ID,
  measurementId: import.meta.env.VITE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);

// Verificar soporte real de FCM en el navegador.
let messagingPromise = null;

export const obtenerMessaging = async () => {
  if (!messagingPromise) {
    messagingPromise = isSupported().then((soportado) => {
      return soportado ? getMessaging(app) : null;
    });
  }

  return messagingPromise;
};

// Obtener token Push.
export const solicitarPermisoNotificaciones = async () => {
  try {
    if (!("Notification" in window)) {
      throw new Error("El navegador no soporta notificaciones.");
    }

    if (!("serviceWorker" in navigator)) {
      throw new Error("El navegador no soporta Service Workers.");
    }

    if (!import.meta.env.VITE_FIREBASE_VAPID_KEY) {
      throw new Error("Falta configurar la clave VAPID.");
    }

    const messaging = await obtenerMessaging();

    if (!messaging) {
      throw new Error("Firebase Messaging no está soportado.");
    }

    const permiso = await Notification.requestPermission();

    if (permiso !== "granted") {
      return null;
    }

    // Utilizar el Service Worker de Firebase.
    // Esta ruta requiere que el SW esté correctamente registrado.
    const registro = await navigator.serviceWorker.register(
      "/firebase-messaging-sw.js"
    );

    await navigator.serviceWorker.ready;

    const token = await getToken(messaging, {
      vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: registro
    });

    if (!token) {
      throw new Error("No se pudo obtener el token FCM.");
    }

    return token;

  } catch (error) {
    console.error("Error registrando notificaciones:", error);
    throw error;
  }
};

// Escuchar mensajes cuando PortalBell está abierto.
export const escucharMensajesPush = async (callback) => {
  const messaging = await obtenerMessaging();

  if (!messaging) return () => {};

  return onMessage(messaging, callback);
};

//gemini
/*import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getMessaging, getToken, onMessage } from "firebase/messaging";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_API_KEY,
  authDomain: import.meta.env.VITE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_DATABASE_URL,
  projectId: import.meta.env.VITE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_APP_ID,
  measurementId: import.meta.env.VITE_MEASUREMENT_ID

};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const messaging = getMessaging(app);

// Función para pedir permiso y obtener el Token Push del dispositivo
export const solicitarPermisoNotificaciones = async (userId) => {
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      // Reemplazá 'TU_CLAVE_VAPID' por la clave que generaste en la consola de Firebase
       const currentToken = await getToken(messaging, { 
  vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY 
});
      
      if (currentToken) {
        console.log('Token FCM obtenido:', currentToken);
        // Aquí guardarías el token en Firestore asociado al usuario logueado (ej: colección 'usuarios')
        return currentToken;
      } else {
        console.log('No se pudo obtener el token de registro.');
      }
    } else {
      console.log('Permiso de notificaciones denegado.');
    }
  } catch (error) {
    console.error('Error al recuperar el token de mensajería:', error);
  }
};*/