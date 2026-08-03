import { ArrowLeft, CalendarCog, FileJson, Map, UserRoundCog } from 'lucide-react';
import type { FileEditorKind } from './MainMenu';

interface FileEditorPlaceholderProps {
  kind: FileEditorKind;
  onBack: () => void;
}

const descriptions: Record<FileEditorKind, { title: string; description: string; icon: typeof FileJson }> = {
  ADVENTURERS: {
    title: 'Редактор авантюристов',
    description: 'Этот файловый редактор будет создавать самостоятельные списки adventurers.json и не станет изменять активную кампанию.',
    icon: UserRoundCog
  },
  EVENTS: {
    title: 'Редактор событий',
    description: 'Этот файловый редактор будет создавать events.json с этапами, длительностью и зависимостями событий.',
    icon: CalendarCog
  },
  SCENARIO: {
    title: 'Редактор сценариев',
    description: 'Этот файловый редактор будет собирать scenario.json и переносимые пакеты .globalmap.',
    icon: Map
  }
};

export default function FileEditorPlaceholder({ kind, onBack }: FileEditorPlaceholderProps) {
  const definition = descriptions[kind];
  const Icon = definition.icon;

  return (
    <main className="relative z-10 flex min-h-screen items-center justify-center p-6">
      <section className="w-full max-w-2xl rounded-2xl border border-emerald-500/20 bg-[#090b0a]/95 p-6 shadow-2xl sm:p-9">
        <button type="button" onClick={onBack} className="mb-8 flex items-center gap-2 font-mono text-xs text-neutral-500 transition hover:text-emerald-300">
          <ArrowLeft className="h-4 w-4" /> Главное меню
        </button>
        <Icon className="h-10 w-10 text-emerald-400" />
        <p className="mt-7 font-mono text-[10px] uppercase tracking-[0.28em] text-emerald-500">Внешний JSON-редактор</p>
        <h1 className="mt-2 text-3xl font-semibold text-neutral-100">{definition.title}</h1>
        <p className="mt-4 leading-relaxed text-neutral-400">{definition.description}</p>
        <div className="mt-8 flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm leading-relaxed text-amber-100/70">
          <FileJson className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          <span>Рабочее место подготовлено. Импорт, проверка структуры и сохранение JSON будут добавлены на следующем этапе.</span>
        </div>
      </section>
    </main>
  );
}

