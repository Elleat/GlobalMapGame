import React, { useMemo, useState } from 'react';
import {
  CalendarDays,
  Copy,
  GitBranch,
  MapPin,
  Plus,
  Search,
  Sparkles,
  Trash2
} from 'lucide-react';
import type {
  GameState,
  Mission,
  MissionCheck,
  MissionResourceKey,
  MissionType,
  PrerequisiteMode
} from '../types';
import {
  createScenarioMission,
  deleteScenarioMission,
  getScenarioMissions,
  saveScenarioMission
} from '../domain/scenarioEditor';

interface EventEditorProps {
  state: GameState;
  updateState: (change: Partial<GameState>) => void;
  showToast: (message: string, isError?: boolean) => void;
  mode?: 'LIVE' | 'FILE';
}

const RESOURCE_OPTIONS: { value: MissionResourceKey; label: string }[] = [
  { value: 'None', label: 'Нет ключевого ресурса' },
  { value: 'Supplies', label: 'Припасы' },
  { value: 'Equipment', label: 'Снаряжение' },
  { value: 'Intelligence', label: 'Разведданные' },
  { value: 'Alchemy', label: 'Алхимия' }
];

const TYPE_LABELS: Record<MissionType, string> = {
  OPERATION: 'Операция — автоматическая симуляция',
  STORY: 'Сюжетная миссия — ручной рапорт ГМа',
  DUMMY: 'Пустышка'
};

function cloneMission(source: Mission, existingIds: readonly string[]): Mission {
  const copy = structuredClone(source);
  const base = Date.now().toString(36);
  let id = `${source.id}_copy_${base}`;
  let sequence = 1;
  while (existingIds.includes(id)) {
    id = `${source.id}_copy_${base}_${sequence}`;
    sequence += 1;
  }
  copy.id = id;
  copy.title = `${source.title} — копия`;
  copy.storyStatus = undefined;
  copy.storyAcceptedDay = undefined;
  copy.storyClanId = undefined;
  copy.suggestedSquadAdvIds = undefined;
  copy.checks = copy.checks?.map((check, index) => ({ ...check, id: `${id}_stage_${index + 1}` }));
  return copy;
}

export default function EventEditor({ state, updateState, showToast, mode = 'LIVE' }: EventEditorProps) {
  const scenarioMissions = getScenarioMissions(state);
  const [selectedId, setSelectedId] = useState<string | null>(scenarioMissions[0]?.id ?? null);
  const [query, setQuery] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const selected = scenarioMissions.find(mission => mission.id === selectedId) ?? null;
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ru');
    if (!normalized) return scenarioMissions;
    return scenarioMissions.filter(mission =>
      `${mission.title} ${mission.region} ${mission.desc}`.toLocaleLowerCase('ru').includes(normalized)
    );
  }, [query, scenarioMissions]);

  const save = (mission: Mission, message?: string) => {
    updateState(saveScenarioMission(state, mission));
    if (message) showToast(message);
  };

  const patchMission = (change: Partial<Mission>) => {
    if (!selected) return;
    save({ ...selected, ...change });
  };

  const addMission = () => {
    const mission = createScenarioMission(state.day, scenarioMissions.map(item => item.id));
    save(mission, 'Новое событие добавлено в сценарий.');
    setSelectedId(mission.id);
  };

  const duplicateMission = () => {
    if (!selected) return;
    const copy = cloneMission(selected, scenarioMissions.map(item => item.id));
    save(copy, `Создана копия события «${selected.title}».`);
    setSelectedId(copy.id);
  };

  const removeMission = (id: string) => {
    const title = scenarioMissions.find(item => item.id === id)?.title ?? id;
    updateState(deleteScenarioMission(state, id));
    setSelectedId(scenarioMissions.find(item => item.id !== id)?.id ?? null);
    setPendingDeleteId(null);
    showToast(`Событие «${title}» удалено из сценария.`);
  };

  const updateCheck = (index: number, change: Partial<MissionCheck>) => {
    if (!selected) return;
    const checks = [...(selected.checks ?? [{ id: `${selected.id}_stage_1`, label: 'Этап 1', reqResource: selected.reqResource, dc: selected.dc }])];
    checks[index] = { ...checks[index], ...change };
    const first = checks[0];
    patchMission({ checks, reqResource: first.reqResource ?? 'None', dc: first.dc });
  };

  const addCheck = () => {
    if (!selected) return;
    const checks = selected.checks?.length
      ? [...selected.checks]
      : [{ id: `${selected.id}_stage_1`, label: 'Этап 1', reqResource: selected.reqResource, dc: selected.dc }];
    checks.push({
      id: `${selected.id}_stage_${Date.now().toString(36)}`,
      label: `Этап ${checks.length + 1}`,
      reqResource: 'None',
      dc: 12
    });
    patchMission({ checks });
  };

  const removeCheck = (index: number) => {
    if (!selected) return;
    const checks = (selected.checks ?? []).filter((_, checkIndex) => checkIndex !== index);
    if (checks.length === 0) return;
    patchMission({ checks, reqResource: checks[0].reqResource ?? 'None', dc: checks[0].dc });
  };

  return (
    <section className="space-y-5" aria-label="Редактор событий">
      <div className="rounded-xl border border-emerald-500/20 bg-black/60 p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-emerald-500">{mode === 'FILE' ? 'Файловый редактор' : 'Текущая кампания'}</p>
            <h2 className="mt-1 text-xl font-bold text-white">События глобальной карты</h2>
            <p className="mt-1 max-w-3xl text-sm text-neutral-500">
              {mode === 'FILE'
                ? 'Черновик содержит отдельный набор событий. Он не меняет активную кампанию, пока не будет выбран при создании новой игры.'
                : 'Здесь задаются дни появления, цепочки условий, этапы, ресурсы и осложнения. Будущие события хранятся в сценарии и появятся на карте автоматически.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={duplicateMission} disabled={!selected} className="flex items-center gap-2 rounded-lg border border-neutral-700 px-4 py-2.5 font-mono text-xs uppercase text-neutral-300 transition hover:border-emerald-500/50 disabled:opacity-40">
              <Copy className="h-4 w-4" /> Дублировать
            </button>
            <button type="button" onClick={addMission} className="flex items-center gap-2 rounded-lg border border-emerald-500 bg-emerald-500 px-4 py-2.5 font-mono text-xs font-bold uppercase text-black transition hover:bg-emerald-400">
              <Plus className="h-4 w-4" /> Новое событие
            </button>
          </div>
        </div>
      </div>

      <div className="grid min-h-[760px] gap-5 xl:grid-cols-[330px_minmax(0,1fr)]">
        <aside className="rounded-xl border border-emerald-500/15 bg-[#0b0b0b] p-4">
          <label className="relative block">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-600" />
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Название или регион..." className="w-full rounded-lg border border-neutral-800 bg-black py-2.5 pl-9 pr-3 text-sm text-neutral-200 outline-none transition focus:border-emerald-500/60" />
          </label>
          <div className="mt-4 space-y-2 overflow-y-auto xl:max-h-[900px]">
            {filtered.map(mission => {
              const isActive = state.missions.some(item => item.id === mission.id);
              const isCompleted = state.completedMissionIds.includes(mission.id);
              return (
                <button
                  type="button"
                  key={mission.id}
                  onClick={() => { setSelectedId(mission.id); setPendingDeleteId(null); }}
                  className={`w-full rounded-lg border p-3 text-left transition ${selected?.id === mission.id ? 'border-emerald-500/60 bg-emerald-500/10' : 'border-neutral-800 bg-black/40 hover:border-neutral-700'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <strong className="line-clamp-2 text-sm text-neutral-100">{mission.title}</strong>
                    <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${isCompleted ? 'bg-neutral-600' : isActive ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                  </div>
                  <div className="mt-1.5 font-mono text-[10px] uppercase text-neutral-600">
                    День {mission.startDay ?? 1} · {mission.type === 'STORY' ? 'Сюжетная' : mission.type === 'DUMMY' ? 'Пустышка' : 'Операция'}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="rounded-xl border border-emerald-500/15 bg-[#0b0b0b] p-5 sm:p-6">
          {!selected ? (
            <div className="flex min-h-[600px] flex-col items-center justify-center text-center text-neutral-600">
              <CalendarDays className="mb-3 h-10 w-10" />
              <p>Выберите событие или создайте новое.</p>
            </div>
          ) : (
            <div className="space-y-7">
              <div className="flex flex-col gap-3 border-b border-neutral-800 pb-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-mono text-[10px] uppercase text-neutral-600">ID: {selected.id}</p>
                  <div className="mt-1 flex flex-wrap gap-2 font-mono text-[10px] uppercase">
                    <StatusBadge active={state.missions.some(item => item.id === selected.id)} completed={state.completedMissionIds.includes(selected.id)} />
                    {state.contracts.some(contract => contract.missionId === selected.id) && <span className="rounded bg-violet-500/15 px-2 py-1 text-violet-300">Есть контракт</span>}
                  </div>
                </div>
                {pendingDeleteId === selected.id ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-rose-300">Удалятся также контракт и ссылки на событие. Продолжить?</span>
                    <button type="button" onClick={() => removeMission(selected.id)} className="rounded border border-rose-500 bg-rose-500/15 px-3 py-1.5 text-xs text-rose-300">Да</button>
                    <button type="button" onClick={() => setPendingDeleteId(null)} className="rounded border border-neutral-700 px-3 py-1.5 text-xs text-neutral-400">Нет</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setPendingDeleteId(selected.id)} className="flex items-center gap-2 rounded border border-rose-500/30 px-3 py-2 font-mono text-xs text-rose-400 transition hover:bg-rose-500/10">
                    <Trash2 className="h-4 w-4" /> Удалить
                  </button>
                )}
              </div>

              <EditorSection title="Основные сведения" icon={<MapPin className="h-4 w-4" />}>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Название">
                    <input value={selected.title} onChange={event => patchMission({ title: event.target.value })} className="editor-input" />
                  </Field>
                  <Field label="Тип события">
                    <select value={selected.type} onChange={event => patchMission({ type: event.target.value as MissionType })} className="editor-input">
                      {Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </Field>
                  <Field label="Регион">
                    <input value={selected.region} onChange={event => patchMission({ region: event.target.value })} className="editor-input" />
                  </Field>
                  <Field label="День появления">
                    <input type="number" min={1} value={selected.startDay ?? 1} onChange={event => patchMission({ startDay: Math.max(1, Number(event.target.value) || 1) })} className="editor-input" />
                  </Field>
                  <Field label="Координата X на карте, %">
                    <input type="number" min={0} max={100} step={0.1} value={selected.x} onChange={event => patchMission({ x: Math.max(0, Math.min(100, Number(event.target.value) || 0)) })} className="editor-input" />
                  </Field>
                  <Field label="Координата Y на карте, %">
                    <input type="number" min={0} max={100} step={0.1} value={selected.y} onChange={event => patchMission({ y: Math.max(0, Math.min(100, Number(event.target.value) || 0)) })} className="editor-input" />
                  </Field>
                </div>
                <Field label="Описание">
                  <textarea value={selected.desc} onChange={event => patchMission({ desc: event.target.value })} rows={5} className="editor-input resize-y leading-relaxed" />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Toggle checked={Boolean(selected.pinned)} onChange={checked => patchMission({ pinned: checked })} label="Закреплено на карте" />
                  <Toggle checked={Boolean(selected.intelRevealed)} onChange={checked => patchMission({ intelRevealed: checked })} label="Разведданные уже раскрыты" />
                </div>
              </EditorSection>

              <EditorSection title="Длительность" icon={<CalendarDays className="h-4 w-4" />}>
                <Toggle
                  checked={selected.lifespan === null}
                  onChange={unlimited => patchMission(unlimited
                    ? { lifespan: null, maxLifespan: null }
                    : { lifespan: 3, maxLifespan: 3 })}
                  label="Без длительности — событие не исчезает с карты"
                />
                {selected.lifespan !== null && (
                  <Field label="Сколько дней событие доступно">
                    <input
                      type="number"
                      min={1}
                      value={selected.maxLifespan ?? selected.lifespan}
                      onChange={event => { const lifespan = Math.max(1, Number(event.target.value) || 1); patchMission({ lifespan, maxLifespan: lifespan }); }}
                      className="editor-input max-w-xs"
                    />
                  </Field>
                )}
              </EditorSection>

              <EditorSection title="Этапы операции" icon={<GitBranch className="h-4 w-4" />}>
                <p className="text-xs leading-relaxed text-neutral-500">
                  «Нет ключевого ресурса» — полноценная проверка без автоуспеха. Один приложенный ресурс может быть потрачен только на один этап или осложнение.
                </p>
                <div className="space-y-3">
                  {(selected.checks?.length ? selected.checks : [{ id: `${selected.id}_stage_1`, label: 'Этап 1', reqResource: selected.reqResource, dc: selected.dc }]).map((check, index, checks) => (
                    <div key={check.id ?? index} className="rounded-lg border border-neutral-800 bg-black/40 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <strong className="font-mono text-xs uppercase text-emerald-400">Этап {index + 1}</strong>
                        <button type="button" disabled={checks.length <= 1} onClick={() => removeCheck(index)} className="text-rose-500 transition hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-25" title="Удалить этап"><Trash2 className="h-4 w-4" /></button>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <Field label="Название этапа">
                          <input value={check.label ?? ''} onChange={event => updateCheck(index, { label: event.target.value })} className="editor-input" />
                        </Field>
                        <Field label="Сложность (DC)">
                          <input type="number" min={1} value={check.dc} onChange={event => updateCheck(index, { dc: Math.max(1, Number(event.target.value) || 1) })} className="editor-input" />
                        </Field>
                        <Field label="Ключевой ресурс">
                          <ResourceSelect value={check.reqResource ?? 'None'} onChange={value => updateCheck(index, { reqResource: value })} />
                        </Field>
                        <Field label="Обязательный особый предмет">
                          <input value={check.requiredSpecialItem ?? ''} onChange={event => updateCheck(index, { requiredSpecialItem: event.target.value || undefined })} placeholder="Не требуется" className="editor-input" />
                        </Field>
                      </div>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={addCheck} className="flex items-center gap-2 rounded border border-emerald-500/30 px-3 py-2 font-mono text-xs text-emerald-400 transition hover:bg-emerald-500/10"><Plus className="h-4 w-4" /> Добавить этап</button>
              </EditorSection>

              <EditorSection title="Осложнения" icon={<Sparkles className="h-4 w-4" />}>
                <Toggle checked={selected.complications?.enabled ?? true} onChange={enabled => patchMission({ complications: { ...selected.complications, enabled } })} label="Осложнения включены" />
                {(selected.complications?.enabled ?? true) && (
                  <div className="grid gap-4 md:grid-cols-3">
                    <Field label="Шанс в каждой точке, %">
                      <input type="number" min={0} max={100} step={0.1} value={Math.round((selected.complications?.chancePerSlot ?? 0.03) * 1000) / 10} onChange={event => patchMission({ complications: { ...selected.complications, chancePerSlot: Math.max(0, Math.min(1, (Number(event.target.value) || 0) / 100)) } })} className="editor-input" />
                    </Field>
                    <Field label="Базовая сложность">
                      <input type="number" min={1} value={selected.complications?.baseDc ?? 12} onChange={event => patchMission({ complications: { ...selected.complications, baseDc: Math.max(1, Number(event.target.value) || 1) } })} className="editor-input" />
                    </Field>
                    <div className="flex items-end">
                      <Toggle checked={selected.complications?.allowMultiple ?? true} onChange={allowMultiple => patchMission({ complications: { ...selected.complications, allowMultiple } })} label="Несколько за операцию" />
                    </div>
                  </div>
                )}
                <p className="text-xs text-neutral-600">Итоговый DC осложнения: базовая сложность + количество этапов. Ключевой ресурс осложнения выбирается случайно, включая вариант «нет».</p>
              </EditorSection>

              <EditorSection title="Условия открытия" icon={<GitBranch className="h-4 w-4" />}>
                <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
                  <Field label="Логика нескольких условий">
                    <select value={selected.prerequisiteMode ?? 'ALL'} onChange={event => patchMission({ prerequisiteMode: event.target.value as PrerequisiteMode })} className="editor-input">
                      <option value="ALL">Выполнить все (И)</option>
                      <option value="ANY">Выполнить хотя бы одно (ИЛИ)</option>
                    </select>
                  </Field>
                  <div>
                    <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-neutral-500">Необходимые предыдущие события</span>
                    <div className="mt-1.5 max-h-56 space-y-1 overflow-y-auto rounded-lg border border-neutral-800 bg-black/40 p-2">
                      {scenarioMissions.filter(item => item.id !== selected.id).map(mission => {
                        const checked = (selected.prerequisiteMissionIds ?? []).includes(mission.id);
                        return (
                          <label key={mission.id} className="flex cursor-pointer items-start gap-2 rounded p-2 text-xs text-neutral-300 transition hover:bg-neutral-900">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={event => {
                                const current = selected.prerequisiteMissionIds ?? [];
                                patchMission({ prerequisiteMissionIds: event.target.checked ? [...current, mission.id] : current.filter(id => id !== mission.id) });
                              }}
                              className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-500"
                            />
                            <span>{mission.title} <small className="text-neutral-600">({mission.id})</small></span>
                          </label>
                        );
                      })}
                      {scenarioMissions.length <= 1 && <p className="p-3 text-center text-xs text-neutral-600">Сначала создайте другое событие.</p>}
                    </div>
                  </div>
                </div>
              </EditorSection>

              <EditorSection title="Награды и тексты рапорта" icon={<Sparkles className="h-4 w-4" />}>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Золотая награда клану">
                    <input type="number" min={0} value={selected.goldReward ?? 0} onChange={event => patchMission({ goldReward: Math.max(0, Number(event.target.value) || 0) })} className="editor-input" />
                  </Field>
                  <Field label="Особый предмет, необходимый всей миссии">
                    <input value={selected.requiredSpecialItem ?? ''} onChange={event => patchMission({ requiredSpecialItem: event.target.value || undefined })} placeholder="Не требуется" className="editor-input" />
                  </Field>
                </div>
                <div className="space-y-2">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-neutral-500">Особые предметы в награду</span>
                  {(selected.rewardSpecialItems ?? []).map((item, index) => (
                    <div key={`${selected.id}_reward_${index}`} className="flex gap-2">
                      <input
                        value={item}
                        onChange={event => {
                          const rewardSpecialItems = [...(selected.rewardSpecialItems ?? [])];
                          rewardSpecialItems[index] = event.target.value;
                          patchMission({ rewardSpecialItems });
                        }}
                        placeholder={`Предмет ${index + 1}`}
                        className="editor-input"
                      />
                      <button
                        type="button"
                        onClick={() => patchMission({ rewardSpecialItems: (selected.rewardSpecialItems ?? []).filter((_, itemIndex) => itemIndex !== index) })}
                        className="rounded-lg border border-rose-500/25 px-3 text-rose-400 transition hover:bg-rose-500/10"
                        title="Удалить награду"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => patchMission({ rewardSpecialItems: [...(selected.rewardSpecialItems ?? []), 'Новый особый предмет'] })}
                    className="flex items-center gap-2 rounded border border-amber-500/30 px-3 py-2 font-mono text-xs text-amber-400 transition hover:bg-amber-500/10"
                  >
                    <Plus className="h-4 w-4" /> Добавить особую награду
                  </button>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Текст при успехе">
                    <textarea value={selected.successText ?? ''} onChange={event => patchMission({ successText: event.target.value })} rows={4} className="editor-input resize-y" />
                  </Field>
                  <Field label="Текст при провале">
                    <textarea value={selected.failText ?? ''} onChange={event => patchMission({ failText: event.target.value })} rows={4} className="editor-input resize-y" />
                  </Field>
                </div>
              </EditorSection>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function StatusBadge({ active, completed }: { active: boolean; completed: boolean }) {
  if (completed) return <span className="rounded bg-neutral-700/50 px-2 py-1 text-neutral-400">Завершено</span>;
  if (active) return <span className="rounded bg-emerald-500/15 px-2 py-1 text-emerald-300">На карте</span>;
  return <span className="rounded bg-amber-500/15 px-2 py-1 text-amber-300">Ожидает условий</span>;
}

function EditorSection({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-4 border-t border-neutral-800 pt-6 first:border-t-0 first:pt-0">
      <h3 className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider text-emerald-400">{icon}{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-neutral-500">{label}</span>
      {children}
    </label>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-neutral-800 bg-black/40 p-3 text-xs text-neutral-300">
      <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} className="h-4 w-4 shrink-0 accent-emerald-500" />
      {label}
    </label>
  );
}

function ResourceSelect({ value, onChange }: { value: MissionResourceKey; onChange: (value: MissionResourceKey) => void }) {
  return (
    <select value={value} onChange={event => onChange(event.target.value as MissionResourceKey)} className="editor-input">
      {RESOURCE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  );
}
