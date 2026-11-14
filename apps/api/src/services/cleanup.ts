import type { Prisma } from '@prisma/client';

/**
 * Kalıcı silme yardımcıları (iş emri, proje, tekne). Hepsi bir transaction içinde çağrılır;
 * ilişkili kayıtlar ya silinir ya da bağlantısı kaldırılır, böylece yabancı anahtar hatası oluşmaz.
 */
type Tx = Prisma.TransactionClient;

/** İş emirlerini siler: ekler, bildirimler ve bağlantılar temizlenir (geçmiş, yorum, malzeme kullanımı cascade) */
export async function removeWorkOrders(tx: Tx, ids: string[], opts: { restoreStock?: boolean } = {}) {
  if (!ids.length) return;
  if (opts.restoreStock) {
    const uses = await tx.materialUsage.findMany({ where: { workOrderId: { in: ids } } });
    for (const u of uses) await tx.material.update({ where: { id: u.materialId }, data: { stock: { increment: u.quantity } } });
  }
  const comments = await tx.workOrderComment.findMany({ where: { workOrderId: { in: ids } }, select: { id: true } });
  await tx.fault.updateMany({ where: { workOrderId: { in: ids }, status: { not: 'RESOLVED' } }, data: { workOrderId: null, status: 'OPEN' } });
  await tx.fault.updateMany({ where: { workOrderId: { in: ids } }, data: { workOrderId: null } });
  await tx.maintenancePlan.updateMany({ where: { workOrderId: { in: ids } }, data: { workOrderId: null } });
  await tx.report.updateMany({ where: { workOrderId: { in: ids } }, data: { workOrderId: null } });
  await tx.attachment.deleteMany({ where: { OR: [{ entityType: 'WORK_ORDER', entityId: { in: ids } }, { entityType: 'COMMENT', entityId: { in: comments.map((c) => c.id) } }] } });
  await tx.notification.deleteMany({ where: { link: { in: ids.map((id) => `/work-orders/${id}`) } } });
  await tx.workOrder.deleteMany({ where: { id: { in: ids } } });
}

/** Projeyi siler: fazlar, görevler, ek iş talepleri ve taksitler cascade; iş emri / rapor / ödeme bağlantısı kalkar */
export async function removeProject(tx: Tx, id: string) {
  const phases = await tx.projectPhase.findMany({ where: { projectId: id }, select: { id: true } });
  const uses = await tx.materialUsage.findMany({ where: { projectId: id, workOrderId: null } });
  for (const u of uses) await tx.material.update({ where: { id: u.materialId }, data: { stock: { increment: u.quantity } } });
  await tx.materialUsage.deleteMany({ where: { projectId: id, workOrderId: null } });
  await tx.materialUsage.updateMany({ where: { projectId: id }, data: { projectId: null } });
  await tx.workOrder.updateMany({ where: { projectId: id }, data: { projectId: null } });
  await tx.report.updateMany({ where: { projectId: id }, data: { projectId: null } });
  await tx.payment.updateMany({ where: { projectId: id }, data: { projectId: null } });
  await tx.attachment.deleteMany({ where: { OR: [{ entityType: 'PROJECT', entityId: id }, { entityType: 'PHASE', entityId: { in: phases.map((p) => p.id) } }] } });
  await tx.notification.deleteMany({ where: { link: `/projects/${id}` } });
  await tx.project.delete({ where: { id } });
}

/** Tekneyi tüm operasyon kayıtlarıyla siler (iş emri, arıza, denetim, rapor, proje, bakım). Teklif ve belgeler korunur, tekne bağı kalkar */
export async function removeVessel(tx: Tx, id: string) {
  const wos = await tx.workOrder.findMany({ where: { vesselId: id }, select: { id: true } });
  await removeWorkOrders(tx, wos.map((w) => w.id));
  const faults = await tx.fault.findMany({ where: { vesselId: id }, select: { id: true } });
  await tx.attachment.deleteMany({ where: { entityType: 'FAULT', entityId: { in: faults.map((f) => f.id) } } });
  await tx.fault.deleteMany({ where: { vesselId: id } });
  await tx.report.deleteMany({ where: { vesselId: id } });
  await tx.inspection.deleteMany({ where: { vesselId: id } });
  for (const p of await tx.project.findMany({ where: { vesselId: id }, select: { id: true } })) await removeProject(tx, p.id);
  await tx.quote.updateMany({ where: { vesselId: id }, data: { vesselId: null } });
  await tx.document.updateMany({ where: { vesselId: id }, data: { vesselId: null } });
  await tx.attachment.deleteMany({ where: { vesselId: id } });
  await tx.vessel.delete({ where: { id } });
}
