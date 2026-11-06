//chatgpt

const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");

admin.initializeApp();

const db = admin.firestore();
const messaging = admin.messaging();

exports.notificarTimbre = onDocumentCreated(
  {
    document: "llamadas/{llamadoId}",

    // Mantener una instancia caliente.
    minInstances: 1,

    // Reintentar ante errores transitorios.
    retry: true
  },
  async (event) => {
    const inicio = Date.now();
    const snap = event.data;

    if (!snap) return;

    const llamada = snap.data();
    const llamadoId = event.params.llamadoId;

    const uf = String(llamada.uf ?? "");
    const edificioId = llamada.edificioId;

    if (!uf || !edificioId) {
      console.error("Llamada incompleta:", llamadoId);
      return;
    }

    // Control de duplicados con una reserva temporal.
    const procesoRef = db.collection("_pushProcesados").doc(event.id);
    const ahora = Date.now();
    let reservado = false;

    await db.runTransaction(async (tx) => {
      const proceso = await tx.get(procesoRef);

      if (proceso.exists) {
        const datos = proceso.data();

        if (datos.estado === "enviado") return;

        const vencimiento = datos.leaseHasta?.toMillis?.() || 0;

        if (vencimiento > ahora) return;
      }

      tx.set(procesoRef, {
        estado: "procesando",
        llamadoId,
        leaseHasta: admin.firestore.Timestamp.fromMillis(
          ahora + 120000
        ),
        actualizado: admin.firestore.FieldValue.serverTimestamp()
      });

      reservado = true;
    });

    if (!reservado) {
      console.log("Evento ya procesado o en ejecución:", event.id);
      return;
    }

    try {
      // 1. Buscar unidad.
      const unidades = await db
        .collection("unidades")
        .where("edificioId", "==", edificioId)
        .where("uf", "==", uf)
        .limit(2)
        .get();

      if (unidades.empty) {
        console.log("No existe unidad:", uf);
        await procesoRef.update({ estado: "enviado" });
        return;
      }

      if (unidades.size > 1) {
        throw new Error(`UF duplicada: ${uf}, edificio: ${edificioId}`);
      }

      const unidadDoc = unidades.docs[0];
      const unidad = unidadDoc.data();

      const destinatarios = [];

      // 2. Titular.
      if (
        unidad.fcmToken &&
        unidad.estadoCasa !== "fuera_de_casa"
      ) {
        destinatarios.push({
          token: unidad.fcmToken,
          ref: unidadDoc.ref
        });
      }

      // 3. Cohabitantes.
      const subUsuarios = await db
        .collection("sub_usuarios")
        .where("unidadId", "==", unidadDoc.id)
        .get();

      subUsuarios.forEach((doc) => {
        const sub = doc.data();

        if (sub.fcmToken) {
          destinatarios.push({
            token: sub.fcmToken,
            ref: doc.ref
          });
        }
      });

      // 4. Eliminar duplicados.
      const unicos = new Map();

      destinatarios.forEach((d) => {
        if (!unicos.has(d.token)) {
          unicos.set(d.token, d);
        }
      });

      const lista = [...unicos.values()];

      if (!lista.length) {
        console.log("Sin dispositivos:", uf);
        await procesoRef.update({ estado: "enviado" });
        return;
      }

      // 5. Configuración Web Push para PWA.
      const mensaje = {
        data: {
          title: "🔔 ¡Están tocando el timbre!",
          body: `Tenés una visita en la puerta (${llamada.tipo || "Visita"}).`,
          click_action:
            `https://portalbell.vercel.app/residente?uf=${encodeURIComponent(uf)}`,
          llamadoId: String(llamadoId),
          edificioId: String(edificioId),
          enviadoEn: String(Date.now())
        },

        webpush: {
          headers: {
            Urgency: "high",
            TTL: "60"
          }
        }
      };

      // 6. Enviar en grupos de hasta 500 tokens.
      let exitosas = 0;
      let fallidas = 0;

      for (let i = 0; i < lista.length; i += 500) {
        const grupo = lista.slice(i, i + 500);

        const respuesta = await messaging.sendEachForMulticast({
          ...mensaje,
          tokens: grupo.map((d) => d.token)
        });

        exitosas += respuesta.successCount;
        fallidas += respuesta.failureCount;

        // 7. Limpiar tokens inválidos.
        const limpieza = [];

        respuesta.responses.forEach((r, index) => {
          const codigo = r.error?.code;

          if (
            !r.success &&
            [
              "messaging/registration-token-not-registered",
              "messaging/invalid-registration-token"
            ].includes(codigo)
          ) {
            limpieza.push(
              grupo[index].ref.update({
                fcmToken: admin.firestore.FieldValue.delete()
              })
            );
          }
        });

        await Promise.all(limpieza);
      }

      // 8. Registrar resultado.
      await procesoRef.update({
        estado: "enviado",
        exitosas,
        fallidas,
        destinatarios: lista.length,
        finalizado: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log({
        llamadoId,
        uf,
        destinatarios: lista.length,
        exitosas,
        fallidas,
        duracionMs: Date.now() - inicio
      });

    } catch (error) {
      console.error("Error notificando timbre:", error);

      // Liberar la reserva para permitir el reintento.
      await procesoRef.delete().catch(() => {});

      throw error;
    }
  }
);

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