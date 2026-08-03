/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Compass,
  FileText,
  Users,
  Shield,
  Clock,
  Coins,
  AlertTriangle,
  Gift,
  HelpCircle,
  Terminal,
  RotateCw,
  Plus,
  Gamepad2,
  UserRoundCog,
  CalendarCog
} from 'lucide-react';

import { GameState, Clan, Adventurer, Mission, Contract, ThemeDefinition } from './types';
import {
  DEFAULT_EVENT_TEMPLATES,
  getRandomPointInSpawnPolygon,
  calculateMaxHp,
  getMaxContractLevelForClan
} from './utils';
import {
  createInitialGameState,
  GAME_STORAGE_KEY,
  loadStoredGameState,
  serializeGameState
} from './domain/state';
import { clampRelation } from './domain/economy';
import { BUILT_IN_THEMES, applyTheme, loadThemeCatalog } from './domain/themes';
import { deleteMapAsset, loadMapAssetUrl, saveMapAsset } from './domain/mapAssets';
import { DEFAULT_MAP_URL } from './domain/constants';
import { createScenarioBundle, importScenarioBundle } from './domain/scenarioBundle';

import MapTab from './components/MapTab';
import PhasesTab from './components/PhasesTab';
import ResultsTab from './components/ResultsTab';
import AdventurersTab from './components/AdventurersTab';
import ClansTab from './components/ClansTab';
import AdventurerEditor from './components/AdventurerEditor';
import EventEditor from './components/EventEditor';
import ThemeSelector from './components/ThemeSelector';

import GmOverlordModal from './components/GmOverlordModal';
import MissionModal from './components/MissionModal';
import RecruitModal from './components/RecruitModal';
import AdventurerDetailModal from './components/AdventurerDetailModal';
import ClanDossierModal from './components/ClanDossierModal';
import ResourceStoreModal from './components/ResourceStoreModal';

export default function App() {
  const [state, setState] = useState<GameState>(() => {
    if (typeof window !== 'undefined') {
      const stored = loadStoredGameState(localStorage);
      if (stored) return stored;
    }
    return createInitialGameState();
  });

  const [mainSection, setMainSection] = useState<'GAME' | 'ADVENTURER_EDITOR' | 'EVENT_EDITOR'>('GAME');
  const [activeTab, setActiveTab] = useState<'MAP' | 'PHASES' | 'RESULTS' | 'ADVENTURERS' | 'CLANS'>('MAP');

  // Modals view toggles
  const [isGmOpen, setIsGmOpen] = useState(false);
  const [isMissionOpen, setIsMissionOpen] = useState(false);
  const [isRecruitOpen, setIsRecruitOpen] = useState(false);
  const [selectedAdvId, setSelectedAdvId] = useState<string | null>(null);
  const [selectedClanId, setSelectedClanId] = useState<string | null>(null);
  const [storeClanId, setStoreClanId] = useState<string | null>(null);
  const [themes, setThemes] = useState<ThemeDefinition[]>(BUILT_IN_THEMES);
  const [runtimeMapUrl, setRuntimeMapUrl] = useState<string | null>(null);

  // Custom visual toast alerts
  const [toast, setToast] = useState<{ message: string; isError?: boolean } | null>(null);

  // Auto-save state updates
  useEffect(() => {
    localStorage.setItem(GAME_STORAGE_KEY, serializeGameState(state));
  }, [state]);

  useEffect(() => {
    let cancelled = false;
    loadThemeCatalog().then(catalog => {
      if (!cancelled) setThemes(catalog);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const selectedTheme = themes.find(theme => theme.id === state.themeId) ?? BUILT_IN_THEMES[0];
    applyTheme(selectedTheme);
  }, [state.themeId, themes]);

  useEffect(() => {
    document.title = `${state.guildName} — Глобальная Карта`;
  }, [state.guildName]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    if (!state.mapAssetId) {
      setRuntimeMapUrl(null);
      return;
    }
    loadMapAssetUrl(state.mapAssetId)
      .then(url => {
        if (cancelled) {
          if (url) URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        setRuntimeMapUrl(url);
      })
      .catch(() => setRuntimeMapUrl(null));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [state.mapAssetId]);

  const showToast = (message: string, isError = false) => {
    setToast({ message, isError });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  const updateState = (newState: Partial<GameState>) => {
    setState(prev => ({ ...prev, ...newState }));
  };

  const handleSelectMapFile = async (file: File) => {
    try {
      const previousId = state.mapAssetId;
      const asset = await saveMapAsset(file);
      updateState({ mapAssetId: asset.id, mapWidth: asset.width, mapHeight: asset.height });
      if (previousId && previousId !== asset.id) await deleteMapAsset(previousId);
      showToast(`Карта «${file.name}» сохранена локально (${asset.width}×${asset.height}).`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не удалось загрузить карту.', true);
    }
  };

  const handleRestoreDefaultMap = async () => {
    try {
      await deleteMapAsset(state.mapAssetId);
      updateState({ mapAssetId: null, mapBgUrl: DEFAULT_MAP_URL, mapWidth: 910, mapHeight: 1303 });
      showToast('Восстановлена карта GlobalMap.webp.');
    } catch {
      showToast('Не удалось восстановить карту по умолчанию.', true);
    }
  };

  const handleExportScenario = async () => {
    try {
      const bundle = await createScenarioBundle(state);
      const url = URL.createObjectURL(bundle.blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = bundle.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      showToast(`Сценарий сохранён в файл «${bundle.fileName}».`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не удалось сохранить сценарий.', true);
    }
  };

  const handleImportScenario = async (file: File) => {
    try {
      const previousMapAssetId = state.mapAssetId;
      const imported = await importScenarioBundle(file, state.isDmMode);
      setState(imported);
      if (previousMapAssetId && previousMapAssetId !== imported.mapAssetId) {
        await deleteMapAsset(previousMapAssetId);
      }
      setMainSection('GAME');
      setActiveTab('MAP');
      setIsGmOpen(false);
      showToast(`Сценарий «${file.name}» открыт. Начат день 1.`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не удалось открыть сценарий.', true);
    }
  };

  // Payout of resources and budget override
  const handleHealAll = () => {
    const updatedAdvs = state.adventurers.map(a => {
      if (a.status !== 'DEAD') {
        return {
          ...a,
          hp: a.maxHp,
          status: 'READY' as const
        };
      }
      return a;
    });
    updateState({ adventurers: updatedAdvs });
    showToast('✨ Сила Гроссмейстера: Все выжившие герои исцелены до максимума!');
  };

  const handleCreateCustomMission = (missionData: Partial<Mission>) => {
    const pt = getRandomPointInSpawnPolygon(state.spawnPolygon);
    const lifespan = missionData.lifespan !== undefined ? missionData.lifespan : 3;
    const newMission: Mission = {
      id: `mission_gm_${Math.random().toString(36).substr(2, 6)}`,
      title: missionData.title || 'Новое Донесение',
      desc: missionData.desc || 'Разведчики докладывают об обнаружении подозрительной активности...',
      reqResource: missionData.reqResource || 'Supplies',
      dc: missionData.dc !== undefined ? missionData.dc : 12,
      type: missionData.type || 'OPERATION',
      lifespan: lifespan,
      maxLifespan: lifespan,
      startDay: state.day,
      x: missionData.x !== undefined ? missionData.x : pt.x,
      y: missionData.y !== undefined ? missionData.y : pt.y,
      region: missionData.region || 'ДИКИЕ ЗЕМЛИ',
      intelRevealed: missionData.intelRevealed !== undefined ? missionData.intelRevealed : false,
      goldReward: missionData.goldReward,
      pinned: missionData.pinned || false
    };

    updateState({
      missions: [...state.missions, newMission],
      allMissions: [...(state.allMissions || []), newMission]
    });

    showToast(`📜 Донесение "${newMission.title}" создано ГМом!`);
  };

  const handleResetToDay1 = () => {
    const newState = createInitialGameState({ isDmMode: state.isDmMode });
    newState.guildName = state.guildName;
    newState.guildShortName = state.guildShortName;
    newState.themeId = state.themeId;
    newState.mapBgUrl = state.mapBgUrl;
    newState.mapAssetId = state.mapAssetId;
    newState.mapWidth = state.mapWidth;
    newState.mapHeight = state.mapHeight;
    newState.clans = newState.clans.map(clan => clan.id === 'clan_guild' ? { ...clan, name: state.guildName } : clan);

    setState(newState);
    localStorage.setItem(GAME_STORAGE_KEY, serializeGameState(newState));
    showToast('🧙‍♂️ Игровой мир успешно сброшен к началу Дня 1!');
  };

  // Recruit adventurer
  const handleRecruit = (clanId: string, name: string, cls: string, level: number, isPlayer: boolean) => {
    const cost = 5 * state.hCost;

    let updatedClans = [...state.clans];
    
    // Check payment
    if (clanId !== 'FREE_GM') {
      const clan = state.clans.find(c => c.id === clanId);
      if (!clan) return;
      if (clan.gold < cost) {
        showToast('Недостаточно золота в казне клана для найма рекрута!', true);
        return;
      }
      updatedClans = state.clans.map(c => {
        if (c.id === clanId) {
          return { ...c, gold: c.gold - cost };
        }
        return c;
      });
    }

    const mhp = calculateMaxHp(level);
    const newAdv: Adventurer = {
      id: `adv_${Math.random().toString(36).substr(2, 6)}`,
      name,
      class: cls,
      level,
      hp: mhp,
      maxHp: mhp,
      status: 'READY',
      successfulMissions: 0,
      totalMissions: 0,
      relations: clanId !== 'FREE_GM' ? { [clanId]: 1 } : {},
      isPlayer
    };

    updateState({
      clans: updatedClans,
      adventurers: [...state.adventurers, newAdv]
    });

    showToast(`⚔️ Нанят новый приключенец: ${name} (${cls})!`);
  };

  // Single adventurer healing
  const handleHealSingle = (advId: string) => {
    const updated = state.adventurers.map(a => {
      if (a.id === advId) {
        return {
          ...a,
          hp: a.maxHp,
          status: 'READY' as const
        };
      }
      return a;
    });
    updateState({ adventurers: updated });
    showToast('Герой полностью исцелен.');
  };

  // relation adjustment
  const handleAdjustReputation = (advId: string, clanId: string, delta: number) => {
    const updated = state.adventurers.map(a => {
      if (a.id === advId) {
        const currentRep = a.relations?.[clanId] || 0;
        return {
          ...a,
          relations: {
            ...a.relations,
            [clanId]: clampRelation(currentRep + delta)
          }
        };
      }
      return a;
    });
    updateState({ adventurers: updated });
  };

  const handleUpdateAdventurer = (advId: string, updatedFields: Partial<Adventurer>) => {
    const updated = state.adventurers.map(a => {
      if (a.id === advId) {
        return {
          ...a,
          ...updatedFields
        };
      }
      return a;
    });
    updateState({ adventurers: updated });
  };

  const handleUpdateClan = (updatedClan: Clan) => {
    const updated = state.clans.map(c => {
      if (c.id === updatedClan.id) {
        return updatedClan;
      }
      return c;
    });
    updateState({ clans: updated });
  };

  // Intel activation (reconnaissance)
  const handleUseIntel = (clanId: string) => {
    const missionId = state.selectedMissionId;
    if (!missionId) return;

    const clan = state.clans.find(c => c.id === clanId);
    if (!clan || (clan.resources.Intelligence || 0) < 1) {
      showToast('Недостаточно разведданных на складе клана!', true);
      return;
    }

    // Deduct 1 intelligence
    const updatedClans = state.clans.map(c => {
      if (c.id === clanId) {
        return {
          ...c,
          resources: {
            ...c.resources,
            Intelligence: (c.resources.Intelligence || 0) - 1
          }
        };
      }
      return c;
    });

    // Mark mission revealed
    const updatedMissions = state.missions.map(m => {
      if (m.id === missionId) {
        return { ...m, intelRevealed: true };
      }
      return m;
    });

    updateState({
      clans: updatedClans,
      missions: updatedMissions
    });

    showToast(`🔍 Клан ${clan.name} задействовал разведку! Секретные параметры миссии рассекречены.`);
  };

  const handleDeleteMission = (missionId: string) => {
    const updatedMissions = state.missions.filter(m => m.id !== missionId);
    const updatedContracts = state.contracts.filter(c => c.missionId !== missionId);
    updateState({
      missions: updatedMissions,
      contracts: updatedContracts,
      selectedMissionId: null
    });
    setIsMissionOpen(false);
    showToast('🗑️ Донесение и все связанные с ним контракты успешно удалены ГМом!');
  };

  // Shopping mechanics for resources
  const handleBuyResource = (clanId: string, resourceType: string) => {
    const clan = state.clans.find(c => c.id === clanId);
    if (!clan) return;

    if (resourceType.startsWith('special-')) {
      const idx = parseInt(resourceType.split('-')[1]);
      const specialItems = clan.resources.specialItems || [];
      const item = specialItems[idx];
      if (!item) return;

      const updatedClans = state.clans.map(c => {
        if (c.id === clanId) {
          const newSpecialItems = [...specialItems];
          newSpecialItems.splice(idx, 1);
          return {
            ...c,
            resources: {
              ...c.resources,
              specialItems: newSpecialItems
            }
          };
        }
        if (c.id === 'clan_guild') {
          const guildSpecial = c.resources.specialItems || [];
          return {
            ...c,
            resources: {
              ...c.resources,
              specialItems: [...guildSpecial, item]
            }
          };
        }
        return c;
      });

      updateState({ clans: updatedClans });
      showToast(`🛒 Особый товар "${item}" перевезён в посольство «${state.guildName}».`);
      return;
    }

    const h = state.hCost;
    const multipliers: Record<string, number> = {
      'Supplies': 0.5,
      'Equipment': 1.0,
      'Intelligence': 1.0,
      'Alchemy': 1.5
    };
    const price = Math.round((multipliers[resourceType] || 1.0) * h);

    const freeBudget = clan.freeResourceBudget !== undefined ? clan.freeResourceBudget : (clan.freeSuppliesBudget || 0);

    const updatedClans = state.clans.map(c => {
      if (c.id === clanId) {
        const updatedResources = { ...c.resources };
        updatedResources[resourceType] = (updatedResources[resourceType] || 0) + 1;

        if (freeBudget > 0) {
          // Subtract from free allowance
          return {
            ...c,
            freeResourceBudget: freeBudget - 1,
            freeSuppliesBudget: freeBudget - 1,
            resources: updatedResources
          };
        } else {
          // Subtract gold
          if (c.gold < price) {
            showToast('Недостаточно золота в казне клана!', true);
            return c;
          }
          return {
            ...c,
            gold: c.gold - price,
            resources: updatedResources
          };
        }
      }
      return c;
    });

    // Check if anything actually changed
    const oldClan = state.clans.find(c => c.id === clanId);
    const newClan = updatedClans.find(c => c.id === clanId);
    if (oldClan && newClan && oldClan.resources[resourceType] === newClan.resources[resourceType]) {
      // purchase failed
      return;
    }

    updateState({ clans: updatedClans });
    showToast(`🛒 Закуплено: +1 ед. ресурсов (${resourceType}) для ${clan.name}.`);
  };

  return (
    <div className="min-h-screen bg-[#060606] text-neutral-300 flex flex-col relative selection:bg-emerald-500 selection:text-black">
      
      {/* Visual background scanning noise */}
      <div className="absolute inset-0 bg-[radial-gradient(rgba(18,18,18,0.15)_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none z-0" />

      {/* Primary CRT Header */}
      <header className="border-b border-emerald-500/15 bg-black/90 p-4 sticky top-0 z-[100] backdrop-blur shadow-[0_4px_30px_rgba(0,0,0,0.8)]">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          
          {/* Logo Title */}
          <div className="flex items-center gap-3">
            <Compass className="w-8 h-8 text-emerald-500 animate-spin-slow" />
            <div>
              <h1 className="text-lg font-mono font-bold uppercase tracking-widest text-emerald-400">
                {state.guildName}
              </h1>
            </div>
          </div>

          {/* Quick Stats Ribbon */}
          <div className="flex items-center gap-4 sm:gap-6 font-mono text-xs">
            <ThemeSelector
              themes={themes}
              value={state.themeId}
              onChange={themeId => updateState({ themeId })}
              onRefresh={() => loadThemeCatalog().then(catalog => {
                setThemes(catalog);
                showToast(`Список тем обновлён: ${catalog.length}.`);
              })}
            />
            
            <div className="flex items-center gap-2 bg-[#0d0d0d] border border-emerald-500/10 px-3 py-1.5 rounded">
              <Clock className="w-4 h-4 text-emerald-500" />
              <span>Текущий День: <strong className="text-white text-sm">{state.day}</strong></span>
            </div>

            {/* DM Mode Switch */}
            <div
              onClick={() => updateState({ isDmMode: !state.isDmMode })}
              className={`flex items-center gap-1.5 border px-3 py-1.5 rounded cursor-pointer select-none transition-all ${state.isDmMode ? 'bg-amber-500/20 border-amber-500 text-amber-400 font-bold' : 'border-neutral-700 hover:border-neutral-600 text-neutral-400 bg-transparent'}`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span className="text-[10px] uppercase">Режим ГМа</span>
            </div>

            {/* Overlord Settings gear button */}
            {state.isDmMode && (
              <button
                onClick={() => setIsGmOpen(true)}
                className="p-1.5 bg-[#121212] hover:bg-[#222] border border-amber-500/30 text-amber-500 rounded transition-all cursor-pointer flex items-center justify-center"
                title="Настройки параметров ГМа"
              >
                <Terminal className="w-4 h-4" />
              </button>
            )}

          </div>

        </div>
      </header>

      {/* Main menu */}
      <nav className="border-b border-emerald-500/15 bg-[#080808]/95 py-3 z-50">
        <div className="max-w-7xl mx-auto px-4 flex flex-wrap gap-2 font-mono text-xs">
          <button
            onClick={() => setMainSection('GAME')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-md border cursor-pointer transition-all ${mainSection === 'GAME' ? 'bg-emerald-500 border-emerald-500 text-black font-bold shadow-[0_0_12px_rgba(0,255,102,0.25)]' : 'border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200'}`}
          >
            <Gamepad2 className="w-4 h-4" /> Игра
          </button>
          <button
            onClick={() => setMainSection('ADVENTURER_EDITOR')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-md border cursor-pointer transition-all ${mainSection === 'ADVENTURER_EDITOR' ? 'bg-emerald-500 border-emerald-500 text-black font-bold shadow-[0_0_12px_rgba(0,255,102,0.25)]' : 'border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200'}`}
          >
            <UserRoundCog className="w-4 h-4" /> Редактор авантюристов
          </button>
          <button
            onClick={() => setMainSection('EVENT_EDITOR')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-md border cursor-pointer transition-all ${mainSection === 'EVENT_EDITOR' ? 'bg-emerald-500 border-emerald-500 text-black font-bold shadow-[0_0_12px_rgba(0,255,102,0.25)]' : 'border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200'}`}
          >
            <CalendarCog className="w-4 h-4" /> Редактор событий
          </button>
        </div>
      </nav>

      {/* Game workspace tabs */}
      {mainSection === 'GAME' && <nav className="border-b border-emerald-500/10 bg-black/40 py-2.5 z-40">
        <div className="max-w-7xl mx-auto px-4 flex flex-wrap gap-2.5 font-mono text-xs">
          
          <button
            onClick={() => setActiveTab('MAP')}
            className={`px-4 py-2 rounded-md cursor-pointer transition-all ${activeTab === 'MAP' ? 'bg-emerald-500 text-black font-bold shadow-[0_0_12px_rgba(0,255,102,0.35)]' : 'bg-transparent text-neutral-400 hover:bg-[#111] hover:text-neutral-200'}`}
          >
            🧭 Картография
          </button>

          <button
            onClick={() => setActiveTab('PHASES')}
            className={`px-4 py-2 rounded-md cursor-pointer transition-all ${activeTab === 'PHASES' ? 'bg-emerald-500 text-black font-bold shadow-[0_0_12px_rgba(0,255,102,0.35)]' : 'bg-transparent text-neutral-400 hover:bg-[#111] hover:text-neutral-200'}`}
          >
            📋 Контракты ({state.contracts.length})
          </button>

          <button
            onClick={() => setActiveTab('RESULTS')}
            className={`px-4 py-2 rounded-md cursor-pointer transition-all ${activeTab === 'RESULTS' ? 'bg-emerald-500 text-black font-bold shadow-[0_0_12px_rgba(0,255,102,0.35)]' : 'bg-transparent text-neutral-400 hover:bg-[#111] hover:text-neutral-200'}`}
          >
            📊 Рапорты ({state.history.length})
          </button>

          <button
            onClick={() => setActiveTab('ADVENTURERS')}
            className={`px-4 py-2 rounded-md cursor-pointer transition-all ${activeTab === 'ADVENTURERS' ? 'bg-emerald-500 text-black font-bold shadow-[0_0_12px_rgba(0,255,102,0.35)]' : 'bg-transparent text-neutral-400 hover:bg-[#111] hover:text-neutral-200'}`}
          >
            ⚔️ Приключенцы ({state.adventurers.length})
          </button>

          <button
            onClick={() => setActiveTab('CLANS')}
            className={`px-4 py-2 rounded-md cursor-pointer transition-all ${activeTab === 'CLANS' ? 'bg-emerald-500 text-black font-bold shadow-[0_0_12px_rgba(0,255,102,0.35)]' : 'bg-transparent text-neutral-400 hover:bg-[#111] hover:text-neutral-200'}`}
          >
            🏛️ Посольства ({state.clans.slice(0, state.nClans).filter(c => c.id !== 'clan_guild').length})
          </button>

        </div>
      </nav>}

      {/* Main Container Workspace */}
      <main className="flex-1 w-full max-w-[1600px] mx-auto p-4 sm:p-6 z-10">
        
        {/* Render Active View Tab */}
        {mainSection === 'GAME' && activeTab === 'MAP' && (
          <MapTab
            state={state}
            updateState={updateState}
            showToast={showToast}
            onSelectMission={(id) => {
              updateState({ selectedMissionId: id });
              setIsMissionOpen(true);
            }}
            mapDisplayUrl={runtimeMapUrl}
          />
        )}

        {mainSection === 'GAME' && activeTab === 'PHASES' && (
          <PhasesTab
            state={state}
            updateState={updateState}
            showToast={showToast}
            onOpenStore={(id) => setStoreClanId(id)}
            onRedirectToReports={() => setActiveTab('RESULTS')}
          />
        )}

        {mainSection === 'GAME' && activeTab === 'RESULTS' && (
          <ResultsTab state={state} updateState={updateState} showToast={showToast} />
        )}

        {mainSection === 'GAME' && activeTab === 'ADVENTURERS' && (
          <AdventurersTab
            state={state}
            onOpenRecruit={() => setIsRecruitOpen(true)}
            onSelectAdv={(id) => setSelectedAdvId(id)}
            showToast={showToast}
          />
        )}

        {mainSection === 'GAME' && activeTab === 'CLANS' && (
          <ClansTab
            state={state}
            onSelectClan={(id) => setSelectedClanId(id)}
            onOpenStore={(id) => setStoreClanId(id)}
          />
        )}

        {mainSection === 'ADVENTURER_EDITOR' && (
          <AdventurerEditor state={state} updateState={updateState} showToast={showToast} />
        )}

        {mainSection === 'EVENT_EDITOR' && (
          <EventEditor state={state} updateState={updateState} showToast={showToast} />
        )}

      </main>

      {/* Retro scan footer */}
      <footer className="border-t border-emerald-500/5 bg-black/50 py-2 font-mono text-[10px] text-neutral-600 text-center z-40 mt-auto" />

      {/* ==============================================
          MODALS & FLOATING DIALOGS VAULT
          ============================================== */}
      
      {/* Toast Notification alert */}
      {toast && (
        <div className={`fixed bottom-5 right-5 px-4 py-3 border rounded shadow-2xl z-[5000] font-mono text-xs flex items-center gap-2 max-w-sm animate-in fade-in slide-in-from-bottom-5 duration-200 ${toast.isError ? 'bg-rose-950/90 border-rose-500 text-rose-300' : 'bg-emerald-950/90 border-emerald-500 text-emerald-300'}`}>
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{toast.message}</span>
        </div>
      )}

      {/* GM Parameters Overlord Modal */}
      <GmOverlordModal
        isOpen={isGmOpen}
        onClose={() => setIsGmOpen(false)}
        state={state}
        updateState={updateState}
        showToast={showToast}
        onHealAll={handleHealAll}
        onCreateCustomMission={handleCreateCustomMission}
        onImportState={(importedState) => updateState(importedState)}
        onResetToDay1={handleResetToDay1}
        onSelectMapFile={handleSelectMapFile}
        onRestoreDefaultMap={handleRestoreDefaultMap}
        onExportScenario={handleExportScenario}
        onImportScenario={handleImportScenario}
      />

      {/* Mission Scouting / Contract Binder Modal */}
      <MissionModal
        isOpen={isMissionOpen}
        onClose={() => setIsMissionOpen(false)}
        selectedMissionId={state.selectedMissionId}
        state={state}
        onUseIntel={handleUseIntel}
        onAssignContract={() => {
          setIsMissionOpen(false);
          setActiveTab('PHASES');
          updateState({ currentPhase: 1 });
        }}
        onDeleteMission={handleDeleteMission}
      />

      {/* Recruitment Modal */}
      <RecruitModal
        isOpen={isRecruitOpen}
        onClose={() => setIsRecruitOpen(false)}
        state={state}
        onRecruit={handleRecruit}
        showToast={showToast}
      />

      {/* Adventurer Dossier Detail Modal */}
      <AdventurerDetailModal
        isOpen={selectedAdvId !== null}
        onClose={() => setSelectedAdvId(null)}
        selectedAdvId={selectedAdvId}
        state={state}
        onHeal={handleHealSingle}
        onAdjustReputation={handleAdjustReputation}
        onUpdateAdventurer={handleUpdateAdventurer}
      />

      {/* Clan Dossier and GM Resource Editor Modal */}
      <ClanDossierModal
        isOpen={selectedClanId !== null}
        onClose={() => setSelectedClanId(null)}
        selectedClanId={selectedClanId}
        state={state}
        updateClan={handleUpdateClan}
        onOpenStore={(id) => setStoreClanId(id)}
        showToast={showToast}
      />

      {/* Clan Resource Purchase Shop Modal */}
      <ResourceStoreModal
        isOpen={storeClanId !== null}
        onClose={() => setStoreClanId(null)}
        selectedClanId={storeClanId}
        state={state}
        onBuyResource={handleBuyResource}
      />

    </div>
  );
}
