// DATOS DE DEMOSTRACIÓN FICTICIOS. No representan locales, personas ni datos reales de Restalia.
// Se sustituirán por los datos de Notion y Microsoft 365 cuando ChatGPT entregue IDs y esquemas.
// Generado en parte con DeepSeek V4 Pro (OpenWork) y revisado a mano.
// d(offsetDías, 'HH:MM') → fecha ISO relativa a hoy, para que la demo esté siempre «al día».

const T = (rows, keys) => rows.map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i]])));

export function buildDemo(d) {
  const locales = T([
    ['loc-01', 'DEMO · Local Centro 01', 'Marca Demo A', 'DEMO-001', 'Calle Ejemplo 12', 'Madrid', 40.4168, -3.7038, 'Responsable Demo 1', 'Abierto', '2019-05-10', 'Local de referencia con el mayor volumen de la zona centro.'],
    ['loc-02', 'DEMO · Local Norte 02', 'Marca Demo B', 'DEMO-002', 'Calle Ejemplo 34', 'Barcelona', 41.3974, 2.1786, 'Responsable Demo 2', 'Abierto', '2018-11-20', 'Terraza amplia y alto tránsito durante los fines de semana.'],
    ['loc-03', 'DEMO · Local Sur 03', 'Marca Demo C', 'DEMO-003', 'Calle Ejemplo 56', 'Valencia', 39.4599, -0.3663, 'Responsable Demo 3', 'Abierto', '2020-02-14', 'Referente de servicio en sala de la zona sur.'],
    ['loc-04', 'DEMO · Local Este 04', 'Marca Demo A', 'DEMO-004', 'Calle Ejemplo 78', 'Sevilla', 37.3791, -5.9745, 'Responsable Demo 4', 'Abierto', '2019-09-03', 'Bodega amplia y buena rotación de producto.'],
    ['loc-05', 'DEMO · Local Oeste 05', 'Marca Demo B', 'DEMO-005', 'Calle Ejemplo 90', 'Málaga', 36.7113, -4.4314, 'Responsable Demo 5', 'Abierto', '2017-06-15', 'Alto volumen en temporada alta por su ubicación.'],
    ['loc-06', 'DEMO · Local Marítimo 06', 'Marca Demo C', 'DEMO-006', 'Calle Ejemplo 12', 'Zaragoza', 41.6388, -0.8791, 'Responsable Demo 6', 'Abierto', '2016-03-08', 'Local consolidado con un equipo estable.'],
    ['loc-07', 'DEMO · Local Parque 07', 'Marca Demo A', 'DEMO-007', 'Calle Ejemplo 23', 'Madrid', 40.4268, -3.6938, 'Responsable Demo 7', 'Abierto', '2021-07-01', 'Necesita refuerzo en los estándares de limpieza.'],
    ['loc-08', 'DEMO · Local Ensanche 08', 'Marca Demo B', 'DEMO-008', 'Calle Ejemplo 45', 'Barcelona', 41.4074, 2.1886, 'Responsable Demo 8', 'En obras', '2019-05-10', 'En reforma de imagen, con reapertura prevista próximamente.'],
    ['loc-09', 'DEMO · Local Polígono 09', 'Marca Demo C', 'DEMO-009', 'Calle Ejemplo 67', 'Valencia', 39.4499, -0.3763, 'Responsable Demo 9', 'Abierto', '2020-10-12', 'Enfocado al servicio rápido en horario de comidas.'],
    ['loc-10', 'DEMO · Local Casco Antiguo 10', 'Marca Demo A', 'DEMO-010', 'Calle Ejemplo 89', 'Sevilla', 37.3991, -5.9845, 'Responsable Demo 10', 'Abierto', '2018-04-25', 'Alta afluencia turística que exige control de calidad.'],
    ['loc-11', 'DEMO · Local Estación 11', 'Marca Demo B', 'DEMO-011', 'Calle Ejemplo 11', 'Málaga', 36.7313, -4.4114, 'Responsable Demo 11', 'Próxima apertura', '2027-01-15', 'Pendiente de permisos y del montaje final.'],
    ['loc-12', 'DEMO · Local Ronda 12', 'Marca Demo C', 'DEMO-012', 'Calle Ejemplo 22', 'Zaragoza', 41.6588, -0.8691, 'Responsable Demo 12', 'Temporalmente cerrado', '2015-09-18', 'Cerrado temporalmente por obras en el acceso.'],
  ], ['id', 'nombre', 'marca', 'codigo', 'direccion', 'ciudad', 'lat', 'lng', 'responsable', 'estado', 'apertura', 'info']);

  const ev = (id, titulo, tipo, day, ini, fin, localId, ubicacion, responsable, estado) => ({ id, titulo, tipo, inicio: d(day, ini), fin: d(day, fin), localId, ubicacion, responsable, estado });
  const eventos = [
    ev('ev-01', 'Reunión semanal de operaciones', 'reunion', 0, '09:00', '10:00', null, 'Teams', 'Alberto', 'Confirmado'),
    ev('ev-02', 'Visita al local centro', 'visita', 0, '11:30', '12:30', 'loc-01', 'DEMO · Local Centro 01', 'Alberto', 'Confirmado'),
    ev('ev-03', 'Auditoría de limpieza', 'auditoria', 0, '13:00', '14:00', 'loc-02', 'DEMO · Local Norte 02', 'Alberto', 'Pendiente'),
    ev('ev-04', 'Revisión de tareas pendientes', 'tarea', 0, '16:00', '16:45', null, 'Oficina central DEMO', 'Alberto', 'Confirmado'),
    ev('ev-06', 'Límite: informe mensual de visitas', 'limite', 0, '17:00', '17:30', null, 'Oficina central DEMO', 'Alberto', 'Pendiente'),
    ev('ev-05', 'Seguimiento de la incidencia INC-0001', 'seguimiento', 0, '18:00', '18:30', 'loc-02', 'DEMO · Local Norte 02', 'Responsable Demo 2', 'Confirmado'),
    ev('ev-07', 'Reunión con responsables de zona', 'reunion', 1, '10:00', '11:00', null, 'Teams', 'Alberto', 'Confirmado'),
    ev('ev-08', 'Visita al local este', 'visita', 1, '12:00', '13:00', 'loc-04', 'DEMO · Local Este 04', 'Alberto', 'Pendiente'),
    ev('ev-09', 'Seguimiento de formación en sala', 'seguimiento', 1, '15:00', '16:00', 'loc-05', 'DEMO · Local Oeste 05', 'Responsable Demo 5', 'Confirmado'),
    ev('ev-10', 'Cierre de auditoría mensual', 'auditoria', -2, '09:00', '10:30', 'loc-06', 'DEMO · Local Marítimo 06', 'Alberto', 'Completado'),
    ev('ev-11', 'Reunión de planificación', 'reunion', -3, '11:00', '12:00', null, 'Oficina central DEMO', 'Alberto', 'Completado'),
    ev('ev-12', 'Visita sin aviso', 'visita', -5, '10:00', '11:00', 'loc-07', 'DEMO · Local Parque 07', 'Alberto', 'Completado'),
    ev('ev-13', 'Revisión de presupuestos de reforma', 'reunion', -6, '09:30', '10:30', null, 'Teams', 'Responsable Demo 8', 'Completado'),
    ev('ev-14', 'Actualización de checklist', 'tarea', -8, '14:00', '15:00', 'loc-08', 'DEMO · Local Ensanche 08', 'Responsable Demo 8', 'Completado'),
    ev('ev-16', 'Seguimiento de apertura', 'seguimiento', -12, '12:00', '13:00', 'loc-11', 'DEMO · Local Estación 11', 'Responsable Demo 11', 'Cancelado'),
    ev('ev-17', 'Auditoría de seguridad alimentaria', 'auditoria', 3, '09:00', '11:00', 'loc-09', 'DEMO · Local Polígono 09', 'Alberto', 'Pendiente'),
    ev('ev-18', 'Visita de seguimiento', 'visita', 5, '11:30', '12:30', 'loc-10', 'DEMO · Local Casco Antiguo 10', 'Alberto', 'Confirmado'),
    ev('ev-19', 'Comité de operaciones', 'reunion', 6, '09:00', '10:00', null, 'Oficina central DEMO', 'Alberto', 'Confirmado'),
    ev('ev-20', 'Revisión de imagen del local', 'tarea', 8, '10:00', '11:00', 'loc-12', 'DEMO · Local Ronda 12', 'Responsable Demo 12', 'Pendiente'),
    ev('ev-21', 'Auditoría de procedimientos', 'auditoria', 10, '09:30', '11:00', 'loc-01', 'DEMO · Local Centro 01', 'Alberto', 'Pendiente'),
    ev('ev-22', 'Formación de nuevos responsables', 'reunion', 12, '10:00', '12:00', null, 'Aula de formación DEMO', 'Responsable Demo 2', 'Pendiente'),
    ev('ev-23', 'Seguimiento del proyecto de aperturas', 'seguimiento', 14, '12:00', '13:00', 'loc-11', 'DEMO · Local Estación 11', 'Alberto', 'Confirmado'),
    ev('ev-24', 'Límite: plan de formación', 'limite', 16, '09:00', '10:00', null, 'Oficina central DEMO', 'Responsable Demo 3', 'Pendiente'),
    ev('ev-25', 'Visita previa a la apertura', 'visita', 18, '11:00', '12:00', 'loc-11', 'DEMO · Local Estación 11', 'Alberto', 'Pendiente'),
    ev('ev-26', 'Revisión trimestral', 'reunion', 20, '09:00', '10:30', null, 'Oficina central DEMO', 'Alberto', 'Pendiente'),
  ];

  const proyectos = [
    { id: 'pry-01', nombre: 'Apertura de nuevos locales', descripcion: 'Plan de trabajo para las próximas aperturas de la red.', responsable: 'Alberto', estado: 'En curso', inicio: d(-30), fin: d(60), color: 'blue' },
    { id: 'pry-02', nombre: 'Renovación de imagen de marca', descripcion: 'Actualización de la imagen en los locales seleccionados.', responsable: 'Responsable Demo 8', estado: 'Planificado', inicio: d(-10), fin: d(45), color: 'green' },
    { id: 'pry-03', nombre: 'Plan de formación anual', descripcion: 'Programa formativo para responsables y equipos de sala.', responsable: 'Responsable Demo 3', estado: 'En curso', inicio: d(-20), fin: d(90), color: 'purple' },
    { id: 'pry-04', nombre: 'Auditoría de seguridad alimentaria', descripcion: 'Campaña de revisión de la seguridad alimentaria en la red.', responsable: 'Responsable Demo 6', estado: 'En pausa', inicio: d(-45), fin: d(15), color: 'amber' },
    { id: 'pry-05', nombre: 'Digitalización de checklists', descripcion: 'Migración de los checklists en papel a formato digital.', responsable: 'Alberto', estado: 'Completado', inicio: d(-60), fin: d(-5), color: 'teal' },
  ];

  const tk = (n, titulo, descripcion, responsable, prioridad, estado, c, l, proyectoId, localId) => ({ id: `tsk-${String(n).padStart(2, '0')}`, titulo, descripcion, responsable, prioridad, estado, creada: d(c), limite: d(l, '18:00'), proyectoId, localId, evidencias: [] });
  const tareas = [
    tk(1, 'Reparar cámara frigorífica', 'Revisar el fallo de la cámara frigorífica y coordinar la reparación.', 'Responsable Demo 2', 'Crítica', 'En curso', -6, -2, null, 'loc-02'),
    tk(2, 'Renovar contrato de proveedor', 'Negociar y renovar el contrato del proveedor principal.', 'Alberto', 'Alta', 'Pendiente', -8, -3, null, null),
    tk(3, 'Actualizar cartas de alérgenos', 'Revisar y actualizar las cartas de alérgenos del local.', 'Responsable Demo 3', 'Crítica', 'Bloqueada', -5, -1, 'pry-04', 'loc-03'),
    tk(4, 'Formar al nuevo turno', 'Planificar la incorporación del nuevo turno de fin de semana.', 'Alberto', 'Media', 'Pendiente', -4, -1, 'pry-03', null),
    tk(5, 'Enviar informe de limpieza', 'Cerrar y enviar el informe mensual de limpieza.', 'Responsable Demo 5', 'Alta', 'En curso', -3, -1, null, 'loc-05'),
    tk(6, 'Revisar incidencias críticas', 'Repasar el estado de las incidencias críticas abiertas.', 'Alberto', 'Crítica', 'En curso', -2, 0, null, null),
    tk(7, 'Preparar el briefing de mañana', 'Preparar el resumen para la reunión diaria de mañana.', 'Alberto', 'Media', 'Pendiente', -1, 0, null, null),
    tk(8, 'Actualizar checklist de apertura', 'Renovar el checklist de apertura del local centro.', 'Responsable Demo 1', 'Alta', 'Pendiente', -1, 0, 'pry-05', 'loc-01'),
    tk(9, 'Revisar inventario de bodega', 'Comprobar existencias y caducidades de la bodega.', 'Responsable Demo 4', 'Media', 'Hecha', -9, -4, null, 'loc-04'),
    tk(10, 'Cerrar auditoría del mes anterior', 'Recopilar evidencias y cerrar la auditoría.', 'Alberto', 'Alta', 'Hecha', -12, -6, 'pry-04', null),
    tk(11, 'Publicar nueva carta', 'Coordinar la publicación de la nueva carta.', 'Responsable Demo 7', 'Media', 'Hecha', -10, -5, null, 'loc-07'),
    tk(12, 'Preparar visita a nuevo local', 'Preparar la documentación para la visita al nuevo local.', 'Alberto', 'Alta', 'Pendiente', -2, 2, 'pry-01', 'loc-11'),
    tk(13, 'Revisar presupuesto de reforma', 'Validar el presupuesto de la reforma del local.', 'Responsable Demo 8', 'Alta', 'En curso', -3, 3, 'pry-02', 'loc-08'),
    tk(14, 'Elaborar plan de formación', 'Redactar el plan de formación del trimestre.', 'Alberto', 'Media', 'Pendiente', -1, 5, 'pry-03', null),
    tk(15, 'Actualizar manual de PRL', 'Revisar el manual de prevención de riesgos laborales.', 'Responsable Demo 6', 'Alta', 'Pendiente', -2, 6, null, null),
    tk(16, 'Solicitar presupuestos de limpieza', 'Pedir presupuestos a empresas de limpieza.', 'Alberto', 'Baja', 'Pendiente', -1, 7, null, null),
    tk(17, 'Digitalizar checklist de cierre', 'Diseñar el checklist de cierre en formato digital.', 'Alberto', 'Media', 'Hecha', -4, -6, 'pry-05', null),
    tk(18, 'Revisar cámaras de seguridad', 'Comprobar el sistema de videovigilancia del local.', 'Responsable Demo 9', 'Media', 'Pendiente', -1, 9, null, 'loc-09'),
    tk(19, 'Planificar turnos de Navidad', 'Preparar los turnos de la campaña navideña.', 'Alberto', 'Alta', 'Pendiente', -2, 10, null, null),
    tk(20, 'Actualizar protocolo de apertura', 'Renovar el protocolo de apertura de locales nuevos.', 'Responsable Demo 11', 'Alta', 'En curso', -3, 12, 'pry-01', 'loc-11'),
    tk(21, 'Revisar facturas pendientes', 'Comprobar las facturas pendientes de proveedores.', 'Alberto', 'Media', 'Pendiente', -1, 13, null, null),
    tk(22, 'Preparar auditoría interna', 'Organizar la documentación de la auditoría interna.', 'Responsable Demo 10', 'Alta', 'Pendiente', -2, 14, 'pry-04', 'loc-10'),
    tk(23, 'Renovar uniformes del equipo', 'Gestionar el pedido de nuevos uniformes.', 'Alberto', 'Baja', 'Pendiente', -1, 16, 'pry-02', null),
    tk(24, 'Planificar formación de responsables', 'Agendar las sesiones de formación de responsables.', 'Responsable Demo 12', 'Media', 'Bloqueada', -2, 18, 'pry-03', null),
  ];

  const vi = (n, localId, day, time, motivo, objetivo, observaciones, resultado, seg, incidencias, acciones) => ({ id: `vis-${String(n).padStart(2, '0')}`, localId, fecha: d(day, time), motivo, objetivo, observaciones, resultado, responsable: 'Alberto', seguimiento: seg == null ? null : d(seg), incidencias, acciones, fotos: [] });
  const visitas = [
    vi(1, 'loc-01', -28, '10:30', 'Visita rutinaria', 'Comprobar el estado general del local', 'El local mantiene un buen nivel operativo. Se revisaron los procesos de apertura y cierre.', 'Satisfactoria', null, [], ['Mantener la rutina actual']),
    vi(2, 'loc-02', -24, '11:00', 'Seguimiento de incidencia', 'Verificar la reparación de la cámara frigorífica', 'La reparación todavía no está completa. Se aisló la zona afectada para evitar pérdidas.', 'Con incidencias', 3, ['INC-0001'], ['Coordinar una segunda revisión técnica']),
    vi(3, 'loc-03', -20, '09:45', 'Revisión de alérgenos', 'Revisar la carta de alérgenos', 'La información de alérgenos está casi al día. Quedan fichas técnicas por renovar.', 'Satisfactoria', null, [], ['Actualizar fichas técnicas']),
    vi(4, 'loc-04', -18, '12:15', 'Revisión de bodega', 'Comprobar inventario y caducidades', 'El inventario coincide con el registro. No se detectaron caducidades.', 'Satisfactoria', null, [], []),
    vi(5, 'loc-05', -15, '10:00', 'Visita de calidad', 'Evaluar el servicio en sala', 'Se detectaron tiempos de espera elevados en horas punta. El equipo de sala necesita refuerzo.', 'Con incidencias', 5, ['INC-0004'], ['Reforzar la formación de sala']),
    vi(6, 'loc-06', -12, '11:30', 'Visita rutinaria', 'Revisar el cumplimiento de procedimientos', 'Los procedimientos se cumplen correctamente. El equipo muestra buena disposición.', 'Satisfactoria', null, [], []),
    vi(7, 'loc-07', -5, '10:00', 'Visita sin aviso', 'Verificar estándares de limpieza', 'Baños y zona de cocina por debajo del estándar. Plan de limpieza sin firmar dos días.', 'Crítica', 2, ['INC-0006'], ['Repetir limpieza profunda', 'Firmar plan de limpieza a diario']),
    vi(8, 'loc-09', -4, '13:00', 'Preparación de auditoría', 'Revisar APPCC antes de la auditoría', 'Registros de temperatura completos. Falta etiquetar producto abierto en cámara.', 'Con incidencias', 6, ['INC-0009'], ['Etiquetar producto abierto']),
    vi(9, 'loc-10', -2, '17:30', 'Visita de seguimiento', 'Comprobar la afluencia del fin de semana', 'Buen ritmo de servicio con alta afluencia. Terraza bien organizada.', 'Satisfactoria', null, [], []),
    vi(10, 'loc-01', -1, '09:30', 'Visita de apertura', 'Comprobar la apertura y el cuadrante', 'Apertura puntual y cuadrante publicado. Pendiente reponer cartelería de promoción.', 'Satisfactoria', 4, [], ['Reponer cartelería de promoción']),
  ];

  const auditorias = [
    { id: 'aud-01', localId: 'loc-06', fecha: d(-2, '09:00'), categorias: ['Operaciones', 'Limpieza', 'Seguridad alimentaria'], estado: 'Completada', auditor: 'Alberto', puntuacion: 91, hallazgos: ['Registro de temperaturas incompleto un día'], respuestas: {} },
    { id: 'aud-02', localId: 'loc-07', fecha: d(-6, '10:00'), categorias: ['Limpieza', 'Imagen de marca'], estado: 'Completada', auditor: 'Alberto', puntuacion: 62, hallazgos: ['Baños sin revisar en la última hora', 'Cartelería deteriorada en fachada', 'Plan de limpieza sin firmar'], respuestas: {} },
    { id: 'aud-03', localId: 'loc-03', fecha: d(-11, '11:00'), categorias: ['Seguridad alimentaria', 'Producto'], estado: 'Completada', auditor: 'Responsable Demo 3', puntuacion: 78, hallazgos: ['Alérgenos de un plato sin actualizar', 'Gramaje irregular en raciones'], respuestas: {} },
    { id: 'aud-04', localId: 'loc-01', fecha: d(-19, '09:30'), categorias: ['Servicio', 'Cumplimiento de procedimientos'], estado: 'Completada', auditor: 'Alberto', puntuacion: 88, hallazgos: ['Tiempo de espera en barra superior a 5 min en hora punta'], respuestas: {} },
    { id: 'aud-05', localId: 'loc-05', fecha: d(-25, '12:00'), categorias: ['PRL', 'Formación'], estado: 'Completada', auditor: 'Responsable Demo 5', puntuacion: 84, hallazgos: ['Botiquín incompleto'], respuestas: {} },
    { id: 'aud-06', localId: 'loc-02', fecha: d(0, '13:00'), categorias: ['Limpieza'], estado: 'Pendiente', auditor: 'Alberto', puntuacion: null, hallazgos: [], respuestas: {} },
    { id: 'aud-07', localId: 'loc-09', fecha: d(3, '09:00'), categorias: ['Seguridad alimentaria'], estado: 'Pendiente', auditor: 'Alberto', puntuacion: null, hallazgos: [], respuestas: {} },
    { id: 'aud-08', localId: 'loc-01', fecha: d(10, '09:30'), categorias: ['Cumplimiento de procedimientos', 'Operaciones'], estado: 'Pendiente', auditor: 'Alberto', puntuacion: null, hallazgos: [], respuestas: {} },
  ];

  const inc = (n, titulo, localId, categoria, descripcion, prioridad, estado, responsable, f, l, accion, seg = []) => ({ id: `INC-${String(n).padStart(4, '0')}`, titulo, localId, categoria, descripcion, prioridad, estado, responsable, fecha: d(f, '10:00'), limite: d(l, '18:00'), accion, seguimiento: seg.map(([o, texto]) => ({ fecha: d(o, '12:00'), texto })) });
  const incidencias = [
    inc(1, 'Cámara frigorífica sin mantener temperatura', 'loc-02', 'Mantenimiento', 'La cámara 2 marca 7 °C de forma intermitente. Se ha trasladado el producto a la cámara 1.', 'Crítica', 'En curso', 'Responsable Demo 2', -25, -1, 'Visita del técnico y sustitución del compresor', [[-24, 'Producto trasladado y zona aislada'], [-10, 'Técnico confirma pieza en pedido']]),
    inc(2, 'Retraso recurrente del proveedor de pan', 'loc-04', 'Proveedor', 'Tres entregas con más de una hora de retraso esta semana.', 'Media', 'Pendiente', 'Alberto', -7, 3, 'Reclamación formal a compras', [[-5, 'Comunicado a compras']]),
    inc(3, 'TPV de barra se reinicia', 'loc-01', 'Sistemas', 'El terminal de barra se reinicia en horas punta.', 'Alta', 'Nueva', 'Responsable Demo 1', -1, 2, 'Abrir ticket con soporte de sistemas'),
    inc(4, 'Tiempos de espera elevados en sala', 'loc-05', 'Cliente', 'Reclamaciones por esperas superiores a 20 minutos en el turno de cena.', 'Alta', 'En curso', 'Responsable Demo 5', -15, 5, 'Refuerzo de personal y formación de sala', [[-14, 'Refuerzo de una persona en viernes y sábado']]),
    inc(5, 'Rotura de mampara de terraza', 'loc-10', 'Mantenimiento', 'Una mampara de la terraza tiene el cristal agrietado.', 'Media', 'Resuelta', 'Responsable Demo 10', -20, -12, 'Sustitución del cristal', [[-13, 'Cristal sustituido']]),
    inc(6, 'Limpieza por debajo del estándar', 'loc-07', 'Limpieza', 'Baños y cocina por debajo del estándar en visita sin aviso.', 'Crítica', 'Nueva', 'Responsable Demo 7', -5, 1, 'Limpieza profunda y firma diaria del plan'),
    inc(7, 'Baja de personal sin cubrir', 'loc-03', 'Personal', 'Una baja de larga duración en cocina sin sustitución.', 'Alta', 'Pendiente', 'Alberto', -9, 4, 'Solicitar cobertura a RRHH'),
    inc(8, 'Etiquetas de alérgenos desactualizadas', 'loc-03', 'Seguridad alimentaria', 'Dos platos de la nueva carta sin información de alérgenos.', 'Alta', 'Resuelta', 'Responsable Demo 3', -12, -8, 'Actualización de la carta y formación', [[-8, 'Carta corregida']]),
    inc(9, 'Producto abierto sin etiquetar', 'loc-09', 'Seguridad alimentaria', 'Producto abierto en cámara sin fecha de apertura.', 'Media', 'En curso', 'Responsable Demo 9', -4, 2, 'Revisión diaria de etiquetado'),
    inc(10, 'Fuga en el fregadero de cocina', 'loc-06', 'Mantenimiento', 'Pequeña fuga bajo el fregadero principal.', 'Baja', 'Cerrada', 'Responsable Demo 6', -30, -25, 'Reparación por fontanero', [[-26, 'Reparado'], [-25, 'Verificado y cerrado']]),
    inc(11, 'Reclamación por cobro duplicado', 'loc-02', 'Cliente', 'Un cliente indica un cargo duplicado con tarjeta.', 'Media', 'Cerrada', 'Responsable Demo 2', -18, -15, 'Devolución del importe', [[-15, 'Importe devuelto']]),
    inc(12, 'Wifi de clientes intermitente', 'loc-05', 'Sistemas', 'La red de clientes se cae varias veces al día.', 'Baja', 'Pendiente', 'Responsable Demo 5', -3, 10, 'Revisión del router'),
    inc(13, 'Faltan EPIs en cocina', 'loc-12', 'Personal', 'No hay guantes anticorte de repuesto.', 'Media', 'Nueva', 'Responsable Demo 12', 0, 3, 'Pedido urgente de EPIs'),
    inc(14, 'Extintor con revisión caducada', 'loc-08', 'Mantenimiento', 'Un extintor de sala con la revisión anual vencida.', 'Alta', 'En curso', 'Responsable Demo 8', -2, 1, 'Revisión por empresa autorizada'),
  ];

  const doc = (n, titulo, area, tipo, origen, ubicacion, f, resumen) => ({ id: `doc-${String(n).padStart(2, '0')}`, titulo, area, tipo, origen, ubicacion, fecha: d(f), resumen, url: null });
  const documentos = [
    doc(1, 'Manual de operaciones de sala', 'Operaciones', 'PDF', 'SharePoint', '/sites/DEMO-Operaciones/Documentos compartidos/Manuales', -40, 'Procedimientos de apertura, servicio y cierre de sala. Incluye checklists de turno.'),
    doc(2, 'Checklist de apertura y cierre', 'Operaciones', 'Excel', 'SharePoint', '/sites/DEMO-Operaciones/Documentos compartidos/Checklists', -12, 'Plantilla diaria de apertura y cierre. Versión vigente para todas las marcas DEMO.'),
    doc(3, 'Plan de acogida de nuevas incorporaciones', 'Formación', 'PowerPoint', 'SharePoint', '/sites/DEMO-Formacion/Documentos compartidos/Acogida', -60, 'Presentación para el primer día de trabajo. Cubre cultura, puesto y normas básicas.'),
    doc(4, 'Formación en alérgenos', 'Formación', 'PDF', 'SharePoint', '/sites/DEMO-Formacion/Documentos compartidos/Seguridad alimentaria', -30, 'Material obligatorio sobre los 14 alérgenos. Incluye test final.'),
    doc(5, 'Calendario de promociones del trimestre', 'Marketing', 'Excel', 'SharePoint', '/sites/DEMO-Marketing/Documentos compartidos/Promociones', -8, 'Fechas y mecánica de las promociones previstas. Indica la cartelería de cada una.'),
    doc(6, 'Guía de cartelería en local', 'Marketing', 'PDF', 'SharePoint', '/sites/DEMO-Marketing/Documentos compartidos/Imagen', -45, 'Dónde y cómo colocar la cartelería. Fotos de referencia por tipo de local.'),
    doc(7, 'Comunicado interno: cambios de horario', 'Comunicación', 'Word', 'OneDrive', '/OneDrive/Documentos/Comunicados', -3, 'Borrador de comunicado sobre horarios de invierno. Pendiente de revisión.'),
    doc(8, 'Plantilla de comunicado a locales', 'Comunicación', 'Word', 'SharePoint', '/sites/DEMO-Comunicacion/Documentos compartidos/Plantillas', -90, 'Estructura estándar para comunicados a la red. Incluye tono y firma.'),
    doc(9, 'Política de vacaciones', 'RRHH', 'PDF', 'SharePoint', '/sites/DEMO-RRHH/Documentos compartidos/Políticas', -120, 'Criterios de solicitud y aprobación de vacaciones. Plazos por temporada.'),
    doc(10, 'Cuadrante tipo de un local', 'RRHH', 'Excel', 'OneDrive', '/OneDrive/Documentos/Plantillas', -25, 'Modelo de cuadrante semanal. Calcula horas por persona.'),
    doc(11, 'Catálogo de proveedores homologados', 'Compras', 'Excel', 'SharePoint', '/sites/DEMO-Compras/Documentos compartidos/Proveedores', -15, 'Proveedores aprobados por categoría. Incluye contacto comercial genérico y plazos.'),
    doc(12, 'Procedimiento de pedidos', 'Compras', 'PDF', 'SharePoint', '/sites/DEMO-Compras/Documentos compartidos/Procedimientos', -70, 'Calendario y pasos para realizar pedidos. Gestión de incidencias con proveedor.'),
    doc(13, 'Plan APPCC', 'Calidad', 'PDF', 'SharePoint', '/sites/DEMO-Calidad/Documentos compartidos/APPCC', -50, 'Sistema de análisis de peligros y puntos de control. Registros obligatorios.'),
    doc(14, 'Estándares de producto por marca', 'Calidad', 'PowerPoint', 'SharePoint', '/sites/DEMO-Calidad/Documentos compartidos/Estándares', -35, 'Fotos y gramajes de referencia. Una sección por marca DEMO.'),
    doc(15, 'Evaluación de riesgos laborales', 'PRL', 'PDF', 'SharePoint', '/sites/DEMO-PRL/Documentos compartidos/Evaluaciones', -100, 'Riesgos por puesto y medidas preventivas. Firmada por el servicio de prevención.'),
    doc(16, 'Plan de emergencia del local', 'PRL', 'PDF', 'SharePoint', '/sites/DEMO-PRL/Documentos compartidos/Emergencias', -80, 'Actuación ante incendio y evacuación. Plano tipo y responsables.'),
    doc(17, 'Checklist de apertura de nuevo local', 'Aperturas', 'Excel', 'SharePoint', '/sites/DEMO-Aperturas/Documentos compartidos/Checklists', -20, 'Hitos desde la firma hasta la inauguración. Responsables por área.'),
    doc(18, 'Calendario de aperturas', 'Aperturas', 'Enlace', 'SharePoint', '/sites/DEMO-Aperturas/Lists/Calendario', -6, 'Lista con las aperturas previstas y su estado. Se actualiza cada semana.'),
    doc(19, 'Fichas de locales', 'Locales', 'Excel', 'OneDrive', '/OneDrive/Documentos/Locales', -10, 'Datos básicos de cada local DEMO. Superficie, aforo y horarios.'),
    doc(20, 'Planos de distribución', 'Locales', 'PDF', 'SharePoint', '/sites/DEMO-Locales/Documentos compartidos/Planos', -150, 'Planos de sala y cocina. Útiles para reformas y auditorías.'),
    doc(21, 'Procedimiento de limpieza y desinfección', 'Calidad', 'PDF', 'SharePoint', '/sites/DEMO-Calidad/Documentos compartidos/Procedimientos', -18, 'Frecuencias, productos y registro firmado de limpieza de sala, cocina y baños.'),
  ];

  const msg = (n, canal, de, asunto, extracto, day, time, importante, pendiente, compromisos = [], tareasDetectadas = [], localId = null) => ({ id: `msg-${String(n).padStart(2, '0')}`, canal, de, asunto, extracto, fecha: d(day, time), importante, pendiente, equipo: canal === 'teams' ? 'Equipo DEMO Operaciones' : '', canalTeams: canal === 'teams' ? 'General (DEMO)' : '', compromisos, tareasDetectadas, localId });
  const mensajes = [
    msg(1, 'outlook', 'Contacto Demo 1', 'Presupuesto reparación cámara', 'Adjunto el presupuesto para el compresor de la cámara 2. Necesito confirmación antes del jueves.', 0, '08:12', true, true, ['Confirmar presupuesto antes del jueves'], ['Aprobar presupuesto de reparación'], 'loc-02'),
    msg(2, 'outlook', 'Contacto Demo 2', 'Calendario de promociones', 'Te paso el calendario de promociones del trimestre. Revisa las fechas de los locales en obras.', 0, '09:40', false, true, [], ['Revisar promociones de locales en obras'], null),
    msg(3, 'outlook', 'Contacto Demo 3', 'Baja en cocina', 'Seguimos sin sustituto para la baja de cocina. ¿Podemos pedir cobertura a otro local?', -1, '17:05', true, true, ['Responder sobre cobertura'], ['Solicitar cobertura a RRHH'], 'loc-03'),
    msg(4, 'outlook', 'Contacto Demo 4', 'Resumen semanal de ventas', 'Comparto el resumen de la semana. Sin novedades relevantes.', -1, '10:20', false, false),
    msg(5, 'outlook', 'Contacto Demo 5', 'Reunión de comité', 'Confirmo la reunión del comité. Trae el estado de las incidencias críticas.', -2, '12:30', true, false, ['Llevar estado de incidencias críticas'], ['Preparar informe de incidencias'], null),
    msg(6, 'outlook', 'Contacto Demo 6', 'Revisión extintores', 'La empresa de mantenimiento puede pasar el viernes por la mañana.', -2, '09:15', false, true, ['Confirmar visita del viernes'], [], 'loc-08'),
    msg(7, 'outlook', 'Contacto Demo 7', 'Nuevo manual de marca', 'Ya está publicado el nuevo manual en SharePoint. Os pido difundirlo en los locales.', -3, '16:45', false, false, [], ['Difundir manual de marca'], null),
    msg(8, 'outlook', 'Contacto Demo 8', 'Retrasos de proveedor', 'Hemos abierto reclamación con el proveedor de pan. Te informo cuando respondan.', -3, '11:00', false, false, [], [], 'loc-04'),
    msg(9, 'outlook', 'Contacto Demo 9', 'Auditoría APPCC', '¿Podemos mover la auditoría del jueves a primera hora?', -4, '13:10', false, true, ['Responder sobre cambio de hora'], [], 'loc-09'),
    msg(10, 'teams', 'Contacto Demo 10', 'Turnos de Navidad', 'Necesitamos cerrar los turnos de Navidad esta semana para publicarlos.', 0, '10:05', true, true, ['Cerrar turnos esta semana'], ['Planificar turnos de Navidad'], null),
    msg(11, 'teams', 'Contacto Demo 11', 'Obras local Ensanche', 'La reforma va según plan. Adjunto fotos del avance.', -1, '18:30', false, false, [], [], 'loc-08'),
    msg(12, 'teams', 'Contacto Demo 12', 'Promoción de temporada', 'Recordad colgar la cartelería nueva antes del viernes.', -1, '09:00', false, false, [], ['Revisar cartelería en locales'], null),
    msg(13, 'teams', 'Contacto Demo 2', 'Incidencia TPV', 'El TPV de barra del local centro se ha vuelto a reiniciar hoy.', 0, '13:20', true, true, [], ['Escalar incidencia de TPV a sistemas'], 'loc-01'),
    msg(14, 'teams', 'Contacto Demo 5', 'Formación de sala', 'La formación de sala del jueves queda confirmada a las 15:00.', -2, '15:00', false, false, ['Asistir a la formación del jueves'], [], 'loc-05'),
  ];

  const aprobaciones = [
    { id: 'apr-01', accion: 'Crear acción correctiva en Notion', sistema: 'Notion', motivo: 'Visita crítica en DEMO · Local Parque 07', datos: { Base: 'Acciones y seguimientos', Título: 'Limpieza profunda y firma diaria del plan', Responsable: 'Responsable Demo 7', 'Fecha límite': 'En 2 días' }, resultado: 'Nueva acción enlazada a la visita y a la incidencia INC-0006.', estado: 'Pendiente', creada: d(0, '08:30'), origen: 'Asistente IA (DEMO)', historial: [] },
    { id: 'apr-02', accion: 'Responder correo «Presupuesto reparación cámara»', sistema: 'Outlook', motivo: 'Compromiso detectado: confirmar antes del jueves', datos: { Para: 'Contacto Demo 1', Asunto: 'RE: Presupuesto reparación cámara', Cuerpo: 'Aprobado. Por favor, confirmad fecha de intervención.' }, resultado: 'Se envía la respuesta desde la cuenta corporativa.', estado: 'Pendiente', creada: d(0, '08:35'), origen: 'Asistente IA (DEMO)', historial: [] },
    { id: 'apr-03', accion: 'Publicar recordatorio en canal de Teams', sistema: 'Teams', motivo: 'Cartelería de promoción pendiente en varios locales', datos: { Equipo: 'Equipo DEMO Operaciones', Canal: 'General (DEMO)', Mensaje: 'Recordatorio: cartelería nueva colocada antes del viernes.' }, resultado: 'Mensaje visible para todos los miembros del canal.', estado: 'Pendiente', creada: d(-1, '18:00'), origen: 'Asistente IA (DEMO)', historial: [] },
    { id: 'apr-04', accion: 'Actualizar estado de incidencia en Notion', sistema: 'Notion', motivo: 'La incidencia INC-0005 figura resuelta en la app', datos: { Base: 'Incidencias', Registro: 'INC-0005', Estado: 'Resuelta → Cerrada' }, resultado: 'La incidencia queda cerrada en Notion.', estado: 'Pendiente', creada: d(-1, '12:10'), origen: 'Asistente IA (DEMO)', historial: [] },
  ];

  const automatizaciones = [
    { id: 'aut-01', nombre: 'Escalar incidencias críticas sin avance en 48 h', descripcion: 'Si una incidencia crítica no cambia de estado en 48 horas, crea una tarea para Alberto.', disparador: 'Cada vez que abres la app', accion: 'Crear tarea de escalado', activa: true, ambito: 'local' },
    { id: 'aut-02', nombre: 'Seguimiento automático 7 días después de una visita', descripcion: 'Al guardar una visita con resultado distinto de Satisfactoria, programa un seguimiento a 7 días.', disparador: 'Al guardar una visita', accion: 'Crear seguimiento en agenda', activa: true, ambito: 'local' },
    { id: 'aut-03', nombre: 'Marcar tareas vencidas', descripcion: 'Resalta las tareas cuya fecha límite ha pasado y las muestra en el briefing.', disparador: 'Cada vez que abres la app', accion: 'Marcar como vencida', activa: true, ambito: 'local' },
    { id: 'aut-04', nombre: 'Briefing diario a las 8:00', descripcion: 'Genera y envía el briefing del día a primera hora.', disparador: 'Todos los días, 8:00', accion: 'Generar briefing y notificar', activa: false, ambito: 'backend' },
    { id: 'aut-05', nombre: 'Detectar tareas en correos de Outlook', descripcion: 'Analiza los correos nuevos y propone tareas y compromisos.', disparador: 'Correo nuevo', accion: 'Proponer tarea (requiere aprobación)', activa: false, ambito: 'backend' },
    { id: 'aut-06', nombre: 'Sincronizar Agenda Restalia (Notion) y Outlook', descripcion: 'Mantiene alineados los eventos de ambas agendas sin duplicados.', disparador: 'Cada 15 minutos', accion: 'Sincronizar sin duplicados', activa: false, ambito: 'backend' },
  ];

  const act = (n, day, time, texto, modulo) => ({ id: `act-${String(n).padStart(2, '0')}`, fecha: d(day, time), texto, modulo });
  const actividad = [
    act(1, 0, '08:35', 'El asistente propuso responder el correo del presupuesto de la cámara', 'aprobaciones'),
    act(2, 0, '08:30', 'El asistente propuso una acción correctiva para DEMO · Local Parque 07', 'aprobaciones'),
    act(3, 0, '08:05', 'Se registró la incidencia INC-0013 en DEMO · Local Ronda 12', 'incidencias'),
    act(4, -1, '19:10', 'Se completó la tarea «Revisar inventario de bodega»', 'tareas'),
    act(5, -1, '09:30', 'Alberto registró una visita a DEMO · Local Centro 01', 'visitas'),
    act(6, -1, '13:30', 'Se abrió la incidencia INC-0003 por el TPV de barra', 'incidencias'),
    act(7, -2, '10:40', 'Se cerró la auditoría de DEMO · Local Marítimo 06 con 91 puntos', 'auditorias'),
    act(8, -2, '12:00', 'Se añadió el calendario de promociones a Marketing', 'documentacion'),
    act(9, -2, '17:30', 'Alberto registró una visita a DEMO · Local Casco Antiguo 10', 'visitas'),
    act(10, -3, '11:20', 'DEMO · Local Ensanche 08 pasó a estado En obras', 'locales'),
    act(11, -3, '16:45', 'Llegó un aviso sobre el nuevo manual de marca', 'comunicaciones'),
    act(12, -3, '09:10', 'La incidencia INC-0008 se marcó como resuelta', 'incidencias'),
  ];

  return { locales, eventos, tareas, proyectos, visitas, auditorias, incidencias, documentos, mensajes, aprobaciones, automatizaciones, actividad };
}
