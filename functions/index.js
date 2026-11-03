const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
admin.initializeApp();

exports.notificarTimbre = onDocumentCreated("llamadas/{llamadoId}", async (event) => {
  const snap = event.data;
  if (!snap) return;

  const llamada = snap.data();
  const ufBuscada = llamada.uf;
  const edificioId = llamada.edificioId;

  try {
    const tokens = [];

    // 1. Buscar al Titular en la colección 'unidades'
    const unidadesRef = admin.firestore().collection("unidades");
    const unidadSnapshot = await unidadesRef
      .where("edificioId", "==", edificioId)
      .where("uf", "==", ufBuscada)
      .get();

    let unidadId = null;

    unidadSnapshot.forEach((doc) => {
      const unidad = doc.data();
      unidadId = doc.id; // Guardamos el ID interno de la unidad

      // Si el titular tiene token y NO está fuera de casa, se lo incluimos
      if (unidad.fcmToken && unidad.estadoCasa !== 'fuera_de_casa') {
        tokens.push(unidad.fcmToken);
      } else {
        console.log(`Titular de UF ${ufBuscada} está fuera de casa o sin token.`);
      }
    });

    // 2. Buscar a los Cohabitantes en la colección 'sub_usuarios' usando el unidadId
    if (unidadId) {
      const subUsuariosRef = admin.firestore().collection("sub_usuarios");
      const subSnapshot = await subUsuariosRef
        .where("unidadId", "==", unidadId)
        .get();

      subSnapshot.forEach((doc) => {
        const sub = doc.data();
        // Los cohabitantes reciben siempre la alerta en su celular vinculado
        if (sub.fcmToken) {
          tokens.push(sub.fcmToken);
        }
      });
    }

    if (tokens.length === 0) {
      console.log("No hay dispositivos disponibles para notificar en esta UF.");
      return null;
    }

    // 3. Enviar la notificación push a todos los tokens recolectados (Titular + Cohabitantes)
    const mensaje = {
      data: {
        title: "🔔 ¡Están tocando el timbre!",
        body: `Tenés una visita en la puerta (${llamada.tipo}).`,
        click_action: `https://portalbell.vercel.app/residente?uf=${ufBuscada}`
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