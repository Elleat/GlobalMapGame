import { CalendarCog, ChevronLeft, FileJson, FolderOpen, Gamepad2, Map, Play, UserRoundCog } from 'lucide-react';
import { useRef } from 'react';

export type FileEditorKind = 'ADVENTURERS' | 'EVENTS' | 'SCENARIO';

interface MainMenuProps {
  guildName: string;
  hasSavedGame: boolean;
  gameChoicesOpen: boolean;
  onOpenGameChoices: () => void;
  onCloseGameChoices: () => void;
  onContinue: () => void;
  onNewGame: () => void;
  onLoadScenario: (file: File) => void;
  onOpenFileEditor: (kind: FileEditorKind) => void;
}

const editorCards: Array<{
  kind: FileEditorKind;
  title: string;
  description: string;
  icon: typeof UserRoundCog;
}> = [
  {
    kind: 'ADVENTURERS',
    title: 'Редактор авантюристов',
    description: 'Подготовить отдельный JSON-файл с героями, не изменяя текущую кампанию.',
    icon: UserRoundCog
  },
  {
    kind: 'EVENTS',
    title: 'Редактор событий',
    description: 'Составить события, этапы и цепочки зависимостей в отдельном JSON-файле.',
    icon: CalendarCog
  },
  {
    kind: 'SCENARIO',
    title: 'Редактор сценариев',
    description: 'Собрать настройки мира и подключаемые наборы данных для новой кампании.',
    icon: Map
  }
];

export default function MainMenu({
  guildName,
  hasSavedGame,
  gameChoicesOpen,
  onOpenGameChoices,
  onCloseGameChoices,
  onContinue,
  onNewGame,
  onLoadScenario,
  onOpenFileEditor
}: MainMenuProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <main className="relative z-10 flex min-h-screen items-center justify-center overflow-hidden px-4 py-10 sm:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(16,185,129,0.11),transparent_36%)]" />
      <div className="relative w-full max-w-5xl">
        <div className="mb-9 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-emerald-500/50 bg-emerald-500/10 shadow-[0_0_35px_rgba(16,185,129,0.18)]">
            <Map className="h-8 w-8 text-emerald-400" />
          </div>
          <p className="font-mono text-[10px] uppercase tracking-[0.38em] text-emerald-500/80">Настольная стратегическая система</p>
          <h1 className="mt-3 font-mono text-3xl font-bold uppercase tracking-[0.16em] text-emerald-300 sm:text-5xl">
            Глобальная Карта
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-neutral-500">
            Запускайте кампанию или подготавливайте самостоятельные наборы данных для будущих сценариев.
          </p>
        </div>

        {gameChoicesOpen ? (
          <section className="mx-auto max-w-3xl rounded-2xl border border-emerald-500/20 bg-[#090b0a]/95 p-5 shadow-2xl sm:p-8" aria-label="Выбор запуска игры">
            <button type="button" onClick={onCloseGameChoices} className="mb-6 flex items-center gap-2 font-mono text-xs text-neutral-500 transition hover:text-emerald-300">
              <ChevronLeft className="h-4 w-4" /> Главное меню
            </button>
            <div className="mb-6">
              <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-emerald-500">Игра</p>
              <h2 className="mt-2 text-2xl font-semibold text-neutral-100">Выберите способ запуска</h2>
              {hasSavedGame && <p className="mt-2 text-sm text-neutral-500">Текущая кампания: «{guildName}»</p>}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <button
                type="button"
                onClick={onContinue}
                disabled={!hasSavedGame}
                className="group rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-left transition hover:border-emerald-400 hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:border-neutral-800 disabled:bg-black/30 disabled:opacity-45"
              >
                <Play className="mb-5 h-6 w-6 text-emerald-400" />
                <strong className="block font-mono text-sm uppercase text-neutral-100">Продолжить</strong>
                <span className="mt-2 block text-xs leading-relaxed text-neutral-500">Открыть сохранённую текущую кампанию.</span>
              </button>
              <button type="button" onClick={onNewGame} className="rounded-xl border border-neutral-800 bg-black/40 p-5 text-left transition hover:border-emerald-500/50 hover:bg-emerald-500/5">
                <Gamepad2 className="mb-5 h-6 w-6 text-emerald-400" />
                <strong className="block font-mono text-sm uppercase text-neutral-100">Новая игра</strong>
                <span className="mt-2 block text-xs leading-relaxed text-neutral-500">Начать кампанию со стандартными данными.</span>
              </button>
              <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-xl border border-neutral-800 bg-black/40 p-5 text-left transition hover:border-emerald-500/50 hover:bg-emerald-500/5">
                <FolderOpen className="mb-5 h-6 w-6 text-emerald-400" />
                <strong className="block font-mono text-sm uppercase text-neutral-100">Загрузить сценарий</strong>
                <span className="mt-2 block text-xs leading-relaxed text-neutral-500">Открыть переносимый файл `.globalmap`.</span>
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".globalmap,application/json"
              className="hidden"
              onChange={event => {
                const file = event.target.files?.[0];
                if (file) onLoadScenario(file);
                event.currentTarget.value = '';
              }}
            />
          </section>
        ) : (
          <section className="grid gap-4 md:grid-cols-2" aria-label="Главное меню Глобальной Карты">
            <button
              type="button"
              onClick={onOpenGameChoices}
              className="group rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-left shadow-[0_0_35px_rgba(16,185,129,0.06)] transition hover:-translate-y-0.5 hover:border-emerald-400 hover:bg-emerald-500/15 md:col-span-2"
            >
              <div className="flex items-start justify-between gap-5">
                <div>
                  <Gamepad2 className="mb-7 h-8 w-8 text-emerald-400" />
                  <strong className="block font-mono text-xl uppercase tracking-wider text-neutral-100">Игра</strong>
                  <span className="mt-2 block max-w-xl text-sm leading-relaxed text-neutral-500">Продолжить текущую кампанию, начать новую или загрузить готовый сценарий.</span>
                </div>
                <Play className="mt-1 h-6 w-6 text-emerald-500/50 transition group-hover:text-emerald-300" />
              </div>
            </button>

            {editorCards.map(({ kind, title, description, icon: Icon }) => (
              <button
                type="button"
                key={kind}
                onClick={() => onOpenFileEditor(kind)}
                className={`rounded-2xl border border-neutral-800 bg-[#090909]/90 p-6 text-left transition hover:-translate-y-0.5 hover:border-emerald-500/45 hover:bg-emerald-500/5 ${kind === 'SCENARIO' ? 'md:col-span-2' : ''}`}
              >
                <Icon className="mb-6 h-7 w-7 text-emerald-500" />
                <strong className="block font-mono text-sm uppercase tracking-wide text-neutral-100">{title}</strong>
                <span className="mt-2 block text-xs leading-relaxed text-neutral-500">{description}</span>
              </button>
            ))}
          </section>
        )}

        <div className="mt-7 flex items-center justify-center gap-2 font-mono text-[10px] uppercase tracking-widest text-neutral-700">
          <FileJson className="h-3.5 w-3.5" /> Локальные файлы · одна текущая кампания
        </div>
      </div>
    </main>
  );
}

