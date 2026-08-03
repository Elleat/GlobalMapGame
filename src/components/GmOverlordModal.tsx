/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState } from 'react';
import { Shield, X, Heart, Plus, Copy, Upload, Save, RotateCw, FilePlus, Compass, Trash2, ImagePlus, FileArchive } from 'lucide-react';
import { GameState, Mission, MissionCheck, MissionResourceKey, MissionType } from '../types';
import { DEFAULT_GUILD_NAME, DEFAULT_MAP_URL } from '../domain/constants';

interface GmOverlordModalProps {
  isOpen: boolean;
  onClose: () => void;
  state: GameState;
  updateState: (newState: Partial<GameState>) => void;
  showToast: (msg: string, isError?: boolean) => void;
  onHealAll: () => void;
  onCreateCustomMission: (missionData: Partial<Mission>) => void;
  onImportState: (importedState: GameState) => void;
  onResetToDay1: () => void;
  onSelectMapFile: (file: File) => Promise<void>;
  onRestoreDefaultMap: () => Promise<void>;
  onExportScenario: () => Promise<void>;
  onImportScenario: (file: File) => Promise<void>;
}

export default function GmOverlordModal({
  isOpen,
  onClose,
  state,
  updateState,
  showToast,
  onHealAll,
  onCreateCustomMission,
  onImportState,
  onResetToDay1,
  onSelectMapFile,
  onRestoreDefaultMap,
  onExportScenario,
  onImportScenario
}: GmOverlordModalProps) {
  const [showConfirmReset, setShowConfirmReset] = useState(false);
  const [showCreateMissionModal, setShowCreateMissionModal] = useState(false);

  // Mission parameter state (defaults to a standard 3-day mission)
  const [mTitle, setMTitle] = useState('Новое Донесение');
  const [mDesc, setMDesc] = useState('Поступили свежие сведения о происшествии в регионе.');
  const [mRegion, setMRegion] = useState('ДИКИЕ ЗЕМЛИ');
  const [mReqResource, setMReqResource] = useState<MissionResourceKey>('Supplies');
  const [mRequiredSpecialItem, setMRequiredSpecialItem] = useState('');
  const [mDc, setMDc] = useState(12);
  const [mType, setMType] = useState<MissionType>('OPERATION');
  const [mLifespan, setMLifespan] = useState(3);
  const [mX, setMX] = useState(50);
  const [mY, setMY] = useState(50);
  const [mIntelRevealed, setMIntelRevealed] = useState(false);
  const [mGoldReward, setMGoldReward] = useState(0);
  const [mPinned, setMPinned] = useState(false);
  const [mChecks, setMChecks] = useState<MissionCheck[]>([
    { reqResource: 'Supplies', dc: 12 }
  ]);

  const fileEventsRef = useRef<HTMLInputElement>(null);
  const fileAdvsRef = useRef<HTMLInputElement>(null);
  const fileStateRef = useRef<HTMLInputElement>(null);
  const fileMapRef = useRef<HTMLInputElement>(null);
  const fileScenarioRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleAddCheckStage = () => {
    setMChecks([...mChecks, { reqResource: 'Equipment', dc: 12 }]);
  };

  const handleRemoveCheckStage = (index: number) => {
    if (mChecks.length <= 1) return;
    setMChecks(mChecks.filter((_, i) => i !== index));
  };

  const handleUpdateCheckStage = (index: number, field: 'reqResource' | 'dc', value: any) => {
    const updated = [...mChecks];
    updated[index] = { ...updated[index], [field]: value };
    setMChecks(updated);
  };

  const handleAddPolygonVertex = () => {
    const poly = [...state.spawnPolygon];
    if (poly.length === 0) {
      poly.push({ x: 50, y: 50 });
    } else {
      const last = poly[poly.length - 1];
      const first = poly[0];
      poly.push({
        x: Math.round((last.x + first.x) / 2),
        y: Math.round((last.y + first.y) / 2)
      });
    }
    updateState({ spawnPolygon: poly });
  };

  const handleRemovePolygonVertex = () => {
    if (state.spawnPolygon.length <= 3) return;
    const poly = state.spawnPolygon.slice(0, -1);
    updateState({ spawnPolygon: poly });
  };

  const handleUpdatePolygonVertex = (index: number, field: 'x' | 'y', val: number) => {
    const poly = [...state.spawnPolygon];
    const clamped = Math.max(0, Math.min(100, val));
    poly[index] = { ...poly[index], [field]: clamped };
    updateState({ spawnPolygon: poly });
  };

  const handleCustomMissionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalChecks = mType === 'DUMMY' ? [] : mChecks;
    const firstCheck = finalChecks[0] || { reqResource: mReqResource, dc: mDc };

    onCreateCustomMission({
      title: mTitle.trim() || 'Новое Донесение',
      desc: mDesc.trim() || 'Поступили свежие сведения о происшествии.',
      region: mRegion.trim() || 'ДИКИЕ ЗЕМЛИ',
      reqResource: mType === 'DUMMY' ? 'None' : (firstCheck.reqResource || 'Supplies'),
      requiredSpecialItem: mType === 'STORY' && mRequiredSpecialItem.trim() ? mRequiredSpecialItem.trim() : undefined,
      dc: mType === 'DUMMY' ? 0 : (firstCheck.dc || 12),
      type: mType,
      lifespan: Number(mLifespan) || 3,
      maxLifespan: Number(mLifespan) || 3,
      x: Number(mX) || 50,
      y: Number(mY) || 50,
      intelRevealed: mIntelRevealed,
      goldReward: mType === 'DUMMY' ? 0 : (mGoldReward > 0 ? Number(mGoldReward) : undefined),
      pinned: mPinned,
      checks: finalChecks
    });
    setShowCreateMissionModal(false);
    
    // Reset defaults for next time
    setMTitle('Новое Донесение');
    setMDesc('Поступили свежие сведения о происшествии в регионе.');
    setMRegion('ДИКИЕ ЗЕМЛИ');
    setMReqResource('Supplies');
    setMRequiredSpecialItem('');
    setMDc(12);
    setMType('OPERATION');
    setMLifespan(3);
    setMX(50);
    setMY(50);
    setMIntelRevealed(false);
    setMGoldReward(0);
    setMPinned(false);
    setMChecks([{ reqResource: 'Supplies', dc: 12 }]);
  };

  const handleApplyChanges = (e: React.FormEvent) => {
    e.preventDefault();
    const mapUrl = (document.getElementById('dm-input-mapurl') as HTMLInputElement)?.value.trim() || state.mapBgUrl;
    const width = parseInt((document.getElementById('dm-input-mapwidth') as HTMLInputElement)?.value) || state.mapWidth;
    const height = parseInt((document.getElementById('dm-input-mapheight') as HTMLInputElement)?.value) || state.mapHeight;
    const day = parseInt((document.getElementById('dm-input-day') as HTMLInputElement)?.value) || state.day;
    const nClans = parseInt((document.getElementById('dm-input-nclans') as HTMLInputElement)?.value) || state.nClans;
    const hCost = parseInt((document.getElementById('dm-input-hcost') as HTMLInputElement)?.value) || state.hCost;
    const guildName = (document.getElementById('dm-input-guild-name') as HTMLInputElement)?.value.trim() || DEFAULT_GUILD_NAME;
    const mapUrlChanged = mapUrl !== state.mapBgUrl;
    const renameGuildReport = (report: NonNullable<GameState['contracts'][number]['simulationReport']>) =>
      report.context?.clanId === 'clan_guild' || report.clanName === state.guildName
        ? { ...report, clanName: guildName }
        : report;

    updateState({
      mapBgUrl: mapUrl,
      mapAssetId: mapUrlChanged ? null : state.mapAssetId,
      mapWidth: width,
      mapHeight: height,
      day,
      nClans,
      hCost,
      guildName,
      guildShortName: guildName,
      clans: state.clans.map(clan => clan.id === 'clan_guild' ? { ...clan, name: guildName } : clan),
      contracts: state.contracts.map(contract => ({
        ...contract,
        simulationReport: contract.simulationReport ? renameGuildReport(contract.simulationReport) : undefined
      })),
      history: state.history.map(entry => ({
        ...entry,
        reports: entry.reports.map(renameGuildReport)
      }))
    });

    showToast('Параметры ГМа успешно применены!');
    onClose();
  };

  // Export state to JSON
  const handleExportState = () => {
    try {
      const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
        JSON.stringify(state, null, 2)
      )}`;
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', jsonString);
      downloadAnchor.setAttribute('download', `adventurer_guild_save_day_${state.day}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      showToast('💾 Сейв-файл игры успешно скачан!');
    } catch (err) {
      showToast('Ошибка при экспорте сейва', true);
    }
  };

  // Import state from JSON
  const handleImportStateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string) as GameState;
        
        if (parsed && typeof parsed.day === 'number' && Array.isArray(parsed.clans) && Array.isArray(parsed.adventurers)) {
          onImportState(parsed);
          showToast('💾 Игровое сохранение успешно загружено!');
        } else {
          showToast('Некорректная структура сейв-файла!', true);
        }
      } catch (err) {
        showToast('Не удалось разобрать JSON файл сейва!', true);
      }
    };
    reader.readAsText(file);
  };

  const copyPolygonJson = () => {
    const jsonStr = JSON.stringify(state.spawnPolygon, null, 2);
    navigator.clipboard.writeText(jsonStr).then(() => {
      showToast('📋 JSON координат полигона скопирован в буфер!');
    }).catch(() => {
      showToast('📋 Не удалось скопировать', true);
    });
  };

  const handleImportEvents = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (Array.isArray(data)) {
          const newMissions = data.map(item => ({
            id: item.id || 'imported_' + Math.random().toString(36).substr(2, 6),
            title: item.title || 'Импортированное событие',
            desc: item.desc || 'Описание из сценария',
            reqResource: item.reqResource || 'Supplies',
            dc: item.dc || 12,
            type: item.type || 'OPERATION',
            lifespan: item.lifespan !== undefined ? item.lifespan : 3,
            maxLifespan: item.lifespan !== undefined ? item.lifespan : 3,
            startDay: item.startDay !== undefined ? item.startDay : state.day,
            x: item.x !== undefined ? item.x : Math.floor(Math.random() * 70) + 15,
            y: item.y !== undefined ? item.y : Math.floor(Math.random() * 70) + 15,
            region: item.region || 'ИМПОРТ',
            pinned: false,
            checks: item.checks || undefined,
            goldReward: item.goldReward !== undefined ? item.goldReward : undefined,
            rewardSpecialItems: item.rewardSpecialItems || undefined,
            unlocksMissionIds: item.unlocksMissionIds || undefined
          }));

          const hasPredefinedDays = data.some(item => item.startDay !== undefined);

          if (hasPredefinedDays) {
            // Reset game state to Day 1 with this balanced scenario!
            const day1Missions = newMissions.filter(m => m.startDay === 1);
            updateState({
              day: 1,
              currentPhase: 1,
              isDaySimulated: false,
              missions: day1Missions,
              allMissions: newMissions,
              contracts: []
            });
            showToast(`🎮 Загружен сбалансированный сценарий: ${newMissions.length} заданий (на 1-й день выставлено ${day1Missions.length})!`);
          } else {
            // Just append to current active missions
            updateState({
              missions: [...state.missions, ...newMissions],
              allMissions: [...(state.allMissions || []), ...newMissions]
            });
            showToast(`Успешно импортировано ${data.length} событий!`);
          }
        } else {
          showToast('JSON должен быть массивом событий', true);
        }
      } catch (err) {
        showToast('Ошибка разбора сценария JSON', true);
      }
    };
    reader.readAsText(file);
  };

  const handleImportAdventurers = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (Array.isArray(data)) {
          const newAdvs = data.map(adv => {
            const lvl = adv.level || 1;
            const mhp = lvl === 1 ? 1 : lvl === 2 ? 2 : lvl === 3 ? 2 : lvl === 4 ? 3 : 4;
            return {
              id: 'adv_' + Math.random().toString(36).substr(2, 6),
              name: adv.name || 'Рекрут',
              class: adv.class || 'Воин',
              level: lvl,
              hp: mhp,
              maxHp: mhp,
              status: 'READY' as const,
              successfulMissions: adv.successfulMissions || 0,
              totalMissions: adv.totalMissions || 0,
              relations: adv.relations || {}
            };
          });

          updateState({
            adventurers: [...state.adventurers, ...newAdvs]
          });

          showToast(`Успешно импортировано ${data.length} приключенцев из adventurers.json!`);
        } else {
          showToast('JSON должен быть массивом приключенцев', true);
        }
      } catch (err) {
        showToast('Ошибка разбора adventurers.json', true);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[1000] flex items-center justify-center p-4">
      <div className="bg-[#0d0d0d] border border-emerald-500/30 rounded-lg w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-emerald-500/20 flex justify-between items-center bg-[#080808]">
          <h2 className="text-emerald-400 font-mono text-base font-bold tracking-wider uppercase flex items-center gap-2">
            <Shield className="w-5 h-5 text-amber-500 animate-pulse" />
            Панель Гроссмейстера
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-[#161616] rounded text-rose-500 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <form onSubmit={handleApplyChanges} className="p-6 overflow-y-auto flex-1 space-y-6">
          
          {/* Saves Management Integration */}
          <div className="bg-[#121212] border border-emerald-500/20 p-4 rounded-lg space-y-3">
            <h3 className="text-emerald-400 font-mono text-xs font-bold uppercase tracking-wider">💾 Сохранение и Загрузка Сессии</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => fileStateRef.current?.click()}
                className="flex-1 px-4 py-2.5 bg-[#161616] border border-emerald-500/20 hover:border-emerald-500 hover:text-emerald-400 text-neutral-300 font-mono text-xs rounded transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Upload className="w-4 h-4 text-emerald-500" />
                <span>Загрузить Сохранение (.json)</span>
              </button>
              <input
                ref={fileStateRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleImportStateChange}
              />

              <button
                type="button"
                onClick={handleExportState}
                className="flex-1 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black font-mono text-xs font-bold rounded transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-[0_0_15px_rgba(0,255,102,0.3)]"
              >
                <Save className="w-4 h-4" />
                <span>Скачать Сохранение (.json)</span>
              </button>
            </div>
            <div className="grid gap-3 border-t border-neutral-800 pt-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={onExportScenario}
                className="flex items-center justify-center gap-2 rounded border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 font-mono text-xs text-amber-400 transition hover:bg-amber-500/10"
              >
                <FileArchive className="h-4 w-4" /> Скачать сценарий с картой (.globalmap)
              </button>
              <button
                type="button"
                onClick={() => fileScenarioRef.current?.click()}
                className="flex items-center justify-center gap-2 rounded border border-amber-500/30 px-4 py-2.5 font-mono text-xs text-amber-400 transition hover:bg-amber-500/10"
              >
                <Upload className="h-4 w-4" /> Открыть сценарий — новая кампания
              </button>
              <input
                ref={fileScenarioRef}
                type="file"
                accept=".globalmap,application/json"
                className="hidden"
                onChange={async event => {
                  const file = event.target.files?.[0];
                  if (file) await onImportScenario(file);
                  event.target.value = '';
                }}
              />
            </div>
            <p className="text-[10px] text-neutral-600">Файл .globalmap содержит исходный сценарий, кланы, авантюристов и изображение карты. Открытие начинает новую кампанию без старых рапортов.</p>
          </div>

          {/* Section 1: Visual Theme & Resolution */}
          <div>
            <h3 className="text-amber-500 font-mono text-xs font-bold uppercase tracking-wider mb-3">🖼️ Фоновая карта и размеры</h3>
            <div className="space-y-4">
              <div className="rounded-lg border border-emerald-500/15 bg-black/40 p-3">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => fileMapRef.current?.click()}
                    className="flex items-center gap-2 rounded border border-emerald-500/30 px-3 py-2 font-mono text-xs text-emerald-400 transition hover:bg-emerald-500/10"
                  >
                    <ImagePlus className="h-4 w-4" /> Выбрать изображение на компьютере
                  </button>
                  <input
                    ref={fileMapRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async event => {
                      const file = event.target.files?.[0];
                      if (file) await onSelectMapFile(file);
                      event.target.value = '';
                    }}
                  />
                  {state.mapAssetId && (
                    <button
                      type="button"
                      onClick={onRestoreDefaultMap}
                      className="rounded border border-neutral-700 px-3 py-2 font-mono text-xs text-neutral-400 transition hover:text-neutral-200"
                    >
                      Вернуть GlobalMap.webp
                    </button>
                  )}
                </div>
                <p className="mt-2 text-[10px] text-neutral-600">
                  {state.mapAssetId ? 'Используется локальное изображение. Оно хранится в браузере на этом компьютере.' : `Карта по умолчанию: ${DEFAULT_MAP_URL}`}
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-mono uppercase text-neutral-400">URL фонового изображения:</label>
                <input
                  type="text"
                  id="dm-input-mapurl"
                  className="w-full bg-black border border-emerald-500/20 text-neutral-200 px-3 py-2 rounded font-mono text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all"
                  defaultValue={state.mapBgUrl}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-mono uppercase text-neutral-400">Ширина карты (px):</label>
                  <input
                    type="number"
                    id="dm-input-mapwidth"
                    className="w-full bg-black border border-emerald-500/20 text-neutral-200 px-3 py-2 rounded font-mono text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all"
                    defaultValue={state.mapWidth}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-mono uppercase text-neutral-400">Высота карты (px):</label>
                  <input
                    type="number"
                    id="dm-input-mapheight"
                    className="w-full bg-black border border-emerald-500/20 text-neutral-200 px-3 py-2 rounded font-mono text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all"
                    defaultValue={state.mapHeight}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Global Constants */}
          <div>
            <h3 className="text-amber-500 font-mono text-xs font-bold uppercase tracking-wider mb-3">⚙️ Игровые Константы</h3>
            <div className="mb-4 flex flex-col gap-1">
              <label className="text-xs font-mono uppercase text-neutral-400">Название Гильдии:</label>
              <input
                type="text"
                id="dm-input-guild-name"
                className="w-full bg-black border border-emerald-500/20 text-neutral-200 px-3 py-2 rounded font-mono text-sm focus:border-emerald-500 outline-none"
                defaultValue={state.guildName}
              />
              <span className="text-[10px] text-neutral-600">Название изменится в заголовках, контрактах, рапортах и названии клана Гильдии.</span>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-mono uppercase text-neutral-400">Текущий День:</label>
                <input
                  type="number"
                  id="dm-input-day"
                  className="w-full bg-black border border-emerald-500/20 text-neutral-200 px-3 py-2 rounded font-mono text-sm focus:border-emerald-500 outline-none"
                  defaultValue={state.day}
                  min="1"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-mono uppercase text-neutral-400">Кол-во Кланов (1-20):</label>
                <input
                  type="number"
                  id="dm-input-nclans"
                  className="w-full bg-black border border-emerald-500/20 text-neutral-200 px-3 py-2 rounded font-mono text-sm focus:border-emerald-500 outline-none"
                  defaultValue={state.nClans}
                  min="1"
                  max="20"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-mono uppercase text-neutral-400">Базовый h (Золото):</label>
                <input
                  type="number"
                  id="dm-input-hcost"
                  className="w-full bg-black border border-emerald-500/20 text-neutral-200 px-3 py-2 rounded font-mono text-sm focus:border-emerald-500 outline-none"
                  defaultValue={state.hCost}
                  min="1"
                />
              </div>
            </div>
          </div>

          <hr className="border-emerald-500/10" />

          {/* Section 3: Data Load & Backup */}
          <div>
            <h3 className="text-emerald-400 font-mono text-xs font-bold uppercase tracking-wider mb-3">📂 Импорт Внешних Данных (JSON)</h3>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => fileEventsRef.current?.click()}
                className="px-3 py-2 bg-neutral-900 border border-emerald-500/20 hover:border-emerald-500 hover:text-emerald-400 text-neutral-300 font-mono text-xs rounded transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Upload className="w-4 h-4 text-emerald-500" />
                Загрузить Сценарий/Events (.json)
              </button>
              <input
                ref={fileEventsRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleImportEvents}
              />

              <button
                type="button"
                onClick={() => fileAdvsRef.current?.click()}
                className="px-3 py-2 bg-neutral-900 border border-emerald-500/20 hover:border-emerald-500 hover:text-emerald-400 text-neutral-300 font-mono text-xs rounded transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Upload className="w-4 h-4 text-emerald-500" />
                Загрузить adventurers.json
              </button>
              <input
                ref={fileAdvsRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleImportAdventurers}
              />
            </div>
          </div>

          <hr className="border-emerald-500/10" />

          {/* Section 4: Spawn Polygon Adjuster */}
          <div>
            <h3 className="text-amber-500 font-mono text-xs font-bold uppercase tracking-wider mb-1">📐 Настройка Зоны Спавна Донесений</h3>
            <p className="text-xs text-neutral-500 font-mono mb-3">В режиме ГМа перетаскивайте вершины полигона прямо на карте или настраивайте их координаты здесь! Донесения будут спавниться строго внутри этой гео-области.</p>
            
            <div className="flex flex-wrap justify-between items-center gap-2 mb-3 bg-[#000] p-2.5 border border-emerald-500/10 rounded">
              <span className="text-xs font-mono text-emerald-400">Вершин в полигоне: <strong>{state.spawnPolygon.length}</strong></span>
              
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAddPolygonVertex}
                  className="px-2 py-1 bg-emerald-950/40 hover:bg-emerald-500 border border-emerald-500 hover:text-black text-emerald-400 rounded font-mono text-[11px] uppercase flex items-center gap-1 transition-all cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  + Вершина
                </button>
                <button
                  type="button"
                  onClick={handleRemovePolygonVertex}
                  disabled={state.spawnPolygon.length <= 3}
                  className="px-2 py-1 bg-rose-950/40 hover:bg-rose-500 border border-rose-500/40 hover:text-white text-rose-400 disabled:opacity-30 disabled:pointer-events-none rounded font-mono text-[11px] uppercase flex items-center gap-1 transition-all cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  - Вершина
                </button>
                <button
                  type="button"
                  onClick={copyPolygonJson}
                  className="px-2 py-1 bg-[#111] hover:bg-[#222] border border-amber-500/30 text-amber-500 rounded font-mono text-[11px] uppercase flex items-center gap-1 transition-all cursor-pointer"
                >
                  <Copy className="w-3 h-3" />
                  JSON
                </button>
              </div>
            </div>

            {/* List of vertices for fine editing */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3 max-h-36 overflow-y-auto pr-1 font-mono text-xs">
              {state.spawnPolygon.map((pt, idx) => (
                <div key={idx} className="bg-black/60 border border-neutral-800 p-1.5 rounded flex items-center justify-between gap-1 text-[11px]">
                  <span className="text-amber-500 font-bold shrink-0">#{idx + 1}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-neutral-500">X:</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={pt.x}
                      onChange={(e) => handleUpdatePolygonVertex(idx, 'x', Number(e.target.value))}
                      className="w-10 bg-neutral-900 text-neutral-200 text-center px-1 py-0.5 rounded outline-none border border-neutral-800"
                    />
                    <span className="text-neutral-500">Y:</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={pt.y}
                      onChange={(e) => handleUpdatePolygonVertex(idx, 'y', Number(e.target.value))}
                      className="w-10 bg-neutral-900 text-neutral-200 text-center px-1 py-0.5 rounded outline-none border border-neutral-800"
                    />
                  </div>
                </div>
              ))}
            </div>

            <textarea
              readOnly
              className="w-full h-16 bg-black border border-emerald-500/20 font-mono text-[10px] text-emerald-400/80 p-2 rounded focus:outline-none resize-none"
              value={JSON.stringify(state.spawnPolygon)}
            />
          </div>

          <hr className="border-emerald-500/10" />

          {/* Section 5: Sudden GM Power Actions */}
          <div>
            <h3 className="text-emerald-400 font-mono text-xs font-bold uppercase tracking-wider mb-3">⚡ Действия Силы Гроссмейстера</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button
                type="button"
                onClick={onHealAll}
                className="px-4 py-2.5 bg-emerald-950/20 hover:bg-emerald-500 border border-emerald-500 hover:text-black text-emerald-400 font-mono text-xs font-bold rounded uppercase transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Heart className="w-4 h-4" />
                Вылечить ВСЕХ героев
              </button>
              <button
                type="button"
                onClick={() => setShowCreateMissionModal(true)}
                className="px-4 py-2.5 bg-emerald-950/40 hover:bg-emerald-500 border border-emerald-500 hover:text-black text-emerald-400 font-mono text-xs font-bold rounded uppercase transition-all flex items-center justify-center gap-2 cursor-pointer shadow-[0_0_10px_rgba(0,255,102,0.15)]"
              >
                <Plus className="w-4 h-4 text-emerald-400 group-hover:text-black" />
                Создать Донесение
              </button>
              
              {!showConfirmReset ? (
                <button
                  type="button"
                  onClick={() => setShowConfirmReset(true)}
                  className="px-4 py-2.5 bg-amber-950/20 hover:bg-amber-500 border border-amber-500/35 hover:text-black text-amber-400 font-mono text-xs font-bold rounded uppercase transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <RotateCw className="w-4 h-4" />
                  Сбросить Кампанию
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onResetToDay1();
                      setShowConfirmReset(false);
                      onClose();
                    }}
                    className="flex-1 px-3 py-2.5 bg-rose-950 hover:bg-rose-600 border border-rose-550 hover:border-rose-450 text-rose-300 hover:text-white font-mono text-xs font-bold rounded uppercase transition-all flex items-center justify-center gap-1 cursor-pointer"
                  >
                    Да, сбросить!
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowConfirmReset(false)}
                    className="px-3 py-2.5 bg-neutral-900 border border-neutral-800 text-neutral-400 font-mono text-xs font-bold rounded uppercase transition-all cursor-pointer"
                  >
                    Отмена
                  </button>
                </div>
              )}
            </div>
          </div>

        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-emerald-500/20 bg-[#080808] flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-[#161616] border border-neutral-700 hover:bg-neutral-800 text-neutral-300 font-mono text-xs font-bold uppercase tracking-wider rounded transition-colors"
          >
            Отмена
          </button>
          <button
            type="submit"
            onClick={handleApplyChanges}
            className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black font-mono text-xs font-bold uppercase tracking-wider rounded shadow-[0_0_15px_rgba(0,255,102,0.3)] transition-colors"
          >
            Сохранить изменения
          </button>
        </div>

      </div>

      {/* Sub-Modal: Detailed Create Mission Form */}
      {showCreateMissionModal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[1100] flex items-center justify-center p-4">
          <div className="bg-[#0f0f0f] border border-amber-500/40 rounded-lg w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl overflow-hidden font-mono text-xs">
            <div className="px-5 py-3.5 border-b border-amber-500/20 flex justify-between items-center bg-[#080808]">
              <h3 className="text-amber-400 font-bold uppercase tracking-wider flex items-center gap-2">
                <FilePlus className="w-4 h-4 text-amber-500" />
                Создание Донесения ГМ
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateMissionModal(false)}
                className="p-1 hover:bg-[#1f1f1f] text-neutral-400 hover:text-white rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCustomMissionSubmit} className="p-5 overflow-y-auto space-y-3.5">
              
              <div className="flex flex-col gap-1">
                <label className="text-neutral-400 uppercase text-[10px]">Заголовок миссии:</label>
                <input
                  type="text"
                  required
                  value={mTitle}
                  onChange={(e) => setMTitle(e.target.value)}
                  className="w-full bg-black border border-amber-500/20 text-neutral-200 px-2.5 py-1.5 rounded focus:border-amber-500 outline-none"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-neutral-400 uppercase text-[10px]">Описание донесения:</label>
                <textarea
                  required
                  rows={3}
                  value={mDesc}
                  onChange={(e) => setMDesc(e.target.value)}
                  className="w-full bg-black border border-amber-500/20 text-neutral-200 p-2 rounded focus:border-amber-500 outline-none resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-neutral-400 uppercase text-[10px]">Регион:</label>
                  <input
                    type="text"
                    value={mRegion}
                    onChange={(e) => setMRegion(e.target.value)}
                    className="w-full bg-black border border-amber-500/20 text-neutral-200 px-2.5 py-1.5 rounded focus:border-amber-500 outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-neutral-400 uppercase text-[10px]">Тип донесения:</label>
                  <select
                    value={mType}
                    onChange={(e) => setMType(e.target.value as MissionType)}
                    className="w-full bg-black border border-amber-500/20 text-neutral-200 px-2 py-1.5 rounded focus:border-amber-500 outline-none"
                  >
                    <option value="OPERATION">ОПЕРАЦИЯ</option>
                    <option value="STORY">СЮЖЕТНАЯ</option>
                    <option value="DUMMY">ЛОЖНАЯ</option>
                  </select>
                </div>
              </div>

              {mType === 'DUMMY' ? (
                <div className="bg-amber-500/10 border border-amber-500/30 p-2.5 rounded text-amber-400 font-mono text-xs">
                  ℹ️ <strong>Ложная миссия (DUMMY):</strong> Не имеет этапов проверки и не дает золото за выполнение.
                </div>
              ) : (
                <div className="space-y-2 border-t border-b border-amber-500/10 py-2.5">
                  <div className="flex justify-between items-center">
                    <label className="text-amber-400 uppercase text-[10px] font-bold tracking-wider">
                      Этапы миссии / Проверки ({mChecks.length}):
                    </label>
                    <button
                      type="button"
                      onClick={handleAddCheckStage}
                      className="px-2 py-1 bg-amber-500/20 hover:bg-amber-500 border border-amber-500/40 hover:text-black text-amber-400 font-mono text-[10px] uppercase rounded flex items-center gap-1 transition-all cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      + Этап
                    </button>
                  </div>

                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {mChecks.map((check, idx) => (
                      <div key={idx} className="bg-black/80 border border-neutral-800 p-2 rounded flex flex-wrap sm:flex-nowrap items-center gap-2">
                        <span className="text-amber-500 font-mono font-bold text-xs shrink-0">#{idx + 1}</span>
                        
                        <div className="flex-1 min-w-[120px]">
                          <select
                            value={check.reqResource || 'Supplies'}
                            onChange={(e) => handleUpdateCheckStage(idx, 'reqResource', e.target.value)}
                            className="w-full bg-neutral-900 border border-neutral-700 text-neutral-200 text-xs px-2 py-1 rounded outline-none focus:border-amber-500"
                          >
                            <option value="Supplies">🎒 Припасы</option>
                            <option value="Equipment">⚔️ Снаряжение</option>
                            <option value="Intelligence">🔍 Разведка</option>
                            <option value="Alchemy">🧪 Алхимия</option>
                            <option value="None">❌ Без ресурса</option>
                          </select>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-[10px] text-neutral-400 uppercase font-mono">DC:</span>
                          <input
                            type="number"
                            min="1"
                            max="35"
                            value={check.dc}
                            onChange={(e) => handleUpdateCheckStage(idx, 'dc', Number(e.target.value))}
                            className="w-14 bg-neutral-900 border border-neutral-700 text-neutral-200 text-xs text-center py-1 rounded outline-none focus:border-amber-500"
                          />
                        </div>

                        {mChecks.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveCheckStage(idx)}
                            className="p-1 hover:bg-rose-950/50 text-rose-400 rounded shrink-0 transition-colors"
                            title="Удалить этап"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-neutral-400 uppercase text-[10px]">Дней (Таймер):</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={mLifespan}
                    onChange={(e) => setMLifespan(Number(e.target.value))}
                    className="w-full bg-black border border-amber-500/20 text-neutral-200 px-2.5 py-1.5 rounded outline-none font-mono text-xs"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-neutral-400 uppercase text-[10px]">Награда Золотом:</label>
                  <input
                    type="number"
                    min="0"
                    disabled={mType === 'DUMMY'}
                    value={mType === 'DUMMY' ? 0 : mGoldReward}
                    onChange={(e) => setMGoldReward(Number(e.target.value))}
                    className="w-full bg-black border border-amber-500/20 text-neutral-200 px-2.5 py-1.5 rounded outline-none font-mono text-xs disabled:opacity-40"
                    placeholder={mType === 'DUMMY' ? '0г' : 'По умолчанию'}
                  />
                </div>
              </div>

              {mType === 'STORY' && (
                <div className="flex flex-col gap-1">
                  <label className="text-amber-400 uppercase text-[10px] font-bold">💎 Требуемый Особый Предмет (для старта):</label>
                  <input
                    type="text"
                    placeholder="Например: Древний Идол, Ключ от Сокровищницы"
                    value={mRequiredSpecialItem}
                    onChange={(e) => setMRequiredSpecialItem(e.target.value)}
                    className="w-full bg-black border border-amber-500/40 text-neutral-200 px-2.5 py-1.5 rounded focus:border-amber-400 outline-none"
                  />
                  <span className="text-[10px] text-neutral-500">Контракт на эту сюжетную миссию сможет оформить только клан, у которого есть этот предмет.</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-neutral-400 uppercase text-[10px]">Координата X (%):</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={mX}
                    onChange={(e) => setMX(Number(e.target.value))}
                    className="w-full bg-black border border-amber-500/20 text-neutral-200 px-2.5 py-1.5 rounded outline-none font-mono text-xs"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-neutral-400 uppercase text-[10px]">Координата Y (%):</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={mY}
                    onChange={(e) => setMY(Number(e.target.value))}
                    className="w-full bg-black border border-amber-500/20 text-neutral-200 px-2.5 py-1.5 rounded outline-none font-mono text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-amber-500/10">
                <label className="flex items-center gap-2 cursor-pointer text-neutral-300">
                  <input
                    type="checkbox"
                    checked={mIntelRevealed}
                    onChange={(e) => setMIntelRevealed(e.target.checked)}
                    className="rounded accent-amber-500"
                  />
                  <span>Рассекречено (Intel Revealed)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-neutral-300">
                  <input
                    type="checkbox"
                    checked={mPinned}
                    onChange={(e) => setMPinned(e.target.checked)}
                    className="rounded accent-amber-500"
                  />
                  <span>Прикреплено</span>
                </label>
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateMissionModal(false)}
                  className="px-3 py-1.5 bg-[#1a1a1a] border border-neutral-700 text-neutral-300 rounded uppercase"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded uppercase flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Разместить Донесение
                </button>
              </div>

            </form>
          </div>
        </div>
      )}
    </div>
  );
}
