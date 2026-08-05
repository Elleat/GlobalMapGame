/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { Compass, HelpCircle, Shield, RotateCw, Maximize2, Search, Plus, MapPin, Award, Layers3 } from 'lucide-react';
import { GameState, MapRegion, Mission, MissionResourceKey, MissionType } from '../types';
import { DEFAULT_MAP_URL } from '../domain/constants';
import { willMissionExpireAfterDay } from '../domain/missions';
import {
  cleanMissionTitle,
  getMissionPresentation,
  getScoutingClanNames
} from '../domain/missionPresentation';
import { getResourceNameRu } from '../utils';
import RegionEditorPanel from './RegionEditorPanel';
import {
  createMapRegion,
  findMapRegionAtPoint,
  getFogOpacity,
  getRegionClipPath
} from '../domain/mapRegions';

interface MapTabProps {
  state: GameState;
  updateState: (newState: Partial<GameState>) => void;
  showToast: (msg: string, isError?: boolean) => void;
  onSelectMission: (id: string) => void;
  mapDisplayUrl?: string | null;
}

export default function MapTab({
  state,
  updateState,
  showToast,
  onSelectMission,
  mapDisplayUrl
}: MapTabProps) {
  const [zoom, setZoom] = useState(60);
  const [rotate, setRotate] = useState(90);
  const [panning, setPanning] = useState(false);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Story Mission Form inputs
  const [storyTitle, setStoryTitle] = useState('');
  const [storyDesc, setStoryDesc] = useState('');
  const [storyReq, setStoryReq] = useState<MissionResourceKey>('Supplies');
  const [storySpecialItem, setStorySpecialItem] = useState('');
  const [storyDc, setStoryDc] = useState(12);
  const [storyLifespan, setStoryLifespan] = useState(3);
  const [storyX, setStoryX] = useState(50);
  const [storyY, setStoryY] = useState(50);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapImageRef = useRef<HTMLImageElement>(null);
  const [activeVertexIndex, setActiveVertexIndex] = useState<number | null>(null);
  const [draggingMissionId, setDraggingMissionId] = useState<string | null>(null);
  const [isDraggingHq, setIsDraggingHq] = useState(false);
  const [draggedDistance, setDraggedDistance] = useState(0);
  const [isRegionEditorOpen, setIsRegionEditorOpen] = useState(false);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(state.mapRegions[0]?.id ?? null);
  const [isAddingRegionPoint, setIsAddingRegionPoint] = useState(false);
  const [isPlayerRegionPreview, setIsPlayerRegionPreview] = useState(false);
  const [draggingRegionVertex, setDraggingRegionVertex] = useState<{ regionId: string; index: number } | null>(null);
  const [selectedRegionVertex, setSelectedRegionVertex] = useState<{ regionId: string; index: number } | null>(null);
  const [draggingRegionLabelId, setDraggingRegionLabelId] = useState<string | null>(null);

  const updateRegion = (regionId: string, change: Partial<MapRegion>) => {
    updateState({
      mapRegions: state.mapRegions.map(region => region.id === regionId ? { ...region, ...change } : region)
    });
  };

  const handleCreateRegion = () => {
    const region = createMapRegion(state.mapRegions.length, { x: storyX, y: storyY });
    updateState({ mapRegions: [...state.mapRegions, region] });
    setSelectedRegionId(region.id);
    setIsPlayerRegionPreview(false);
    showToast(`🗺️ Создан скрытый регион «${region.name}».`);
  };

  const handleDuplicateRegion = (regionId: string) => {
    const source = state.mapRegions.find(region => region.id === regionId);
    if (!source) return;
    const copy: MapRegion = {
      ...structuredClone(source),
      id: `region_${Date.now().toString(36)}_copy`,
      name: `${source.name} — копия`,
      visibleToPlayers: false,
      points: source.points.map(point => ({ x: Math.min(100, point.x + 2), y: Math.min(100, point.y + 2) })),
      labelPosition: {
        x: Math.min(100, source.labelPosition.x + 2),
        y: Math.min(100, source.labelPosition.y + 2)
      }
    };
    updateState({ mapRegions: [...state.mapRegions, copy] });
    setSelectedRegionId(copy.id);
  };

  const handleDeleteRegion = (regionId: string) => {
    const next = state.mapRegions.filter(region => region.id !== regionId);
    updateState({ mapRegions: next });
    setSelectedRegionId(next[0]?.id ?? null);
    setIsAddingRegionPoint(false);
  };

  const handleMoveRegion = (regionId: string, direction: -1 | 1) => {
    const index = state.mapRegions.findIndex(region => region.id === regionId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= state.mapRegions.length) return;
    const next = [...state.mapRegions];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    updateState({ mapRegions: next });
  };

  const getMapCoordsFromEvent = (e: React.MouseEvent) => {
    if (!mapContainerRef.current) return { x: 50, y: 50 };
    const containerRect = mapContainerRef.current.getBoundingClientRect();
    const dx = e.clientX - containerRect.left - panOffset.x;
    const dy = e.clientY - containerRect.top - panOffset.y;
    const scale = zoom / 100;
    if (scale <= 0) return { x: 50, y: 50 };

    const unscaledX = dx / scale;
    const unscaledY = dy / scale;

    const rad = (-rotate * Math.PI) / 180;
    const mapX_px = unscaledX * Math.cos(rad) - unscaledY * Math.sin(rad);
    const mapY_px = unscaledX * Math.sin(rad) + unscaledY * Math.cos(rad);

    const percentX = Math.round((mapX_px / (state.mapWidth || 1000)) * 100);
    const percentY = Math.round((mapY_px / (state.mapHeight || 1000)) * 100);

    return {
      x: Math.max(0, Math.min(100, percentX)),
      y: Math.max(0, Math.min(100, percentY))
    };
  };

  const getClampedPanOffset = (offset: { x: number; y: number }, currentZoom: number = zoom, currentRotate: number = rotate) => {
    if (!mapContainerRef.current) return offset;
    const CW = mapContainerRef.current.clientWidth;
    const CH = mapContainerRef.current.clientHeight;
    if (!CW || !CH) return offset;

    const W = state.mapWidth || 910;
    const H = state.mapHeight || 1303;
    const scale = currentZoom / 100;
    const rad = (currentRotate * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    // 4 corners of unscaled map
    const corners = [
      { x: 0, y: 0 },
      { x: W, y: 0 },
      { x: W, y: H },
      { x: 0, y: H }
    ];

    let minX_rel = Infinity;
    let maxX_rel = -Infinity;
    let minY_rel = Infinity;
    let maxY_rel = -Infinity;

    corners.forEach(c => {
      const rx = (c.x * cos - c.y * sin) * scale;
      const ry = (c.x * sin + c.y * cos) * scale;
      if (rx < minX_rel) minX_rel = rx;
      if (rx > maxX_rel) maxX_rel = rx;
      if (ry < minY_rel) minY_rel = ry;
      if (ry > maxY_rel) maxY_rel = ry;
    });

    const minTx = Math.min(-minX_rel, CW - maxX_rel);
    const maxTx = Math.max(-minX_rel, CW - maxX_rel);
    const minTy = Math.min(-minY_rel, CH - maxY_rel);
    const maxTy = Math.max(-minY_rel, CH - maxY_rel);

    return {
      x: Math.round(Math.max(minTx, Math.min(maxTx, offset.x))),
      y: Math.round(Math.max(minTy, Math.min(maxTy, offset.y)))
    };
  };

  // Pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    // The left button is reserved for tools and selection; pan with right or middle.
    if (e.button !== 1 && e.button !== 2) return;

    const target = e.target as HTMLElement;
    if (target.closest('.no-pan') || activeVertexIndex !== null) {
      return;
    }
    // Prevent default browser dragging and text selection on either click
    e.preventDefault();
    setPanning(true);
    setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (panning) {
      const rawOffset = {
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      };
      setPanOffset(getClampedPanOffset(rawOffset));
    } else if (activeVertexIndex !== null && mapContainerRef.current) {
      const coords = getMapCoordsFromEvent(e);
      const updatedPolygon = [...state.spawnPolygon];
      updatedPolygon[activeVertexIndex] = coords;
      updateState({ spawnPolygon: updatedPolygon });
    } else if (draggingRegionVertex !== null && mapContainerRef.current) {
      setDraggedDistance(distance => distance + 1);
      const coords = getMapCoordsFromEvent(e);
      const region = state.mapRegions.find(item => item.id === draggingRegionVertex.regionId);
      if (region) {
        updateRegion(region.id, {
          points: region.points.map((point, index) => index === draggingRegionVertex.index ? coords : point)
        });
      }
    } else if (draggingRegionLabelId !== null && mapContainerRef.current) {
      setDraggedDistance(distance => distance + 1);
      updateRegion(draggingRegionLabelId, { labelPosition: getMapCoordsFromEvent(e) });
    } else if (draggingMissionId !== null && mapContainerRef.current) {
      setDraggedDistance(d => d + 1);
      const coords = getMapCoordsFromEvent(e);
      const updatePosition = (mission: Mission) => {
        if (mission.id !== draggingMissionId) return mission;
        if (mission.regionMode === 'MANUAL') return { ...mission, ...coords };
        const region = findMapRegionAtPoint(state.mapRegions, coords);
        return { ...mission, ...coords, regionMode: 'AUTO' as const, regionId: region?.id, region: region?.name ?? 'ВНЕ РЕГИОНОВ' };
      };
      const updatedMissions = state.missions.map(updatePosition);
      const updatedAllMissions = (state.allMissions || []).map(updatePosition);
      updateState({ missions: updatedMissions, allMissions: updatedAllMissions });
    } else if (isDraggingHq && mapContainerRef.current) {
      setDraggedDistance(d => d + 1);
      const coords = getMapCoordsFromEvent(e);
      updateState({ hqPos: coords });
    }
  };

  const handleMouseUp = () => {
    setPanning(false);
    setActiveVertexIndex(null);
    setDraggingMissionId(null);
    setIsDraggingHq(false);
    setDraggingRegionVertex(null);
    setDraggingRegionLabelId(null);
  };

  // Map click for GM coordinate selection
  const handleMapClick = (e: React.MouseEvent) => {
    if (!state.isDmMode) return;
    
    // Avoid coordinate select if dragging or clicking buttons/vertices
    const target = e.target as HTMLElement;
    if (target.closest('.no-pan') || activeVertexIndex !== null || panning) {
      return;
    }
    if (draggedDistance > 5) {
      setDraggedDistance(0);
      return;
    }

    const coords = getMapCoordsFromEvent(e);
    if (isRegionEditorOpen && selectedRegionId && isAddingRegionPoint) {
      const region = state.mapRegions.find(item => item.id === selectedRegionId);
      if (region) {
        updateRegion(region.id, { points: [...region.points, coords] });
        showToast(`📐 В регион «${region.name}» добавлена новая вершина.`);
      }
      return;
    }
    if (isRegionEditorOpen) return;
    setStoryX(coords.x);
    setStoryY(coords.y);
    showToast(`📍 Выбраны координаты спавна: X=${coords.x}%, Y=${coords.y}%`);
  };

  const applyZoomAtPoint = (targetZoom: number, focusX: number, focusY: number) => {
    const newZoom = Math.max(60, Math.min(500, targetZoom));
    if (newZoom === zoom) return;

    const s1 = zoom / 100;
    const s2 = newZoom / 100;

    const newPanX = focusX - (s2 / s1) * (focusX - panOffset.x);
    const newPanY = focusY - (s2 / s1) * (focusY - panOffset.y);

    const clamped = getClampedPanOffset({ x: newPanX, y: newPanY }, newZoom, rotate);
    setZoom(newZoom);
    setPanOffset(clamped);
  };

  const zoomIn = () => {
    if (!mapContainerRef.current) {
      setZoom(z => Math.min(500, z + 20));
      return;
    }
    const focusX = mapContainerRef.current.clientWidth / 2;
    const focusY = mapContainerRef.current.clientHeight / 2;
    applyZoomAtPoint(zoom + 20, focusX, focusY);
  };

  const zoomOut = () => {
    if (!mapContainerRef.current) {
      setZoom(z => Math.max(60, z - 20));
      return;
    }
    const focusX = mapContainerRef.current.clientWidth / 2;
    const focusY = mapContainerRef.current.clientHeight / 2;
    applyZoomAtPoint(zoom - 20, focusX, focusY);
  };

  const rotateCw = () => setRotate(r => (r + 90) % 360);
  const resetMap = () => {
    setZoom(60);
    setRotate(90);
    setTimeout(() => {
      centerOnHq(60);
    }, 50);
  };
  const fitToView = () => {
    if (mapContainerRef.current && mapImageRef.current) {
      const cW = mapContainerRef.current.clientWidth;
      const iW = state.mapWidth || 910;
      const ratio = Math.round((cW / iW) * 100);
      const newZoom = Math.max(60, Math.min(200, ratio));
      setZoom(newZoom);
      setPanOffset(getClampedPanOffset({ x: 0, y: 0 }, newZoom, rotate));
    }
  };

  const centerOnHq = (currentZoom: number = zoom) => {
    if (mapContainerRef.current) {
      const containerWidth = mapContainerRef.current.clientWidth;
      const containerHeight = mapContainerRef.current.clientHeight;
      const hq = state.hqPos || { x: 50, y: 50 };
      
      const hqPixelX = (hq.x / 100) * state.mapWidth;
      const hqPixelY = (hq.y / 100) * state.mapHeight;
      
      const scale = currentZoom / 100;
      const scaledHqX = hqPixelX * scale;
      const scaledHqY = hqPixelY * scale;
      
      // Calculate rotation in radians
      const rad = (rotate * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      
      // Rotate the scaled coordinates around top-left (0,0)
      const rotatedHqX = scaledHqX * cos - scaledHqY * sin;
      const rotatedHqY = scaledHqX * sin + scaledHqY * cos;
      
      // Centering means we want rotatedHqX + targetPanX = containerWidth / 2
      // and rotatedHqY + targetPanY = containerHeight / 2
      const targetPanX = Math.round(containerWidth / 2 - rotatedHqX);
      const targetPanY = Math.round(containerHeight / 2 - rotatedHqY);
      
      setPanOffset(getClampedPanOffset({ x: targetPanX, y: targetPanY }, currentZoom, rotate));
    }
  };

  const handleWheel = (e: WheelEvent | React.WheelEvent) => {
    e.preventDefault();
    if (!mapContainerRef.current) return;
    const rect = mapContainerRef.current.getBoundingClientRect();
    const focusX = e.clientX - rect.left;
    const focusY = e.clientY - rect.top;

    const delta = e.deltaY > 0 ? -15 : 15;
    applyZoomAtPoint(zoom + delta, focusX, focusY);
  };

  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;
    const listener = (event: WheelEvent) => handleWheel(event);
    container.addEventListener('wheel', listener, { passive: false });
    return () => container.removeEventListener('wheel', listener);
  }, [zoom, panOffset, rotate, state.mapWidth, state.mapHeight]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
      if (event.key === 'Escape') {
        setIsAddingRegionPoint(false);
        setSelectedRegionVertex(null);
      }
      if (event.key === 'Home') {
        event.preventDefault();
        centerOnHq();
      }
      if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        setZoom(current => Math.min(500, current + 15));
      }
      if (event.key === '-' || event.key === '_') {
        event.preventDefault();
        setZoom(current => Math.max(60, current - 15));
      }
      if (event.ctrlKey && event.key.toLocaleLowerCase() === 'z' && isAddingRegionPoint && selectedRegionId) {
        const region = state.mapRegions.find(item => item.id === selectedRegionId);
        if (region && region.points.length > 3) {
          event.preventDefault();
          updateRegion(region.id, { points: region.points.slice(0, -1) });
        }
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedRegionVertex) {
        const region = state.mapRegions.find(item => item.id === selectedRegionVertex.regionId);
        if (region && region.points.length > 3) {
          event.preventDefault();
          updateRegion(region.id, { points: region.points.filter((_, index) => index !== selectedRegionVertex.index) });
          setSelectedRegionVertex(null);
        }
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isAddingRegionPoint, selectedRegionId, selectedRegionVertex, state.mapRegions]);

  useEffect(() => {
    const timer = setTimeout(() => {
      centerOnHq();
    }, 200);
    return () => clearTimeout(timer);
  }, [state.hqPos, state.mapWidth, state.mapHeight, rotate]);

  useEffect(() => {
    setPanOffset(prev => getClampedPanOffset(prev, zoom, rotate));
  }, [zoom, rotate]);

  useEffect(() => {
    if (selectedRegionId && state.mapRegions.some(region => region.id === selectedRegionId)) return;
    setSelectedRegionId(state.mapRegions[0]?.id ?? null);
  }, [selectedRegionId, state.mapRegions]);

  // Create story mission handler
  const handleCreateStoryMission = (e: React.FormEvent) => {
    e.preventDefault();
    const title = storyTitle.trim() || 'Сюжетное Задание';
    const desc = storyDesc.trim() || 'Важное поручение от лорда-командующего.';

    const newM: Mission = {
      id: 'story_' + Math.random().toString(36).substr(2, 6),
      title,
      desc,
      reqResource: storyReq,
      dc: storyDc,
      type: 'STORY',
      lifespan: storyLifespan,
      maxLifespan: storyLifespan,
      startDay: state.day,
      x: storyX,
      y: storyY,
      region: 'СЮЖЕТНАЯ ЗОНА',
      pinned: true,
      intelRevealed: false,
      scoutedByClanIds: [],
      storyStatus: 'AVAILABLE',
      checks: [{
        id: `story-stage-${Date.now().toString(36)}`,
        label: 'Сюжетный этап',
        reqResource: storyReq,
        requiredSpecialItem: storySpecialItem.trim() || undefined,
        dc: storyDc
      }]
    };

    updateState({
      missions: [...state.missions, newM],
      allMissions: [...(state.allMissions || []), newM]
    });

    showToast(`⚔️ Создано Донесение: "${title}"!`);
    
    // Clear inputs
    setStoryTitle('');
    setStoryDesc('');
    setStoryReq('Supplies');
    setStorySpecialItem('');
    setStoryDc(12);
    setStoryLifespan(3);
  };

  // Convert polygon coordinates to SVG points string (0-100 viewBox numbers)
  const polygonPointsString = state.spawnPolygon
    .map(p => `${p.x},${p.y}`)
    .join(' ');

  return (
    <div className="space-y-4">
      
      {/* Map Controls Ribbon */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#0d0d0d] border border-emerald-500/10 p-3 rounded-md">
        
        {/* Left Side: Game Master Mode Banner */}
        <div className="flex items-center gap-2">
          <Compass className="w-5 h-5 text-emerald-500 animate-spin-slow" />
          <span className="font-mono text-xs uppercase tracking-wider text-neutral-300">
            Интерактивная карта донесений
          </span>
          {state.isDmMode && (
            <span className="px-1.5 py-0.5 bg-amber-500 text-black text-[9px] font-mono font-bold rounded uppercase flex items-center gap-1">
              <Shield className="w-3 h-3" />
              ГМ РЕЖИМ
            </span>
          )}
        </div>

        {/* Right Side: Map Controls */}
        <div className="flex items-center gap-2 font-mono">
          <button
            onClick={zoomOut}
            className="px-2 py-1 bg-[#161616] hover:bg-[#252525] border border-emerald-500/10 text-emerald-400 text-xs rounded transition-all"
          >
            -
          </button>
          <span className="text-xs text-neutral-400 w-12 text-center">{zoom}%</span>
          <button
            onClick={zoomIn}
            className="px-2 py-1 bg-[#161616] hover:bg-[#252525] border border-emerald-500/10 text-emerald-400 text-xs rounded transition-all"
          >
            +
          </button>
          
          <button
            onClick={rotateCw}
            className="p-1.5 bg-[#161616] hover:bg-[#252525] border border-emerald-500/10 text-emerald-400 rounded transition-all"
            title="Повернуть на 90 градусов"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
          
          <button
            onClick={fitToView}
            className="p-1.5 bg-[#161616] hover:bg-[#252525] border border-emerald-500/10 text-emerald-400 rounded transition-all"
            title="Вписать в размер экрана"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => centerOnHq()}
            className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500 border border-amber-500/35 hover:text-black text-amber-400 text-xs rounded transition-all uppercase font-bold"
            title="Центрировать карту на Штабе"
          >
            🏰 Штаб
          </button>

          {state.isDmMode && (
            <button
              type="button"
              onClick={() => {
                setIsRegionEditorOpen(open => !open);
                setIsAddingRegionPoint(false);
                setIsPlayerRegionPreview(false);
              }}
              className={`px-2.5 py-1 border text-xs rounded transition-all uppercase font-bold flex items-center gap-1.5 ${isRegionEditorOpen ? 'bg-sky-500 border-sky-400 text-black' : 'bg-sky-500/10 border-sky-500/35 text-sky-300 hover:bg-sky-500/20'}`}
              title="Редактировать регионы карты"
            >
              <Layers3 className="h-3.5 w-3.5" /> Регионы
            </button>
          )}

          <button
            onClick={resetMap}
            className="px-2.5 py-1 bg-rose-950/20 hover:bg-rose-900/30 border border-rose-500/20 text-rose-400 text-xs rounded transition-all uppercase"
          >
            Сброс
          </button>
        </div>

      </div>

      {/* Main Map Canvas Area */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        
        {/* Canvas Display Card (Occupies 3 columns) */}
        <div className="lg:col-span-3 bg-[#0d0d0d] border border-emerald-500/20 rounded-lg relative overflow-hidden h-[600px] select-none shadow-2xl">
          
          <div
            ref={mapContainerRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onContextMenu={(e) => e.preventDefault()}
            className={`w-full h-full ${panning ? 'cursor-grabbing' : 'cursor-default'}`}
            style={{ position: 'relative' }}
          >
            
            {/* Navigational Canvas Wrapper */}
            <div
              className="absolute origin-top-left transition-transform duration-75"
              onClick={handleMapClick}
              style={{
                transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom / 100}) rotate(${rotate}deg)`,
                width: `${state.mapWidth}px`,
                height: `${state.mapHeight}px`
              }}
            >
              
              {/* Map Image Backdrop */}
              <img
                ref={mapImageRef}
                src={mapDisplayUrl || state.mapBgUrl || DEFAULT_MAP_URL}
                alt="Поле Боя"
                onError={(e) => {
                  const target = e.currentTarget;
                  if (!target.src.endsWith(DEFAULT_MAP_URL)) {
                    target.src = DEFAULT_MAP_URL;
                    if (!mapDisplayUrl) updateState({ mapBgUrl: DEFAULT_MAP_URL, mapAssetId: null });
                  }
                }}
                className="w-full h-full object-cover rounded pointer-events-auto"
                draggable={false}
                onDragStart={(e) => e.preventDefault()}
              />

              {/* Atmospheric fog clipped to region polygons. */}
              {state.mapEffectsEnabled && state.mapRegions.map(region => {
                const editingView = state.isDmMode && isRegionEditorOpen && !isPlayerRegionPreview;
                const fogIsVisible = region.fog.enabled && (editingView || region.visibleToPlayers);
                if (!fogIsVisible) return null;
                const playbackRate = region.fog.speed === 'FAST' ? 1.35 : region.fog.speed === 'SLOW' ? 0.65 : 1;
                return (
                  <div
                    key={`fog-${region.id}`}
                    className="absolute inset-0 pointer-events-none overflow-hidden region-fog-mask"
                    style={{
                      zIndex: 4,
                      clipPath: getRegionClipPath(region.points),
                      opacity: getFogOpacity(region.fog.density)
                    } as React.CSSProperties}
                    aria-hidden="true"
                  >
                    <video
                      className="region-fog-video"
                      src="/effects/AmbientFog001_001_Loop_White_1200x1200.webm"
                      muted
                      autoPlay
                      loop
                      playsInline
                      preload="metadata"
                      onLoadedMetadata={event => { event.currentTarget.playbackRate = playbackRate; }}
                    />
                  </div>
                );
              })}

              {/* Configurable region fill and boundary layers. */}
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                style={{ zIndex: 5 }}
              >
                {state.mapRegions.map(region => {
                  const editingView = state.isDmMode && isRegionEditorOpen && !isPlayerRegionPreview;
                  if (!editingView && !region.visibleToPlayers) return null;
                  const selected = region.id === selectedRegionId;
                  const configuredFillVisible = region.visibleToPlayers && region.showFill;
                  const configuredBoundaryVisible = region.visibleToPlayers && region.showBoundary;
                  const fillVisible = editingView ? region.showFill : configuredFillVisible;
                  const boundaryVisible = editingView || configuredBoundaryVisible;
                  const hiddenFromPlayers = !region.visibleToPlayers;
                  const strokeOpacity = configuredBoundaryVisible
                    ? region.borderOpacity
                    : editingView ? (selected ? 0.85 : 0.4) : 0;
                  const fillOpacity = fillVisible
                    ? editingView && hiddenFromPlayers
                      ? Math.min(region.fillOpacity, selected ? 0.16 : 0.08)
                      : region.fillOpacity
                    : editingView && selected ? 0.035 : 0;
                  return (
                    <polygon
                      key={region.id}
                      className={editingView ? 'no-pan cursor-pointer' : undefined}
                      points={region.points.map(point => `${point.x},${point.y}`).join(' ')}
                      fill={region.color}
                      fillOpacity={fillOpacity}
                      stroke={boundaryVisible ? region.color : 'transparent'}
                      strokeOpacity={strokeOpacity}
                      strokeWidth={selected && editingView ? 0.75 : 0.45}
                      strokeDasharray={editingView && (!configuredBoundaryVisible || hiddenFromPlayers) ? '1.2 0.8' : undefined}
                      vectorEffect="non-scaling-stroke"
                      style={{ pointerEvents: editingView && !isAddingRegionPoint ? 'auto' : 'none' }}
                      onClick={event => {
                        if (!editingView) return;
                        event.stopPropagation();
                        setSelectedRegionId(region.id);
                      }}
                    >
                      <title>{region.name}{hiddenFromPlayers ? ' · скрыт от игроков' : ''}</title>
                    </polygon>
                  );
                })}
              </svg>

              {/* GM Spawn Area Polygon - Drawn relative using SVG viewBox */}
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                style={{ zIndex: 5 }}
              >
                {state.isDmMode && !isRegionEditorOpen && (
                  <polygon
                    points={polygonPointsString}
                    fill="rgba(245, 158, 11, 0.22)"
                    stroke="#f59e0b"
                    strokeWidth="0.8"
                    strokeDasharray="2 1"
                  />
                )}

                {/* Animated Dashed Lines from HQ to Active Contracts */}
                {state.contracts.map((c) => {
                  const mission = state.missions.find(m => m.id === c.missionId);
                  if (!mission) return null;
                  const hq = state.hqPos || { x: 50, y: 50 };
                  const { isDelayedStory } = getMissionPresentation(mission, state.day, state.isDmMode);
                  return (
                    <line
                      key={c.missionId}
                      x1={hq.x}
                      y1={hq.y}
                      x2={mission.x}
                      y2={mission.y}
                      stroke={isDelayedStory ? 'var(--story-delayed, #f59e0b)' : 'var(--contract-line, #10b981)'}
                      strokeWidth={isDelayedStory ? '1.4' : '0.8'}
                      strokeDasharray={isDelayedStory ? '0.8 0.8' : '2 1.5'}
                    >
                      <animate
                        attributeName="stroke-dashoffset"
                        from="7"
                        to="0"
                        dur="1.2s"
                        repeatCount="indefinite"
                      />
                    </line>
                  );
                })}
              </svg>

              {/* Region names rotate back so they remain readable. */}
              {state.mapRegions.map(region => {
                const editingView = state.isDmMode && isRegionEditorOpen && !isPlayerRegionPreview;
                const labelVisible = editingView || (region.visibleToPlayers && region.showLabel);
                if (!labelVisible) return null;
                const selected = region.id === selectedRegionId;
                return (
                  <div
                    key={`label-${region.id}`}
                    className={`no-pan absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded border px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider shadow-md ${editingView ? 'cursor-move' : 'pointer-events-none'} ${region.visibleToPlayers ? 'bg-black/70' : 'border-dashed bg-black/45'}`}
                    style={{
                      left: `${region.labelPosition.x}%`,
                      top: `${region.labelPosition.y}%`,
                      color: region.color,
                      borderColor: region.color,
                      opacity: region.visibleToPlayers ? 1 : selected ? 0.95 : 0.6,
                      transform: `translate(-50%, -50%) rotate(${-rotate}deg)`,
                      zIndex: 12
                    }}
                    onMouseDown={event => {
                      if (!editingView) return;
                      event.stopPropagation();
                      setSelectedRegionId(region.id);
                      setDraggingRegionLabelId(region.id);
                      setDraggedDistance(0);
                    }}
                  >
                    {region.name}{editingView && !region.visibleToPlayers ? ' · скрыт' : ''}
                  </div>
                );
              })}

              {/* GM Mode Spawn Zone Label */}
              {state.isDmMode && !isRegionEditorOpen && state.spawnPolygon.length > 0 && (() => {
                const avgX = state.spawnPolygon.reduce((acc, p) => acc + p.x, 0) / state.spawnPolygon.length;
                const avgY = state.spawnPolygon.reduce((acc, p) => acc + p.y, 0) / state.spawnPolygon.length;
                return (
                  <div
                    className="absolute bg-amber-500/90 text-black font-mono text-[9px] font-bold px-2 py-0.5 rounded border border-amber-300 shadow pointer-events-none -translate-x-1/2 -translate-y-1/2 z-10 uppercase tracking-wider"
                    style={{ left: `${avgX}%`, top: `${avgY}%` }}
                  >
                    📐 Зона спавна ({state.spawnPolygon.length} вершин)
                  </div>
                );
              })()}

              {/* Guild HQ Fortress Icon (Draggable by GM) */}
              {(() => {
                const hq = state.hqPos || { x: 50, y: 50 };
                return (
                  <div
                    onMouseDown={(e) => {
                      if (!state.isDmMode) return;
                      e.stopPropagation();
                      setIsDraggingHq(true);
                      setDraggedDistance(0);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (draggedDistance > 5) return;
                      showToast(`🏰 Штаб-квартира «${state.guildName}»` + (state.isDmMode ? ' (ГМ: можно перетащить)' : ''));
                    }}
                    className="no-pan absolute w-12 h-12 cursor-pointer flex items-center justify-center group"
                    style={{
                      left: `${hq.x}%`,
                      top: `${hq.y}%`,
                      transform: `translate(-50%, -50%) rotate(${-rotate}deg)`,
                      zIndex: 35
                    }}
                  >
                    <div className="absolute inset-0 rounded-full animate-pulse bg-amber-500/30" />
                    <div className={`relative w-10 h-10 rounded-full border-2 border-amber-400 bg-[#121212] flex items-center justify-center shadow-[0_0_15px_rgba(245,158,11,0.5)] transition-all group-hover:scale-110 ${state.isDmMode ? 'cursor-move' : 'cursor-pointer'}`}>
                      <Shield className="w-5 h-5 text-amber-400 fill-amber-500/20" />
                      <span className="absolute bottom-11 bg-black border border-amber-500 text-amber-400 text-[10px] font-mono px-2 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity">
                        🏰 Штаб «{state.guildName}» {state.isDmMode && '(ГМ: перетащите)'}
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* GM Vertex Drag Handles */}
              {state.isDmMode && !isRegionEditorOpen && state.spawnPolygon.map((v, idx) => (
                <div
                  key={idx}
                  className="no-pan absolute w-5 h-5 bg-amber-500 hover:bg-emerald-400 border-2 border-white rounded-full cursor-move flex items-center justify-center text-[9px] font-bold text-black select-none"
                  style={{
                    left: `${v.x}%`,
                    top: `${v.y}%`,
                    transform: `translate(-50%, -50%) rotate(${-rotate}deg)`,
                    zIndex: 20
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setActiveVertexIndex(idx);
                  }}
                >
                  {idx + 1}
                </div>
              ))}

              {/* Selected region vertex handles. */}
              {state.isDmMode && isRegionEditorOpen && !isPlayerRegionPreview && (() => {
                const selectedRegion = state.mapRegions.find(region => region.id === selectedRegionId);
                if (!selectedRegion) return null;
                return selectedRegion.points.map((point, index) => (
                  <div
                    key={`${selectedRegion.id}-vertex-${index}`}
                    className="no-pan absolute flex h-5 w-5 cursor-move items-center justify-center rounded-full border-2 border-white bg-sky-500 text-[8px] font-bold text-black shadow-[0_0_8px_rgba(56,189,248,0.7)] hover:bg-amber-400"
                    style={{
                      left: `${point.x}%`,
                      top: `${point.y}%`,
                      transform: `translate(-50%, -50%) rotate(${-rotate}deg)`,
                      zIndex: 25
                    }}
                    onMouseDown={event => {
                      event.stopPropagation();
                      setSelectedRegionVertex({ regionId: selectedRegion.id, index });
                      setDraggingRegionVertex({ regionId: selectedRegion.id, index });
                      setDraggedDistance(0);
                    }}
                    title={`Вершина ${index + 1}`}
                  >
                    {index + 1}
                  </div>
                ));
              })()}

              {/* Draggable/Selectable Active Mission Pins */}
              {state.missions.map((m) => {
                const isUrgent = willMissionExpireAfterDay(m);
                const presentation = getMissionPresentation(m, state.day, state.isDmMode);
                const isStory = presentation.showStoryIdentity;
                const isDummy = presentation.visibleType === 'DUMMY' && (state.isDmMode || m.intelRevealed);
                const isDelayedStory = presentation.isDelayedStory;
                const scoutingClanNames = getScoutingClanNames(m, state.clans);
                const scoutingSuffix = m.intelRevealed
                  ? ` · разведано: ${scoutingClanNames.length > 0 ? scoutingClanNames.join(', ') : 'источник не указан'}`
                  : '';
                return (
                  <div
                    key={m.id}
                    onMouseDown={(e) => {
                      if (!state.isDmMode) return;
                      e.stopPropagation();
                      setDraggingMissionId(m.id);
                      setDraggedDistance(0);
                    }}
                    onClick={(e) => {
                      if (draggedDistance > 5) {
                        e.stopPropagation();
                        return;
                      }
                      onSelectMission(m.id);
                    }}
                    className="no-pan absolute w-10 h-10 cursor-pointer flex items-center justify-center group"
                    style={{
                      left: `${m.x}%`,
                      top: `${m.y}%`,
                      transform: `translate(-50%, -50%) rotate(${-rotate}deg)`,
                      zIndex: 30
                    }}
                  >
                    <div 
                      className="relative w-full h-full flex items-center justify-center animate-bounce"
                      style={{ animationDuration: isUrgent ? '0.8s' : '2s' }}
                    >
                      {/* Pulsing halo */}
                      <div className={`absolute inset-0 rounded-full animate-ping opacity-35 ${isDelayedStory ? 'bg-amber-400' : isDummy ? 'bg-neutral-400' : isUrgent ? 'bg-rose-500' : isStory ? 'bg-violet-400' : 'bg-emerald-400'}`} />
                      
                      {/* Floating pinpoint flag */}
                      <div className={`relative w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all group-hover:scale-125 ${isDelayedStory ? 'bg-amber-950 border-amber-400 text-amber-300 shadow-[0_0_14px_rgba(245,158,11,0.7)]' : isDummy ? 'bg-neutral-900 border-neutral-400 text-neutral-300' : isUrgent ? 'bg-rose-950 border-rose-500 text-rose-400' : isStory ? 'bg-violet-950 border-violet-400 text-violet-300' : 'bg-black/90 border-emerald-500 text-emerald-400'}`}>
                        {isStory ? <span className="text-base leading-none">◆</span> : <MapPin className="w-4 h-4" />}
                        
                        {/* Floating tooltip badge */}
                        <span className="absolute bottom-9 bg-black border border-emerald-500/40 text-neutral-200 text-[10px] font-mono px-2 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity">
                          {isDelayedStory ? '⏳ Сюжетная миссия ожидает рапорта · ' : isStory ? '◆ Сюжетная миссия · ' : ''}{cleanMissionTitle(m.title)} {m.intelRevealed && `(DC ${m.dc})`}{scoutingSuffix}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}

            </div>
          </div>

        </div>

        {/* Sidebar Panel (1 Column): GM Story Creator & Lists */}
        <div className="space-y-4">
          
          {/* GM Story Creator Panel */}
          {state.isDmMode ? (
            isRegionEditorOpen ? (
              <RegionEditorPanel
                regions={state.mapRegions}
                selectedRegionId={selectedRegionId}
                effectsEnabled={state.mapEffectsEnabled}
                playerPreview={isPlayerRegionPreview}
                addPointMode={isAddingRegionPoint}
                onSelect={regionId => {
                  setSelectedRegionId(regionId);
                  setIsAddingRegionPoint(false);
                }}
                onCreate={handleCreateRegion}
                onUpdate={updateRegion}
                onDuplicate={handleDuplicateRegion}
                onDelete={handleDeleteRegion}
                onMove={handleMoveRegion}
                onToggleAddPoint={() => setIsAddingRegionPoint(active => !active)}
                onEffectsEnabledChange={mapEffectsEnabled => updateState({ mapEffectsEnabled })}
                onPlayerPreviewChange={setIsPlayerRegionPreview}
              />
            ) : (
            <div className="bg-[#0d0d0d] border border-amber-500/30 p-4 rounded-lg space-y-3.5 shadow-md">
              <h3 className="text-amber-500 font-mono text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 border-b border-amber-500/10 pb-2">
                <Shield className="w-4 h-4" />
                Создать Сюжетную Миссию
              </h3>
              
              <form onSubmit={handleCreateStoryMission} className="space-y-3 font-mono text-xs">
                
                <div className="flex flex-col gap-1">
                  <label className="text-neutral-400 uppercase text-[10px]">Заголовок события:</label>
                  <input
                    type="text"
                    required
                    placeholder="Например: Врата Древних"
                    value={storyTitle}
                    onChange={(e) => setStoryTitle(e.target.value)}
                    className="w-full bg-black border border-amber-500/20 text-neutral-200 px-2.5 py-1.5 rounded focus:border-amber-500 outline-none"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-neutral-400 uppercase text-[10px]">Описание донесения:</label>
                  <textarea
                    placeholder="Караван лорда пропал вчера..."
                    value={storyDesc}
                    onChange={(e) => setStoryDesc(e.target.value)}
                    className="w-full h-16 bg-black border border-amber-500/20 text-neutral-200 p-2 rounded focus:border-amber-500 outline-none resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-neutral-400 uppercase text-[10px]">Сложность (DC):</label>
                    <input
                      type="number"
                      min="1"
                      max="35"
                      value={storyDc}
                      onChange={(e) => setStoryDc(parseInt(e.target.value) || 12)}
                      className="w-full bg-black border border-amber-500/20 text-neutral-200 px-2.5 py-1.5 rounded outline-none"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-neutral-400 uppercase text-[10px]">Дней (Timer):</label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={storyLifespan}
                      onChange={(e) => setStoryLifespan(parseInt(e.target.value) || 3)}
                      className="w-full bg-black border border-amber-500/20 text-neutral-200 px-2.5 py-1.5 rounded outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-neutral-400 uppercase text-[10px]">Ключевой Ресурс:</label>
                    <select
                      value={storyReq}
                      onChange={(e) => setStoryReq(e.target.value as MissionResourceKey)}
                      className="w-full bg-black border border-amber-500/20 text-neutral-200 px-2 py-1.5 rounded outline-none"
                    >
                      <option value="Supplies">🎒 Припасы</option>
                      <option value="Equipment">⚔️ Снаряжение</option>
                      <option value="Intelligence">🔍 Разведданные</option>
                      <option value="Alchemy">🧪 Алхимия</option>
                      <option value="None">❌ Нет</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-neutral-400 uppercase text-[10px]">Особый Предмет:</label>
                    <input
                      type="text"
                      placeholder="Напр: Древний Идол"
                      value={storySpecialItem}
                      onChange={(e) => setStorySpecialItem(e.target.value)}
                      className="w-full bg-black border border-amber-500/20 text-neutral-200 px-2.5 py-1.5 rounded outline-none placeholder:text-neutral-600"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] bg-black p-2 rounded border border-amber-500/10 text-neutral-400">
                  <div>Коорд X: <strong className="text-amber-500">{storyX}%</strong></div>
                  <div>Коорд Y: <strong className="text-amber-500">{storyY}%</strong></div>
                </div>

                <button
                  type="submit"
                  className="w-full py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold uppercase tracking-wider rounded transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Разместить
                </button>

              </form>
            </div>
            )
          ) : (
            <div className="bg-[#0d0d0d] border border-emerald-500/10 p-4 rounded-lg space-y-3 shadow-md">
              <h3 className="text-emerald-400 font-mono text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 border-b border-emerald-500/10 pb-2">
                <Compass className="w-4 h-4 text-emerald-500" />
                Сводка Донесений ({state.missions.length})
              </h3>
              <p className="text-[11px] font-mono text-neutral-400 leading-relaxed">
                По карте разбросаны донесения о таинственных развалинах, нападениях чудищ и засадах. Клиентские кланы могут оформлять контракты на эти донесения.
              </p>
              <div className="space-y-2 overflow-y-auto max-h-[300px] pr-1">
                {state.missions.length === 0 ? (
                  <span className="text-neutral-500 font-mono text-[11px]">Донесений пока нет. Попросите ГМа сгенерировать.</span>
                ) : (
                  state.missions.map(m => (
                    <div
                      key={m.id}
                      onClick={() => onSelectMission(m.id)}
                      className="p-2 bg-[#121212] border border-emerald-500/5 hover:border-emerald-500/30 rounded cursor-pointer transition-all text-xs font-mono flex flex-col gap-1 hover:translate-x-1"
                    >
                      <strong className="text-neutral-200">
                        {cleanMissionTitle(m.title)}
                        {m.intelRevealed && ` (разведано: ${getScoutingClanNames(m, state.clans).join(', ') || 'источник не указан'})`}
                      </strong>
                      <span className="text-[10px] text-neutral-400 uppercase">Регион: {m.region}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Polygon Vertices Coordinate Viewer removed */}

        </div>

      </div>

    </div>
  );
}
