# Backend de Restalia Operations AI · administración

Versión 0.4 · noviembre de 2026. Código en [`worker/`](../worker). Arquitectura general en [arquitectura.md](arquitectura.md).

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

`GET /api/health` · `GET /api/auth/login[?teams=1]` · `GET /api/auth/callback` · `GET /api/auth/status` · `POST /api/auth/key` · `POST /api/auth/logout` · `POST /api/auth/disconnect` · `GET /api/data?since=` · `GET /api/sync/status` · `POST /api/sync/run {source?, full?}` · `GET /api/notion/schema` · `GET /api/notion/:coleccion` · `GET /api/graph/mail[?q=&from=&since=]` · `GET /api/graph/calendar[?from=&to=]` · `GET /api/graph/teams/messages` · `GET /api/graph/files[?q=]` · `POST /api/approvals/execute` · `POST /api/ai/chat` · `POST /api/push/subscribe` · `GET /api/audit`.

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

### Mapa de locales (gratis)

- Coordenadas: el backend geocodifica la Dirección (+ Municipio) de cada local con **Nominatim de OpenStreetMap** (gratis, sin clave, máx. 1 consulta/s, User-Agent identificable). Lo hace poco a poco en cada cron (y en «Actualizar ahora»), unos 6 locales por ejecución, y guarda el resultado en la tabla `geocache` de D1. **No escribe nada en Notion.** Si cambia la dirección en Notion, se vuelve a geocodificar. Si la dirección no se encuentra y el local está en un centro comercial («CC …» en el nombre o la dirección), se busca el centro comercial por su nombre. Si tampoco aparece, se usa el centro del municipio (marcado como «aproximada») y se reintenta a los 7 días.
- Mapa: Leaflet 1.9.4 (cdnjs) con teselas de OpenStreetMap, atribución incluida. Comparte filtros con la tabla. `GET /api/geo/status` resume cuántos locales están ubicados.
- El Worker `restalia-ops-deployer` debe incluir `geo.js` en su lista de archivos.

## 8. Pruebas

```bash
cd worker && npm install
npx wrangler d1 execute restalia-ops-dev --env dev --local --file schema.sql
node test/mock-apis.mjs &                       # Notion, Entra ID y Graph simulados (datos ficticios)
# .dev.vars con SESSION_SECRET, ACCESS_KEY, MS_*, ALLOWED_EMAIL=test@example.com, NOTION_TOKEN,
# NOTION_DATA_SOURCES={"locales":"ds-locales","tareas":"ds-tareas","historial":"ds-historial"},
# NOTION_API_BASE=http://localhost:8790/notion, GRAPH_BASE=http://localhost:8790/graph,
# MS_LOGIN_BASE=http://localhost:8790/login, GEOCODER_BASE=http://localhost:8790/geo, NOTION_WRITES_ENABLED=true, FRONTEND_ORIGIN=http://localhost:8000
npx wrangler dev --env dev --local &
node test/e2e.mjs                               # 41 comprobaciones (con la base local recién creada)
```

Cubren: login con PKCE y rechazo de otra cuenta, cookie segura, CSRF, bloqueo por intentos, paginación de Notion, deltas de Graph con borrados, idempotencia (una segunda sincronización no reenvía nada), ausencia de duplicados, reconciliación de borrados, escritura en Notion validada contra el esquema, Historial de cambios, cero escrituras en Graph y búsqueda en SharePoint.
