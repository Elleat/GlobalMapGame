import { ArrowLeft, CircleHelp, Download, FileJson, FolderOpen, Plus } from 'lucide-react';
import { useRef } from 'react';

interface FileEditorToolbarProps {
  title: string;
  fileName: string;
  accept?: string;
  dirty: boolean;
  status?: { message: string; isError?: boolean } | null;
  onFileNameChange: (value: string) => void;
  onBack: () => void;
  onNew: () => void;
  onOpen: (file: File) => void;
  onDownload: () => void;
  openLabel?: string;
  downloadLabel?: string;
  onDownloadBundle?: () => void | Promise<void>;
  onHelp?: () => void;
}

export default function FileEditorToolbar({
  title,
  fileName,
  accept = '.json,application/json',
  dirty,
  status,
  onFileNameChange,
  onBack,
  onNew,
  onOpen,
  onDownload,
  openLabel = 'Открыть JSON',
  downloadLabel = 'Скачать JSON',
  onDownloadBundle,
  onHelp
}: FileEditorToolbarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="sticky top-0 z-[90] border-b border-emerald-500/20 bg-black/95 px-4 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <button type="button" onClick={onBack} className="rounded border border-neutral-800 p-2 text-neutral-500 transition hover:border-emerald-500/40 hover:text-emerald-300" title="Главное меню">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <FileJson className="h-6 w-6 text-emerald-400" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate font-mono text-sm font-bold uppercase tracking-wider text-emerald-300">{title}</h1>
              {dirty && <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" title="Есть несохранённые изменения" />}
            </div>
            <p className="text-[11px] text-neutral-600">Отдельный файл · активная кампания не изменяется</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            value={fileName}
            onChange={event => onFileNameChange(event.target.value)}
            aria-label="Название набора"
            className="min-w-[190px] flex-1 rounded border border-neutral-800 bg-[#0b0b0b] px-3 py-2 text-xs text-neutral-200 outline-none focus:border-emerald-500/50 xl:flex-none"
          />
          <button type="button" onClick={onNew} className="flex items-center gap-1.5 rounded border border-neutral-800 px-3 py-2 font-mono text-[10px] uppercase text-neutral-400 transition hover:border-neutral-600 hover:text-neutral-200">
            <Plus className="h-3.5 w-3.5" /> Новый
          </button>
          <button type="button" onClick={() => inputRef.current?.click()} className="flex items-center gap-1.5 rounded border border-neutral-800 px-3 py-2 font-mono text-[10px] uppercase text-neutral-400 transition hover:border-emerald-500/50 hover:text-emerald-300">
            <FolderOpen className="h-3.5 w-3.5" /> {openLabel}
          </button>
          <button type="button" onClick={onDownload} className="flex items-center gap-1.5 rounded border border-emerald-500 bg-emerald-500 px-3 py-2 font-mono text-[10px] font-bold uppercase text-black transition hover:bg-emerald-400">
            <Download className="h-3.5 w-3.5" /> {downloadLabel}
          </button>
          {onDownloadBundle && <button type="button" onClick={() => void onDownloadBundle()} className="flex items-center gap-1.5 rounded border border-amber-500/60 bg-amber-500/10 px-3 py-2 font-mono text-[10px] font-bold uppercase text-amber-300 transition hover:bg-amber-500/20"><Download className="h-3.5 w-3.5" /> Скачать .globalmap</button>}
          {onHelp && <button type="button" onClick={onHelp} className="flex items-center gap-1.5 rounded border border-neutral-800 px-3 py-2 font-mono text-[10px] uppercase text-neutral-400 transition hover:border-emerald-500/50 hover:text-emerald-300" title="Управление и горячие клавиши"><CircleHelp className="h-3.5 w-3.5" /> Справка</button>}
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            className="hidden"
            onChange={event => {
              const file = event.target.files?.[0];
              if (file) onOpen(file);
              event.currentTarget.value = '';
            }}
          />
        </div>
      </div>
      {status && (
        <div className={`mx-auto mt-2 max-w-[1600px] rounded border px-3 py-2 text-xs ${status.isError ? 'border-rose-500/30 bg-rose-500/10 text-rose-300' : 'border-emerald-500/20 bg-emerald-500/5 text-emerald-300'}`}>
          {status.message}
        </div>
      )}
    </div>
  );
}
