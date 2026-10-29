import { initializeApp } from "firebase/app";
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
        vapidKey: 'TU_CLAVE_VAPID_DE_FIREBASE' 
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
};