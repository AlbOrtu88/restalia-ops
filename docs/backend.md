# Backend de Restalia Operations AI · administración

Versión 0.5 · noviembre de 2026. Código en [`worker/`](../worker). Arquitectura general en [arquitectura.md](arquitectura.md).

## 1. Qué hay desplegado

| Entorno | Worker | Dirección | Base D1 |
|---|---|---|---|
| Producción | `restalia-ops` | https://restalia-ops.hola-0d4.workers.dev | `restalia-ops` |
| Desarrollo | `restalia-ops-dev` | https://restalia-ops-dev.hola-0d4.workers.dev | `restalia-ops-dev` |
| Despliegue | `restalia-ops-deployer` | (sin uso directo) | KV `restalia-ops-deploy` |

- **La app conectada es la dirección del Worker**, no la de GitHub Pages. El Worker sirve la misma PWA (la lee de GitHub Pages) y la API en `/api`, en el mismo dominio. Así la cookie de sesión es de primera parte y funciona en Safari del iPhone, que bloquea cookies entre dominios distintos.
- https://albortu88.github.io/restalia-ops/ sigue funcionando como versión sin conexión (datos DEMO y locales del dispositivo).
- Cuenta de Cloudflare: la de Entrevistable (subdominio `hola-0d4`).

## 2. Seguridad

- Sesión: cookie `__Host-rops` `HttpOnly; Secure; SameSite=Lax`, 30 días. En D1 solo se guarda el hash del identificador.
- Inicio de sesión con Microsoft Entra ID (código de autorización + PKCE, cliente confidencial). Solo entra la cuenta `ALLOWED_EMAIL` del tenant `MS_TENANT_ID`; cualquier otra se rechaza y queda en auditoría.
- Tokens de Microsoft cifrados con AES-GCM (clave derivada de `SESSION_SECRET`) en la tabla `vault`. Nunca llegan al navegador ni a los registros.
- Peticiones que cambian algo: se rechazan si el `Origin` no es el del propio Worker (CSRF).
- Microsoft Graph es de **solo lectura** en el código: el cliente rechaza cualquier método que no sea GET (salvo `POST /search/query`, que es una búsqueda). No hay envío de correo ni escritura en Teams, SharePoint u OneDrive.
- Escritura en Notion: solo desde `/api/approvals/execute`, con propuesta aprobada en la app, operación estructurada, campo permitido y opción válida según el esquema real, y con el interruptor `NOTION_WRITES_ENABLED="true"` (apagado por defecto). Cada ejecución se registra en auditoría y en «Historial de cambios».
- Acceso con llave (opcional): `ACCESS_KEY` de **24 caracteres o más** (si es más corta, el acceso con llave queda desactivado y Configuración lo indica), bloqueo de 15 min tras 5 intentos fallidos. Pensado para usar Notion antes de tener Entra ID. Se puede quitar borrando el secreto.
- Retención: correos y mensajes de Teams de más de 45 días se eliminan; registro de sincronización 30 días; auditoría 180 días. Del correo solo se guarda asunto, remitente, fecha, vista previa (≈255 caracteres) y enlace.

## 3. Secretos y variables (Cloudflare → Workers → el Worker → Settings → Variables and Secrets)

| Nombre | Tipo | Quién | Para qué |
|---|---|---|---|
| `SESSION_SECRET` | Secreto | Ya puesto (aleatorio) | Cifrado de tokens. Cambiarlo invalida la conexión con Microsoft |
| `ALLOWED_EMAIL` | Secreto | Ya puesto | Única cuenta Microsoft admitida |
| `MS_TENANT_ID` | Secreto | Ya puesto | Tenant de Restalia |
| `TEAMS_TEAM_ID` | Secreto | Ya puesto | Equipo «COMUNICACIÓN R+» |
| `NOTION_DATA_SOURCES` | Secreto | Ya puesto | JSON colección → id de data source de las 9 bases |
| `NOTION_TOKEN` | Secreto | **Alberto** | Token de la integración interna de Notion |
| `MS_CLIENT_ID` | Secreto | **Alberto / TI** | Id. de aplicación (cliente) del registro de Entra ID |
| `MS_CLIENT_SECRET` | Secreto | **Alberto / TI** | Valor del secreto de cliente de Entra ID |
| `OUTLOOK_ICS_URL` | Secreto | **Alberto** (opcional) | Enlace ICS de «Publicar un calendario» de Outlook. Agenda de Outlook/Teams sin Entra ID (ver 4.4) |
| `ACCESS_KEY` | Secreto | Alberto (opcional) | Llave provisional de acceso |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | Secreto | Alberto (opcional) | IA externa. Sin clave se usa Cloudflare Workers AI |
| `AI_PROVIDER`, `AI_MODEL` | Variable | Opcional | Forzar proveedor/modelo (`anthropic`, `openai`, `workers-ai`) |
| `NOTION_WRITES_ENABLED` | Variable | Alberto, cuando decida | `true` activa la ejecución de aprobaciones en Notion |

Nada de esto está en el repositorio. Los IDs de D1 de `wrangler.toml` son recursos de Cloudflare, no datos de Restalia.

## 4. Acciones pendientes de Alberto

### 4.1 Notion: integración interna (5 minutos)
1. Abre https://www.notion.so/profile/integrations → **Nueva integración**.
2. Nombre `Restalia Ops`, espacio **Espacio de Alberto Ortuno**, tipo **Interna**. Capacidades: *Leer contenido*; añade *Actualizar contenido* e *Insertar contenido* solo si quieres que las aprobaciones puedan escribir más adelante. Sin acceso a usuarios ni comentarios.
3. Copia el **Token interno secreto** (no lo pegues en ningún chat).
4. En Notion, abre la página **Restalia Operations** → `•••` → **Conexiones** → añade `Restalia Ops`. Con eso quedan compartidas las bases que cuelgan de ella. Si alguna base está fuera, compártela también.
5. En Cloudflare: Workers → `restalia-ops` → Settings → Variables and Secrets → **Add** → tipo *Secret*, nombre `NOTION_TOKEN`, valor el token → Deploy. Repite en `restalia-ops-dev` si quieres probar allí.
6. Abre la app conectada → Configuración → **Actualizar ahora**. Después pulsa **Esquema real de Notion** para ver el mapeo comprobado.

### 4.2 Microsoft Entra ID: registro de la app (lo puede hacer TI)
1. https://entra.microsoft.com → Identidad → Aplicaciones → **Registros de aplicaciones** → **Nuevo registro**.
2. Nombre `Restalia Operations AI`. Cuentas: **solo este directorio organizativo** (un solo tenant).
3. URI de redirección, plataforma **Web**:
   - `https://restalia-ops.hola-0d4.workers.dev/api/auth/callback`
   - `https://restalia-ops-dev.hola-0d4.workers.dev/api/auth/callback` (añádela después en *Autenticación*)
4. *Certificados y secretos* → **Nuevo secreto de cliente** (24 meses). Copia el **Valor**.
5. *Permisos de API* → Microsoft Graph → **Permisos delegados**: `User.Read`, `offline_access`, `openid`, `profile`, `email`, `Mail.Read`, `Calendars.Read`, `Files.Read.All`, `Chat.Read`, `Team.ReadBasic.All`, `Channel.ReadBasic.All`, `ChannelMessage.Read.All`.
6. **Conceder consentimiento de administrador** para Restalia (necesario para `ChannelMessage.Read.All`; y para todos si el tenant no permite que los usuarios consientan).
7. En Cloudflare (los dos Workers): secretos `MS_CLIENT_ID` (Id. de aplicación) y `MS_CLIENT_SECRET` (el valor del paso 4).
8. En la app conectada → Configuración → **Entrar con Microsoft 365**. Cuando TI haya concedido el consentimiento, pulsa **Activar canales de Teams**.

Texto para TI: *«Necesito registrar una aplicación de un solo tenant, "Restalia Operations AI", con permisos delegados de solo lectura (User.Read, Mail.Read, Calendars.Read, Files.Read.All, Chat.Read, Team.ReadBasic.All, Channel.ReadBasic.All, ChannelMessage.Read.All, offline_access). Solo accede a mi propio buzón, calendario, archivos y equipos a los que pertenezco. No pide permisos de escritura ni de aplicación. ChannelMessage.Read.All requiere consentimiento de administrador. Redirecciones: las dos URL de /api/auth/callback indicadas.»*

### 4.4 Agenda de Outlook/Teams sin Entra ID (calendario publicado)
Si no puedes registrar la app en Entra ID, la agenda se lee con el enlace ICS de Outlook. Es **solo lectura** y no necesita a TI.
1. En Safari u otro navegador (en el iPhone, «aA» → *Solicitar sitio web de escritorio*): https://outlook.office.com → ⚙️ Configuración → **Calendario** → **Calendarios compartidos** → *Publicar un calendario* → Calendario + **Puede ver todos los detalles** → **Publicar** → copia el **enlace ICS**.
2. Cloudflare → Workers y Pages → `restalia-ops` → Configuración → Variables y secretos → **Agregar** → Secreto `OUTLOOK_ICS_URL` con ese enlace → Implementar.
3. El backend lo descarga cada 15 minutos (y con «Actualizar ahora»), expande las series (30 días atrás y 120 adelante) y borra de la app lo que desaparezca de Outlook. El enlace nunca llega a la app ni al registro de auditoría.

Quien tenga el enlace puede ver el calendario: no lo compartas. Para anularlo, *Despublicar* en el mismo sitio de Outlook (y pon el nuevo enlace en Cloudflare si vuelves a publicar).

**Crear visitas sin permisos de escritura:** en la ficha del local, **Programar visita** (tipo, día, hora, duración y notas) abre Outlook con el evento ya relleno (`outlook.office.com/calendar/0/deeplink/compose`) o descarga un `.ics` para el calendario del iPhone. Tú pulsas Guardar. El cuerpo del evento lleva la marca `restalia-local:<id>`, que enlaza la cita con su ficha («Próximas citas»). Sin marca, una cita se enlaza a un local si la ubicación contiene su calle o el título contiene su nombre completo. No se envían invitaciones.

Crear y modificar eventos directamente desde la app (sin abrir Outlook) necesita el registro de Entra ID con `Calendars.ReadWrite` en lugar de `Calendars.Read`.

### 4.3 IA (opcional)
Sin hacer nada, el asistente usa Cloudflare Workers AI (Llama 3.3 70B), que procesa los datos en la infraestructura de Cloudflare. Para usar Claude, añade el secreto `ANTHROPIC_API_KEY` (y, si quieres, la variable `AI_MODEL`).

## 5. Sincronización

| Fuente | Cómo | Incremental | Borrados |
|---|---|---|---|
| Notion (9 bases) | `POST /v1/data_sources/{id}/query`, 100 por página | `last_edited_time ≥ última correcta − 2 min` | Reconciliación completa cada noche (02:30 UTC) |
| Outlook Calendar | `calendarView/delta` (30 días atrás, 120 adelante) | deltaLink | `@removed`; la ventana se reinicia cada 7 días |
| Outlook Correo | `inbox/messages/delta` (últimos 30 días) | deltaLink | `@removed` |
| Teams | Canales del equipo (25 últimos por canal) y vista previa de los chats | Por fecha | — |
| OneDrive | `drive/root/delta` (solo archivos) | deltaLink | `deleted` |
| SharePoint | Búsqueda en vivo (`/search/query`) desde Documentación y el asistente | — | — |

- Cron cada 15 minutos (producción) y 30 (desarrollo). Cada ejecución usa como máximo 40 peticiones externas (límite del plan gratuito de Workers): si no termina, guarda el cursor y sigue en la siguiente.
- Reintentos con espera ante 429 y 5xx respetando `Retry-After`. Errores por fuente en Configuración → Sincronización y en `sync_log`.
- Clave de deduplicación: `(system, ref)` = (`notion`, page_id) o (`graph`, `graph:<fuente>:<id>`). La app guarda `source.system`, `source.ref`, `source.updatedAt`, `source.syncedAt`.
- Webhooks: Graph admite suscripciones (correo, calendario, chats) con renovación cada ≤3 días y Notion tiene webhooks de integración. Quedan para una fase posterior; hoy el Cron cubre el caso con un retraso máximo de 15 minutos.

## 6. Endpoints

`GET /api/health` · `GET /api/auth/login[?teams=1]` · `GET /api/auth/callback` · `GET /api/auth/status` · `POST /api/auth/key` · `POST /api/auth/logout` · `POST /api/auth/disconnect` · `GET /api/data?since=` · `GET /api/sync/status` · `POST /api/sync/run {source?, full?}` · `GET /api/notion/schema` · `GET /api/notion/:coleccion` · `GET /api/graph/mail[?q=&from=&since=]` · `GET /api/graph/calendar[?from=&to=]` · `GET /api/graph/teams/messages` · `GET /api/graph/files[?q=]` · `POST /api/approvals/execute` · `POST /api/ai/chat` · `POST /api/push/subscribe` · `GET /api/audit` · `GET /api/factorial/status` · `GET /api/factorial/connect` · `GET /api/factorial/callback` · `GET /api/factorial/tools[?fresh=1]` · `POST /api/factorial/call {name, arguments, confirm}` · `POST /api/factorial/disconnect`.

Todos salvo health y auth exigen sesión.

## 7. Desplegar una versión nueva

Desde el contenedor de Claude no se llega a `api.cloudflare.com`, así que el despliegue usa el Worker `restalia-ops-deployer`: cada minuto copia `worker/src/*.js` y `schema.sql` de la rama guardada en su KV (`ref`) a KV, y Claude publica desde ahí con la API de Cloudflare. Pasos:
1. Subir los cambios a la rama (o a `main`) y poner esa rama en la clave `ref` del KV `restalia-ops-deploy`.
2. Esperar un minuto y publicar `restalia-ops-dev`; probar; publicar `restalia-ops`.

Con un ordenador con `wrangler` también vale: `cd worker && npx wrangler deploy --env dev` (o `--env prod`).

## 7 bis. Comprobar que Notion llega de verdad a la app

`/api/health` solo dice que el Worker responde. Para comprobar la cadena completa, con sesión iniciada: Configuración → **Comprobar conexión con Notion** (`GET /api/notion/check`). Consulta «Locales» en vivo en Notion y lo compara con la copia del backend: número de locales, cuántos tienen «Responsable asignado», última sincronización y si coinciden.

### Locales: campos y escritura

- Mapeo: `responsableAsignado` ← «Responsable asignado», `gerente` ← «Gerente» (nunca se mezclan), `municipio` ← «Municipio», `zona`, `prioridad`, `proximaVisita`, `franquiciado`, `notasGenerales`, `notionEditedAt` (versión de la página). `ciudad` y `responsable` se mantienen como alias por compatibilidad.
- Desde la app solo se pueden **proponer** cambios de Estado, Próxima visita y Notas generales. Se ejecutan solo al aprobarlos en Aprobaciones y con `NOTION_WRITES_ENABLED="true"`. Antes de escribir, el backend comprueba que la página no haya cambiado en Notion desde la propuesta (si cambió → 409 y no se escribe).

### Visitas e incidencias (fase 4)

- En Notion, «Local» es una **relación** con Locales en Visitas, Incidencias y Acciones y seguimientos (la columna de texto antigua se conserva como «Local (texto)»). El backend lee el id del local de la relación y, si no hay relación, usa el texto (`localId` ← relación, o nombre como respaldo).
- Incidencias suma `severidad` ← «Severidad», `fechaObjetivo` ← «Fecha objetivo», `causaRaiz` ← «Causa raíz», `siguientePaso` ← «Siguiente paso». Acciones suma `siguientePaso`.
- Al guardar una visita o incidencia de un **local de Notion**, la app crea automáticamente una propuesta `notion.create` en Aprobaciones con el local como relación (y su nombre de respaldo). Nada se escribe hasta aprobarla.
- Al crear, el backend **omite** (sin inventar nada) los campos que la base no tenga, las opciones de select/estado que no existan y la relación si «Local» todavía es texto. Lo omitido vuelve en `skipped` y queda en el historial de la aprobación.
- Tras ejecutarse, el registro de la app guarda la página creada (`notionRef`). Cuando esa página llega en la siguiente sincronización, la copia local se oculta y la de Notion conserva las fotos: no hay duplicados.
- Modificables tras aprobación en Incidencias: Estado, Acción correctiva, Causa raíz, Siguiente paso, Fecha objetivo y Severidad (se pueden vaciar).
- Crear en Locales desde la app no está permitido (422).

### Mapa de locales (gratis)

- Coordenadas: el backend geocodifica la Dirección (+ Municipio) de cada local con **Nominatim de OpenStreetMap** (gratis, sin clave, máx. 1 consulta/s, User-Agent identificable). Lo hace poco a poco en cada cron (y en «Actualizar ahora»), unos 6 locales por ejecución, y guarda el resultado en la tabla `geocache` de D1. **No escribe nada en Notion.** Si cambia la dirección en Notion, se vuelve a geocodificar. Si la dirección no se encuentra y el local está en un centro comercial («CC …» en el nombre o la dirección), se busca el centro comercial por su nombre. Si tampoco aparece, se usa el centro del municipio (marcado como «aproximada») y se reintenta a los 7 días.
- Mapa: Leaflet 1.9.4 (cdnjs) con teselas de OpenStreetMap, atribución incluida. Comparte filtros con la tabla. `GET /api/geo/status` resume cuántos locales están ubicados.
- El Worker `restalia-ops-deployer` debe incluir `geo.js` en su lista de archivos.

### Factorial (fichaje, vacaciones, tareas y gastos)

- Usa el **servidor MCP oficial** de Factorial (`https://mcp.factorialhr.com`), no la API pública: no hace falta clave de API ni app OAuth de un administrador.
- Al pulsar «Conectar con Factorial», el backend registra la app sola (registro dinámico de clientes, RFC 7591; queda en `vault.factorial_client`) y abre el inicio de sesión de Factorial con PKCE y `resource`. Alberto entra con **su** usuario; el token solo puede hacer lo que él ya puede hacer en Factorial. Tokens cifrados en `vault.factorial`, nunca en el navegador.
- Permisos pedidos: `employees tasks time_off time_tracking company_holidays company_locations one:read one:write` (los de One solo sirven si el plan de Restalia incluye Factorial One).
- La app lee la lista de acciones del servidor (`tools/list`, en caché 12 h) y busca por nombre las de fichar, vacaciones, tareas, compañeros y One. Todas las demás aparecen en «Todas las acciones», con formulario generado a partir de su esquema.
- Las acciones que **cambian algo** (según la anotación `readOnlyHint` o, si falta, el nombre) exigen `confirm: true` (si no, 428) y quedan en el registro de auditoría (`factorial.call`).
- Tickets de gastos: el servidor MCP no tiene herramienta de gastos. Las fotos se guardan en el dispositivo (IndexedDB) y «Subir a Factorial» las comparte con la hoja del iPhone (o las descarga) para subirlas en lote en Factorial (Mis gastos → Subir tickets); su OCR rellena cada gasto. Si hay Factorial One, se le puede pedir el borrador por texto.
- Variable opcional para pruebas: `FACTORIAL_MCP_URL`.
- El Worker `restalia-ops-deployer` debe incluir `factorial.js` en su lista de archivos.

## 8. Pruebas

Se ejecutan solas en GitHub (Actions → CI) en cada PR y en cada cambio de `main`, sin secretos ni acceso a Notion, Microsoft 365 o Cloudflare:
- **Backend (e2e del Worker)**: `worker/test/e2e.mjs` contra APIs simuladas.
- **App (Playwright)**: `worker/test/app-smoke.cjs` en iPhone 13 (claro y oscuro) y escritorio 1440 px: aviso «Sin sesión», acceso, sincronización, que cada pantalla se pinta, mapa a pantalla completa, alta de visita → propuesta para Notion con el local como relación, sin scroll horizontal y sin errores de consola. Las capturas quedan como artefacto «capturas» de la ejecución (7 días).

En local:

```bash
cd worker && npm install
cp test/ci.dev.vars .dev.vars                  # valores ficticios de prueba (no son secretos reales)
npx wrangler d1 execute DB --env dev --local --file schema.sql
node test/mock-apis.mjs &                       # Notion, Entra ID, Graph, Nominatim y calendario simulados
npx wrangler dev --env dev --local --port 8787 &
node test/e2e.mjs                               # con la base local recién creada
# App: servir la raíz del repo en :8000 (FRONTEND_ORIGIN) y, con la base local recién creada,
(cd .. && python3 -m http.server 8000 --bind 127.0.0.1 &) && node test/app-smoke.cjs
```

Cada prueba necesita la base local recién creada (`rm -rf .wrangler/state` y volver a aplicar `schema.sql`): la e2e prueba el bloqueo por intentos fallidos y deja la llave bloqueada un rato.

Cubren: login con PKCE y rechazo de otra cuenta, cookie segura, CSRF, bloqueo por intentos, paginación de Notion, deltas de Graph con borrados, idempotencia (una segunda sincronización no reenvía nada), ausencia de duplicados, reconciliación de borrados, escritura y alta en Notion validadas contra el esquema (relación con el local, opciones inexistentes omitidas), Historial de cambios, calendario publicado de Outlook, cero escrituras en Graph y búsqueda en SharePoint.
