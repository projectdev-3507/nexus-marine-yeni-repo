import { FileText, Film, Image as ImageIcon, Paperclip, X } from 'lucide-react';
import { MEDIA_ACCEPT } from './media';

/** Yorum ekleri: seçilen dosyalar (gönderilmeden önce) */
export function PendingFiles({ files, onChange }: { files: File[]; onChange: (f: File[]) => void }) {
  if (!files.length) return null;
  return (
    <div className="pending-files">
      {files.map((f, i) => (
        <span key={i} className="pf">
          {f.type.startsWith('image/') ? <ImageIcon /> : f.type.startsWith('video/') ? <Film /> : <FileText />}
          <span className="pf-name">{f.name}</span>
          <small>{(f.size / 1048576).toFixed(1)} MB</small>
          <button onClick={() => onChange(files.filter((_, j) => j !== i))} aria-label="Kaldır"><X /></button>
        </span>
      ))}
    </div>
  );
}

/** "Ekle" butonu: fotoğraf, video veya belge seçtirir (en fazla 10) */
export function AttachButton({ files, onChange }: { files: File[]; onChange: (f: File[]) => void }) {
  return (
    <label className="btn btn-sm attach-btn" title="Fotoğraf, video veya belge ekle">
      <Paperclip /> <span>Ekle</span>
      <input type="file" multiple hidden accept={MEDIA_ACCEPT} onChange={(e) => { const fs = Array.from(e.target.files ?? []); e.target.value = ''; onChange([...files, ...fs].slice(0, 10)); }} />
    </label>
  );
}
