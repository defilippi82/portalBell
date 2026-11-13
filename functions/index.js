
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onTaskDispatched } = require("firebase-functions/tasks");
const { logger } = require("firebase-functions");
const { defineSecret } = require("firebase-functions/params");

const admin = require("firebase-admin");
const { getFunctions } = require("firebase-admin/functions");

admin.initializeApp();

const db = admin.firestore();
const messaging = admin.messaging();

// -----------------------------------------------------
// CONFIGURACIÓN
// -----------------------------------------------------

const REGION = "southamerica-east1";

const COLECCION_PROCESADOS = "_pushProcesados";
const TIEMPO_LEASE_MS = 2 * 60 * 1000;

const whatsappToken = defineSecret("WHATSAPP_TOKEN");
const whatsappPhoneId = defineSecret("WHATSAPP_PHONE_NUMBER_ID");

// Cola asociada a la función enviarFallbackWhatsapp.
const queueWhatsapp = getFunctions().taskQueue(
  `locations/${REGION}/functions/enviarFallbackWhatsapp`
);

// -----------------------------------------------------
// 1. NUEVA LLAMADA: PUSH INMEDIATO + PROGRAMAR WHATSAPP
// -----------------------------------------------------

exports.enviarNotificacionLlamada = onDocumentCreated(
  {
    document: "llamadas/{llamadoId}",
    region: REGION,
    retry: true,
  },
  async (event) => {
    const llamadoId = event.params.llamadoId;
    const llamada = event.data?.data();

    if (!llamada) return;

    const { edificioId, uf } = llamada;

    if (!edificioId || uf === undefined || uf === null) {
      logger.warn("Llamada sin edificioId o UF", { llamadoId });
      return;
    }

    const eventoId = event.id;
    const procesoRef = db.collection(COLECCION_PROCESADOS).doc(eventoId);

    // Evitar que dos ejecuciones procesen simultáneamente el mismo evento.
    const puedeProcesar = await db.runTransaction(async (tx) => {
      const procesoSnap = await tx.get(procesoRef);

      if (procesoSnap.exists) {
        const proceso = procesoSnap.data();

        if (proceso.estado === "completado") {
          return false;
        }

        if (
          proceso.estado === "procesando" &&
          proceso.leaseHasta &&
          proceso.leaseHasta.toMillis() > Date.now()
        ) {
          return false;
        }
      }

      tx.set(
        procesoRef,
        {
          estado: "procesando",
          llamadoId,
          leaseHasta: admin.firestore.Timestamp.fromMillis(
            Date.now() + TIEMPO_LEASE_MS
          ),
          inicio: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return true;
    });

    if (!puedeProcesar) {
      logger.info("Evento ya procesado o en ejecución", { llamadoId });
      return;
    }

    try {
      // Buscar unidad.
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
      const unidadId = unidadDoc.id;

      const telefonoResidente = unidadData.telefono || "";

      // Completar los datos de la llamada sin pisar estados existentes.
      await db.runTransaction(async (tx) => {
        const llamadaSnap = await tx.get(
          db.collection("llamadas").doc(llamadoId)
        );

        if (!llamadaSnap.exists) return;

        const actual = llamadaSnap.data();
        const actualizacion = {
          telefonoResidente,
        };

        if (!actual.estado) {
          actualizacion.estado = "activo";
        }

        if (actual.whatsappEnviado === undefined) {
          actualizacion.whatsappEnviado = false;
        }

        if (!actual.creadoEn) {
          actualizacion.creadoEn =
            admin.firestore.FieldValue.serverTimestamp();
        }

        tx.set(
          db.collection("llamadas").doc(llamadoId),
          actualizacion,
          { merge: true }
        );
      });

      // -------------------------------------------------
      // PUSH INMEDIATO
      // -------------------------------------------------

      const dispositivosSnap = await db
        .collection("unidades")
        .doc(unidadId)
        .collection("dispositivos")
        .get();

      const dispositivosHabilitados = dispositivosSnap.docs.filter((doc) => {
        const dispositivo = doc.data();

        return (
          dispositivo.recibirPush === true &&
          dispositivo.estado === "en_casa" &&
          typeof dispositivo.fcmToken === "string" &&
          dispositivo.fcmToken.trim() !== ""
        );
      });

      const tokensMap = new Map();

      for (const doc of dispositivosHabilitados) {
        const token = doc.data().fcmToken.trim();

        if (!tokensMap.has(token)) {
          tokensMap.set(token, doc.ref);
        }
      }

      const tokensUnicos = Array.from(tokensMap.keys());

      if (tokensUnicos.length > 0) {
        const textoVisitante = llamada.nombreVisitante
          ? `🔔 ${llamada.nombreVisitante} está en tu puerta`
          : "🔔 ¡Están tocando el timbre!";

        // FCM admite hasta 500 tokens por envío multicast.
        for (let i = 0; i < tokensUnicos.length; i += 500) {
          const lote = tokensUnicos.slice(i, i + 500);

          const resultadoPush = await messaging.sendEachForMulticast({
            tokens: lote,
            data: {
              title: "🔔 PortalBell",
              body: textoVisitante,
              click_action: "/",
              llamadoId: String(llamadoId),
            },
            webpush: {
              headers: {
                Urgency: "high",
                TTL: "60",
              },
            },
          });

          logger.info("Resultado de envío push", {
            llamadoId,
            enviados: resultadoPush.successCount,
            errores: resultadoPush.failureCount,
          });
        }
      } else {
        logger.info("No hay dispositivos habilitados para push", {
          llamadoId,
        });
      }

      // -------------------------------------------------
      // PROGRAMAR FALLBACK DE WHATSAPP
      // -------------------------------------------------

      try {
        await queueWhatsapp.enqueue(
          { llamadoId },
          {
            id: `whatsapp-${llamadoId}`,
            scheduleDelaySeconds: 1,
            dispatchDeadlineSeconds: 60,
          }
        );

        logger.info("Tarea WhatsApp programada", { llamadoId });
      } catch (error) {
        // Si la tarea ya existe, consideramos que ya fue programada.
        if (
          error.code === "functions/task-already-exists" ||
          error.code === "already-exists"
        ) {
          logger.info("La tarea WhatsApp ya estaba programada", {
            llamadoId,
          });
        } else {
          throw error;
        }
      }

      await marcarProcesoCompletado(procesoRef, "push_y_whatsapp_programado");
    } catch (error) {
      logger.error("Error procesando llamada", {
        llamadoId,
        mensaje: error.message,
      });

      // Liberar el proceso para permitir un nuevo intento del trigger.
      await procesoRef.set(
        {
          estado: "error",
          leaseHasta: admin.firestore.Timestamp.fromMillis(Date.now()),
          error: error.message,
        },
        { merge: true }
      );

      throw error;
    }
  }
);

// -----------------------------------------------------
// 2. CLOUD TASKS: RESPALDO DE WHATSAPP
// -----------------------------------------------------

exports.enviarFallbackWhatsapp = onTaskDispatched(
  {
    region: REGION,
    secrets: [whatsappToken, whatsappPhoneId],

    retryConfig: {
      maxAttempts: 3,
      minBackoffSeconds: 30,
      maxBackoffSeconds: 120,
      maxDoublings: 2,
    },

    rateLimits: {
      maxConcurrentDispatches: 10,
    },
  },
  async (req) => {
    const { llamadoId } = req.data || {};

    if (!llamadoId) {
      logger.error("Cloud Task sin llamadoId");
      return;
    }

    const llamadaRef = db.collection("llamadas").doc(llamadoId);

    // Consultar el estado actualizado de la llamada.
    const llamadaSnap = await llamadaRef.get();

    if (!llamadaSnap.exists) {
      logger.warn("La llamada ya no existe", { llamadoId });
      return;
    }

    const llamada = llamadaSnap.data();

    if (
      llamada.estado !== "activo" ||
      llamada.whatsappEnviado === true
    ) {
      logger.info("No corresponde enviar WhatsApp", {
        llamadoId,
        estado: llamada.estado,
        whatsappEnviado: llamada.whatsappEnviado,
      });
      return;
    }

    // Reclamar el envío mediante una transacción.
    const puedeEnviar = await db.runTransaction(async (tx) => {
      const snap = await tx.get(llamadaRef);

      if (!snap.exists) return false;

      const actual = snap.data();

      if (
        actual.estado !== "activo" ||
        actual.whatsappEnviado === true
      ) {
        return false;
      }

      const ahora = Date.now();
      const leaseHasta = actual.whatsappLeaseHasta;

      if (
        actual.whatsappEstado === "enviando" &&
        leaseHasta &&
        leaseHasta.toMillis() > ahora
      ) {
        return false;
      }

      tx.update(llamadaRef, {
        whatsappEstado: "enviando",
        whatsappLeaseHasta: admin.firestore.Timestamp.fromMillis(
          ahora + TIEMPO_LEASE_MS
        ),
        whatsappIntentoEn: admin.firestore.FieldValue.serverTimestamp(),
      });

      return true;
    });

    if (!puedeEnviar) {
      logger.info("WhatsApp ya reclamado o llamada no habilitada", {
        llamadoId,
      });
      return;
    }

    const telefono = llamada.telefonoResidente;

    if (!telefono) {
      await llamadaRef.update({
        whatsappEstado: "sin_telefono",
        whatsappLeaseHasta: admin.firestore.FieldValue.delete(),
      });

      logger.warn("No hay teléfono para enviar WhatsApp", { llamadoId });
      return;
    }

    try {
      const phoneId = whatsappPhoneId.value();
      const token = whatsappToken.value();

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
              name: "hello_world",
              language: {
                code: "en_US",
              },
            },
          }),
        }
      );

      const resultadoMeta = await response.json();

      if (!response.ok || resultadoMeta.error) {
        throw new Error(
          resultadoMeta.error?.message ||
            `Meta devolvió HTTP ${response.status}`
        );
      }

      // Confirmar envío.
      await llamadaRef.update({
        whatsappEnviado: true,
        whatsappEstado: "enviado",
        whatsappEnviadoEn: admin.firestore.FieldValue.serverTimestamp(),
        whatsappMensajeId: resultadoMeta.messages?.[0]?.id || null,
        whatsappLeaseHasta: admin.firestore.FieldValue.delete(),
      });

      logger.info("WhatsApp enviado correctamente", {
        llamadoId,
        mensajeId: resultadoMeta.messages?.[0]?.id || null,
      });
    } catch (error) {
      // Liberar el bloqueo para permitir el reintento de Cloud Tasks.
      await llamadaRef.update({
        whatsappEstado: "pendiente",
        whatsappLeaseHasta: admin.firestore.FieldValue.delete(),
        whatsappError: error.message,
        whatsappUltimoErrorEn:
          admin.firestore.FieldValue.serverTimestamp(),
      });

      logger.error("Error enviando WhatsApp", {
        llamadoId,
        mensaje: error.message,
      });

      throw error;
    }
  }
);

// -----------------------------------------------------
// 3. UTILIDAD: MARCAR EVENTO COMO COMPLETADO
// -----------------------------------------------------

async function marcarProcesoCompletado(procesoRef, resultado) {
  await procesoRef.set(
    {
      estado: "completado",
      resultado,
      leaseHasta: admin.firestore.FieldValue.delete(),
      finalizado: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
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