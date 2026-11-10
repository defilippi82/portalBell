const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

const db = admin.firestore();
const messaging = admin.messaging();

// Declaración de secretos para la API de Meta (WhatsApp)
const { defineSecret } = require("firebase-functions/params");
const whatsappToken = defineSecret("WHATSAPP_TOKEN");
const whatsappPhoneId = defineSecret("WHATSAPP_PHONE_NUMBER_ID");

const COLECCION_PROCESADOS = "_pushProcesados";
const TIEMPO_LEASE_MS = 2 * 60 * 1000;
const MAX_TOKENS_POR_ENVIO = 500;

// -----------------------------------------------------
// 1. PROCESAMIENTO DE LLAMADA NUEVA (PUSH INSTANTÁNEO)
// -----------------------------------------------------
exports.enviarNotificacionLlamada = onDocumentCreated(
  {
    document: "llamadas/{llamadoId}",
    region: "southamerica-east1",
    retry: true,
  },
  async (event) => {
    const llamadoId = event.params.llamadoId;
    const llamada = event.data?.data();

    if (!llamada) return;

    const { edificioId, uf } = llamada;
    if (!edificioId || !uf) return;

    const eventoId = event.id;
    const procesoRef = db.collection(COLECCION_PROCESADOS).doc(eventoId);

    // Control de duplicados
    const puedeProcesar = await db.runTransaction(async (tx) => {
      const procesoSnap = await tx.get(procesoRef);
      if (procesoSnap.exists && procesoSnap.data().estado === "completado") return false;
      
      tx.set(procesoRef, {
        estado: "procesando",
        llamadoId,
        inicio: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      return true;
    });

    if (!puedeProcesar) return;

    try {
      // Buscar la unidad para obtener el teléfono y vincularlo a la llamada
      const unidadQuery = await db
        .collection("unidades")
        .where("edificioId", "==", edificioId)
        .where("uf", "==", uf)
        .limit(1)
        .get();

      if (unidadQuery.empty) {
        await marcarProcesoCompletado(procesoRef, "unidad_no_encontrada");
        return;
      }

      const unidadDoc = unidadQuery.docs[0];
      const unidadData = unidadDoc.data();
      const telefonoResidente = unidadData.telefono || "";
      const unidadId = unidadDoc.id;

      // Guardamos el teléfono directamente en el documento de la llamada para que el fallback lo lea fácil
      await db.collection("llamadas").doc(llamadoId).set({
        telefonoResidente: telefonoResidente,
        estado: "activo",
        whatsappEnviado: false,
        creadoEn: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      // Buscar dispositivos de la unidad
      const dispositivosSnap = await db
        .collection("unidades").doc(unidadId).collection("dispositivos").get();

      if (dispositivosSnap.empty) {
        await marcarProcesoCompletado(procesoRef, "sin_dispositivos");
        return;
      }

      const dispositivosHabilitados = dispositivosSnap.docs.filter((doc) => {
        const d = doc.data();
        return d.recibirPush === true && d.estado === "en_casa" && typeof d.fcmToken === "string";
      });

      if (dispositivosHabilitados.length === 0) {
        await marcarProcesoCompletado(procesoRef, "sin_destinatarios");
        return;
      }

      // Preparar tokens únicos
      const tokensMap = new Map();
      for (const doc of dispositivosHabilitados) {
        tokensMap.set(doc.data().fcmToken.trim(), doc.ref);
      }
      const tokensUnicos = Array.from(tokensMap.keys());

      // Enviar Push de Alta Prioridad
      await messaging.sendEachForMulticast({
        data: {
          title: "🔔 PortalBell",
          body: llamada.nombreVisitante ? `🔔 ${llamada.nombreVisitante} está en tu puerta` : "🔔 ¡Están tocando el timbre!",
          click_action: "/",
          llamadoId: String(llamadoId),
        },
        tokens: tokensUnicos,
        webpush: { headers: { Urgency: "high", TTL: "60" } },
      });

      await marcarProcesoCompletado(procesoRef, "finalizado");

    } catch (error) {
      logger.error("Error en notificación push", { error: error.message });
      throw error;
    }
  }
);

// -----------------------------------------------------
// 2. FALLBACK AUTOMÁTICO DE WHATSAPP (Corre cada 1 minuto)
// -----------------------------------------------------
exports.verificarFallbackWhatsapp = onSchedule(
  {
    schedule: "every 1 minutes",
    region: "southamerica-east1",
    secrets: [whatsappToken, whatsappPhoneId],
  },
  async (event) => {
    const ahora = Date.now();
    // Umbral: Llamadas creadas hace más de 15 segundos que siguen activas y sin WhatsApp enviado
    const corteTiempo = new Date(ahora - 15000); 

    const llamadasPendientes = await db.collection("llamadas")
      .where("estado", "==", "activo")
      .where("whatsappEnviado", "==", false)
      .where("creadoEn", "<=", corteTiempo)
      .get();

    if (llamadasPendientes.empty) {
      return;
    }

    const phoneId = whatsappPhoneId.value();
    const token = whatsappToken.value();

    for (const docLlamada of llamadasPendientes.docs) {
      const data = docLlamada.data();
      const llamadoId = docLlamada.id;
      const telefono = data.telefonoResidente;
      const uf = data.uf || "su unidad";

      if (!telefono) {
        // Si no tiene teléfono, marcamos que ya se evaluó para que no lo busque más
        await docLlamada.ref.update({ whatsappEnviado: true });
        continue;
      }

      try {
        logger.info(`Disparando WhatsApp de respaldo para llamado ${llamadoId} al teléfono ${telefono}`);

        // Petición a la API Cloud de Meta
        const response = await fetch(
          `https://graph.facebook.com/v18.0/${phoneId}/messages`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              messaging_product: "whatsapp",
              to: telefono,
              type: "template",
              template: {
                name: "hello_world", // Plantilla de prueba de Meta
                language: { code: "en_US" },
              },
            }),
          }
        );

        const resultadoMeta = await response.json();
        logger.info("Respuesta Meta WhatsApp:", resultadoMeta);

        // Marcamos como enviado para que no vuelva a dispararse
        await docLlamada.ref.update({ whatsappEnviado: true });

      } catch (err) {
        logger.error(`Error enviando WhatsApp para llamado ${llamadoId}`, err);
      }
    }
  }
);

async function marcarProcesoCompletado(procesoRef, resultado) {
  await procesoRef.set({
    estado: "completado",
    resultado,
    finalizado: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}


//gemini
/*const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
admin.initializeApp();

exports.notificarTimbre = onDocumentCreated("llamadas/{llamadoId}", async (event) => {
  const snap = event.data;
  if (!snap) return;

  const llamada = snap.data();
  const ufBuscada = String(llamada.uf); // 🔑 Forzamos a texto para asegurar coincidencia
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
        if (sub.fcmToken) {
          tokens.push(sub.fcmToken);
        }
      });
    }

    if (tokens.length === 0) {
      console.log("No hay dispositivos disponibles para notificar en esta UF.");
      return null;
    }

    // 3. Enviar la notificación push multicast con PRIORIDAD ALTA
    const mensaje = {
      data: {
        title: "🔔 ¡Están tocando el timbre!",
        body: `Tenés una visita en la puerta (${llamada.tipo}).`,
        click_action: `https://portalbell.vercel.app/residente?uf=${ufBuscada}`
      },
      tokens: tokens,
      // 🔑 Configuración de prioridad para evitar retrasos por ahorro de energía en los celulares
      android: {
        priority: "high"
      },
      apns: {
        headers: {
          "apns-priority": "10" // Prioridad máxima en dispositivos Apple
        }
      }
    };

    const response = await admin.messaging().sendEachForMulticast(mensaje);
    console.log(`Notificaciones enviadas. Exitosas: ${response.successCount}, Fallidas: ${response.failureCount}`);
    return null;

  } catch (error) {
    console.error("Error enviando push:", error);
    return null;
  }
});*/