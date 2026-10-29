const {onDocumentCreated} = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
admin.initializeApp();

exports.notificarTimbre = onDocumentCreated("llamadas/{llamadoId}", async (event) => {
  const snap = event.data;
  if (!snap) return;

  const llamada = snap.data();
  const unidadId = llamada.unidadId;

  try {
    const usuariosRef = admin.firestore().collection("usuarios");
    const snapshot = await usuariosRef.where("unidadId", "==", unidadId).get();

    const tokens = [];
    snapshot.forEach((doc) => {
      const usuario = doc.data();
      if (usuario.estado === "en_casa" && usuario.fcmToken) {
        tokens.push(usuario.fcmToken);
      }
    });

    if (tokens.length === 0) return null;

    const mensaje = {
      notification: {
        title: "🔔 ¡Están llamando!",
        body: `Visitante: ${llamada.nombreVisitante}`,
      },
      tokens: tokens,
    };

    await admin.messaging().sendEachForMulticast(mensaje);
    return null;
  } catch (error) {
    console.error("Error:", error);
    return null;
  }
});