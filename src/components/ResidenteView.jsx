
import React, { useState, useEffect, useRef } from 'react';

import {
  db,
  solicitarPermisoNotificaciones,
  escucharMensajesPush
} from '../firebaseConfig/firebase';

import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  setDoc,
  deleteDoc,
  deleteField,
  doc,
  onSnapshot,
  orderBy,
  writeBatch
} from 'firebase/firestore';

export default function ResidenteView() {

  // =====================================================
  // 1. ESTADOS GENERALES
  // =====================================================

  const [ufData, setUfData] = useState(null);
  const [cargando, setCargando] = useState(true);

  const [estadoCasa, setEstadoCasa] = useState('en_casa');
  const [pushHabilitado, setPushHabilitado] = useState(false);
  const [procesandoPush, setProcesandoPush] = useState(false);

  // Cohabitantes
  const [subUsuarios, setSubUsuarios] = useState([]);
  const [nuevoSubNombre, setNuevoSubNombre] = useState('');
  const [nuevoSubRol, setNuevoSubRol] = useState('');
  const [nuevoSubTelefono, setNuevoSubTelefono] = useState('');

  // Llamadas y chat
  const [llamadaEntrante, setLlamadaEntrante] = useState(null);
  const [mensajesChat, setMensajesChat] = useState([]);
  const [nuevoMensaje, setNuevoMensaje] = useState('');

  // Videollamadas
  const [enVideollamada, setEnVideollamada] = useState(false);

  const localVideoRef = useRef(null);
  const callLocalVideoRef = useRef(null);
  const callRemoteVideoRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const iniciandoVideollamadaRef = useRef(false);

  // Visitantes frecuentes
  const [visitantesFrecuentes, setVisitantesFrecuentes] = useState([]);
  const [nuevoAlias, setNuevoAlias] = useState('');
  const [visitorIdAEditar, setVisitorIdAEditar] = useState('');

  // Historial
  const [historial, setHistorial] = useState([]);
  const [filtroFecha, setFiltroFecha] = useState('');

  const servers = {
    iceServers: [
      {
        urls: [
          'stun:stun1.l.google.com:19302',
          'stun:stun2.l.google.com:19302'
        ]
      }
    ]
  };

  const mensajesPredeterminados = [
    'Ya bajo',
    'No puedo bajar en este momento',
    'Dejalo en recepción por favor',
    'En 5 minutos bajo'
  ];

  // =====================================================
  // 2. IDENTIFICACIÓN DEL DISPOSITIVO
  // =====================================================

  const obtenerDeviceId = () => {

    let deviceId = localStorage.getItem('portal_device_id');

    if (!deviceId) {
      deviceId = crypto.randomUUID();

      localStorage.setItem('portal_device_id', deviceId);
    }

    return deviceId;
  };

  // =====================================================
  // 3. IDENTIFICAR TITULAR O COHABITANTE
  // =====================================================

 const obtenerContextoDispositivo = async (unidadId) => {
  const deviceId = obtenerDeviceId();
  const tokenAcceso = localStorage.getItem('portal_token');

  const unidadRef = doc(db, 'unidades', unidadId);
  const unidadSnap = await getDoc(unidadRef);

  if (!unidadSnap.exists()) {
    throw new Error('No se encontró la unidad.');
  }

  const datosUnidad = unidadSnap.data();

  // Primero comprobamos si el token corresponde al titular.
  if (tokenAcceso && tokenAcceso === datosUnidad.token) {
    return {
      ref: doc(db, 'unidades', unidadId, 'dispositivos', deviceId),
      deviceId,
      identidad: {
        tipoUsuario: 'titular',
        subUsuarioId: null
      }
    };
  }

  // Si no es el titular, buscamos al cohabitante.
  if (tokenAcceso) {
    const q = query(
      collection(db, 'sub_usuarios'),
      where('unidadId', '==', unidadId),
      where('token', '==', tokenAcceso)
    );

    const resultado = await getDocs(q);

    if (resultado.size !== 1) {
      throw new Error('No se pudo identificar al usuario.');
    }

    return {
      ref: doc(db, 'unidades', unidadId, 'dispositivos', deviceId),
      deviceId,
      identidad: {
        tipoUsuario: 'cohabitante',
        subUsuarioId: resultado.docs[0].id
      }
    };
  }

  throw new Error('No se encontró un token de acceso válido.');
};

  // =====================================================
  // 4. CARGAR ESTADO DEL DISPOSITIVO
  // =====================================================

  const cargarEstadoDispositivo = async (unidadId) => {

    try {

      const contexto = await obtenerContextoDispositivo(unidadId);

      const snapshot = await getDoc(contexto.ref);

      if (snapshot.exists()) {

        const dispositivo = snapshot.data();

        setEstadoCasa(dispositivo.estado || 'en_casa');

        setPushHabilitado(
          Boolean(dispositivo.fcmToken)
        );

      } else {

        setEstadoCasa('en_casa');
        setPushHabilitado(false);
      }

    } catch (error) {

      console.error(
        'Error recuperando dispositivo:',
        error
      );
    }
  };

  // =====================================================
  // 5. INICIALIZACIÓN
  // =====================================================

  useEffect(() => {

    const params = new URLSearchParams(window.location.search);

    const ufUrl = params.get('uf');
    const tokenUrl = params.get('token');

    if (ufUrl && tokenUrl) {

      localStorage.setItem('portal_uf', ufUrl);
      localStorage.setItem('portal_token', tokenUrl);

    } else if (ufUrl) {

      localStorage.setItem('portal_uf', ufUrl);
      localStorage.removeItem('portal_token');
    }

    const ufGuardada = localStorage.getItem('portal_uf');

    if (ufGuardada) {

      buscarDatosUnidad(ufGuardada);

    } else {

      setCargando(false);
    }

  }, []);

  // =====================================================
  // 6. BUSCAR UNIDAD
  // =====================================================

  const buscarDatosUnidad = async (ufBuscada) => {

    try {

      const q = query(
        collection(db, 'unidades'),
        where('uf', '==', ufBuscada)
      );

      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {

        const docEncontrado = querySnapshot.docs[0];

        const datosUnidad = {
          id: docEncontrado.id,
          ...docEncontrado.data()
        };

        setUfData(datosUnidad);

        await cargarEstadoDispositivo(docEncontrado.id);

        cargarSubUsuarios(docEncontrado.id);

        cargarVisitantesFrecuentes(docEncontrado.id);

        cargarHistorial(
          datosUnidad.edificioId,
          ufBuscada
        );
      }

    } catch (error) {

      console.error('Error buscando unidad:', error);

    } finally {

      setCargando(false);
    }
  };

  // =====================================================
  // 7. CAMBIAR PRESENCIA INDIVIDUAL
  // =====================================================

  const cambiarEstadoCasa = async (nuevoEstado) => {

    if (!ufData) return;

    try {

      const contexto = await obtenerContextoDispositivo(ufData.id);

      await setDoc(
        contexto.ref,
        {
          ...contexto.identidad,
          unidadId: ufData.id,
          deviceId: contexto.deviceId,
          estado: nuevoEstado,
          actualizado: new Date().toISOString()
        },
        { merge: true }
      );

      setEstadoCasa(nuevoEstado);

    } catch (error) {

      console.error(
        'Error al actualizar presencia:',
        error
      );

      alert('No se pudo actualizar tu estado de presencia.');
    }
  };

  // =====================================================
  //
  // =====================================================
  // 8. ACTIVAR / DESACTIVAR PUSH POR DISPOSITIVO
  // =====================================================

  const handleTogglePush = async () => {

    if (procesandoPush) return;

    try {

      setProcesandoPush(true);

      if (!ufData) {
        throw new Error('No se encontró la unidad funcional.');
      }

      const contexto = await obtenerContextoDispositivo(ufData.id);

      // -----------------------------------------------
      // DESACTIVAR PUSH
      // -----------------------------------------------

      if (pushHabilitado) {

        await setDoc(
          contexto.ref,
          {
            recibirPush: false,
            pushActualizado: new Date().toISOString()
          },
          { merge: true }
        );

        setPushHabilitado(false);

        alert('Notificaciones desactivadas en este dispositivo.');

        return;
      }

      // -----------------------------------------------
      // ACTIVAR PUSH
      // -----------------------------------------------

      const currentToken = await solicitarPermisoNotificaciones();

      if (!currentToken) {

        alert('No se pudo activar el servicio de notificaciones.');

        return;
      }

      await setDoc(
        contexto.ref,
        {
          ...contexto.identidad,
          unidadId: ufData.id,
          deviceId: contexto.deviceId,
          fcmToken: currentToken,
          estado: estadoCasa || 'en_casa',
          recibirPush: true,
          pushActualizado: new Date().toISOString()
        },
        { merge: true }
      );

      setPushHabilitado(true);

      alert('¡PortalBell está listo para recibir avisos!');

    } catch (error) {

      console.error(
        'Error activando/desactivando notificaciones:',
        error
      );

      alert(
        'No se pudo completar la operación: ' + error.message
      );

    } finally {

      setProcesandoPush(false);
    }
  };

  // =====================================================
  // 9. ESCUCHAR LLAMADAS ENTRANTES
  // =====================================================

  useEffect(() => {

    if (!ufData) return;

    const q = query(
      collection(db, 'llamadas'),
      where('edificioId', '==', ufData.edificioId),
      where('uf', '==', String(ufData.uf)),
      where('estado', '==', 'activo')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {

      if (!snapshot.empty) {

        const docLlamada = snapshot.docs[0];

        const datosLlamada = {
          id: docLlamada.id,
          ...docLlamada.data()
        };

        setLlamadaEntrante(datosLlamada);

        if (
          datosLlamada.tipo === 'video' &&
          !enVideollamada
        ) {
          iniciarVideollamadaEntrante(datosLlamada.id);
        }

      } else {

        setLlamadaEntrante(null);
        setMensajesChat([]);

        detenerCamaraSeguridad();
      }
    });

    return () => unsubscribe();

  }, [ufData, visitantesFrecuentes, enVideollamada]);

  // =====================================================
  // 10. ESCUCHAR PUSH EN PRIMER PLANO
  // =====================================================

  useEffect(() => {

    let cancelar = () => {};

    const iniciarEscuchaPush = async () => {

      cancelar = await escucharMensajesPush((payload) => {

        console.log(
          '[PortalBell] Push en primer plano:',
          payload
        );

        const data = payload.data || {};

        const titulo =
          data.title || '🔔 ¡Están tocando el timbre!';

        const cuerpo =
          data.body || 'Tenés una visita en la puerta.';

        navigator.serviceWorker.ready
          .then((registro) => {

            return registro.showNotification(titulo, {

              body: cuerpo,

              icon: '/pwa-192x192.png',

              badge: '/pwa-192x192.png',

              tag: `portalbell-${data.llamadoId || Date.now()}`,

              renotify: false,

              data: {
                url: data.click_action || '/residente'
              }
            });
          })
          .catch(console.error);
      });
    };

    iniciarEscuchaPush().catch(console.error);

    return () => cancelar();

  }, []);

  // =====================================================
  // 11. CARGAR COHABITANTES
  // =====================================================

  const cargarSubUsuarios = async (unidadId) => {

    try {

      const q = query(
        collection(db, 'sub_usuarios'),
        where('unidadId', '==', unidadId)
      );

      const querySnapshot = await getDocs(q);

      setSubUsuarios(
        querySnapshot.docs.map(d => ({
          id: d.id,
          ...d.data()
        }))
      );

    } catch (error) {

      console.error(error);
    }
  };

  // =====================================================
  // 12. VISITANTES FRECUENTES
  // =====================================================

  const cargarVisitantesFrecuentes = async (unidadId) => {

    try {

      const q = query(
        collection(db, 'visitantes_frecuentes'),
        where('unidadId', '==', unidadId)
      );

      const querySnapshot = await getDocs(q);

      setVisitantesFrecuentes(
        querySnapshot.docs.map(d => ({
          id: d.id,
          ...d.data()
        }))
      );

    } catch (error) {

      console.error(
        'Error cargando visitantes frecuentes:',
        error
      );
    }
  };

  // =====================================================
  // 13. HISTORIAL
  // =====================================================

  const cargarHistorial = async (edificioId, ufNombre) => {

    try {

      const q = query(
        collection(db, 'historial'),
        where('edificioId', '==', edificioId),
        where('uf', '==', String(ufNombre))
      );

      const querySnapshot = await getDocs(q);

      const lista = querySnapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));

      lista.sort(
        (a, b) => new Date(b.fecha) - new Date(a.fecha)
      );

      setHistorial(lista);

    } catch (error) {

      console.error('Error cargando historial:', error);
    }
  };

  const limpiarHistorial = async () => {

    if (historial.length === 0) {

      alert('No hay registros en el historial para borrar.');

      return;
    }

    if (
      window.confirm(
        '¿Estás seguro de que deseás borrar todo el historial de timbres? Esta acción no se puede deshacer.'
      )
    ) {

      try {

        const batch = writeBatch(db);

        historial.forEach((item) => {

          batch.delete(
            doc(db, 'historial', item.id)
          );
        });

        await batch.commit();

        setHistorial([]);

        alert('Historial borrado correctamente.');

      } catch (error) {

        console.error(
          'Error al limpiar el historial:',
          error
        );

        alert('Hubo un error al limpiar el historial.');
      }
    }
  };

  // =====================================================
  // 14. ALIAS DE VISITANTES
  // =====================================================

  const guardarAliasVisitante = async (visitorId, aliasText) => {

    try {

      const q = query(
        collection(db, 'visitantes_frecuentes'),
        where('unidadId', '==', ufData.id),
        where('visitorId', '==', visitorId)
      );

      const snapshot = await getDocs(q);

      if (!snapshot.empty) {

        const docId = snapshot.docs[0].id;

        await updateDoc(
          doc(db, 'visitantes_frecuentes', docId),
          { alias: aliasText }
        );

      } else {

        await addDoc(
          collection(db, 'visitantes_frecuentes'),
          {
            unidadId: ufData.id,
            edificioId: ufData.edificioId,
            visitorId,
            alias: aliasText,
            ultimaVisita: new Date().toISOString()
          }
        );
      }

      alert('Alias guardado correctamente.');

      cargarVisitantesFrecuentes(ufData.id);

      setVisitorIdAEditar('');
      setNuevoAlias('');

    } catch (error) {

      console.error('Error guardando alias:', error);
    }
  };

  const eliminarVisitanteFrecuente = async (id) => {

    if (window.confirm('¿Estás seguro de eliminar este registro de visitante?')) {

      try {

        await deleteDoc(
          doc(db, 'visitantes_frecuentes', id)
        );

        cargarVisitantesFrecuentes(ufData.id);

      } catch (error) {

        console.error('Error eliminando visitante:', error);
      }
    }
  };

  // =====================================================
  // 15. VIDEOLLAMADAS WEBRTC
  // =====================================================

 
const solicitarVideollamadaSeguridad = async () => {

  if (!llamadaEntrante) {
    alert(
      'No hay ninguna llamada o chat activo con un visitante en este momento.'
    );
    return;
  }

  try {

    const llamadaRef = doc(
      db,
      'llamadas',
      llamadaEntrante.id
    );

    await updateDoc(llamadaRef, {
      tipo: 'video'
    });

    setLlamadaEntrante(prev => ({
      ...prev,
      tipo: 'video'
    }));

    // No iniciamos WebRTC acá.
    // El onSnapshot detectará el cambio y lo iniciará una sola vez.

  } catch (error) {

    console.error(
      'Error al solicitar videollamada:',
      error
    );

    alert('No se pudo solicitar la videollamada.');
  }
};


  
const iniciarVideollamadaEntrante = async (callId) => {

  // Evita iniciar dos conexiones WebRTC simultáneamente.
  if (iniciandoVideollamadaRef.current) return;

  if (peerConnectionRef.current) return;

  iniciandoVideollamadaRef.current = true;

  setEnVideollamada(true);

  try {

    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });

    mediaStreamRef.current = stream;

    if (callLocalVideoRef.current) {
      callLocalVideoRef.current.srcObject = stream;
    }

    await conectarWebRTCResidente(callId, stream);

  } catch (error) {

    console.error(
      'Error al acceder a la cámara o iniciar WebRTC:',
      error
    );

    alert(
      'No se pudo iniciar la videollamada. Verificá los permisos de cámara y micrófono.'
    );

    detenerCamaraSeguridad(iniciandoVideollamadaRef.current = false);
  }
};

  const conectarWebRTCResidente = async (callId, localStream) => {

    try {

      const pc = new RTCPeerConnection(servers);

      peerConnectionRef.current = pc;

      localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
      });

      pc.ontrack = (event) => {

        if (callRemoteVideoRef.current) {

          callRemoteVideoRef.current.srcObject =
            event.streams[0] || new MediaStream([event.track]);
        }
      };

      const candidateCollection = collection(
        db,
        'llamadas',
        callId,
        'residentCandidates'
      );

      pc.onicecandidate = (event) => {

        if (event.candidate) {

          addDoc(
            candidateCollection,
            event.candidate.toJSON()
          ).catch(console.error);
        }
      };

      const callDocRef = doc(db, 'llamadas', callId);

      const unsubscribeOffer = onSnapshot(
        callDocRef,
        async (callSnap) => {

          if (callSnap.exists()) {

            const data = callSnap.data();

            if (data.offer && !pc.currentRemoteDescription) {

              try {

                await pc.setRemoteDescription(
                  new RTCSessionDescription(data.offer)
                );

                const answer = await pc.createAnswer();

                await pc.setLocalDescription(answer);

                await updateDoc(callDocRef, {
                  answer: {
                    type: answer.type,
                    sdp: answer.sdp
                  }
                });

                unsubscribeOffer();

              } catch (error) {

                console.error('Error procesando oferta WebRTC:', error);
              }
            }
          }
        }
      );

      const visitorCandidatesCol = collection(
        db,
        'llamadas',
        callId,
        'visitorCandidates'
      );

      onSnapshot(
        visitorCandidatesCol,
        (snapshot) => {

          snapshot.docChanges().forEach((change) => {

            if (change.type === 'added') {

              const candidate = new RTCIceCandidate(
                change.doc.data()
              );

              pc.addIceCandidate(candidate).catch(console.error);
            }
          });
        }
      );

    } catch (error) {

      console.error('Error WebRTC Residente:', error);
    }
  };

  const detenerCamaraSeguridad = () => {

    if (mediaStreamRef.current) {

      mediaStreamRef.current.getTracks().forEach(track => {
        track.stop();
      });

      mediaStreamRef.current = null;
    }

    if (peerConnectionRef.current) {

      peerConnectionRef.current.close();

      peerConnectionRef.current = null;
    }

    setEnVideollamada(false);
  };

  // =====================================================
  // 16. GESTIÓN DE COHABITANTES
  // =====================================================

  const agregarSubUsuario = async (e) => {

    e.preventDefault();

    if (subUsuarios.length >= 4) {

      alert(
        'Alcanzaste el límite máximo de 4 cohabitantes adicionales para tu unidad.'
      );

      return;
    }

    try {

      const tokenSub = btoa(
        `sub_${ufData.uf}_${Date.now()}`
      );

      await addDoc(
        collection(db, 'sub_usuarios'),
        {
          unidadId: ufData.id,
          uf: String(ufData.uf),
          nombre: nuevoSubNombre,
          rol: nuevoSubRol || 'Familiar',
          telefono: nuevoSubTelefono,
          token: tokenSub
        }
      );

      setNuevoSubNombre('');
      setNuevoSubRol('');
      setNuevoSubTelefono('');

      cargarSubUsuarios(ufData.id);

    } catch (error) {

      console.error('Error al crear cohabitante:', error);
    }
  };

  const enviarWhatsAppSubUsuario = (sub) => {

    const urlApp =
      `${window.location.origin}/residente?uf=${encodeURIComponent(ufData.uf)}&token=${encodeURIComponent(sub.token)}`;

    const texto =
      `¡Hola ${sub.nombre}! Acá tenés tu acceso personal al timbre inteligente de la UF ${ufData.uf}. Ingresá y agregalo a la pantalla de inicio de tu celu: ${urlApp}`;

    const urlWA =
      `https://api.whatsapp.com/send?phone=${sub.telefono}&text=${encodeURIComponent(texto)}`;

    window.open(urlWA, '_blank');
  };

  const eliminarSubUsuario = async (id) => {

    if (window.confirm('¿Eliminar este cohabitante?')) {

      try {

        await deleteDoc(
          doc(db, 'sub_usuarios', id)
        );

        cargarSubUsuarios(ufData.id);

      } catch (error) {

        console.error('Error eliminando cohabitante:', error);
      }
    }
  };

  // =====================================================
  // 17. CHAT Y RESPUESTAS RÁPIDAS
  // =====================================================

  useEffect(() => {

    if (!llamadaEntrante || llamadaEntrante.tipo !== 'chat') {
      return;
    }

    const q = query(
      collection(
        db,
        'llamadas',
        llamadaEntrante.id,
        'mensajes'
      ),
      orderBy('fecha', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {

      const msgs = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));

      setMensajesChat(msgs);
    });

    return () => unsubscribe();

  }, [llamadaEntrante?.id, llamadaEntrante?.tipo]);

  const enviarMensajeRapido = async (msg) => {

    if (!llamadaEntrante) return;

    try {

      await addDoc(
        collection(
          db,
          'llamadas',
          llamadaEntrante.id,
          'mensajes'
        ),
        {
          remitente: 'residente',
          texto: msg,
          fecha: new Date().toISOString()
        }
      );

      await addDoc(
        collection(db, 'historial'),
        {
          edificioId: ufData.edificioId,
          uf: String(ufData.uf),
          fecha: new Date().toISOString(),
          resultado: `Respuesta rápida: ${msg}`
        }
      );

      cargarHistorial(
        ufData.edificioId,
        ufData.uf
      );

      alert(`Mensaje enviado al visitante: "${msg}"`);

    } catch (error) {

      console.error('Error enviando mensaje rápido:', error);
    }
  };

  const enviarMensajeChat = async (e) => {

    e.preventDefault();

    if (!nuevoMensaje.trim() || !llamadaEntrante) return;

    try {

      await addDoc(
        collection(
          db,
          'llamadas',
          llamadaEntrante.id,
          'mensajes'
        ),
        {
          remitente: 'residente',
          texto: nuevoMensaje,
          fecha: new Date().toISOString()
        }
      );

      setNuevoMensaje('');

    } catch (error) {

      console.error('Error enviando mensaje:', error);
    }
  };

  // =====================================================
  // 18. FINALIZAR LLAMADA
  // =====================================================

  const finalizarLlamada = async () => {

    if (llamadaEntrante) {

      try {

        const llamadaRef = doc(
          db,
          'llamadas',
          llamadaEntrante.id
        );

        await updateDoc(llamadaRef, {
          estado: 'finalizado'
        });

        await addDoc(
          collection(db, 'historial'),
          {
            edificioId: ufData.edificioId,
            uf: String(ufData.uf),
            fecha: new Date().toISOString(),
            resultado: `Llamada finalizada (${llamadaEntrante.tipo})`
          }
        );

        cargarHistorial(
          ufData.edificioId,
          ufData.uf
        );

      } catch (error) {

        console.error('Error finalizando llamada:', error);
      }
    }

    setLlamadaEntrante(null);

    detenerCamaraSeguridad();
  };

  // =====================================================
  // 19. ESTADOS DE CARGA
  // =====================================================

  if (cargando) {

    return (
      <div style={{
        padding: '20px',
        textAlign: 'center',
        fontFamily: 'sans-serif'
      }}>
        Cargando panel de residente...
      </div>
    );
  }

  if (!ufData) {

    return (
      <div style={{
        padding: '20px',
        textAlign: 'center',
        maxWidth: '400px',
        margin: '40px auto',
        fontFamily: 'sans-serif'
      }}>
        <h2>⚠️ Acceso no configurado</h2>

        <p>
          No se detectó una Unidad Funcional válida.
          Ingresá a través del enlace personalizado
          que recibiste por WhatsApp.
        </p>
      </div>
    );
  }

  // =====================================================
  // 20. DATOS PARA LA VISTA
  // =====================================================

  const historialFiltrado = historial.filter(item => {

    if (!filtroFecha) return true;

    return item.fecha?.startsWith(filtroFecha);
  });

  const visitanteConocido = visitantesFrecuentes.find(
    v => v.visitorId === llamadaEntrante?.visitorId
  );

  const nombreVisitanteMostrado =
    visitanteConocido?.alias ||
    (
      llamadaEntrante?.visitorId
        ? `Dispositivo (${llamadaEntrante.visitorId.substring(0, 8)}...)`
        : 'Visitante Anónimo'
    );

  // =====================================================
  // 21. INTERFAZ
  // =====================================================

  return (

    <div style={{
      padding: '15px',
      maxWidth: '600px',
      margin: '0 auto',
      fontFamily: 'sans-serif'
    }}>

      <h2>Panel Residente - UF {ufData.uf}</h2>

      <p style={{
        color: '#555',
        fontSize: '14px'
      }}>
        <strong>Titular:</strong> {ufData.nombre} {ufData.apellido}
        {' | '}
        <strong>Piso:</strong> {ufData.piso}
        {' - '}
        <strong>Depto:</strong> {ufData.departamento}
      </p>

      {/* ============================================= */}
      {/* LLAMADA ENTRANTE */}
      {/* ============================================= */}

      {llamadaEntrante && (

        <div style={{
          background: '#d4edda',
          border: '2px solid #28a745',
          padding: '15px',
          borderRadius: '8px',
          marginBottom: '20px',
          textAlign: 'center'
        }}>

          <h3 style={{
            color: '#155724',
            margin: '0 0 10px 0'
          }}>
            🔔 ¡Están tocando el timbre!
          </h3>

          <p style={{
            fontSize: '15px',
            marginBottom: '5px'
          }}>
            Visitante: <strong>{nombreVisitanteMostrado}</strong>
          </p>

          <p style={{
            fontSize: '14px',
            marginBottom: '10px'
          }}>
            Visita en puerta solicitando:
            {' '}
            <strong>
              {llamadaEntrante.tipo === 'video'
                ? 'Videollamada 📹'
                : 'Chat Rápido 💬'}
            </strong>
          </p>

          {llamadaEntrante.tipo === 'chat' ? (

            <div>

              <div style={{
                textAlign: 'left',
                background: 'white',
                padding: '10px',
                borderRadius: '6px',
                marginBottom: '10px'
              }}>

                <div style={{
                  height: '150px',
                  overflowY: 'auto',
                  border: '1px solid #eee',
                  padding: '8px',
                  marginBottom: '10px',
                  background: '#fafafa',
                  borderRadius: '4px'
                }}>

                  {mensajesChat.map((m, i) => (

                    <div
                      key={m.id || i}
                      style={{
                        marginBottom: '8px',
                        textAlign: m.remitente === 'residente'
                          ? 'right'
                          : 'left'
                      }}
                    >

                      <span style={{
                        display: 'inline-block',
                        background: m.remitente === 'residente'
                          ? '#28a745'
                          : '#e9ecef',
                        color: m.remitente === 'residente'
                          ? 'white'
                          : 'black',
                        padding: '6px 10px',
                        borderRadius: '8px',
                        fontSize: '13px'
                      }}>
                        {m.texto}
                      </span>

                    </div>
                  ))}

                </div>

                <form
                  onSubmit={enviarMensajeChat}
                  style={{
                    display: 'flex',
                    gap: '5px'
                  }}
                >

                  <input
                    type="text"
                    placeholder="Escribile al visitante..."
                    value={nuevoMensaje}
                    onChange={e => setNuevoMensaje(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: '4px',
                      border: '1px solid #ccc'
                    }}
                  />

                  <button
                    type="submit"
                    style={{
                      background: '#28a745',
                      color: 'white',
                      border: 'none',
                      padding: '8px 12px',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    Enviar
                  </button>

                </form>

              </div>

              <button
                onClick={solicitarVideollamadaSeguridad}
                style={{
                  background: '#17a2b8',
                  color: 'white',
                  border: 'none',
                  padding: '10px 15px',
                  borderRadius: '5px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  width: '100%',
                  marginBottom: '10px'
                }}
              >
                📹 Solicitar Videollamada al Visitante
              </button>

            </div>

          ) : (

            <div>

              <div style={{
                background: '#000',
                borderRadius: '6px',
                overflow: 'hidden',
                marginBottom: '10px',
                position: 'relative',
                height: '180px'
              }}>

                <video
                  ref={callRemoteVideoRef}
                  autoPlay
                  playsInline
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover'
                  }}
                />

                <div style={{
                  position: 'absolute',
                  bottom: '8px',
                  left: '8px',
                  background: 'rgba(0,0,0,0.6)',
                  color: 'white',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '11px'
                }}>
                  👤 Visitante en puerta
                </div>

              </div>

              <div style={{
                background: '#222',
                borderRadius: '6px',
                overflow: 'hidden',
                position: 'relative',
                height: '90px',
                width: '120px',
                margin: '0 auto 10px auto'
              }}>

                <video
                  ref={callLocalVideoRef}
                  autoPlay
                  playsInline
                  muted
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover'
                  }}
                />

                <div style={{
                  position: 'absolute',
                  bottom: '4px',
                  left: '4px',
                  background: 'rgba(0,0,0,0.6)',
                  color: 'white',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontSize: '9px'
                }}>
                  Tu cámara
                </div>

              </div>

            </div>
          )}

          <button
            onClick={finalizarLlamada}
            style={{
              background: '#dc3545',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '5px',
              fontWeight: 'bold',
              cursor: 'pointer',
              width: '100%',
              marginTop: '5px'
            }}
          >
            📵 Cortar / Atendido
          </button>

        </div>
      )}

      {/* ============================================= */}
      {/* PRESENCIA Y NOTIFICACIONES */}
      {/* ============================================= */}

      <div style={{
        background: '#e9ecef',
        padding: '15px',
        borderRadius: '8px',
        marginBottom: '15px'
      }}>

        <h3>⚙️ Presencia y Alertas</h3>

        <div style={{
          display: 'flex',
          gap: '10px',
          marginBottom: '12px'
        }}>

          <button
            onClick={() => cambiarEstadoCasa('en_casa')}
            style={{
              flex: 1,
              padding: '10px',
              background: estadoCasa === 'en_casa'
                ? '#28a745'
                : '#ccc',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            🏠 Estoy en Casa
          </button>

          <button
            onClick={() => cambiarEstadoCasa('fuera_de_casa')}
            style={{
              flex: 1,
              padding: '10px',
              background: estadoCasa === 'fuera_de_casa'
                ? '#dc3545'
                : '#ccc',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            🚶‍♂️ Fuera de Casa
          </button>

        </div>

        <label style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          cursor: procesandoPush ? 'wait' : 'pointer',
          background: 'white',
          padding: '10px',
          borderRadius: '5px'
        }}>

          <input
            type="checkbox"
            checked={pushHabilitado}
            disabled={procesandoPush}
            onChange={handleTogglePush}
            style={{
              width: '18px',
              height: '18px'
            }}
          />

          <span style={{
            fontSize: '14px',
            fontWeight: 'bold'
          }}>
            {procesandoPush
              ? 'Procesando...'
              : '🔔 Activar Notificaciones Push'}
          </span>

        </label>

        <p style={{
          fontSize: '11px',
          color: '#666',
          marginBottom: 0
        }}>
          El estado de presencia y las notificaciones se configuran
          únicamente para este dispositivo.
        </p>

      </div>

      {/* ============================================= */}
      {/* MENSAJES PREDETERMINADOS */}
      {/* ============================================= */}

      <div style={{
        background: '#e2f0d9',
        padding: '15px',
        borderRadius: '8px',
        marginBottom: '15px'
      }}>

        <h3 style={{ margin: '0 0 5px 0' }}>
          💬 Mensajes Predeterminados
        </h3>

        <p style={{
          fontSize: '13px',
          color: '#555'
        }}>
          Respuestas rápidas para enviar al visitante:
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '8px'
        }}>

          {mensajesPredeterminados.map((msg, index) => (

            <button
              key={index}
              onClick={() => enviarMensajeRapido(msg)}
              disabled={!llamadaEntrante}
              style={{
                padding: '10px',
                color: 'black',
                background: '#17a2b8',
                border: '1px solid #28a745',
                borderRadius: '4px',
                cursor: llamadaEntrante ? 'pointer' : 'not-allowed',
                textAlign: 'left',
                fontSize: '12px',
                opacity: llamadaEntrante ? 1 : 0.6
              }}
            >
              💬 {msg}
            </button>

          ))}

        </div>

      </div>

      {/* ============================================= */}
      {/* COHABITANTES */}
      {/* ============================================= */}

      <div style={{
        background: '#f8f9fa',
        padding: '15px',
        borderRadius: '8px',
        marginBottom: '15px',
        border: '1px solid #ddd'
      }}>

        <h3>
          👥 Cohabitantes de la UF ({subUsuarios.length}/4)
        </h3>

        {subUsuarios.length < 4 && (

          <form
            onSubmit={agregarSubUsuario}
            style={{
              display: 'flex',
              gap: '8px',
              marginBottom: '10px',
              flexWrap: 'wrap'
            }}
          >

            <input
              type="text"
              placeholder="Nombre y Apellido"
              value={nuevoSubNombre}
              onChange={e => setNuevoSubNombre(e.target.value)}
              required
              style={{
                flex: 2,
                padding: '8px'
              }}
            />

            <input
              type="text"
              placeholder="Rol (Ej: Pareja, Hijo)"
              value={nuevoSubRol}
              onChange={e => setNuevoSubRol(e.target.value)}
              style={{
                flex: 1,
                padding: '8px'
              }}
            />

            <input
              type="text"
              placeholder="Celular (54911...)"
              value={nuevoSubTelefono}
              onChange={e => setNuevoSubTelefono(e.target.value)}
              required
              style={{
                flex: 1.5,
                padding: '8px'
              }}
            />

            <button
              type="submit"
              style={{
                background: '#007bff',
                color: 'white',
                border: 'none',
                padding: '8px 12px',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Agregar
            </button>

          </form>
        )}

        <ul style={{
          paddingLeft: '20px',
          margin: 0
        }}>

          {subUsuarios.map(sub => (

            <li
              key={sub.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '6px',
                background: 'white',
                padding: '6px',
                borderRadius: '4px'
              }}
            >

              <span>
                <strong>{sub.nombre}</strong>
                {' '}({sub.rol})
                {' '} - 📞 {sub.telefono}
              </span>

              <div style={{
                display: 'flex',
                gap: '5px'
              }}>

                <button
                  onClick={() => enviarWhatsAppSubUsuario(sub)}
                  title="Enviar link por WhatsApp"
                  style={{
                    background: '#25D366',
                    color: 'white',
                    border: 'none',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  📲
                </button>

                <button
                  onClick={() => eliminarSubUsuario(sub.id)}
                  style={{
                    background: '#dc3545',
                    color: 'white',
                    border: 'none',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  🗑️
                </button>

              </div>

            </li>

          ))}

        </ul>

      </div>

      {/* ============================================= */}
      {/* VISITANTES FRECUENTES */}
      {/* ============================================= */}

      <div style={{
        background: '#f8f9fa',
        padding: '15px',
        borderRadius: '8px',
        marginBottom: '15px',
        border: '1px solid #ddd'
      }}>

        <h3>🏷️ Dispositivos y Visitas Frecuentes</h3>

        <p style={{
          fontSize: '13px',
          color: '#666'
        }}>
          Asigná un alias o eliminá los dispositivos registrados:
        </p>

        <div style={{
          maxHeight: '180px',
          overflowY: 'auto',
          background: 'white',
          padding: '8px',
          borderRadius: '4px',
          border: '1px solid #eee'
        }}>

          {visitantesFrecuentes.length > 0 ? (

            <ul style={{
              paddingLeft: 0,
              listStyle: 'none',
              margin: 0
            }}>

              {visitantesFrecuentes.map(vf => (

                <li
                  key={vf.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '8px',
                    borderBottom: '1px solid #f1f1f1',
                    paddingBottom: '6px'
                  }}
                >

                  <div style={{
                    overflow: 'hidden',
                    marginRight: '10px'
                  }}>

                    <strong>
                      {vf.alias || 'Sin alias'}
                    </strong>

                    <div style={{
                      fontSize: '11px',
                      color: '#888'
                    }}>
                      ID: {vf.visitorId}
                    </div>

                  </div>

                  <div style={{
                    display: 'flex',
                    gap: '5px',
                    flexShrink: 0
                  }}>

                    {visitorIdAEditar === vf.visitorId ? (

                      <div style={{
                        display: 'flex',
                        gap: '4px'
                      }}>

                        <input
                          type="text"
                          placeholder="Ej: Hijo..."
                          value={nuevoAlias}
                          onChange={e => setNuevoAlias(e.target.value)}
                          style={{
                            padding: '4px',
                            fontSize: '12px',
                            width: '90px'
                          }}
                        />

                        <button
                          onClick={() => guardarAliasVisitante(
                            vf.visitorId,
                            nuevoAlias
                          )}
                          style={{
                            background: '#28a745',
                            color: 'white',
                            border: 'none',
                            padding: '4px 6px',
                            borderRadius: '4px',
                            cursor: 'pointer'
                          }}
                        >
                          💾
                        </button>

                      </div>

                    ) : (

                      <button
                        onClick={() => {
                          setVisitorIdAEditar(vf.visitorId);
                          setNuevoAlias(vf.alias || '');
                        }}
                        style={{
                          background: '#007bff',
                          color: 'white',
                          border: 'none',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '12px'
                        }}
                      >
                        ✏️ Editar
                      </button>

                    )}

                    <button
                      onClick={() => eliminarVisitanteFrecuente(vf.id)}
                      title="Eliminar dispositivo"
                      style={{
                        background: '#dc3545',
                        color: 'white',
                        border: 'none',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      🗑️
                    </button>

                  </div>

                </li>

              ))}

            </ul>

          ) : (

            <p style={{
              fontSize: '13px',
              color: '#666',
              textAlign: 'center',
              margin: '20px 0'
            }}>
              Aún no hay registros en visitantes frecuentes.
            </p>

          )}

        </div>

      </div>

      {/* ============================================= */}
      {/* HISTORIAL */}
      {/* ============================================= */}

      <div style={{
        background: '#fff3cd',
        padding: '15px',
        borderRadius: '8px',
        border: '1px solid #ffeeba'
      }}>

        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '10px',
          flexWrap: 'wrap',
          gap: '8px'
        }}>

          <h3 style={{ margin: 0 }}>
            📋 Historial de Timbre
          </h3>

          <div style={{
            display: 'flex',
            gap: '5px',
            alignItems: 'center'
          }}>

            <input
              type="date"
              value={filtroFecha}
              onChange={e => setFiltroFecha(e.target.value)}
              style={{
                padding: '5px',
                borderRadius: '4px',
                border: '1px solid #ccc'
              }}
            />

            {historial.length > 0 && (

              <button
                onClick={limpiarHistorial}
                title="Limpiar todo el historial"
                style={{
                  background: '#dc3545',
                  color: 'white',
                  border: 'none',
                  padding: '6px 10px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 'bold'
                }}
              >
                🗑️ Limpiar
              </button>

            )}

          </div>

        </div>

        <div style={{
          maxHeight: '150px',
          overflowY: 'auto',
          background: 'white',
          padding: '8px',
          borderRadius: '4px'
        }}>

          {historialFiltrado.length > 0 ? (

            historialFiltrado.map((h, i) => (

              <div
                key={h.id || i}
                style={{
                  borderBottom: '1px solid #eee',
                  padding: '5px 0',
                  fontSize: '13px'
                }}
              >
                🕒 {h.fecha
                  ? new Date(h.fecha).toLocaleString()
                  : 'Reciente'}
                {' - '}
                <strong>{h.resultado}</strong>
              </div>

            ))

          ) : (

            <p style={{
              textAlign: 'center',
              color: '#666',
              fontSize: '13px'
            }}>
              No hay registros para la fecha seleccionada.
            </p>

          )}

        </div>

      </div>

    </div>
  );
}

/*import React, { useState, useEffect, useRef } from 'react';
import { db, solicitarPermisoNotificaciones, escucharMensajesPush } from '../firebaseConfig/firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, doc, deleteDoc, onSnapshot, orderBy, writeBatch } from 'firebase/firestore';
//import { getMessaging, getToken } from 'firebase/messaging';

export default function ResidenteView() {
  const [ufData, setUfData] = useState(null);
  const [cargando, setCargando] = useState(true);
  
  // Estados del Residente
  const [estadoCasa, setEstadoCasa] = useState('en_casa');
  const [pushHabilitado, setPushHabilitado] = useState(false);
  
  // Gestión de Sub-usuarios (Cohabitantes con WhatsApp y Token)
  const [subUsuarios, setSubUsuarios] = useState([]);
  const [nuevoSubNombre, setNuevoSubNombre] = useState('');
  const [nuevoSubRol, setNuevoSubRol] = useState('');
  const [nuevoSubTelefono, setNuevoSubTelefono] = useState('');

  // Llamadas Entrantes y Chat en tiempo real
  const [llamadaEntrante, setLlamadaEntrante] = useState(null);
  const [mensajesChat, setMensajesChat] = useState([]);
  const [nuevoMensaje, setNuevoMensaje] = useState('');

  // Videollamada activa y WebRTC
  const [enVideollamada, setEnVideollamada] = useState(false);
  const localVideoRef = useRef(null);           
  const callLocalVideoRef = useRef(null);       
  const callRemoteVideoRef = useRef(null);      
  const mediaStreamRef = useRef(null);
  const peerConnectionRef = useRef(null);

  // Base de datos de Visitantes y Alias
  const [visitantesFrecuentes, setVisitantesFrecuentes] = useState([]);
  const [nuevoAlias, setNuevoAlias] = useState('');
  const [visitorIdAEditar, setVisitorIdAEditar] = useState('');

  // Historial y Filtro
  const [historial, setHistorial] = useState([]);
  const [filtroFecha, setFiltroFecha] = useState('');

  const servers = {
    iceServers: [
      { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }
    ]
  };

  const mensajesPredeterminados = [
    "Ya bajo",
    "No puedo bajar en este momento",
    "Dejalo en recepción por favor",
    "En 5 minutos bajo"
  ];

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'granted') {
      setPushHabilitado(true);
    }

    const params = new URLSearchParams(window.location.search);
    let ufUrl = params.get('uf');
    let tokenUrl = params.get('token');

    if (ufUrl && tokenUrl) {
      localStorage.setItem('portal_uf', ufUrl);
      localStorage.setItem('portal_token', tokenUrl);
    }

    const ufGuardada = localStorage.getItem('portal_uf');
    
    if (ufGuardada) {
      buscarDatosUnidad(ufGuardada);
    } else {
      setCargando(false);
    }
  }, []);

  // Escuchar llamadas entrantes de visitantes en tiempo real
  useEffect(() => {
    if (!ufData) return;

    const q = query(
      collection(db, 'llamadas'),
      where('edificioId', '==', ufData.edificioId),
      where('uf', '==', String(ufData.uf)),
      where('estado', '==', 'activo')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const docLlamada = snapshot.docs[0];
        const datosLlamada = { id: docLlamada.id, ...docLlamada.data() };
        setLlamadaEntrante(datosLlamada);

        if (datosLlamada.tipo === 'video' && !enVideollamada) {
          iniciarVideollamadaEntrante(datosLlamada.id);
        }
        
        /*if (Notification.permission === 'granted') {
          const visitanteConocido = visitantesFrecuentes.find(v => v.visitorId === datosLlamada.visitorId);
          const nombreAviso = visitanteConocido?.alias || 'Visitante';
          new Notification("🔔 ¡Están tocando el timbre!", {
            body: `${nombreAviso} está en la puerta (${datosLlamada.tipo}).`
          });
        }*//*
      } else {
        setLlamadaEntrante(null);
        setMensajesChat([]);
        detenerCamaraSeguridad();
      }
    });

    return () => unsubscribe();
  }, [ufData, visitantesFrecuentes, enVideollamada]);

  //useEffect de chatgpt
  
useEffect(() => {
  let cancelar = () => {};

  const iniciarEscuchaPush = async () => {
    cancelar = await escucharMensajesPush((payload) => {
      console.log("[PortalBell] Push en primer plano:", payload);

      const data = payload.data || {};

      const titulo =
        data.title || "🔔 ¡Están tocando el timbre!";

      const cuerpo =
        data.body || "Tenés una visita en la puerta.";

      navigator.serviceWorker.ready.then((registro) => {
        return registro.showNotification(titulo, {
          body: cuerpo,
          icon: "/pwa-192x192.png",
          badge: "/pwa-192x192.png",
          tag: `portalbell-${data.llamadoId || Date.now()}`,
          renotify: false,
          data: {
            url: data.click_action || "/residente"
          }
        });
      }).catch(console.error);
    });
  };

  iniciarEscuchaPush().catch(console.error);

  return () => cancelar();
}, []);


  // Escuchar mensajes del chat en tiempo real
  useEffect(() => {
    if (!llamadaEntrante || llamadaEntrante.tipo !== 'chat') return;

    const q = query(collection(db, 'llamadas', llamadaEntrante.id, 'mensajes'), orderBy('fecha', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setMensajesChat(msgs);
    });

    return () => unsubscribe();
  }, [llamadaEntrante?.id]);

  const buscarDatosUnidad = async (ufBuscada) => {
    try {
      const q = query(collection(db, 'unidades'), where('uf', '==', ufBuscada));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const docEncontrado = querySnapshot.docs[0];
        const datosUnidad = { id: docEncontrado.id, ...docEncontrado.data() };
        setUfData(datosUnidad);
        cargarSubUsuarios(docEncontrado.id);
        cargarVisitantesFrecuentes(docEncontrado.id);
        cargarHistorial(datosUnidad.edificioId, ufBuscada);
      }
    } catch (error) {
      console.error("Error buscando unidad:", error);
    } finally {
      setCargando(false);
    }
  };
  
  const cargarSubUsuarios = async (unidadId) => {
    try {
      const q = query(collection(db, 'sub_usuarios'), where('unidadId', '==', unidadId));
      const querySnapshot = await getDocs(q);
      setSubUsuarios(querySnapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    }
  };
  
  const cargarVisitantesFrecuentes = async (unidadId) => {
    try {
      const q = query(collection(db, 'visitantes_frecuentes'), where('unidadId', '==', unidadId));
      const querySnapshot = await getDocs(q);
      const lista = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setVisitantesFrecuentes(lista);
    } catch (e) {
      console.error("Error cargando visitantes frecuentes:", e);
    }
  };

  // Cargar historial de manera precisa filtrando por edificioId y uf
  const cargarHistorial = async (edificioId, ufNombre) => {
    try {
      const q = query(
        collection(db, 'historial'), 
        where('edificioId', '==', edificioId),
        where('uf', '==', String(ufNombre))
      );
      const querySnapshot = await getDocs(q);
      const lista = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      // Ordenar por fecha descendente (más reciente primero)
      lista.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
      setHistorial(lista);
    } catch (e) {
      console.error("Error cargando historial:", e);
    }
  };

  // Función para limpiar todo el historial de la UF
  const limpiarHistorial = async () => {
    if (historial.length === 0) {
      alert("No hay registros en el historial para borrar.");
      return;
    }

    if (window.confirm("¿Estás seguro de que deseás borrar todo el historial de timbres? Esta acción no se puede deshacer.")) {
      try {
        const batch = writeBatch(db);
        historial.forEach((item) => {
          const docRef = doc(db, 'historial', item.id);
          batch.delete(docRef);
        });
        await batch.commit();
        setHistorial([]);
        alert("Historial borrado correctamente.");
      } catch (error) {
        console.error("Error al limpiar el historial:", error);
        alert("Hubo un error al limpiar el historial.");
      }
    }
  };

  const cambiarEstadoCasa = async (nuevoEstado) => {
    setEstadoCasa(nuevoEstado);
    if (ufData) {
      try {
        await updateDoc(doc(db, 'unidades', ufData.id), {
          estado: nuevoEstado,
        });
      } catch (error) {
        console.error("Error al actualizar estado en casa:", error);
      }
    }
  };

  const guardarAliasVisitante = async (visitorId, aliasText) => {
    try {
      const q = query(
        collection(db, 'visitantes_frecuentes'), 
        where('unidadId', '==', ufData.id),
        where('visitorId', '==', visitorId)
      );
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        const docId = snapshot.docs[0].id;
        await updateDoc(doc(db, 'visitantes_frecuentes', docId), { alias: aliasText });
      } else {
        await addDoc(collection(db, 'visitantes_frecuentes'), {
          unidadId: ufData.id,
          edificioId: ufData.edificioId,
          visitorId: visitorId,
          alias: aliasText,
          ultimaVisita: new Date().toISOString()
        });
      }
      alert("Alias guardado correctamente.");
      cargarVisitantesFrecuentes(ufData.id);
      setVisitorIdAEditar('');
      setNuevoAlias('');
    } catch (error) {
      console.error("Error guardando alias:", error);
    }
  };

  const eliminarVisitanteFrecuente = async (id) => {
    if (window.confirm("¿Estás seguro de eliminar este registro de visitante?")) {
      try {
        await deleteDoc(doc(db, 'visitantes_frecuentes', id));
        cargarVisitantesFrecuentes(ufData.id);
      } catch (error) {
        console.error("Error al eliminar visitante:", error);
      }
    }
  };

  const solicitarVideollamadaSeguridad = async () => {
    if (!llamadaEntrante) {
      alert("No hay ninguna llamada o chat activo con un visitante en este momento para elevar a videollamada.");
      return;
    }

    try {
      const llamadaRef = doc(db, 'llamadas', llamadaEntrante.id);
      await updateDoc(llamadaRef, { tipo: 'video' });
      
      setLlamadaEntrante(prev => ({ ...prev, tipo: 'video' }));
      iniciarVideollamadaEntrante(llamadaEntrante.id);
    } catch (error) {
      console.error("Error al solicitar videollamada:", error);
      alert("No se pudo iniciar la videollamada.");
    }
  };

  const iniciarVideollamadaEntrante = async (callId) => {
    setEnVideollamada(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      mediaStreamRef.current = stream;
      if (callLocalVideoRef.current) {
        callLocalVideoRef.current.srcObject = stream;
      }
      conectarWebRTCResidente(callId, stream);
    } catch (err) {
      console.error("Error al acceder a la cámara en llamada entrante:", err);
      alert("No se pudo acceder a la cámara. Verificá los permisos del navegador.");
    }
  };

  const conectarWebRTCResidente = async (callId, localStream) => {
    try {
      const pc = new RTCPeerConnection(servers);
      peerConnectionRef.current = pc;

      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

      pc.ontrack = (event) => {
        if (callRemoteVideoRef.current) {
          callRemoteVideoRef.current.srcObject = event.streams[0] || new MediaStream([event.track]);
        }
      };

      const candidateCollection = collection(db, 'llamadas', callId, 'residentCandidates');
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          addDoc(candidateCollection, event.candidate.toJSON());
        }
      };

      const callDocRef = doc(db, 'llamadas', callId);
      const unsubscribeOffer = onSnapshot(callDocRef, async (callSnap) => {
        if (callSnap.exists()) {
          const data = callSnap.data();
          if (data.offer && !pc.currentRemoteDescription) {
            await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            await updateDoc(callDocRef, {
              answer: { type: answer.type, sdp: answer.sdp }
            });
            unsubscribeOffer();
          }
        }
      });

      const visitorCandidatesCol = collection(db, 'llamadas', callId, 'visitorCandidates');
      onSnapshot(visitorCandidatesCol, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const candidate = new RTCIceCandidate(change.doc.data());
            pc.addIceCandidate(candidate).catch(e => console.error(e));
          }
        });
      });

    } catch (err) {
      console.error("Error WebRTC Residente:", err);
    }
  };

  const detenerCamaraSeguridad = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    setEnVideollamada(false);
  };

  
const handleTogglePush = async () => {
  if (pushHabilitado) {
    // Desactivar visualmente no elimina el token del servidor.
    setPushHabilitado(false);
    return;
  }

  try {
    if (!ufData) {
      throw new Error("No se encontró la unidad funcional.");
    }

    const currentToken = await solicitarPermisoNotificaciones();

    if (!currentToken) {
      alert("No se pudo activar el servicio de notificaciones.");
      return;
    }

    // Identificar si ingresó el titular o un cohabitante.
    const tokenAcceso = localStorage.getItem("portal_token");

    if (tokenAcceso) {
      const q = query(
        collection(db, "sub_usuarios"),
        where("unidadId", "==", ufData.id),
        where("token", "==", tokenAcceso)
      );

      const resultado = await getDocs(q);

      if (resultado.empty) {
        throw new Error(
          "No se encontró el cohabitante asociado al acceso."
        );
      }

      if (resultado.size > 1) {
        throw new Error("El acceso del cohabitante no es único.");
      }

      await updateDoc(
        doc(db, "sub_usuarios", resultado.docs[0].id),
        {
          fcmToken: currentToken,
          pushActualizado: new Date().toISOString()
        }
      );

      console.log("Push registrado para cohabitante.");

    } else {
      // El titular guarda su token en unidades.
      await updateDoc(doc(db, "unidades", ufData.id), {
        fcmToken: currentToken,
        pushActualizado: new Date().toISOString()
      });

      console.log("Push registrado para titular.");
    }

    setPushHabilitado(true);

    alert("¡PortalBell está listo para recibir avisos!");

  } catch (error) {
    console.error("Error activando notificaciones:", error);
    alert("No se pudieron activar las notificaciones: " + error.message);
  }
};

  /*const handleTogglePush = async () => {
    if (!pushHabilitado) {
      try {
        if (!('Notification' in window)) {
          alert("Tu navegador no soporta notificaciones push.");
          return;
        }
        const permiso = await Notification.requestPermission();
        if (permiso === 'granted') {
          const messaging = getMessaging();
          const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
          
          if (vapidKey && ufData) {
            const currentToken = await getToken(messaging, { vapidKey });
            if (currentToken) {
              await updateDoc(doc(db, 'unidades', ufData.id), {
                fcmToken: currentToken
              });
              console.log("Token FCM guardado correctamente en la UF:", currentToken);
            }
          }
          setPushHabilitado(true);
          alert("¡Notificaciones push activadas correctamente!");
        } else {
          alert("Debes permitir las notificaciones para recibir alertas de timbre.");
        }
      } catch (error) {
        console.error("Error al registrar push:", error);
      }
    } else {
      setPushHabilitado(false);
    }
  };

  const agregarSubUsuario = async (e) => {
    e.preventDefault();
    if (subUsuarios.length >= 4) {
      alert("Alcanzaste el límite máximo de 4 cohabitantes adicionales para tu unidad.");
      return;
    }
    try {
      const tokenSub = btoa(`sub_${ufData.uf}_${Date.now()}`);
      await addDoc(collection(db, 'sub_usuarios'), {
        unidadId: ufData.id,
        uf: String(ufData.uf),
        nombre: nuevoSubNombre,
        rol: nuevoSubRol || 'Familiar',
        telefono: nuevoSubTelefono,
        token: tokenSub
      });
      setNuevoSubNombre('');
      setNuevoSubRol('');
      setNuevoSubTelefono('');
      cargarSubUsuarios(ufData.id);
    } catch (error) {
      console.error("Error al crear cohabitante:", error);
    }
  };

  const enviarWhatsAppSubUsuario = (sub) => {
    const urlApp = `${window.location.origin}/residente?uf=${ufData.uf}&token=${sub.token}`;
    const texto = `¡Hola ${sub.nombre}! Acá tenés tu acceso personal al timbre inteligente de la UF ${ufData.uf}. Ingresá y agregalo a la pantalla de inicio de tu celu: ${urlApp}`;
    const urlWA = `https://api.whatsapp.com/send?phone=${sub.telefono}&text=${encodeURIComponent(texto)}`;
    window.open(urlWA, '_blank');
  };

  const eliminarSubUsuario = async (id) => {
    if (window.confirm("¿Eliminar este cohabitante?")) {
      await deleteDoc(doc(db, 'sub_usuarios', id));
      cargarSubUsuarios(ufData.id);
    }
  };

  const enviarMensajeRapido = async (msg) => {
    if (llamadaEntrante) {
      try {
        await addDoc(collection(db, 'llamadas', llamadaEntrante.id, 'mensajes'), {
          remitente: 'residente',
          texto: msg,
          fecha: new Date().toISOString()
        });
      } catch (e) {
        console.error(e);
      }
    }
    alert(`Mensaje enviado al visitante: "${msg}"`);
    try {
      await addDoc(collection(db, 'historial'), {
        edificioId: ufData.edificioId,
        uf: String(ufData.uf),
        fecha: new Date().toISOString(),
        resultado: `Respuesta rápida: ${msg}`
      });
      cargarHistorial(ufData.edificioId, ufData.uf);
    } catch (e) {
      console.error(e);
    }
  };

  const enviarMensajeChat = async (e) => {
    e.preventDefault();
    if (!nuevoMensaje.trim() || !llamadaEntrante) return;

    try {
      await addDoc(collection(db, 'llamadas', llamadaEntrante.id, 'mensajes'), {
        remitente: 'residente',
        texto: nuevoMensaje,
        fecha: new Date().toISOString()
      });
      setNuevoMensaje('');
    } catch (error) {
      console.error("Error enviando mensaje:", error);
    }
  };

  const finalizarLlamada = async () => {
    if (llamadaEntrante) {
      try {
        const llamadaRef = doc(db, 'llamadas', llamadaEntrante.id);
        await updateDoc(llamadaRef, { estado: 'finalizado' });

        // Registrar en el historial de forma automática al finalizar
        await addDoc(collection(db, 'historial'), {
          edificioId: ufData.edificioId,
          uf: String(ufData.uf),
          fecha: new Date().toISOString(),
          resultado: `Llamada finalizada (${llamadaEntrante.tipo})`
        });
        cargarHistorial(ufData.edificioId, ufData.uf);

      } catch (error) {
        console.error("Error al finalizar llamada:", error);
      }
    }
    setLlamadaEntrante(null);
    detenerCamaraSeguridad();
  };

  if (cargando) return <div style={{ padding: '20px', textAlign: 'center', fontFamily: 'sans-serif' }}>Cargando panel de residente...</div>;

  if (!ufData) return (
    <div style={{ padding: '20px', textAlign: 'center', maxWidth: '400px', margin: '40px auto', fontFamily: 'sans-serif' }}>
      <h2>⚠️ Acceso no configurado</h2>
      <p>No se detectó una Unidad Funcional válida. Ingresá a través del enlace personalizado que recibiste por WhatsApp.</p>
    </div>
  );

  const historialFiltrado = historial.filter(item => {
    if (!filtroFecha) return true;
    return item.fecha?.startsWith(filtroFecha);
  });

  const visitanteConocido = visitantesFrecuentes.find(v => v.visitorId === llamadaEntrante?.visitorId);
  const nombreVisitanteMostrado = visitanteConocido?.alias || (llamadaEntrante?.visitorId ? `Dispositivo (${llamadaEntrante.visitorId.substring(0, 8)}...)` : 'Visitante Anónimo');

  return (
    <div style={{ padding: '15px', maxWidth: '600px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h2>Panel Residente - UF {ufData.uf}</h2>
      <p style={{ color: '#555', fontSize: '14px' }}>
        <strong>Titular:</strong> {ufData.nombre} {ufData.apellido} | <strong>Piso:</strong> {ufData.piso} - <strong>Depto:</strong> {ufData.departamento}
      </p>

      {/* SECCIÓN DE LLAMADA ENTRANTE (EN TIEMPO REAL) }
      {llamadaEntrante && (
        <div style={{ background: '#d4edda', border: '2px solid #28a745', padding: '15px', borderRadius: '8px', marginBottom: '20px', textAlign: 'center' }}>
          <h3 style={{ color: '#155724', margin: '0 0 10px 0' }}>🔔 ¡Están tocando el timbre!</h3>
          <p style={{ fontSize: '15px', marginBottom: '5px' }}>
            Visitante: <strong>{nombreVisitanteMostrado}</strong>
          </p>
          <p style={{ fontSize: '14px', marginBottom: '10px' }}>Visita en puerta solicitando: <strong>{llamadaEntrante.tipo === 'video' ? 'Videollamada 📹' : 'Chat Rápido 💬'}</strong></p>

          {llamadaEntrante.tipo === 'chat' ? (
            <div>
              <div style={{ textAlign: 'left', background: 'white', padding: '10px', borderRadius: '6px', marginBottom: '10px' }}>
                <div style={{ height: '150px', overflowY: 'auto', border: '1px solid #eee', padding: '8px', marginBottom: '10px', background: '#fafafa', borderRadius: '4px' }}>
                  {mensajesChat.map((m, i) => (
                    <div key={i} style={{ marginBottom: '8px', textAlign: m.remitente === 'residente' ? 'right' : 'left' }}>
                      <span style={{ display: 'inline-block', background: m.remitente === 'residente' ? '#28a745' : '#e9ecef', color: m.remitente === 'residente' ? 'white' : 'black', padding: '6px 10px', borderRadius: '8px', fontSize: '13px' }}>
                        {m.texto}
                      </span>
                    </div>
                  ))}
                </div>
                <form onSubmit={enviarMensajeChat} style={{ display: 'flex', gap: '5px' }}>
                  <input 
                    type="text" 
                    placeholder="Escribile al visitante..." 
                    value={nuevoMensaje} 
                    onChange={e => setNuevoMensaje(e.target.value)}
                    style={{ flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                  />
                  <button type="submit" style={{ background: '#28a745', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer' }}>Enviar</button>
                </form>
              </div>

              <button 
                onClick={solicitarVideollamadaSeguridad} 
                style={{ background: '#17a2b8', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer', width: '100%', marginBottom: '10px' }}
              >
                📹 Solicitar Videollamada al Visitante
              </button>
            </div>
          ) : (
            <div>
              <div style={{ background: '#000', borderRadius: '6px', overflow: 'hidden', marginBottom: '10px', position: 'relative', height: '180px' }}>
                <video ref={callRemoteVideoRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <div style={{ position: 'absolute', bottom: '8px', left: '8px', background: 'rgba(0,0,0,0.6)', color: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '11px' }}>
                  👤 Visitante en puerta
                </div>
              </div>

              <div style={{ background: '#222', borderRadius: '6px', overflow: 'hidden', position: 'relative', height: '90px', width: '120px', margin: '0 auto 10px auto' }}>
                <video ref={callLocalVideoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <div style={{ position: 'absolute', bottom: '4px', left: '4px', background: 'rgba(0,0,0,0.6)', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '9px' }}>
                  Tu cámara
                </div>
              </div>
            </div>
          )}

          <button 
            onClick={finalizarLlamada} 
            style={{ background: '#dc3545', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer', width: '100%', marginTop: '5px' }}
          >
            📵 Cortar / Atendido
          </button>
        </div>
      )}

      {/* 1. ESTADO CASA Y NOTIFICACIONES PUSH }
      <div style={{ background: '#e9ecef', padding: '15px', borderRadius: '8px', marginBottom: '15px' }}>
        <h3>⚙️ Presencia y Alertas</h3>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
          <button 
            onClick={() => cambiarEstadoCasa('en_casa')}
            style={{ flex: 1, padding: '10px', background: estadoCasa === 'en_casa' ? '#28a745' : '#ccc', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            🏠 Estoy en Casa
          </button>
          <button 
            onClick={() => cambiarEstadoCasa('fuera_de_casa')}
            style={{ flex: 1, padding: '10px', background: estadoCasa === 'fuera_de_casa' ? '#dc3545' : '#ccc', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            🚶‍♂️ Fuera de Casa
          </button>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', background: 'white', padding: '10px', borderRadius: '5px' }}>
          <input type="checkbox" checked={pushHabilitado} onChange={handleTogglePush} style={{ width: '18px', height: '18px' }} />
          <span style={{ fontSize: '14px', fontWeight: 'bold' }}>🔔 Activar Notificaciones Push</span>
        </label>
      </div>

      {/* 2. MENSAJES PREDETERMINADOS }
      <div style={{ background: '#e2f0d9', padding: '15px', borderRadius: '8px', marginBottom: '15px' }}>
        <h3 style={{ margin: '0 0 5px 0' }}>💬 Mensajes Predeterminados</h3>
        <p style={{ fontSize: '13px', color: '#555' }}>Respuestas rápidas para enviar al visitante:</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          {mensajesPredeterminados.map((msg, index) => (
            <button key={index} onClick={() => enviarMensajeRapido(msg)} style={{ padding: '8px', background: '#17a2b8', border: '1px solid #28a745', borderRadius: '4px', cursor: 'pointer', textAlign: 'left', fontSize: '12px' }}>
              💬 {msg}
            </button>
          ))}
        </div>
      </div>

      {/* 3. GESTIÓN DE COHABITANTES CON WHATSAPP }
      <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '8px', marginBottom: '15px', border: '1px solid #ddd' }}>
        <h3>👥 Cohabitantes de la UF ({subUsuarios.length}/4)</h3>
        
        {subUsuarios.length < 4 && (
          <form onSubmit={agregarSubUsuario} style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
            <input type="text" placeholder="Nombre y Apellido" value={nuevoSubNombre} onChange={e => setNuevoSubNombre(e.target.value)} required style={{ flex: 2, padding: '8px' }} />
            <input type="text" placeholder="Rol (Ej: Pareja, Hijo)" value={nuevoSubRol} onChange={e => setNuevoSubRol(e.target.value)} style={{ flex: 1, padding: '8px' }} />
            <input type="text" placeholder="Celular (54911...)" value={nuevoSubTelefono} onChange={e => setNuevoSubTelefono(e.target.value)} required style={{ flex: 1.5, padding: '8px' }} />
            <button type="submit" style={{ background: '#007bff', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer' }}>Agregar</button>
          </form>
        )}

        <ul style={{ paddingLeft: '20px', margin: 0 }}>
          {subUsuarios.map(sub => (
            <li key={sub.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', background: 'white', padding: '6px', borderRadius: '4px' }}>
              <span><strong>{sub.nombre}</strong> ({sub.rol}) - 📞 {sub.telefono}</span>
              <div style={{ display: 'flex', gap: '5px' }}>
                <button onClick={() => enviarWhatsAppSubUsuario(sub)} title="Enviar link por WhatsApp" style={{ background: '#25D366', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}>📲</button>
                <button onClick={() => eliminarSubUsuario(sub.id)} style={{ background: '#dc3545', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}>🗑️</button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* 5. GESTIÓN DE DISPOSITIVOS / VISITANTES FRECUENTES }
      <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '8px', marginBottom: '15px', border: '1px solid #ddd' }}>
        <h3>🏷️ Dispositivos y Visitas Frecuentes</h3>
        <p style={{ fontSize: '13px', color: '#666' }}>Asigná un alias o eliminá los dispositivos registrados:</p>
        
        <div style={{ maxHeight: '180px', overflowY: 'auto', background: 'white', padding: '8px', borderRadius: '4px', border: '1px solid #eee' }}>
          {visitantesFrecuentes.length > 0 ? (
            <ul style={{ paddingLeft: '0', listStyle: 'none', margin: 0 }}>
              {visitantesFrecuentes.map(vf => (
                <li key={vf.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', borderBottom: '1px solid #f1f1f1', paddingBottom: '6px' }}>
                  <div style={{ overflow: 'hidden', marginRight: '10px' }}>
                    <strong>{vf.alias || 'Sin alias'}</strong>
                    <div style={{ fontSize: '11px', color: '#888' }}>ID: {vf.visitorId}</div>
                  </div>
                  
                  <div style={{ display: 'flex', gap: '5px', flexShrink: 0 }}>
                    {visitorIdAEditar === vf.visitorId ? (
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <input 
                          type="text" 
                          placeholder="Ej: Hijo..." 
                          value={nuevoAlias} 
                          onChange={e => setNuevoAlias(e.target.value)}
                          style={{ padding: '4px', fontSize: '12px', width: '90px' }}
                        />
                        <button onClick={() => guardarAliasVisitante(vf.visitorId, nuevoAlias)} style={{ background: '#28a745', color: 'white', border: 'none', padding: '4px 6px', borderRadius: '4px', cursor: 'pointer' }}>💾</button>
                      </div>
                    ) : (
                      <button onClick={() => { setVisitorIdAEditar(vf.visitorId); setNuevoAlias(vf.alias || ''); }} style={{ background: '#007bff', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>✏️ Editar</button>
                    )}
                    <button onClick={() => eliminarVisitanteFrecuente(vf.id)} title="Eliminar dispositivo" style={{ background: '#dc3545', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>🗑️</button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ fontSize: '13px', color: '#666', textAlign: 'center', margin: '20px 0' }}>Aún no hay dispositivos registrados que hayan tocado el timbre.</p>
          )}
        </div>
      </div>

      {/* 4. HISTORIAL Y FILTRO POR FECHA CON BOTÓN DE LIMPIEZA }
      <div style={{ background: '#fff3cd', padding: '15px', borderRadius: '8px', border: '1px solid #ffeeba' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
          <h3 style={{ margin: 0 }}>📋 Historial de Timbre</h3>
          <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
            <input type="date" value={filtroFecha} onChange={e => setFiltroFecha(e.target.value)} style={{ padding: '5px', borderRadius: '4px', border: '1px solid #ccc' }} />
            {historial.length > 0 && (
              <button 
                onClick={limpiarHistorial} 
                title="Limpiar todo el historial"
                style={{ background: '#dc3545', color: 'white', border: 'none', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
              >
                🗑️ Limpiar
              </button>
            )}
          </div>
        </div>

        <div style={{ maxHeight: '150px', overflowY: 'auto', background: 'white', padding: '8px', borderRadius: '4px' }}>
          {historialFiltrado.length > 0 ? (
            historialFiltrado.map((h, i) => (
              <div key={i} style={{ borderBottom: '1px solid #eee', padding: '5px 0', fontSize: '13px' }}>
                🕒 {h.fecha ? new Date(h.fecha).toLocaleString() : 'Reciente'} - <strong>{h.resultado}</strong>
              </div>
            ))
          ) : (
            <p style={{ textAlign: 'center', color: '#666', fontSize: '13px' }}>No hay registros para la fecha seleccionada.</p>
          )}
        </div>
      </div>
    </div>
  );
}*/