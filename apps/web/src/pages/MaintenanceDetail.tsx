import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, Circle, ClipboardList, Pencil, Plus, Repeat, RotateCcw, Send, Camera, MessageSquare, ListChecks, CalendarDays, Lock, Eye, Users, Receipt, Link2, X, Check, Hourglass } from 'lucide-react';
import { useApi, useAction } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { api, uploadFiles } from '../lib/api';
import { AttachButton, PendingFiles } from '../components/attach';
import { QuoteEditor } from './Finance';
import { Avatar, Badge, Card, Empty, Field, KV, Loading, Modal, PageHeader, Progress, StatusBadge } from '../components/ui';
import { AttachmentStrip, Gallery, MEDIA_ACCEPT, Uploader } from '../components/media';
import { repeatText, teamText } from '../components/planning';
import { fmtDate, fmtDateTime, fmtMoney, relTime } from '../lib/format';
import { MAINT_APPROVAL, CATEGORY_LABELS, MAINTENANCE_STATUS_LABELS, MAINT_TONE, PRIORITY_LABELS, WORK_ORDER_STATUS_LABELS, WO_TONE } from '../lib/labels';
import { MaintenanceForm } from './Maintenance';
import { WorkOrderForm } from './WorkOrders';
import '../styles/doc.css';

type Step = { label: string; done: boolean; doneAt?: string | null; doneBy?: string | null };

/**
 * Bakım görevi: paket adımları (ör. Silver Care maddeleri), "Tamamla", fotoğraf, yorum ve
 * bakıma bağlı ek işler (iş emirleri). Müşteri aynı sayfayı özet olarak görür.
 */
export default function MaintenanceDetail({ planId, quote }: { planId?: string; quote?: string } = {}) {
  const params = useParams();
  const id = planId ?? params.id;
  const nav = useNavigate();
  const { can, staff, user } = useAuth();
  const { data: m } = useApi<any>(`/maintenance/${id}`);
  const [edit, setEdit] = useState(false);
  const [done, setDone] = useState(false);
  const [extra, setExtra] = useState(false);
  const [comment, setComment] = useState('');
  // Yorum kanalı (personel): müşteriyle mi, ekip içi mi — iş emirlerindeki gibi
  const [channel, setChannel] = useState<'client' | 'team'>('client');
  const step = useAction((b: { index: number; done: boolean }) => api(`/maintenance/${id}/steps`, { body: b }));
  const reopen = useAction(() => api(`/maintenance/${id}/reopen`, { body: {} }), { success: 'Bakım yeniden açıldı' });
  const [pending, setPending] = useState<File[]>([]);
  const send = useAction(async (internal: boolean) => {
    const c = await api<any>(`/maintenance/${id}/comments`, { body: { body: comment, internal: staff ? internal : false, withFiles: pending.length > 0 } });
    if (pending.length) await uploadFiles('MAINT_COMMENT', c.id, pending);
    return c;
  }, { success: 'Yorum eklendi', onSuccess: () => { setComment(''); setPending([]); } });
  if (!m) return <Loading />;

  const steps: Step[] = Array.isArray(m.checklist) ? m.checklist : [];
  const doneCount = steps.filter((s) => s.done).length;
  const completed = m.status === 'COMPLETED';
  // Müşteri talebi onaylanmadan bakım yürütülmez
  const awaiting = !!m.approvalStatus && m.approvalStatus !== 'APPROVED';
  const work = !!m.canWork && !completed && !awaiting;
  const idx = (m.series ?? []).findIndex((x: any) => x.id === m.id);
  const prev = idx > 0 ? m.series[idx - 1] : null;
  const next = idx >= 0 && idx < m.series.length - 1 ? m.series[idx + 1] : null;

  return (
    <div>
      <PageHeader
        crumbs={quote ? <><Link to="/quotes">Teklifler</Link> / {quote}</> : <>{staff ? <Link to="/maintenance">Bakım Planları</Link> : <Link to="/maintenance">İşlemler</Link>} / {m.vessel.name}</>}
        title={m.title}
        sub={
          <span className="row-wrap" style={{ gap: 8 }}>
            <StatusBadge map={MAINT_TONE} labels={MAINTENANCE_STATUS_LABELS} value={m.status} />
            <span className="row" style={{ gap: 4 }}><CalendarDays size={14} /> {fmtDate(m.plannedDate)}</span>
            {repeatText(m) && <Badge tone="info" plain><Repeat size={11} /> {repeatText(m)}</Badge>}
            <Link to={`/vessels/${m.vessel.id}`}>{m.vessel.name}</Link>
          </span>
        }
        actions={
          <>
            {staff && can('maintenance.manage') && <button className="btn" onClick={() => setEdit(true)}><Pencil /> Düzenle</button>}
            {staff && can('workorders.manage') && <button className="btn" onClick={() => setExtra(true)}><Plus /> Ek iş emri</button>}
            {completed && staff && can('maintenance.manage') && <button className="btn" onClick={() => reopen.mutate(undefined)}><RotateCcw /> Yeniden aç</button>}
            {work && <button className="btn btn-success" onClick={() => setDone(true)}><CheckCircle2 /> Tamamla</button>}
          </>
        }
      />

      {m.approvalStatus && <ApprovalCard m={m} inQuotes={!!quote} />}

      {completed && (
        <div className="notice ok mb-2">
          <CheckCircle2 />
          <div><b>Bakım tamamlandı</b> · {fmtDateTime(m.completedAt)}{m.completedBy ? ` · ${m.completedBy}` : ''}{steps.length ? ` · ${doneCount}/${steps.length} adım` : ''}{m.completionNote && <div className="mt-1" style={{ whiteSpace: 'pre-wrap' }}>{m.completionNote}</div>}</div>
        </div>
      )}

      <div className="grid g-side">
        <div className="stack">
          <Card title={<span className="row" style={{ gap: 8 }}><ListChecks size={16} /> Bakım adımları{steps.length > 0 && <span className="muted small">· {doneCount}/{steps.length}</span>}</span>}>
            {m.description && <p className="mb-2" style={{ whiteSpace: 'pre-wrap' }}>{m.description}</p>}
            {steps.length > 0 && <div className="mb-2"><Progress value={(doneCount / steps.length) * 100} ok={doneCount === steps.length} /></div>}
            {steps.length === 0 && <Empty title="Adım tanımlanmamış" text={staff ? 'Düzenle → "Bakım adımları" alanına paket maddelerini yazabilirsiniz.' : undefined} />}
            <div className="maint-steps">
              {steps.map((s, i) => (
                <label key={i} className={`maint-step${s.done ? ' done' : ''}${work ? '' : ' ro'}`}>
                  {work ? <input type="checkbox" checked={s.done} disabled={step.isPending} onChange={(e) => step.mutate({ index: i, done: e.target.checked })} /> : s.done ? <CheckCircle2 size={18} className="ok-ic" /> : <Circle size={18} className="muted" />}
                  <span className="grow">{s.label}</span>
                  {s.done && s.doneAt && <small className="muted">{s.doneBy ? `${s.doneBy} · ` : ''}{fmtDateTime(s.doneAt)}</small>}
                </label>
              ))}
            </div>
            {work && steps.length > 0 && doneCount < steps.length && <p className="xs muted mt-2">Adımları tek tek işaretleyebilir ya da "Tamamla" ile hepsini tamamlayabilirsiniz.</p>}
          </Card>

          <Card title={<span className="row" style={{ gap: 8 }}><Camera size={16} /> Fotoğraflar</span>}>
            {staff && m.canWork && <div className="mb-2"><Uploader entityType="MAINTENANCE" entityId={m.id} accept={MEDIA_ACCEPT} tagOptions /></div>}
            {(m.attachments ?? []).length ? <Gallery items={m.attachments} editable={staff} /> : <p className="muted small" style={{ margin: 0 }}>Fotoğraf eklenmemiş.</p>}
            {staff && <p className="xs muted mt-2">Müşteri yalnızca "müşteriye görünür" işaretli fotoğrafları görür.</p>}
          </Card>

          {(() => {
            const all: any[] = m.comments ?? [];
            const team = all.filter((c) => c.internal);
            const client = all.filter((c) => !c.internal);
            const isTeam = staff && channel === 'team';
            const list = staff ? (isTeam ? team : client) : all;
            return (
              <Card className={`comments-card${isTeam ? ' is-team' : ''}`} title={<span className="row" style={{ gap: 8 }}><MessageSquare size={16} /> Yorumlar</span>}>
                <div className="stack" style={{ gap: 12 }}>
                  {staff && (
                    <div className="cm-tabs" role="tablist">
                      <button role="tab" aria-selected={!isTeam} className={`cm-client${!isTeam ? ' active' : ''}`} onClick={() => setChannel('client')}><Users size={15} /> Müşteriyle <em>{client.length}</em></button>
                      <button role="tab" aria-selected={isTeam} className={`cm-team${isTeam ? ' active' : ''}`} onClick={() => setChannel('team')}><Lock size={15} /> Ekip içi <em>{team.length}</em></button>
                    </div>
                  )}
                  {staff && (
                    <div className={`cm-note${isTeam ? ' team' : ''}`}>
                      {isTeam ? <><Lock size={14} /> Yalnızca ekip görür — müşteri (tekne sahibi / kaptan) bu yorumları göremez.</> : <><Eye size={14} /> Buraya yazılanları müşteri (tekne sahibi / kaptan) görür.</>}
                    </div>
                  )}
                  {list.length === 0 && <span className="small muted">{isTeam ? 'Henüz ekip içi yorum yok.' : 'Henüz yorum yok.'}</span>}
                  {list.map((c: any) => (
                    <div key={c.id} className={`cm-item${c.internal ? ' team' : ''}${c.userId && c.userId === user?.id ? ' mine' : ''}`}>
                      <Avatar name={c.userName} size="sm" />
                      <div className="cm-bubble">
                        <div className="small"><b>{c.userName}</b> <span className="muted xs">{relTime(c.createdAt)}</span></div>
                        <div className="small" style={{ whiteSpace: 'pre-wrap' }}>{c.body}</div>
                        <AttachmentStrip items={c.files ?? []} />
                      </div>
                    </div>
                  ))}
                  <div className="composer">
                    <textarea className="textarea" placeholder={isTeam ? 'Ekip içi yorum yazın… (müşteri görmez)' : 'Yorum yazın…'} value={comment} onChange={(e) => setComment(e.target.value)} style={{ minHeight: 64 }} />
                    <PendingFiles files={pending} onChange={setPending} />
                    <div className="row composer-bar">
                      <AttachButton files={pending} onChange={setPending} />
                      <span className="spacer" />
                      <button className={`btn btn-sm ${isTeam ? 'btn-team' : 'btn-primary'}`} disabled={(!comment.trim() && !pending.length) || send.isPending} onClick={() => send.mutate(!!isTeam)}>
                        {send.isPending ? 'Gönderiliyor…' : <>{isTeam ? <Lock /> : <Send />} {isTeam ? 'Ekibe gönder' : 'Gönder'}</>}
                      </button>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })()}
        </div>

        <div className="stack">
          <Card title="Bakım bilgileri">
            <KV items={[
              ['Tekne', <Link to={`/vessels/${m.vessel.id}`}>{m.vessel.name}</Link>],
              ['Marina', [m.vessel.marina, m.vessel.berth].filter(Boolean).join(' · ') || null],
              ['Tarih', fmtDate(m.plannedDate)],
              ['Periyot', repeatText(m) || 'Tek seferlik'],
              ...(m.repeatUntil ? [['Tekrar bitişi', fmtDate(m.repeatUntil)] as [string, any]] : []),
              ['Teknisyenler', teamText(m) || 'Atanmadı'],
              ...(staff ? [['Öncelik', PRIORITY_LABELS[m.priority as keyof typeof PRIORITY_LABELS] ?? m.priority] as [string, any], ['Tahmini süre', m.estimatedHours != null ? `${m.estimatedHours} saat` : null] as [string, any]] : []),
              ...(m.source === 'CUSTOMER' ? [['Talep', `Müşteri talebi${m.requester ? ` · ${m.requester.name}` : ''}`] as [string, any]] : []),
            ]} />
            {staff && m.technicalNotes && <><div className="divider" /><div className="small"><b>Teknik notlar</b><div style={{ whiteSpace: 'pre-wrap' }}>{m.technicalNotes}</div></div></>}
          </Card>

          {staff && (
            <Card title={<span className="row" style={{ gap: 8 }}><ClipboardList size={16} /> Ek işler (iş emirleri)</span>} pad={false}>
              {(m.extraWorkOrders ?? []).length === 0 && <Empty title="Bağlı iş emri yok" text="Bakım sırasında ek bir iş çıkarsa buradan iş emri açabilirsiniz." />}
              {(m.extraWorkOrders ?? []).map((w: any) => (
                <Link key={w.id} to={`/work-orders/${w.id}`} className="list-item" style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div className="grow"><div className="strong truncate">{w.title}</div><div className="xs muted">{w.number}{w.technician ? ` · ${w.technician.name}` : ''}</div></div>
                  <StatusBadge map={WO_TONE} labels={WORK_ORDER_STATUS_LABELS} value={w.status} />
                </Link>
              ))}
              {m.workOrder && (
                <Link to={`/work-orders/${m.workOrder.id}`} className="list-item" style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div className="grow"><div className="strong">{m.workOrder.number}</div><div className="xs muted">Eski bağlantı</div></div>
                  <StatusBadge map={WO_TONE} labels={WORK_ORDER_STATUS_LABELS} value={m.workOrder.status} />
                </Link>
              )}
              {can('workorders.manage') && <div className="toolbar" style={{ borderTop: '1px solid var(--border)', borderBottom: 0 }}><button className="btn btn-sm" onClick={() => setExtra(true)}><Plus /> Ek iş emri aç</button></div>}
            </Card>
          )}

          {(m.series ?? []).length > 1 && (
            <Card title={<span className="row" style={{ gap: 8 }}><Repeat size={16} /> Tekrarlar</span>}>
              <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                <button className="btn btn-sm" disabled={!prev} onClick={() => nav(`/maintenance/${prev.id}`)}>← {prev ? fmtDate(prev.plannedDate) : 'Önceki'}</button>
                <span className="xs muted">{idx + 1} / {m.series.length}</span>
                <button className="btn btn-sm" disabled={!next} onClick={() => nav(`/maintenance/${next.id}`)}>{next ? fmtDate(next.plannedDate) : 'Sonraki'} →</button>
              </div>
              <div className="xs muted mt-2">Tamamlanan: {m.series.filter((x: any) => x.status === 'COMPLETED').length} · Gecikmiş: {m.series.filter((x: any) => x.status === 'OVERDUE').length}</div>
            </Card>
          )}
        </div>
      </div>

      {edit && <MaintenanceForm id={m.id} onClose={() => setEdit(false)} />}
      {extra && <WorkOrderForm vesselId={m.vessel.id} initial={{ vesselId: m.vessel.id, parentPlanId: m.id, parentPlan: { id: m.id, title: m.title, plannedDate: m.plannedDate, category: m.category }, technicianId: m.technicianId ?? '', helperIds: m.helperIds ?? [] }} onClose={() => setExtra(false)} onCreated={(w) => nav(`/work-orders/${w.id}`)} />}
      {done && <CompleteModal m={m} steps={steps} onClose={() => setDone(false)} />}
    </div>
  );
}

/** Tamamla: tüm adımlar tamamlanır; not müşteriye özet olarak görünür */
export function CompleteModal({ m, steps, onClose }: { m: any; steps: Step[]; onClose: () => void }) {
  const [note, setNote] = useState('');
  const [hours, setHours] = useState('');
  const save = useAction(() => api(`/maintenance/${m.id}/complete`, { body: { note: note || null, actualHours: hours || null } }), { success: 'Bakım tamamlandı', onSuccess: onClose });
  const open = steps.filter((s) => !s.done).length;
  return (
    <Modal open onClose={onClose} title="Bakımı tamamla" footer={<><button className="btn" onClick={onClose}>Vazgeç</button><button className="btn btn-success" disabled={save.isPending} onClick={() => save.mutate(undefined)}><CheckCircle2 /> Tamamla</button></>}>
      <div className="stack">
        <div><b>{m.title}</b><div className="small muted">{m.vessel?.name} · {fmtDate(m.plannedDate)}</div></div>
        {steps.length > 0 && <div className="notice">{open ? `Kalan ${open} adım da tamamlandı olarak işaretlenecek.` : 'Tüm adımlar tamamlandı.'}</div>}
        <Field label="Müşteriye özet (isteğe bağlı)"><textarea className="textarea" value={note} placeholder="Ör. Tüm kontroller yapıldı, akü voltajı normal. Sintinede su yok." onChange={(e) => setNote(e.target.value)} /></Field>
        <Field label="Gerçekleşen süre (saat)"><input className="input" type="number" step="0.25" value={hours} onChange={(e) => setHours(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

/**
 * Müşteri bakım talebi onayı: yönetici teklif bağlayıp gönderir (veya teklifsiz onaylar),
 * müşteri teklifi onaylayınca bakım takvime düşer.
 */
function ApprovalCard({ m, inQuotes }: { m: any; inQuotes?: boolean }) {
  const { staff, can } = useAuth();
  const [st, tone] = MAINT_APPROVAL[m.approvalStatus] ?? [m.approvalStatus, 'info'];
  const [editor, setEditor] = useState(false);
  const [pick, setPick] = useState('');
  const [respond, setRespond] = useState<'APPROVED' | 'REJECTED' | null>(null);
  const [note, setNote] = useState('');
  const manage = staff && can('maintenance.manage');
  const quotes = useApi<any>(manage && m.approvalStatus === 'PENDING' ? '/quotes' : null, { vesselId: m.vessel.id, pageSize: 50 }).data?.items?.filter((q: any) => ['DRAFT', 'SENT'].includes(q.status)) ?? [];
  const link = useAction((quoteId: string) => api(`/maintenance/${m.id}/quote`, { body: { quoteId } }), { success: 'Teklif müşteriye gönderildi' });
  const decide = useAction((decision: 'APPROVED' | 'REJECTED') => api(`/maintenance/${m.id}/decision`, { body: { decision } }), { success: 'Kaydedildi' });
  const answer = useAction(() => api(`/quotes/${m.quote.id}/respond`, { body: { decision: respond, note: note || null } }), { success: 'Yanıtınız iletildi', onSuccess: () => setRespond(null) });
  const q = m.quote;
  const steps: string[] = Array.isArray(m.checklist) ? m.checklist.map((x: any) => x.label) : [];
  const prefill = { customerId: m.vessel.ownerId ?? '', vesselId: m.vessel.id, title: `${m.title} — ${m.vessel.name}`, items: (steps.length ? steps : [m.title]).map((d) => ({ description: d, quantity: 1, unit: 'adet', unitPrice: 0 })), notes: m.description ?? '' };
  const cls = tone === 'ok' ? 'notice ok mb-2' : tone === 'danger' ? 'notice danger mb-2' : 'notice mb-2';
  // Yanıtlanmış teklif: İşlemler / Takvim'de bilgi kutusu gösterilmez; Teklifler'den açılınca kalemler görünür
  const answered = m.approvalStatus === 'APPROVED' || m.approvalStatus === 'REJECTED';
  if (answered && !(inQuotes && q)) return null;
  void cls;
  return (
    <Card className="mb-2" title={<span className="row" style={{ gap: 8 }}><Receipt size={16} /> {staff ? 'Müşteri bakım talebi · onay' : 'Teklif ve onay'} <Badge tone={tone as any}>{staff || answered ? st : MAINT_APPROVAL[m.approvalStatus]?.[2]}</Badge></span>}>
      {m.approvalStatus === 'PENDING' && (staff ? (
        <div className="stack" style={{ gap: 10 }}>
          <p className="small" style={{ margin: 0 }}>Müşteri bu bakımı planladı. Teklif hazırlayıp gönderin; müşteri onaylayınca bakım takvime düşer{m.repeatWeekdays?.length || m.repeatMonthDay ? ' ve tekrarlar oluşur' : ''}.</p>
          {manage && (
            <div className="row-wrap" style={{ gap: 8 }}>
              <button className="btn btn-primary" onClick={() => setEditor(true)}><Receipt /> Teklif hazırla</button>
              {quotes.length > 0 && (
                <>
                  <select className="select sm" style={{ width: 'auto', minWidth: 220 }} value={pick} onChange={(e) => setPick(e.target.value)}>
                    <option value="">Mevcut teklifi seç…</option>
                    {quotes.map((x: any) => <option key={x.id} value={x.id}>{x.number} · {x.title}</option>)}
                  </select>
                  <button className="btn" disabled={!pick || link.isPending} onClick={() => link.mutate(pick)}><Link2 /> Bağla ve gönder</button>
                </>
              )}
              <span className="spacer" />
              <button className="btn btn-ghost" onClick={() => confirm('Teklif olmadan onaylansın mı? Bakım hemen takvime eklenir.') && decide.mutate('APPROVED')}><Check /> Teklifsiz onayla</button>
              <button className="btn btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => confirm('Bakım talebi reddedilsin mi?') && decide.mutate('REJECTED')}><X /> Reddet</button>
            </div>
          )}
        </div>
      ) : (
        <div className="row small" style={{ gap: 8 }}><Hourglass size={16} /> Talebiniz ekibimize ulaştı. Teklif hazırlanınca burada görünecek; onayladığınızda bakım takviminize eklenir.</div>
      ))}
      {(m.approvalStatus === 'QUOTE_SENT' || answered) && q && (
        <div className="stack" style={{ gap: 10 }}>
          <div className="row-wrap" style={{ gap: 8 }}>
            <b>{q.title}</b><span className="mono xs muted">{q.number}</span><span className="spacer" />
            <span style={{ fontSize: 18 }}><b className="mono">{fmtMoney(q.total, q.currency)}</b> <span className="xs muted">KDV dahil</span></span>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Kalem</th><th style={{ textAlign: 'right' }}>Miktar</th><th style={{ textAlign: 'right' }}>Tutar</th></tr></thead>
              <tbody>{q.items.map((i: any) => <tr key={i.id}><td>{i.description}</td><td className="mono" style={{ textAlign: 'right' }}>{i.quantity} {i.unit}</td><td className="mono" style={{ textAlign: 'right' }}>{fmtMoney(i.quantity * i.unitPrice, q.currency)}</td></tr>)}</tbody>
            </table>
          </div>
          {answered ? (
            <div className="xs muted">{m.approvalStatus === 'APPROVED' ? `Onaylandı${q.approvedAt ? ` · ${fmtDate(q.approvedAt)}` : ''}` : `Reddedildi${q.rejectedAt ? ` · ${fmtDate(q.rejectedAt)}` : ''}`}</div>
          ) : staff ? (
            <div className="xs muted">Müşteri onayı bekleniyor · <Link to={`/quotes/${q.id}`}>Teklifi aç</Link></div>
          ) : can('quotes.respond') ? (
            <div className="row" style={{ gap: 8 }}>
              <span className="xs muted grow">Onayladığınızda bakım takviminize eklenir.</span>
              <button className="btn" onClick={() => setRespond('REJECTED')}><X /> Reddet</button>
              <button className="btn btn-success" onClick={() => setRespond('APPROVED')}><Check /> Teklifi onayla</button>
            </div>
          ) : (
            <div className="xs muted">Tekne sahibinin onayı bekleniyor.</div>
          )}
        </div>
      )}
      {editor && <QuoteEditor prefill={prefill} onClose={() => setEditor(false)} onSaved={(nq) => link.mutate(nq.id)} />}
      <Modal open={!!respond} onClose={() => setRespond(null)} title={respond === 'APPROVED' ? 'Teklifi onayla' : 'Teklifi reddet'} footer={<><button className="btn" onClick={() => setRespond(null)}>Vazgeç</button><button className={`btn ${respond === 'APPROVED' ? 'btn-success' : 'btn-danger'}`} disabled={answer.isPending} onClick={() => answer.mutate(undefined)}>{respond === 'APPROVED' ? 'Onayla' : 'Reddet'}</button></>}>
        {q && <p className="mb-2">{q.title} · <b>{fmtMoney(q.total, q.currency)}</b></p>}
        <Field label="Not (isteğe bağlı)"><textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </Modal>
    </Card>
  );
}
