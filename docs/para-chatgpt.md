# Lo que ChatGPT debe entregar para conectar Restalia Operations AI

Lista concreta. Con esto se rellenan `js/adapters/notion.js` (IDs y mapeo de propiedades) y se construye el backend. **Nada de lo que aparece en la app hoy es dato real de Restalia.**

Formato preferido: un JSON o una tabla por punto. Si algo no existe, indicarlo con «no existe» en lugar de inventarlo.

## 1. Notion

1. **ID de cada base de datos** (32 caracteres) y nombre exacto:
   - Locales
   - Visitas
   - Incidencias
   - Acciones y seguimientos
   - Contactos
   - Registro del asistente IA
   - Bandeja de aprobaciones
   - Historial de cambios
   - **Agenda Restalia** (ID y si es base de datos o calendario vinculado)
2. **Esquema de propiedades de cada base**: nombre exacto, tipo (title, select, multi_select, status, date, relation, people, rich_text, number, checkbox, url, files) y, para select/status, la lista de opciones con su orden.
3. **Relaciones entre bases** (p. ej. Visitas → Locales, Incidencias → Locales, Acciones → Visitas/Incidencias) con el nombre de la propiedad de relación.
4. **Equivalencias de estados** con la app:
   - Incidencias: Nueva / En curso / Pendiente / Resuelta / Cerrada
   - Tareas: Pendiente / En curso / Bloqueada / Hecha
   - Prioridades: Crítica / Alta / Media / Baja
   - Resultado de visita: Satisfactoria / Con incidencias / Crítica
5. **¿Existen bases de Auditorías, Plantillas de auditoría o Proyectos?** Si existen, su ID y esquema; si no, se mantienen en la app (capa C) y no se crean en Notion.
6. **Workspace e integración**: nombre del workspace y confirmación de que se puede crear una integración interna con acceso solo a estas bases (el token lo guardará el backend, nunca la app).
7. **Qué propiedades puede escribir la app** en cada base y cuáles son de solo lectura.
8. 3 a 5 **ejemplos anonimizados** de registros de Locales, Visitas e Incidencias para validar el mapeo (sin nombres, teléfonos ni emails reales).

## 2. Microsoft 365

1. **Tenant**: dominio principal y si TI permite registrar una aplicación en Microsoft Entra ID (o quién debe hacerlo).
2. **Buzón** a leer (el de Alberto) y carpetas relevantes, si no es solo la Bandeja de entrada.
3. **Calendarios** de Outlook a sincronizar (principal y compartidos, con su nombre).
4. **Teams**: equipos y canales a leer (nombre exacto) y si interesan los chats 1:1.
5. **SharePoint**: sitios y bibliotecas (URL) con manuales, procedimientos y documentación, agrupados por área (Operaciones, Formación, Marketing, Comunicación, RRHH, Compras, Calidad, PRL, Aperturas, Locales).
6. **OneDrive**: carpetas de Alberto que deben indexarse.
7. Confirmación de que **no se escribirá nunca** en SharePoint ni OneDrive (la app solo enlaza).
8. Si TI exige que el backend se aloje en Azure o permite Cloudflare.

## 3. Proveedor de IA

1. Proveedor elegido (Anthropic Claude, OpenAI o Azure OpenAI) y modelo.
2. Política de datos de Restalia: qué información puede enviarse al proveedor (p. ej. sin datos personales de clientes).
3. Quién custodia la clave de API.

## 4. Operativa

1. Lista de **marcas** y su código.
2. **Roles y personas** que usarán la app (solo cargos, sin datos personales) y qué módulos ve cada uno.
3. **Categorías de auditoría** y checklists oficiales, si existen, para sustituir las plantillas DEMO.
4. **Categorías de incidencias** oficiales y plazos de resolución por prioridad.
5. **Automatizaciones** deseadas con su disparador y acción (p. ej. «briefing diario a las 8:00»).
6. **KPIs oficiales** y su definición (cómo se calculan visitas realizadas, acciones pendientes, etc.).

## 5. Formato de entrega sugerido

```json
{
  "notion": {
    "locales": { "databaseId": "…", "properties": { "Nombre": "title", "Marca": "select:[…]" } },
    "agendaRestalia": { "databaseId": "…" }
  },
  "m365": { "tenant": "…", "calendars": ["…"], "teams": [{ "team": "…", "channels": ["…"] }], "sharepoint": [{ "area": "Calidad", "url": "…" }] },
  "ai": { "provider": "…", "model": "…" }
}
```
