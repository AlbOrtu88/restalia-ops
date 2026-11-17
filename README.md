# Restalia Operations AI

PWA (app web instalable en iPhone) de operaciones: agenda, tareas, locales, visitas, auditorías, incidencias, proyectos, documentación, comunicaciones, informes, automatizaciones, aprobaciones y asistente IA.

- Sin build: HTML + CSS + módulos ES. Para probar en local: `python3 -m http.server` y abrir http://localhost:8000.
- Los datos incluidos son **DEMO** (ficticios). No hay secretos en este repositorio: los accesos viven como secretos del backend.
- **Versión conectada** (Notion + Microsoft 365): https://restalia-ops.hola-0d4.workers.dev — el Worker de [`worker/`](worker) sirve esta misma app y su API en `/api`.
- Versión sin conexión: https://albortu88.github.io/restalia-ops/
- Administración del backend, secretos, permisos y pasos pendientes: [docs/backend.md](docs/backend.md).
- Arquitectura, limitaciones y backend necesario: [docs/arquitectura.md](docs/arquitectura.md).
- Datos que faltan para conectar Notion y Microsoft 365: [docs/para-chatgpt.md](docs/para-chatgpt.md).
