// Único punto que escribe fuera. Requisitos para ejecutar:
//  1) sesión válida, 2) aprobación hecha por Alberto en la app, 3) operación estructurada (op) sobre un campo permitido,
//  4) interruptor NOTION_WRITES_ENABLED="true" en el backend (apagado por defecto: modo seguro).
// Cada ejecución se registra en audit_log y, si Notion lo permite, en «Historial de cambios».
// Correo: no se envía nada (sin Mail.Send). SharePoint/OneDrive y Teams: nunca se escriben.
import { HttpError, Budget, audit, now } from './util.js';
import { updatePage, createPage, NOTION_COLLECTIONS, dataSources } from './notion.js';

const APP_TO_NOTION = { tareas: 'tareas', incidencias: 'incidencias', visitas: 'visitas' };

export async function execute(env, body, session) {
  const op = body?.op;
  const actor = session.user;
  if (!op?.type) {
    await audit(env, 'approval.rejected', { actor, target: body?.id, result: 'sin-op', detail: body?.accion });
    throw new HttpError(422, 'La propuesta no tiene una operación estructurada; no se ejecuta nada. Créala de nuevo desde un registro sincronizado.', 'no-op');
  }
  if (op.type === 'mail.reply' || op.type === 'mail.send') throw new HttpError(403, 'El envío de correo está desactivado (fase posterior, requiere Mail.Send y tu aprobación expresa).', 'mail-disabled');
  if (!op.type.startsWith('notion.')) throw new HttpError(403, `Operación no permitida: ${op.type}. Microsoft 365 es de solo lectura.`, 'forbidden');
  if (env.NOTION_WRITES_ENABLED !== 'true') throw new HttpError(403, 'Las escrituras en Notion están desactivadas en el backend (modo seguro). Actívalas cuando lo decidas.', 'writes-off');
  const col = APP_TO_NOTION[op.collection];
  if (!col || !dataSources(env)[col]) throw new HttpError(422, `Colección no admitida para escritura: ${op.collection}`);
  const budget = new Budget(10);
  let result;
  if (op.type === 'notion.update') {
    if (!/^[0-9a-f-]{32,36}$/i.test(op.ref || '')) throw new HttpError(422, 'Referencia de Notion no válida');
    result = await updatePage(env, budget, col, op.ref, op.changes || {});
  } else if (op.type === 'notion.create') {
    if (col !== 'tareas') throw new HttpError(422, 'Desde la app solo se pueden crear acciones/tareas en Notion');
    result = await createPage(env, budget, col, op.fields || {});
  } else throw new HttpError(422, `Operación desconocida: ${op.type}`);
  await audit(env, 'approval.executed', { actor, target: result.id, detail: `${op.type} ${col} ${JSON.stringify(op.changes || Object.keys(op.fields || {}))}` });
  // Registro en «Historial de cambios» (si la base está configurada). Si falla, la acción ya está hecha y se informa.
  let historial = 'no configurado';
  if (dataSources(env).historial) {
    try {
      await createPage(env, budget, 'historial', {
        texto: `${body.accion || op.type} (aprobado en Restalia Ops)`, fecha: now(), registro: result.id,
        campo: Object.keys(op.changes || op.fields || {}).join(', '), aprobacion: body.id || '',
      });
      historial = 'registrado';
    } catch (e) { historial = `no registrado: ${e.message}`; }
  }
  return { ok: true, ref: result.id, url: result.url, collection: NOTION_COLLECTIONS[col].name, historial };
}
