# Restalia Operations AI · Arquitectura, limitaciones y backend necesario

Versión 0.1 (primera entrega navegable). Fecha: 16/11/2026.

## 1. Qué es hoy

Una PWA (app web instalable en el iPhone) escrita en JavaScript sin dependencias ni paso de compilación obligatorio. Funciona completa **en el propio dispositivo**:

- Los datos se guardan en el navegador (localStorage para registros y configuración, IndexedDB para fotos).
- Todo lo que se ve al abrirla es **DEMO**: locales, personas, mensajes y cifras ficticios, con etiqueta DEMO. Se pueden quitar desde Configuración → Datos.
- No hay ninguna conexión real con Notion, Microsoft 365 ni un proveedor de IA. La app lo dice en cada pantalla que lo necesita y nunca simula que una API responde.

## 2. Estado por módulo

| Módulo | Funciona ya en el dispositivo | Necesita backend para |
|---|---|---|
| Inicio | Saludo, resumen del día, 6 KPIs, briefing en 6 bloques (calculado con reglas, no con IA), agenda de hoy, actividad, gráficos semanales | Briefing redactado por IA; datos reales |
| Mi asistente IA | Chat con historial, conversaciones por proyecto, adjuntos de texto, respuestas estructuradas, acciones con confirmación (crear tarea, cambiar estado), memoria de trabajo, dictado por voz si el navegador lo permite, 8 sugerencias. Motor local de intenciones sobre los datos de la app | Respuestas de un modelo de IA (Claude, OpenAI o Azure OpenAI) vía `/ai/chat`; leer PDF/Word/imágenes |
| Agenda | Vistas día, semana y mes; filtros por tipo; eventos locales; une reuniones, visitas, auditorías, tareas, seguimientos y fechas límite | Sincronizar Outlook Calendar y Agenda Restalia (Notion) |
| Tareas | Lista, kanban (arrastrar o selector en móvil), calendario, por responsable, por proyecto, por local | Escribir en «Acciones y seguimientos» de Notion (vía Aprobaciones) |
| Locales | CRM de solo lectura con tabla/tarjetas y ficha completa con pestañas | Cargar los locales reales desde Notion (no se crean locales en la app para no duplicar el CRM) |
| Visitas | Formulario, fotos con la cámara, acciones que generan tareas, incidencia opcional, informe imprimible (PDF), seguimiento automático a 7 días | Proponer el registro a Notion (ya crea la propuesta en Aprobaciones) y subir fotos |
| Auditorías | Plantillas editables por categoría, checklist Cumple / No cumple / N/A con nota y foto, puntuación, hallazgos, plan correctivo con tareas, histórico | Base de Notion si existe (hoy capa C, propia de la app) |
| Incidencias | Estados Nueva → En curso → Pendiente → Resuelta → Cerrada; kanban, lista, detalle, seguimiento, tareas derivadas, fotos | Escribir en Notion (vía Aprobaciones) |
| Proyectos | Lista con avance calculado por tareas, ficha, tareas y conversaciones del asistente por proyecto | Confirmar si los proyectos viven en Notion |
| Documentación | Buscador con filtros por área, tipo y fecha; ficha con ubicación; «Abrir original» deshabilitado | Índice real de SharePoint y OneDrive (solo lectura; nunca se mueve ni modifica nada) |
| Comunicaciones | Bandeja Outlook + Teams, importantes, pendientes, compromisos, tareas detectadas; «Preparar respuesta» crea una aprobación | Leer correo y Teams; enviar solo tras aprobación |
| Informes | 8 informes con KPIs, gráficos y tabla; periodo 7/30/90 días o 12 meses; PDF (imprimir) y Excel (CSV con `;` y BOM) | Datos reales |
| Automatizaciones | 3 reglas locales (escalar críticas a 48 h, seguimiento a 7 días, tareas vencidas) que se ejecutan al abrir la app; nuevas reglas se guardan como propuesta | Reglas programadas (8:00), detección en correo, sincronización Notion/Outlook |
| Aprobaciones | Bandeja con acción, sistema, motivo, datos y resultado; Aprobar, Rechazar, Modificar; historial | Ejecutar lo aprobado. Sin backend queda «En cola (sin conexión)» |
| Configuración | Nombre, idioma (español; inglés en navegación), tema claro/oscuro/automático, estado real de conexiones, URL del backend, proveedor de IA, capas de datos, exportar/importar copia, quitar o restaurar DEMO, borrar todo, guía de instalación, permiso de notificaciones | — |

## 3. Limitaciones actuales (honestas)

1. **Datos solo en este dispositivo.** Si se borra Safari o se cambia de iPhone, se pierden. Mitigación: Configuración → Exportar copia.
2. **Sin sincronización entre dispositivos** hasta tener backend.
3. **Sin IA real.** El asistente y el briefing usan reglas locales y lo indican.
4. **Notificaciones con la app cerrada** no son posibles sin backend Web Push. En iPhone requieren además iOS 16.4+ y la app instalada.
5. **Automatizaciones** solo corren cuando abres la app (un iPhone no ejecuta tareas en segundo plano para una web).
6. **Idioma inglés**: preparado (diccionario en `js/core/i18n.js`), traducida solo la navegación.
7. **Fotos**: comprimidas a 1280 px y guardadas en IndexedDB; Safari puede limitar el espacio.
8. **Dictado**: depende de que el navegador ofrezca reconocimiento de voz; en iPhone se puede usar el micrófono del teclado.

## 4. Arquitectura

```
iPhone / ordenador (PWA)
 ├─ Interfaz: módulos en js/modules/*  (router por hash, sin build)
 ├─ Núcleo: store (capas A–E), insights, charts, media, ui, i18n
 └─ Adaptadores (js/adapters/*): notion · graph · ai · storage · notifications
          │  HTTPS + cookie de sesión (nunca tokens en el navegador)
          ▼
 Backend seguro (BFF) — por construir
 ├─ /auth (Microsoft Entra ID, OAuth 2.0 + PKCE)
 ├─ /notion/:coleccion  (lectura; escritura solo desde /approvals/execute)
 ├─ /graph/mail · /graph/calendar · /graph/teams/messages · /graph/files
 ├─ /ai/chat  (proveedor intercambiable: Anthropic, OpenAI, Azure OpenAI)
 ├─ /approvals/execute  (único punto que escribe fuera)
 ├─ /files  (evidencias) · /push/subscribe (Web Push)
 └─ /health → { notion, graph, ai, storage, push }
```

### Capas de datos

| Capa | Contenido | Fuente | Regla |
|---|---|---|---|
| A | Locales, visitas, incidencias, acciones, contactos, aprobaciones, historial, Agenda Restalia | Notion | Fuente de verdad. La app no crea bases nuevas |
| B | Correo, calendario, Teams, documentos | Microsoft 365 | Solo lectura; enviar solo tras aprobación; SharePoint/OneDrive nunca se modifican |
| C | Auditorías, proyectos, automatizaciones, plantillas | App | Hasta confirmar si existen en Notion |
| D | Conversaciones y memoria del asistente | Dispositivo (luego backend) | Borrable por el usuario |
| E | Configuración | Dispositivo | Sin secretos |

### Sincronización sin duplicados

Cada registro guarda `source: { system, ref }` (p. ej. `{ system: 'notion', ref: '<page_id>' }`). Al sincronizar, el backend fusiona por la pareja `(system, ref)`: actualiza si existe, crea si no. Los registros creados en la app llevan `system: 'local'` y, al aprobarse su envío a Notion, el backend devuelve el `page_id` y la app los enlaza en lugar de crear un duplicado.

### Cambiar de proveedor de IA

El frontend solo llama a `/ai/chat` con `{ provider, model, messages, context }`. El backend elige el SDK. Cambiar de proveedor es un cambio de configuración, no de código en la app.

## 5. Backend recomendado

- **Cloudflare Workers** (mismo sitio que la app) o **Azure Functions** si TI de Restalia prefiere quedarse en su tenant.
- Secretos en el gestor del proveedor (Workers Secrets / Azure Key Vault): token de la integración de Notion, client secret de Entra ID, claves de IA, claves VAPID.
- Sesión por cookie `HttpOnly; Secure; SameSite=Lax`, CORS solo para el dominio de la app.
- Registro de auditoría de cada ejecución de `/approvals/execute`.

### Permisos mínimos de Microsoft Graph (delegados)

`User.Read`, `Mail.Read`, `Mail.Send` (solo si se aprueba responder), `Calendars.Read`, `Chat.Read`, `ChannelMessage.Read.All` (requiere consentimiento de administrador), `Files.Read.All`, `Sites.Read.All`, `offline_access`.

## 6. Orden de trabajo propuesto

1. Recibir de ChatGPT lo listado en `para-chatgpt.md`.
2. Backend mínimo: `/health`, `/auth`, lectura de Notion (locales, incidencias, acciones, Agenda Restalia).
3. Lectura de Microsoft 365 (calendario y correo).
4. `/approvals/execute` para escribir en Notion y responder correo.
5. `/ai/chat` con el proveedor elegido.
6. Web Push y automatizaciones programadas.
