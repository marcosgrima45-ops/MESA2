import { CSSProperties, useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import {
  BookOpen,
  Download,
  Focus,
  Maximize,
  Minimize,
  Minus,
  Plus,
  RotateCcw,
  ScrollText,
  ShieldAlert,
  SlidersVertical,
  Sparkle,
  Sparkles,
  Trophy,
  Type,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { DiceCanvasElement, DiceScene3D } from './components/DiceScene3D';
import { DiceTableHUD } from './components/DiceTableHUD';
import { GameMasterWindow } from './components/GameMasterWindow';
import { NotebookWindow } from './components/NotebookWindow';
import {
  DEFAULT_DICE_CONFIG,
  DiceConfig,
  DiceType,
  RollResult,
  TableSurface,
} from './types';

const DICE_CONFIG_KEY = 'mesa_rol_3d_dice_config';
const TABLE_SURFACE_KEY = 'mesa_rol_3d_table_surface';
const DICE_TYPE_KEY = 'mesa_rol_3d_dice_type';
const DICE_COUNT_KEY = 'mesa_rol_3d_dice_count';
const MODIFIER_KEY = 'mesa_rol_3d_modifier';
const SOUND_KEY = 'mesa_rol_3d_sound';
const FONT_SIZE_KEY = 'mesa_rol_3d_font_size';
const NOTEBOOK_OPEN_KEY = 'mesa_rol_3d_notebook_open';
const ORACLE_OPEN_KEY = 'mesa_rol_3d_oracle_open';

export default function App() {
  const [fontSize, setFontSize] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(FONT_SIZE_KEY);
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= 12 && parsed <= 28) return parsed;
      }
    } catch {
      // Ignore storage error
    }
    return 16;
  });

  const [diceType, setDiceType] = useState<DiceType>(() => {
    try {
      const saved = localStorage.getItem(DICE_TYPE_KEY) as DiceType | null;
      if (saved && ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'].includes(saved)) {
        return saved;
      }
    } catch {
      // Ignore storage error
    }
    return 'd20';
  });

  const [diceCount, setDiceCount] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(DICE_COUNT_KEY);
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= 1 && parsed <= 10) return parsed;
      }
    } catch {
      // Ignore storage error
    }
    return 1;
  });

  const [modifier, setModifier] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(MODIFIER_KEY);
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed)) return parsed;
      }
    } catch {
      // Ignore storage error
    }
    return 0;
  });

  const [diceConfig, setDiceConfig] = useState<DiceConfig>(() => {
    try {
      const saved = localStorage.getItem(DICE_CONFIG_KEY);
      if (saved) return { ...DEFAULT_DICE_CONFIG, ...JSON.parse(saved) };
    } catch {
      // Ignore storage error
    }
    return DEFAULT_DICE_CONFIG;
  });

  const [tableSurface, setTableSurface] = useState<TableSurface>(() => {
    try {
      const saved = localStorage.getItem(TABLE_SURFACE_KEY) as TableSurface | null;
      if (
        saved &&
        ['dark_wood', 'green_felt', 'red_velvet', 'midnight_felt', 'obsidian_stone'].includes(saved)
      ) {
        return saved;
      }
    } catch {
      // Ignore storage error
    }
    return 'dark_wood';
  });

  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(SOUND_KEY);
      if (saved !== null) return saved === 'true';
    } catch {
      // Ignore storage error
    }
    return true;
  });

  const [showDiceHUD, setShowDiceHUD] = useState(false);

  const [isOracleOpen, setIsOracleOpen] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(ORACLE_OPEN_KEY);
      if (saved !== null) return saved === 'true';
    } catch {
      // Ignore storage error
    }
    return true;
  });
  const [isOracleMinimized, setIsOracleMinimized] = useState(false);

  const [isNotebookOpen, setIsNotebookOpen] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(NOTEBOOK_OPEN_KEY);
      if (saved !== null) return saved === 'true';
    } catch {
      // Ignore storage error
    }
    return false;
  });
  const [isNotebookMinimized, setIsNotebookMinimized] = useState(false);

  const [showNewGameModal, setShowNewGameModal] = useState(false);
  const [clearNotebookOnReset, setClearNotebookOnReset] = useState(false);
  const [resetSignal, setResetSignal] = useState(0);
  const [now, setNow] = useState(new Date());
  const footerRef = useRef<HTMLElement | null>(null);
  const [footerHeight, setFooterHeight] = useState(44);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => {
    if (typeof document === 'undefined') return false;
    return Boolean(document.fullscreenElement);
  });

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 10000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  useEffect(() => {
    const el = footerRef.current;
    if (!el) return;

    const updateHeight = () => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      if (h > 0) setFooterHeight(h);
    };

    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(el);
    window.addEventListener('resize', updateHeight);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateHeight);
    };
  }, []);

  const [isRolling, setIsRolling] = useState(false);
  const [rollTrigger, setRollTrigger] = useState(0);
  const [latestRollResult, setLatestRollResult] = useState<RollResult | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(DICE_TYPE_KEY, diceType);
    } catch {
      // Ignore storage error
    }
  }, [diceType]);

  useEffect(() => {
    try {
      localStorage.setItem(DICE_COUNT_KEY, diceCount.toString());
    } catch {
      // Ignore storage error
    }
  }, [diceCount]);

  useEffect(() => {
    try {
      localStorage.setItem(MODIFIER_KEY, modifier.toString());
    } catch {
      // Ignore storage error
    }
  }, [modifier]);

  useEffect(() => {
    try {
      localStorage.setItem(DICE_CONFIG_KEY, JSON.stringify(diceConfig));
    } catch {
      // Ignore storage error
    }
  }, [diceConfig]);

  useEffect(() => {
    try {
      localStorage.setItem(TABLE_SURFACE_KEY, tableSurface);
    } catch {
      // Ignore storage error
    }
  }, [tableSurface]);

  useEffect(() => {
    try {
      localStorage.setItem(SOUND_KEY, soundEnabled.toString());
    } catch {
      // Ignore storage error
    }
  }, [soundEnabled]);

  useEffect(() => {
    try {
      localStorage.setItem(FONT_SIZE_KEY, fontSize.toString());
    } catch {
      // Ignore storage error
    }
  }, [fontSize]);

  useEffect(() => {
    try {
      localStorage.setItem(ORACLE_OPEN_KEY, isOracleOpen.toString());
    } catch {
      // Ignore storage error
    }
  }, [isOracleOpen]);

  useEffect(() => {
    try {
      localStorage.setItem(NOTEBOOK_OPEN_KEY, isNotebookOpen.toString());
    } catch {
      // Ignore storage error
    }
  }, [isNotebookOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        const target = e.target as HTMLElement | null;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
        e.preventDefault();
        if (!isRolling) setRollTrigger((prev) => prev + 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRolling]);

  const handleRollDice = () => {
    if (!isRolling) setRollTrigger((prev) => prev + 1);
  };

  const handleRollStart = () => {
    setIsRolling(true);
  };

  const handleRollComplete = (_resultText: string, totalValue: number, individualValues: number[]) => {
    setIsRolling(false);
    const total = totalValue + modifier;
    let isCritSuccess = false;
    let isCritFail = false;

    if (diceType === 'd20') {
      if (individualValues.includes(20)) {
        isCritSuccess = true;
      } else if (individualValues.includes(1) && individualValues.length === 1) {
        isCritFail = true;
      }
    }

    if (isCritSuccess) {
      try {
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.5 },
          colors: ['#ffd700', '#ffae19', '#ffffff', '#e6c35c'],
        });
      } catch {
        // Ignore confetti error
      }
    }

    let notation = '';
    const diceExpr = `${diceType === 'd100' ? '' : diceCount}${diceType}`;
    const rollsStr = individualValues.join(' + ');
    if (modifier !== 0) {
      const modStr = modifier > 0 ? `+ ${modifier}` : `- ${Math.abs(modifier)}`;
      notation = `${diceExpr} [${rollsStr}] ${modStr}`;
    } else {
      notation = `${diceExpr} [${rollsStr}]`;
    }

    setLatestRollResult({
      total,
      individualRolls: individualValues,
      modifier,
      notation,
      isCritSuccess,
      isCritFail,
    });
  };

  const handleResetCamera = () => {
    const canvas = document.getElementById('webgl-canvas') as DiceCanvasElement | null;
    if (!canvas) return;
    canvas.__resetCamera?.();
  };

  const handleToggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Ignore fullscreen permission errors in restricted contexts
    }
  };

  const handleDownloadHTML = async () => {
    try {
      const res = await fetch('/Mesa-de-Dados-3D.html', { cache: 'no-store' });
      if (!res.ok) throw new Error('No se pudo obtener el archivo');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'Mesa-de-Dados-3D.html';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      const link = document.createElement('a');
      link.href = '/Mesa-de-Dados-3D.html';
      link.download = 'Mesa-de-Dados-3D.html';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleSelectDiceType = (type: DiceType) => {
    setDiceType(type);
    if (type === 'd100') setDiceCount(1);
  };

  const handleTrigger3DRoll = (type: DiceType) => {
    setDiceType(type);
    setDiceCount(1);
    setModifier(0);
    setRollTrigger((prev) => prev + 1);
  };

  const handleConfirmNewGame = () => {
    setLatestRollResult(null);
    setDiceType('d20');
    setDiceCount(1);
    setModifier(0);
    setResetSignal((prev) => prev + 1);
    setIsOracleOpen(true);
    setIsOracleMinimized(false);
    if (clearNotebookOnReset) {
      try {
        localStorage.removeItem('mesa_rol_3d_notebook_pages');
        localStorage.removeItem('mesa_rol_3d_notebook_active_page');
      } catch {
        // Ignore storage error
      }
      window.dispatchEvent(new Event('storage'));
    }
    setShowNewGameModal(false);
  };

  const diceTypes: Array<{ id: DiceType; label: string; sides: number }> = [
    { id: 'd4', label: 'D4', sides: 4 },
    { id: 'd6', label: 'D6', sides: 6 },
    { id: 'd8', label: 'D8', sides: 8 },
    { id: 'd10', label: 'D10', sides: 10 },
    { id: 'd12', label: 'D12', sides: 12 },
    { id: 'd20', label: 'D20', sides: 20 },
    { id: 'd100', label: 'D100', sides: 100 },
  ];

  return (
    <div
      style={{ '--footer-h': `${footerHeight}px` } as CSSProperties}
      className="relative w-full h-dvh overflow-hidden bg-[#0c0a08] text-[#dfc596] select-none font-sans"
    >
      <DiceScene3D
        currentDiceType={diceType}
        currentDiceCount={diceCount}
        onRollStart={handleRollStart}
        onRollComplete={handleRollComplete}
        rollTrigger={rollTrigger}
        diceConfig={diceConfig}
        tableSurface={tableSurface}
        soundEnabled={soundEnabled}
      />

      {latestRollResult && (
        <div className="absolute top-2 sm:top-5 inset-x-0 z-30 flex justify-center px-3 pointer-events-none">
          <div className="pointer-events-auto w-48 max-w-[calc(100vw-16px)] bg-[#140e08]/95 border border-[#ba9858]/80 rounded-xl p-2.5 shadow-[0_8px_30px_rgba(0,0,0,0.85)] backdrop-blur-md flex flex-col items-center gap-1 animate-bounce-subtle select-none transition-all">
            <div className="flex items-center justify-between w-full">
              <span
                style={{ fontSize: `${Math.max(10, fontSize - 4)}px` }}
                className="font-cinzel font-bold text-[#a88a5b] tracking-wider uppercase truncate max-w-[130px]"
              >
                {latestRollResult.notation}
              </span>
              <button
                type="button"
                onClick={() => setLatestRollResult(null)}
                className="p-0.5 hover:bg-[#2e2114] rounded text-[#8f7447] hover:text-[#ffd875] transition-colors cursor-pointer"
                title="Cerrar resultado"
              >
                <X size={12} />
              </button>
            </div>

            {latestRollResult.isCritSuccess && (
              <div className="flex items-center gap-1 text-[9px] font-cinzel font-extrabold text-[#ffd700] bg-[#3d2c0b]/80 border border-[#d4af37] px-2 py-0.5 rounded-full animate-pulse">
                <Trophy size={11} />
                <span>¡ÉXITO CRÍTICO!</span>
              </div>
            )}

            {latestRollResult.isCritFail && (
              <div className="flex items-center gap-1 text-[9px] font-cinzel font-extrabold text-[#f87171] bg-[#3d0e12]/80 border border-[#ef4444] px-2 py-0.5 rounded-full animate-pulse">
                <ShieldAlert size={11} />
                <span>¡PIFIA CRÍTICA!</span>
              </div>
            )}

            <div
              style={{ fontSize: `${Math.max(26, Math.round(fontSize * 1.8))}px` }}
              className="font-cinzel font-black tracking-tight drop-shadow-md text-[#ffd875] leading-none my-0.5"
            >
              {latestRollResult.total}
            </div>

            {latestRollResult.individualRolls.length > 1 && (
              <div className="flex flex-wrap items-center justify-center gap-1 pt-1 border-t border-[#44321b]/60 w-full">
                {latestRollResult.individualRolls.map((val, idx) => (
                  <span
                    key={idx}
                    className="px-1.5 py-0.2 rounded bg-[#100a05] border border-[#523d21] font-cinzel font-bold text-[10px] text-[#79f5be]"
                  >
                    {val}
                  </span>
                ))}
                {latestRollResult.modifier !== 0 && (
                  <span className="text-[10px] font-cinzel font-bold text-[#dfc596]">
                    {latestRollResult.modifier > 0
                      ? `+${latestRollResult.modifier}`
                      : latestRollResult.modifier}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {showDiceHUD && (
        <DiceTableHUD
          diceConfig={diceConfig}
          onUpdateDiceConfig={setDiceConfig}
          tableSurface={tableSurface}
          onUpdateTableSurface={setTableSurface}
          onRollDice={handleRollDice}
          onClose={() => setShowDiceHUD(false)}
          onDownloadHTML={handleDownloadHTML}
          isRolling={isRolling}
        />
      )}

      <GameMasterWindow
        isOpen={isOracleOpen}
        isMinimized={isOracleMinimized}
        onClose={() => setIsOracleOpen(false)}
        onMinimize={() => setIsOracleMinimized(true)}
        onRestore={() => setIsOracleMinimized(false)}
        onTrigger3DRoll={handleTrigger3DRoll}
        latestRollResult={latestRollResult}
        is3DRolling={isRolling}
        fontSize={fontSize}
        onFontSizeChange={setFontSize}
        resetSignal={resetSignal}
      />

      <NotebookWindow
        isOpen={isNotebookOpen}
        isMinimized={isNotebookMinimized}
        onClose={() => setIsNotebookOpen(false)}
        onMinimize={() => setIsNotebookMinimized(true)}
        onRestore={() => setIsNotebookMinimized(false)}
        fontSize={fontSize}
        latestRollNotation={latestRollResult?.notation}
      />

      {showNewGameModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-4 animate-fade-in">
          <div className="bg-[#181008] border-2 border-[#ba9858] rounded-2xl max-w-md w-full max-h-[calc(100dvh-24px)] overflow-y-auto p-5 shadow-[0_20px_50px_rgba(0,0,0,0.9)] space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-[#3e2c19]">
              <div className="w-10 h-10 rounded-xl bg-[#33180c] border border-[#d4af37]/60 flex items-center justify-center text-[#ffd875]">
                <RotateCcw size={22} className="text-[#ffd875]" />
              </div>
              <div>
                <h3 className="font-cinzel font-bold text-lg text-[#ffd875]">
                  ¿Empezar Nueva Partida?
                </h3>
                <p className="text-xs text-[#a88a5b]">Comenzar una aventura desde cero</p>
              </div>
            </div>

            <p className="text-xs text-[#d6c29b] leading-relaxed">
              Esta acción reiniciará el diálogo con el <strong>Oráculo</strong> para empezar una historia
              fresca y despejará el marcador de tiradas de dados.
            </p>

            <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-[#24170d] border border-[#443019] cursor-pointer hover:border-[#ba9858]/80 transition-colors">
              <input
                type="checkbox"
                checked={clearNotebookOnReset}
                onChange={(e) => setClearNotebookOnReset(e.target.checked)}
                className="mt-0.5 accent-[#d4af37] w-4 h-4 rounded cursor-pointer"
              />
              <div className="text-xs text-[#cfb68a]">
                <span className="font-semibold block text-[#ffd875]">
                  Vaciar también la Libreta de Notas
                </span>
                <span className="text-[11px] text-[#9c825a]">
                  Si no marcas esta casilla, tus notas y diario se conservarán intactos.
                </span>
              </div>
            </label>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#3e2c19]">
              <button
                type="button"
                onClick={() => setShowNewGameModal(false)}
                className="px-4 py-2 rounded-lg bg-[#27190e] hover:bg-[#362314] text-[#cfb68a] hover:text-[#ffd875] text-xs font-semibold border border-[#3e2c19] cursor-pointer transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmNewGame}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#8f1d24] to-[#b32b34] hover:from-[#a8252d] hover:to-[#cb353f] text-white text-xs font-cinzel font-bold border border-[#d97c7c]/60 shadow-lg cursor-pointer transition-all flex items-center gap-1.5"
              >
                <Sparkle size={14} />
                <span>Sí, Nueva Partida</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <footer
        ref={footerRef}
        className="fixed bottom-0 inset-x-0 min-h-11 bg-[#100c08]/95 backdrop-blur-md border-t border-[#3b2b1a] z-40 flex flex-wrap items-center justify-between px-2 sm:px-3 py-1 select-none shadow-[0_-4px_20px_rgba(0,0,0,0.7)] gap-x-2 gap-y-1"
      >
        <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 py-0.5 min-w-0">
          <div className="flex flex-wrap items-center gap-0.5 sm:gap-1">
            {diceTypes.map((d) => {
              const isSelected = diceType === d.id;
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => handleSelectDiceType(d.id)}
                  className={`px-2 py-1 rounded font-cinzel text-[11px] font-black transition-all cursor-pointer min-w-[32px] sm:min-w-[34px] text-center ${
                    isSelected
                      ? 'bg-gradient-to-b from-[#d4af37] to-[#8f6826] text-[#120a04] shadow-[0_0_8px_rgba(212,175,55,0.4)] scale-105'
                      : 'bg-[#1e150d] hover:bg-[#2c1f13] text-[#cfb68a] border border-[#3e2c19]'
                  }`}
                  title={`Seleccionar dado ${d.label}`}
                >
                  {d.label}
                </button>
              );
            })}
          </div>

          <span className="w-px h-5 bg-[#3e2c19] hidden xs:block" />

          {diceType !== 'd100' && (
            <div
              className="flex items-center bg-[#100a05] border border-[#443019] rounded p-0.5"
              title="Cantidad de dados"
            >
              <button
                type="button"
                disabled={diceCount <= 1}
                onClick={() => setDiceCount((prev) => Math.max(1, prev - 1))}
                className="w-5 h-5 flex items-center justify-center text-[#8f7447] hover:text-[#ffd875] disabled:opacity-30 rounded hover:bg-[#24170d] cursor-pointer"
                title="Menos dados"
              >
                <Minus size={11} />
              </button>
              <span className="font-cinzel font-bold text-[11px] px-1 text-[#ffd875] min-w-[20px] text-center">
                {diceCount}x
              </span>
              <button
                type="button"
                disabled={diceCount >= 10}
                onClick={() => setDiceCount((prev) => Math.min(10, prev + 1))}
                className="w-5 h-5 flex items-center justify-center text-[#8f7447] hover:text-[#ffd875] disabled:opacity-30 rounded hover:bg-[#24170d] cursor-pointer"
                title="Más dados"
              >
                <Plus size={11} />
              </button>
            </div>
          )}

          <div
            className="flex items-center bg-[#100a05] border border-[#443019] rounded p-0.5"
            title="Modificador"
          >
            <button
              type="button"
              onClick={() => setModifier((prev) => prev - 1)}
              className="w-5 h-5 flex items-center justify-center text-[#8f7447] hover:text-[#ffd875] rounded hover:bg-[#24170d] cursor-pointer"
              title="Disminuir modificador"
            >
              <Minus size={11} />
            </button>
            <span className="font-cinzel font-bold text-[11px] px-1 text-[#79f5be] min-w-[26px] text-center">
              {modifier >= 0 ? `+${modifier}` : modifier}
            </span>
            <button
              type="button"
              onClick={() => setModifier((prev) => prev + 1)}
              className="w-5 h-5 flex items-center justify-center text-[#8f7447] hover:text-[#ffd875] rounded hover:bg-[#24170d] cursor-pointer"
              title="Aumentar modificador"
            >
              <Plus size={11} />
            </button>
          </div>

          <button
            type="button"
            onClick={handleRollDice}
            disabled={isRolling}
            className="px-3 py-1 rounded bg-gradient-to-r from-[#d4af37] to-[#9e762b] hover:from-[#e6c14e] hover:to-[#b38833] text-[#120a04] font-cinzel font-black text-xs shadow-md border border-[#fff2b3] flex items-center gap-1.5 transition-all transform active:scale-95 disabled:opacity-50 cursor-pointer ml-0.5"
            title="Lanzar tirada [Espacio]"
          >
            <Sparkles size={13} className={isRolling ? 'animate-spin' : ''} />
            <span>{isRolling ? 'Rodando...' : 'Lanzar'}</span>
            <span className="text-[9px] font-sans opacity-60 hidden md:inline">[Espacio]</span>
          </button>

          <span className="w-px h-5 bg-[#3e2c19]" />

          <button
            type="button"
            onClick={() => setShowNewGameModal(true)}
            className="px-2.5 py-1 rounded bg-[#22130c] hover:bg-[#341b11] border border-[#5c331a] hover:border-[#ffd875] text-[#ffd875] flex items-center gap-1.5 font-cinzel text-xs font-bold transition-all cursor-pointer shrink-0 shadow-sm"
            title="Empezar una nueva partida desde cero"
          >
            <RotateCcw size={13} className="text-[#f59e0b]" />
            <span className="whitespace-nowrap">Nueva Partida</span>
          </button>

          <span className="w-px h-5 bg-[#3e2c19]" />

          <button
            type="button"
            onClick={() => {
              if (isOracleOpen) {
                setIsOracleMinimized((prev) => !prev);
              } else {
                setIsOracleOpen(true);
                setIsOracleMinimized(false);
              }
            }}
            className={`px-2.5 py-1 rounded flex items-center gap-1.5 font-cinzel text-xs font-bold transition-all cursor-pointer border shrink-0 ${
              isOracleOpen && !isOracleMinimized
                ? 'bg-[#2b1f13] text-[#ffd875] border-[#ba9858]/80 shadow-[0_0_8px_rgba(212,175,55,0.35)]'
                : isOracleOpen
                ? 'bg-[#181109] text-[#b39569] border-[#3e2c19] hover:bg-[#22160c]'
                : 'bg-[#140e08] text-[#8f7447] border-[#332212] hover:text-[#ffd875] hover:bg-[#1d130a]'
            }`}
            title={
              isOracleOpen
                ? isOracleMinimized
                  ? 'Restaurar ventana del Oráculo'
                  : 'Minimizar ventana del Oráculo'
                : 'Abrir ventana del Oráculo'
            }
          >
            <ScrollText size={14} className="text-[#d4af37]" />
            <span className="whitespace-nowrap">Oráculo</span>
            {isOracleOpen && (
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isOracleMinimized ? 'bg-[#806847]' : 'bg-emerald-400'
                }`}
              />
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              if (isNotebookOpen) {
                setIsNotebookMinimized((prev) => !prev);
              } else {
                setIsNotebookOpen(true);
                setIsNotebookMinimized(false);
              }
            }}
            className={`px-2.5 py-1 rounded flex items-center gap-1.5 font-cinzel text-xs font-bold transition-all cursor-pointer border shrink-0 ${
              isNotebookOpen && !isNotebookMinimized
                ? 'bg-[#2b1f13] text-[#ffd875] border-[#ba9858]/80 shadow-[0_0_8px_rgba(212,175,55,0.35)]'
                : isNotebookOpen
                ? 'bg-[#181109] text-[#b39569] border-[#3e2c19] hover:bg-[#22160c]'
                : 'bg-[#140e08] text-[#8f7447] border-[#332212] hover:text-[#ffd875] hover:bg-[#1d130a]'
            }`}
            title={
              isNotebookOpen
                ? isNotebookMinimized
                  ? 'Restaurar Libreta de Notas'
                  : 'Minimizar Libreta de Notas'
                : 'Abrir Libreta de Notas'
            }
          >
            <BookOpen size={14} className="text-[#ffd875]" />
            <span className="whitespace-nowrap">Libreta</span>
            {isNotebookOpen && (
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isNotebookMinimized ? 'bg-[#806847]' : 'bg-amber-400'
                }`}
              />
            )}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 ml-auto shrink-0">
          <div
            className="flex items-center gap-1 bg-[#140d07] border border-[#3e2c19] px-1.5 py-0.5 rounded-md"
            title="Ajustar tamaño de letra para leer mejor"
          >
            <Type size={13} className="text-[#d4af37] shrink-0" />
            <button
              type="button"
              onClick={() => setFontSize((prev) => Math.max(12, prev - 1))}
              disabled={fontSize <= 12}
              className="w-5 h-5 flex items-center justify-center rounded bg-[#1f150d] hover:bg-[#2c1f13] text-[#cfb68a] hover:text-[#ffd875] disabled:opacity-30 cursor-pointer transition-colors"
              title="Letra más pequeña [-]"
            >
              <Minus size={11} />
            </button>
            <input
              type="range"
              min="12"
              max="26"
              step="1"
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              className="w-14 sm:w-20 accent-[#d4af37] h-1.5 bg-[#2b1c10] rounded cursor-pointer"
              title={`Deslizador de tamaño: ${fontSize}px`}
            />
            <button
              type="button"
              onClick={() => setFontSize((prev) => Math.min(26, prev + 1))}
              disabled={fontSize >= 26}
              className="w-5 h-5 flex items-center justify-center rounded bg-[#1f150d] hover:bg-[#2c1f13] text-[#cfb68a] hover:text-[#ffd875] disabled:opacity-30 cursor-pointer transition-colors"
              title="Letra más grande [+]"
            >
              <Plus size={11} />
            </button>
            <span className="font-mono text-[10px] text-[#ffd875] font-bold min-w-[24px] text-center hidden xs:inline">
              {fontSize}px
            </span>
          </div>

          <span className="w-px h-5 bg-[#3e2c19] hidden sm:block" />

          <button
            type="button"
            onClick={handleResetCamera}
            className="w-8 h-8 rounded hover:bg-[#251a10] active:bg-[#2f2115] flex items-center justify-center text-[#a88a5b] hover:text-[#ffd875] transition-colors cursor-pointer"
            title="Centrar vista de cámara"
          >
            <Focus size={15} />
          </button>

          <button
            type="button"
            onClick={handleToggleFullscreen}
            className={`w-8 h-8 rounded hover:bg-[#251a10] active:bg-[#2f2115] flex items-center justify-center transition-colors cursor-pointer ${
              isFullscreen ? 'text-[#79f5be]' : 'text-[#a88a5b] hover:text-[#ffd875]'
            }`}
            title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
          >
            {isFullscreen ? <Minimize size={15} /> : <Maximize size={15} />}
          </button>

          <button
            type="button"
            onClick={handleDownloadHTML}
            className="w-8 h-8 rounded hover:bg-[#251a10] active:bg-[#2f2115] flex items-center justify-center text-[#ffd875] hover:text-[#fff2b3] transition-colors cursor-pointer"
            title="Descargar archivo HTML único para ejecutar en tu PC (Offline)"
          >
            <Download size={15} />
          </button>

          <button
            type="button"
            onClick={() => setSoundEnabled((prev) => !prev)}
            className={`w-8 h-8 rounded flex items-center justify-center transition-colors cursor-pointer ${
              soundEnabled
                ? 'hover:bg-[#251a10] text-[#79f5be]'
                : 'hover:bg-[#251a10] text-[#7a6245]'
            }`}
            title={soundEnabled ? 'Silenciar volumen' : 'Activar volumen'}
          >
            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>

          <button
            type="button"
            onClick={() => setShowDiceHUD((prev) => !prev)}
            className={`w-8 h-8 rounded flex items-center justify-center transition-colors cursor-pointer relative ${
              showDiceHUD
                ? 'bg-[#251a10] text-[#ffd875]'
                : 'hover:bg-[#251a10] text-[#a88a5b] hover:text-[#ffd875]'
            }`}
            title="Ajustes de dados y mesa"
          >
            <SlidersVertical size={16} />
            {showDiceHUD && (
              <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-3 h-0.5 rounded-full bg-[#d4af37]" />
            )}
          </button>

          <div className="flex flex-col items-end justify-center px-1.5 py-0.5 rounded hover:bg-[#251a10] transition-colors text-[10px] leading-tight text-[#b39569] cursor-default font-mono hidden sm:flex">
            <span className="font-semibold text-[#dfc596]">
              {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            <span className="text-[9px] text-[#806847]">
              {now.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: 'numeric' })}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
