import { ArrowLeft, Check, ChevronLeft, ChevronRight, FileJson, Image, Map, Shield, Upload, Users } from 'lucide-react';
import { useRef, useState } from 'react';
import {
  formatDataFileError,
  parseAdventurerDataFile,
  parseEventDataFile,
  parseScenarioDataFile,
  readJsonFile,
  type AdventurerDataFile,
  type EventDataFile,
  type ScenarioDataFile
} from '../domain/dataFiles';

export interface NewGameSetupValue {
  guildName: string;
  isDmMode: boolean;
  scenarioFile: ScenarioDataFile | null;
  adventurerFile: AdventurerDataFile | null;
  eventFile: EventDataFile | null;
  mapFile: File | null;
}

interface NewGameSetupProps {
  hasStoredGame: boolean;
  defaultGuildName: string;
  onBack: () => void;
  onStart: (value: NewGameSetupValue) => Promise<boolean>;
}

const steps = ['Основа', 'Наборы данных', 'Карта', 'Проверка'];

export default function NewGameSetup({ hasStoredGame, defaultGuildName, onBack, onStart }: NewGameSetupProps) {
  const [step, setStep] = useState(0);
  const [guildName, setGuildName] = useState(defaultGuildName);
  const [isDmMode, setIsDmMode] = useState(true);
  const [scenarioFile, setScenarioFile] = useState<ScenarioDataFile | null>(null);
  const [adventurerFile, setAdventurerFile] = useState<AdventurerDataFile | null>(null);
  const [eventFile, setEventFile] = useState<EventDataFile | null>(null);
  const [mapFile, setMapFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const scenarioInput = useRef<HTMLInputElement>(null);
  const adventurerInput = useRef<HTMLInputElement>(null);
  const eventInput = useRef<HTMLInputElement>(null);
  const mapInput = useRef<HTMLInputElement>(null);

  const loadScenario = async (file: File) => {
    try {
      const parsed = parseScenarioDataFile(await readJsonFile(file));
      setScenarioFile(parsed);
      setGuildName(parsed.scenario.guildName);
      setError(null);
    } catch (loadError) {
      setError(formatDataFileError(loadError).join(' '));
    }
  };

  const loadAdventurers = async (file: File) => {
    try {
      setAdventurerFile(parseAdventurerDataFile(await readJsonFile(file)));
      setError(null);
    } catch (loadError) {
      setError(formatDataFileError(loadError).join(' '));
    }
  };

  const loadEvents = async (file: File) => {
    try {
      setEventFile(parseEventDataFile(await readJsonFile(file)));
      setError(null);
    } catch (loadError) {
      setError(formatDataFileError(loadError).join(' '));
    }
  };

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const started = await onStart({ guildName, isDmMode, scenarioFile, adventurerFile, eventFile, mapFile });
      if (!started) setBusy(false);
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : 'Не удалось создать новую игру.');
      setBusy(false);
    }
  };

  return (
    <main className="relative z-10 min-h-screen px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <button type="button" onClick={onBack} className="mb-6 flex items-center gap-2 font-mono text-xs text-neutral-500 transition hover:text-emerald-300"><ArrowLeft className="h-4 w-4" /> Главное меню</button>
        <div className="rounded-2xl border border-emerald-500/20 bg-[#090b0a]/95 shadow-2xl">
          <header className="border-b border-emerald-500/15 p-5 sm:p-7">
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-emerald-500">Новая игра</p>
            <h1 className="mt-2 text-2xl font-semibold text-neutral-100">Подготовка кампании</h1>
            <div className="mt-6 grid grid-cols-4 gap-2">
              {steps.map((label, index) => (
                <div key={label} className={`rounded-lg border px-2 py-2 text-center font-mono text-[9px] uppercase sm:text-[10px] ${index === step ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300' : index < step ? 'border-emerald-500/20 text-emerald-600' : 'border-neutral-800 text-neutral-600'}`}>{index + 1}. {label}</div>
              ))}
            </div>
          </header>

          <div className="min-h-[430px] p-5 sm:p-7">
            {error && <div className="mb-5 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</div>}

            {step === 0 && (
              <div className="space-y-6">
                <SectionTitle icon={<Shield className="h-5 w-5" />} title="Основа кампании" description="Выберите стандартную конфигурацию или загрузите подготовленный scenario.json." />
                <label className="block space-y-2"><span className="font-mono text-[10px] uppercase text-neutral-500">Название Гильдии</span><input value={guildName} onChange={event => setGuildName(event.target.value)} className="editor-input" /></label>
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-neutral-300"><input type="checkbox" checked={isDmMode} onChange={event => setIsDmMode(event.target.checked)} className="h-4 w-4 accent-amber-500" /> Начать игру в режиме ГМа</label>
                <FileChoice title="Сценарий" value={scenarioFile ? `${scenarioFile.scenario.name} · ${scenarioFile.scenario.clans.length - 1} кланов` : 'Стандартный сценарий'} onChoose={() => scenarioInput.current?.click()} onClear={scenarioFile ? () => setScenarioFile(null) : undefined} />
                <input ref={scenarioInput} type="file" accept=".json,application/json" className="hidden" onChange={event => { const file = event.target.files?.[0]; if (file) void loadScenario(file); event.currentTarget.value = ''; }} />
              </div>
            )}

            {step === 1 && (
              <div className="space-y-6">
                <SectionTitle icon={<Users className="h-5 w-5" />} title="Наборы данных" description="Отдельные файлы имеют приоритет над списками, встроенными в сценарий. Все файлы проверяются целиком до загрузки." />
                <div className="grid gap-4 md:grid-cols-2">
                  <FileChoice title="Авантюристы" value={adventurerFile ? `${adventurerFile.name} · ${adventurerFile.adventurers.length}` : scenarioFile ? `Из scenario.json · ${scenarioFile.scenario.adventurers.length}` : 'Стандартный список'} onChoose={() => adventurerInput.current?.click()} onClear={adventurerFile ? () => setAdventurerFile(null) : undefined} />
                  <FileChoice title="События" value={eventFile ? `${eventFile.name} · ${eventFile.events.length}` : scenarioFile ? `Из scenario.json · ${scenarioFile.scenario.events.length}` : 'Стандартные события'} onChoose={() => eventInput.current?.click()} onClear={eventFile ? () => setEventFile(null) : undefined} />
                </div>
                <input ref={adventurerInput} type="file" accept=".json,application/json" className="hidden" onChange={event => { const file = event.target.files?.[0]; if (file) void loadAdventurers(file); event.currentTarget.value = ''; }} />
                <input ref={eventInput} type="file" accept=".json,application/json" className="hidden" onChange={event => { const file = event.target.files?.[0]; if (file) void loadEvents(file); event.currentTarget.value = ''; }} />
              </div>
            )}

            {step === 2 && (
              <div className="space-y-6">
                <SectionTitle icon={<Image className="h-5 w-5" />} title="Карта" description="Выберите изображение для этой кампании или оставьте стандартную GlobalMap.webp." />
                <FileChoice title="Изображение карты" value={mapFile ? `${mapFile.name} · ${(mapFile.size / 1024 / 1024).toFixed(1)} МБ` : 'GlobalMap.webp'} onChoose={() => mapInput.current?.click()} onClear={mapFile ? () => setMapFile(null) : undefined} />
                <input ref={mapInput} type="file" accept="image/*" className="hidden" onChange={event => { const file = event.target.files?.[0]; if (file) { if (!file.type.startsWith('image/')) setError('Выбранный файл не является изображением.'); else { setMapFile(file); setError(null); } } event.currentTarget.value = ''; }} />
              </div>
            )}

            {step === 3 && (
              <div className="space-y-6">
                <SectionTitle icon={<Check className="h-5 w-5" />} title="Проверка" description="Новая кампания всегда начинается с первого дня без контрактов и старых рапортов." />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Summary label="Гильдия" value={guildName || 'Не указана'} />
                  <Summary label="Режим запуска" value={isDmMode ? 'ГМ' : 'Игрок'} />
                  <Summary label="Сценарий" value={scenarioFile?.scenario.name ?? 'Стандартный'} />
                  <Summary label="Авантюристы" value={String(adventurerFile?.adventurers.length ?? scenarioFile?.scenario.adventurers.length ?? 'Стандартный список')} />
                  <Summary label="События" value={String(eventFile?.events.length ?? scenarioFile?.scenario.events.length ?? 'Стандартные события')} />
                  <Summary label="Карта" value={mapFile?.name ?? 'GlobalMap.webp'} />
                </div>
                {hasStoredGame && <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-4 text-sm leading-relaxed text-amber-200/70">При запуске существующее локальное сохранение будет заменено после дополнительного подтверждения.</div>}
              </div>
            )}
          </div>

          <footer className="flex items-center justify-between border-t border-neutral-800 p-5 sm:px-7">
            <button type="button" onClick={() => step === 0 ? onBack() : setStep(value => value - 1)} className="flex items-center gap-2 rounded border border-neutral-800 px-4 py-2.5 font-mono text-xs text-neutral-400 transition hover:text-neutral-200"><ChevronLeft className="h-4 w-4" /> Назад</button>
            {step < steps.length - 1 ? (
              <button type="button" onClick={() => { if (step === 0 && !guildName.trim()) { setError('Укажите название Гильдии.'); return; } setError(null); setStep(value => value + 1); }} className="flex items-center gap-2 rounded bg-emerald-500 px-4 py-2.5 font-mono text-xs font-bold text-black transition hover:bg-emerald-400">Далее <ChevronRight className="h-4 w-4" /></button>
            ) : (
              <button type="button" disabled={busy || !guildName.trim()} onClick={() => void start()} className="flex items-center gap-2 rounded bg-emerald-500 px-5 py-2.5 font-mono text-xs font-bold text-black transition hover:bg-emerald-400 disabled:opacity-40"><Map className="h-4 w-4" /> {busy ? 'Создаём…' : 'Начать игру'}</button>
            )}
          </footer>
        </div>
      </div>
    </main>
  );
}

function SectionTitle({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return <div><h2 className="flex items-center gap-2 text-lg font-semibold text-neutral-100">{icon}{title}</h2><p className="mt-2 max-w-3xl text-sm leading-relaxed text-neutral-500">{description}</p></div>;
}

function FileChoice({ title, value, onChoose, onClear }: { title: string; value: string; onChoose: () => void; onClear?: () => void }) {
  return <div className="rounded-xl border border-neutral-800 bg-black/30 p-5"><div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2"><FileJson className="h-4 w-4 text-emerald-500" /><strong className="text-sm text-neutral-200">{title}</strong></div><p className="mt-2 text-xs text-neutral-500">{value}</p></div>{onClear && <button type="button" onClick={onClear} className="text-xs text-rose-400 hover:text-rose-300">Сбросить</button>}</div><button type="button" onClick={onChoose} className="mt-4 flex items-center gap-2 rounded border border-neutral-700 px-3 py-2 font-mono text-[10px] uppercase text-neutral-300 transition hover:border-emerald-500/50 hover:text-emerald-300"><Upload className="h-3.5 w-3.5" /> Выбрать файл</button></div>;
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-neutral-800 bg-black/30 p-4"><span className="font-mono text-[10px] uppercase text-neutral-600">{label}</span><strong className="mt-1 block text-sm text-neutral-200">{value}</strong></div>;
}
