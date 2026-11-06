//chatgpt


const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

const db = admin.firestore();
const messaging = admin.messaging();

const COLECCION_PROCESADOS = "_pushProcesados";
const TIEMPO_LEASE_MS = 2 * 60 * 1000;
const MAX_TOKENS_POR_ENVIO = 500;

// -----------------------------------------------------
// PROCESAMIENTO DE UNA LLAMADA NUEVA
// -----------------------------------------------------

exports.enviarNotificacionLlamada = onDocumentCreated(
  {
    document: "llamadas/{llamadoId}",
    region: "southamerica-east1",
    retry: true
    
  },
  async (event) => {
    const llamadoId = event.params.llamadoId;
    const llamada = event.data?.data();

    if (!llamada) {
      logger.warn("La llamada no contiene información", { llamadoId });
      return;
    }

    const { edificioId, uf } = llamada;

    if (!edificioId || !uf) {
      logger.warn("La llamada no tiene edificioId o UF", {
        llamadoId,
        edificioId,
        uf,
      });
      return;
    }

    const eventoId = event.id;
    const procesoRef = db.collection(COLECCION_PROCESADOS).doc(eventoId);

    // -------------------------------------------------
    // 1. CONTROL DE DUPLICADOS
    // -------------------------------------------------

    const puedeProcesar = await db.runTransaction(async (tx) => {
      const procesoSnap = await tx.get(procesoRef);
      const ahora = Date.now();

      if (procesoSnap.exists) {
        const proceso = procesoSnap.data();

        if (proceso.estado === "completado") {
          return false;
        }

        const leaseHasta = proceso.leaseHasta?.toMillis?.() || 0;

        if (
          proceso.estado === "procesando" &&
          leaseHasta > ahora
        ) {
          return false;
        }
      }

      tx.set(
        procesoRef,
        {
          estado: "procesando",
          llamadoId,
          edificioId,
          uf,
          inicio: admin.firestore.FieldValue.serverTimestamp(),
          leaseHasta: admin.firestore.Timestamp.fromMillis(
            ahora + TIEMPO_LEASE_MS
          ),
        },
        { merge: true }
      );

      return true;
    });

    if (!puedeProcesar) {
      logger.info("Evento duplicado o ya procesándose", {
        llamadoId,
        eventoId,
      });
      return;
    }

    try {
      // -----------------------------------------------
      // 2. BUSCAR LA UNIDAD
      // -----------------------------------------------

      const unidadQuery = await db
        .collection("unidades")
        .where("edificioId", "==", edificioId)
        .where("uf", "==", uf)
        .limit(1)
        .get();

      if (unidadQuery.empty) {
        logger.warn("No se encontró la unidad", {
          llamadoId,
          edificioId,
          uf,
        });

        await marcarProcesoCompletado(procesoRef, "unidad_no_encontrada");
        return;
      }

      const unidadDoc = unidadQuery.docs[0];
      const unidadId = unidadDoc.id;

      // -----------------------------------------------
      // 3. BUSCAR LOS DISPOSITIVOS DE ESA UNIDAD
      // -----------------------------------------------

      const dispositivosSnap = await db
        .collection("unidades")
        .doc(unidadId)
        .collection("dispositivos")
        .get();

      if (dispositivosSnap.empty) {
        logger.info("La unidad no tiene dispositivos registrados", {
          llamadoId,
          unidadId,
        });

        await marcarProcesoCompletado(procesoRef, "sin_dispositivos");
        return;
      }

      // -----------------------------------------------
      // 4. FILTRAR DISPOSITIVOS HABILITADOS
      // -----------------------------------------------

      const dispositivosHabilitados = dispositivosSnap.docs.filter(
        (doc) => {
          const dispositivo = doc.data();

          return (
            dispositivo.recibirPush === true &&
            dispositivo.estado === "en_casa" &&
            typeof dispositivo.fcmToken === "string" &&
            dispositivo.fcmToken.trim().length > 0
          );
        }
      );

      if (dispositivosHabilitados.length === 0) {
        logger.info("No hay dispositivos habilitados para recibir push", {
          llamadoId,
          unidadId,
          totalDispositivos: dispositivosSnap.size,
        });

        await marcarProcesoCompletado(procesoRef, "sin_destinatarios");
        return;
      }

      // -----------------------------------------------
      // 5. AGRUPAR TOKENS SIN DUPLICAR
      // -----------------------------------------------

      // Un mismo token puede aparecer en más de un documento.
      // Lo enviamos una sola vez y conservamos todas sus referencias
      // para poder limpiar tokens inválidos.

      const tokensMap = new Map();

      for (const doc of dispositivosHabilitados) {
        const dispositivo = doc.data();
        const token = dispositivo.fcmToken.trim();

        if (!tokensMap.has(token)) {
          tokensMap.set(token, {
            token,
            documentos: [],
          });
        }

        tokensMap.get(token).documentos.push(doc.ref);
      }

      const destinatarios = Array.from(tokensMap.values());

      logger.info("Destinatarios preparados", {
        llamadoId,
        unidadId,
        dispositivosHabilitados: dispositivosHabilitados.length,
        tokensUnicos: destinatarios.length,
      });

      // -----------------------------------------------
      // 6. PREPARAR EL MENSAJE
      // -----------------------------------------------

      const nombreVisitante =
        llamada.nombreVisitante ||
        llamada.visitanteNombre ||
        llamada.nombre ||
        "";

      const titulo = "🔔PortalBell";

      const cuerpo = nombreVisitante
        ? `🔔 ${nombreVisitante} está en tu puerta`
        :  "🔔 ¡Están tocando el timbre!";

      const mensajeBase = {
        data: {
          title: titulo,
          body: cuerpo,
          click_action: "/",
          llamadoId: String(llamadoId),
          edificioId: String(edificioId),
          uf: String(uf),
        },
        webpush: {
          headers: {
            Urgency: "high",
            TTL: "60",
          },
        },
      };

      // -----------------------------------------------
      // 7. ENVIAR EN LOTES DE HASTA 500 TOKENS
      // -----------------------------------------------

      let enviados = 0;
      let fallidos = 0;
      let tokensInvalidos = 0;

      for (
        let inicio = 0;
        inicio < destinatarios.length;
        inicio += MAX_TOKENS_POR_ENVIO
      ) {
        const lote = destinatarios.slice(
          inicio,
          inicio + MAX_TOKENS_POR_ENVIO
        );

        const response = await messaging.sendEachForMulticast({
          ...mensajeBase,
          tokens: lote.map((item) => item.token),
        });

        enviados += response.successCount;
        fallidos += response.failureCount;

        // ---------------------------------------------
        // 8. LIMPIAR TOKENS INVÁLIDOS
        // ---------------------------------------------

        const limpiezas = [];

        response.responses.forEach((resultado, index) => {
          if (resultado.success) {
            return;
          }

          const codigo = resultado.error?.code;
          const esTokenInvalido =
            codigo === "messaging/invalid-registration-token" ||
            codigo === "messaging/registration-token-not-registered";

          if (!esTokenInvalido) {
            logger.warn("Error al enviar notificación", {
              llamadoId,
              codigo,
              mensaje: resultado.error?.message,
            });
            return;
          }

          tokensInvalidos++;

          const destinatario = lote[index];

          for (const dispositivoRef of destinatario.documentos) {
            limpiezas.push(
              dispositivoRef.set(
                {
                  fcmToken: admin.firestore.FieldValue.delete(),
                  recibirPush: false,
                  actualizado:
                    admin.firestore.FieldValue.serverTimestamp(),
                },
                { merge: true }
              )
            );
          }
        });

        if (limpiezas.length > 0) {
          await Promise.all(limpiezas);
        }
      }

      // -----------------------------------------------
      // 9. REGISTRAR RESULTADO
      // -----------------------------------------------

      await procesoRef.set(
        {
          estado: "completado",
          resultado: "finalizado",
          dispositivosHabilitados: dispositivosHabilitados.length,
          tokensUnicos: destinatarios.length,
          enviados,
          fallidos,
          tokensInvalidos,
          finalizado: admin.firestore.FieldValue.serverTimestamp(),
          leaseHasta: admin.firestore.Timestamp.fromMillis(0),
        },
        { merge: true }
      );

      logger.info("Proceso de notificaciones finalizado", {
        llamadoId,
        unidadId,
        enviados,
        fallidos,
        tokensInvalidos,
      });
    } catch (error) {
      logger.error("Error procesando notificación de llamada", {
        llamadoId,
        eventoId,
        error: error.message,
        stack: error.stack,
      });

      // Liberamos el bloqueo para permitir un nuevo intento.
      await procesoRef.set(
        {
          estado: "error",
          error: error.message || "Error desconocido",
          leaseHasta: admin.firestore.Timestamp.fromMillis(0),
          ultimoError: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      throw error;
    }
  }
);

// -----------------------------------------------------
// FUNCIÓN AUXILIAR: MARCAR PROCESO COMPLETADO
// -----------------------------------------------------

async function marcarProcesoCompletado(procesoRef, resultado) {
  await procesoRef.set(
    {
      estado: "completado",
      resultado,
      finalizado: admin.firestore.FieldValue.serverTimestamp(),
      leaseHasta: admin.firestore.Timestamp.fromMillis(0),
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