const {onDocumentCreated} = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
admin.initializeApp();

exports.notificarTimbre = onDocumentCreated("llamadas/{llamadoId}", async (event) => {
  const snap = event.data;
  if (!snap) return;

  const llamada = snap.data();
  const ufBuscada = llamada.uf;
  const edificioId = llamada.edificioId;

  try {
    // Buscamos la unidad correspondiente en Firestore
    const unidadesRef = admin.firestore().collection("unidades");
    const snapshot = await unidadesRef
      .where("edificioId", "==", edificioId)
      .where("uf", "==", ufBuscada)
      .get();

    const tokens = [];
    snapshot.forEach((doc) => {
      const unidad = doc.data();
      // Si la unidad tiene un fcmToken guardado, lo agregamos
      if (unidad.fcmToken) {
        tokens.push(unidad.fcmToken);
      }
    });

    if (tokens.length === 0) {
      console.log("No hay tokens FCM registrados para esta UF.");
      return null;
    }

    const mensaje = {
      notification: {
        title: "🔔 ¡Están tocando el timbre!",
        body: `Tenés una visita en la puerta (${llamada.tipo}).`,
      },
      tokens: tokens,
    };

    const response = await admin.messaging().sendEachForMulticast(mensaje);
    console.log("Notificaciones enviadas con éxito:", response.successCount);
    return null;
  } catch (error) {
    console.error("Error enviando push:", error);
    return null;
  }
});