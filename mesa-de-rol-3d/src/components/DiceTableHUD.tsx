import React, { useState } from 'react';
import {
  Check,
  ChevronUp,
  Dices,
  Download,
  Layers,
  Maximize2,
  Palette,
  RotateCcw,
  SlidersVertical,
  Sparkles,
  X,
} from 'lucide-react';
import {
  DEFAULT_DICE_CONFIG,
  DICE_THEMES,
  DiceConfig,
  TABLE_SURFACES,
  TableSurface,
} from '../types';

interface DiceTableHUDProps {
  diceConfig?: DiceConfig;
  onUpdateDiceConfig: (config: DiceConfig) => void;
  tableSurface: TableSurface;
  onUpdateTableSurface: (surface: TableSurface) => void;
  onRollDice: () => void;
  onClose: () => void;
  onDownloadHTML?: () => void;
  isRolling?: boolean;
}

export const DiceTableHUD: React.FC<DiceTableHUDProps> = ({
  diceConfig = DEFAULT_DICE_CONFIG,
  onUpdateDiceConfig,
  tableSurface,
  onUpdateTableSurface,
  onRollDice,
  onClose,
  onDownloadHTML,
  isRolling = false,
}) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [activeTab, setActiveTab] = useState<'theme' | 'scale' | 'material' | 'surface'>('theme');

  const updateConfig = (partial: Partial<DiceConfig>) => {
    onUpdateDiceConfig({ ...diceConfig, ...partial });
  };

  const selectTheme = (themeId: string) => {
    const theme = DICE_THEMES.find((t) => t.id === themeId);
    if (theme) {
      onUpdateDiceConfig({
        ...diceConfig,
        themeId: theme.id,
        primaryColor: theme.primaryColor,
        secondaryColor: theme.secondaryColor,
        numeralColor: theme.numeralColor,
        metalness: theme.metalness,
        roughness: theme.roughness,
      });
    }
  };

  const stepScale = (delta: number) => {
    const current = diceConfig.scale ?? 1;
    const next = Math.max(0.5, Math.min(2.5, Number((current + delta).toFixed(2))));
    updateConfig({ scale: next });
  };

  const resetDefaults = () => {
    onUpdateDiceConfig({ ...DEFAULT_DICE_CONFIG });
    onUpdateTableSurface('dark_wood');
  };

  if (isMinimized) {
    return (
      <div className="fixed bottom-[calc(var(--footer-h,44px)+10px)] left-2 sm:left-4 z-[45] max-w-[calc(100vw-16px)] flex items-center gap-2 bg-[#18120b]/95 border border-[#856a3e] rounded-full px-3 py-1.5 shadow-[0_6px_24px_rgba(0,0,0,0.9)] backdrop-blur-md">
        <Dices size={15} className="text-[#5ed6a4]" />
        <span className="font-cinzel text-xs font-bold text-[#dfc596]">
          Ajustes Dados ({diceConfig.scale.toFixed(1)}x)
        </span>
        <button
          type="button"
          onClick={() => setIsMinimized(false)}
          className="p-1 hover:bg-[#332617] rounded-full text-[#9c783e] hover:text-[#5ed6a4] transition-colors cursor-pointer"
          title="Expandir controles"
        >
          <ChevronUp size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="hud-panel fixed bottom-[calc(var(--footer-h,44px)+10px)] left-2 sm:left-4 z-[45] w-[min(352px,calc(100vw-16px))] max-h-[calc(100dvh-var(--footer-h,44px)-20px)] bg-[#18120b]/95 border border-[#7a5e33] rounded-xl shadow-[0_16px_40px_rgba(0,0,0,0.95)] backdrop-blur-md flex flex-col overflow-hidden text-[#dfc596] select-none animate-fade-in">
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-[#140e08] border-b border-[#5c4524]/70 shrink-0">
        <div className="flex items-center gap-2">
          <Dices size={16} className="text-[#5ed6a4]" />
          <span className="font-cinzel font-bold text-xs text-[#5ed6a4] tracking-wider">
            PERSONALIZAR DADOS & MESA
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setIsMinimized(true)}
            className="p-1 text-[#8f7447] hover:text-[#e0c897] hover:bg-[#2e2113] rounded transition-colors cursor-pointer"
            title="Minimizar panel"
          >
            <ChevronUp size={15} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-[#8f7447] hover:text-[#e0c897] hover:bg-[#2e2113] rounded transition-colors cursor-pointer"
            title="Cerrar panel de dados"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      <div className="flex border-b border-[#4d381c]/70 bg-[#1e160e] shrink-0">
        <button
          type="button"
          onClick={() => setActiveTab('theme')}
          className={`flex-1 py-1.5 text-[11px] font-cinzel font-bold flex items-center justify-center gap-1 transition-colors border-r border-[#4d381c]/50 cursor-pointer ${
            activeTab === 'theme'
              ? 'text-[#79f5be] bg-[#271d12] border-b-2 border-b-[#5ed6a4]'
              : 'text-[#9c783e] hover:text-[#dfc596] hover:bg-[#241a10]'
          }`}
        >
          <Palette size={13} />
          <span>Temas</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('scale')}
          className={`flex-1 py-1.5 text-[11px] font-cinzel font-bold flex items-center justify-center gap-1 transition-colors border-r border-[#4d381c]/50 cursor-pointer ${
            activeTab === 'scale'
              ? 'text-[#79f5be] bg-[#271d12] border-b-2 border-b-[#5ed6a4]'
              : 'text-[#9c783e] hover:text-[#dfc596] hover:bg-[#241a10]'
          }`}
        >
          <Maximize2 size={13} />
          <span>Tamaño</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('material')}
          className={`flex-1 py-1.5 text-[11px] font-cinzel font-bold flex items-center justify-center gap-1 transition-colors border-r border-[#4d381c]/50 cursor-pointer ${
            activeTab === 'material'
              ? 'text-[#79f5be] bg-[#271d12] border-b-2 border-b-[#5ed6a4]'
              : 'text-[#9c783e] hover:text-[#dfc596] hover:bg-[#241a10]'
          }`}
        >
          <SlidersVertical size={13} />
          <span>Material</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('surface')}
          className={`flex-1 py-1.5 text-[11px] font-cinzel font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer ${
            activeTab === 'surface'
              ? 'text-[#79f5be] bg-[#271d12] border-b-2 border-b-[#5ed6a4]'
              : 'text-[#9c783e] hover:text-[#dfc596] hover:bg-[#241a10]'
          }`}
        >
          <Layers size={13} />
          <span>Tapete</span>
        </button>
      </div>

      <div className="p-3.5 space-y-3.5 flex-1 min-h-0 overflow-y-auto">
        {activeTab === 'theme' && (
          <div className="space-y-3">
            <p className="text-[11px] text-[#a89069]">Estilo alquímico de los dados:</p>
            <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
              {DICE_THEMES.map((theme) => {
                const isSelected = diceConfig.themeId === theme.id;
                return (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => selectTheme(theme.id)}
                    className={`p-2 rounded-lg border text-left flex flex-col gap-1 transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#221c13] border-[#ba9858] shadow-[0_0_8px_rgba(186,152,88,0.4)] ring-1 ring-[#ba9858]'
                        : 'bg-[#161009] border-[#3d2b17] hover:bg-[#20180f] hover:border-[#634929]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div
                        className="w-5 h-5 rounded-md border border-black/60 shadow-inner flex items-center justify-center font-bold text-[10px]"
                        style={{
                          backgroundColor: theme.primaryColor,
                          color: theme.numeralColor,
                          border: `1.5px solid ${theme.secondaryColor}`,
                        }}
                      >
                        20
                      </div>
                      {isSelected && <Check size={13} className="text-[#ba9858]" />}
                    </div>
                    <div>
                      <div className="font-cinzel text-xs font-bold text-[#dfc596] truncate">
                        {theme.name}
                      </div>
                      <div className="text-[9px] text-[#8f7447] truncate leading-tight">
                        {theme.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="pt-2 border-t border-[#3b2a16] space-y-2">
              <span className="text-[10px] font-cinzel text-[#a89069] uppercase font-bold block">
                Colores Personalizados
              </span>
              <div className="grid grid-cols-3 gap-2">
                <div className="flex flex-col items-center gap-1 bg-[#120d08] p-1.5 rounded-lg border border-[#3b2a16]">
                  <label className="text-[9px] font-cinzel text-[#b59b72] text-center">
                    Cuerpo / Cara
                  </label>
                  <input
                    type="color"
                    value={diceConfig.primaryColor}
                    onChange={(e) => updateConfig({ primaryColor: e.target.value, themeId: 'custom' })}
                    className="w-8 h-8 rounded border border-[#6b522d] bg-transparent cursor-pointer"
                  />
                </div>
                <div className="flex flex-col items-center gap-1 bg-[#120d08] p-1.5 rounded-lg border border-[#3b2a16]">
                  <label className="text-[9px] font-cinzel text-[#b59b72] text-center">
                    Sombra / Borde
                  </label>
                  <input
                    type="color"
                    value={diceConfig.secondaryColor}
                    onChange={(e) => updateConfig({ secondaryColor: e.target.value, themeId: 'custom' })}
                    className="w-8 h-8 rounded border border-[#6b522d] bg-transparent cursor-pointer"
                  />
                </div>
                <div className="flex flex-col items-center gap-1 bg-[#120d08] p-1.5 rounded-lg border border-[#3b2a16]">
                  <label className="text-[9px] font-cinzel text-[#b59b72] text-center">
                    Inscripción / Tinta
                  </label>
                  <input
                    type="color"
                    value={diceConfig.numeralColor}
                    onChange={(e) => updateConfig({ numeralColor: e.target.value, themeId: 'custom' })}
                    className="w-8 h-8 rounded border border-[#6b522d] bg-transparent cursor-pointer"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'scale' && (
          <div className="space-y-3">
            <div className="bg-[#120d08] p-2.5 rounded-lg border border-[#4d381c] space-y-2">
              <div className="flex items-center justify-between text-xs font-cinzel">
                <span className="text-[#a89069] flex items-center gap-1">
                  <Maximize2 size={13} /> Escala de los Dados
                </span>
                <span className="font-bold text-[#79f5be] bg-[#1e2e24] px-2 py-0.5 rounded border border-[#3ea878]">
                  {diceConfig.scale.toFixed(2)}x
                </span>
              </div>
              <input
                type="range"
                min="0.5"
                max="2.5"
                step="0.05"
                value={diceConfig.scale}
                onChange={(e) => updateConfig({ scale: parseFloat(e.target.value) })}
                className="w-full accent-[#5ed6a4] cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-[#7d6542] font-cinzel">
                <span>0.5x (Mini)</span>
                <span>1.0x (Normal)</span>
                <span>1.75x (Grande)</span>
                <span>2.5x (Épico)</span>
              </div>
            </div>

            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => stepScale(-0.15)}
                className="flex-1 py-1.5 px-2 bg-[#251b11] hover:bg-[#382a1a] text-[#dfc596] border border-[#523d21] rounded-lg text-xs font-cinzel font-bold transition-colors cursor-pointer"
              >
                - 15%
              </button>
              <button
                type="button"
                onClick={() => updateConfig({ scale: 1 })}
                className="py-1.5 px-3 bg-[#251b11] hover:bg-[#382a1a] text-[#79f5be] border border-[#523d21] rounded-lg text-xs font-cinzel font-bold transition-colors cursor-pointer"
              >
                1.0x
              </button>
              <button
                type="button"
                onClick={() => stepScale(0.15)}
                className="flex-1 py-1.5 px-2 bg-[#251b11] hover:bg-[#382a1a] text-[#dfc596] border border-[#523d21] rounded-lg text-xs font-cinzel font-bold transition-colors cursor-pointer"
              >
                + 15%
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-cinzel text-[#a89069] uppercase font-bold">
                Ajustes Rápidos
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { label: 'Discreto (0.75x)', val: 0.75 },
                  { label: 'Estándar (1.0x)', val: 1 },
                  { label: 'Destacado (1.35x)', val: 1.35 },
                  { label: 'Colosal (1.8x)', val: 1.8 },
                ].map((preset) => (
                  <button
                    key={preset.val}
                    type="button"
                    onClick={() => updateConfig({ scale: preset.val })}
                    className={`p-1.5 rounded-lg text-left border text-xs font-cinzel transition-all cursor-pointer ${
                      Math.abs(diceConfig.scale - preset.val) < 0.05
                        ? 'bg-[#1e2e24] border-[#3ea878] text-[#79f5be] font-bold'
                        : 'bg-[#1b140d] border-[#443019] text-[#b89b6c] hover:bg-[#271c12]'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'material' && (
          <div className="space-y-3.5">
            <div className="bg-[#120d08] p-2.5 rounded-lg border border-[#4d381c] space-y-1.5">
              <div className="flex items-center justify-between text-xs font-cinzel">
                <span className="text-[#a89069]">Aspecto Metalizado (Metalness)</span>
                <span className="font-bold text-[#79f5be]">{Math.round(diceConfig.metalness * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={diceConfig.metalness}
                onChange={(e) => updateConfig({ metalness: parseFloat(e.target.value), themeId: 'custom' })}
                className="w-full accent-[#5ed6a4] cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-[#7d6542] font-cinzel">
                <span>Resina / Hueso</span>
                <span>Metal Pulido</span>
              </div>
            </div>

            <div className="bg-[#120d08] p-2.5 rounded-lg border border-[#4d381c] space-y-1.5">
              <div className="flex items-center justify-between text-xs font-cinzel">
                <span className="text-[#a89069]">Acabado / Pulido (Roughness)</span>
                <span className="font-bold text-[#79f5be]">{Math.round(diceConfig.roughness * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.05"
                max="0.95"
                step="0.05"
                value={diceConfig.roughness}
                onChange={(e) => updateConfig({ roughness: parseFloat(e.target.value), themeId: 'custom' })}
                className="w-full accent-[#5ed6a4] cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-[#7d6542] font-cinzel">
                <span>Reflectante / Espejo</span>
                <span>Mate / Piedra</span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => updateConfig({ metalness: 0.9, roughness: 0.15, themeId: 'custom' })}
                className="flex-1 py-1.5 px-2 bg-[#251b11] hover:bg-[#382a1a] text-[#dfc596] border border-[#523d21] rounded-lg text-[11px] font-cinzel transition-colors cursor-pointer"
              >
                Espejo Metálico
              </button>
              <button
                type="button"
                onClick={() => updateConfig({ metalness: 0.2, roughness: 0.6, themeId: 'custom' })}
                className="flex-1 py-1.5 px-2 bg-[#251b11] hover:bg-[#382a1a] text-[#dfc596] border border-[#523d21] rounded-lg text-[11px] font-cinzel transition-colors cursor-pointer"
              >
                Mate Suave
              </button>
            </div>
          </div>
        )}

        {activeTab === 'surface' && (
          <div className="space-y-3">
            <p className="text-[11px] text-[#a89069]">Selecciona la superficie de la mesa de lanzamiento:</p>
            <div className="space-y-2">
              {TABLE_SURFACES.map((surface) => {
                const isSelected = tableSurface === surface.id;
                return (
                  <button
                    key={surface.id}
                    type="button"
                    onClick={() => onUpdateTableSurface(surface.id)}
                    className={`w-full p-2.5 rounded-lg border text-left flex items-center justify-between transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#221c13] border-[#ba9858] shadow-[0_0_8px_rgba(186,152,88,0.4)] ring-1 ring-[#ba9858]'
                        : 'bg-[#161009] border-[#3d2b17] hover:bg-[#20180f] hover:border-[#634929]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-6 h-6 rounded-full border border-black/80 shadow-md"
                        style={{ backgroundColor: surface.bgColor, borderColor: surface.accent }}
                      />
                      <span className="font-cinzel text-xs font-bold text-[#dfc596]">
                        {surface.name}
                      </span>
                    </div>
                    {isSelected && <Check size={14} className="text-[#ba9858]" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {onDownloadHTML && (
          <div className="pt-2 border-t border-[#4d381c]/70">
            <button
              type="button"
              onClick={onDownloadHTML}
              className="w-full py-2 px-3 bg-[#1e160e] hover:bg-[#2b1f13] text-[#ffd875] hover:text-[#fff2b3] border border-[#d4af37]/60 hover:border-[#ffd875] font-cinzel font-bold text-xs rounded-lg flex items-center justify-center gap-2 shadow-md cursor-pointer transition-all"
            >
              <Download size={14} className="text-[#ffd875]" />
              <span>Descargar HTML Único para PC (Offline)</span>
            </button>
            <p className="text-[10px] text-[#8a724f] text-center mt-1">
              Guarda un único archivo .html en tu PC. Doble clic y listo para jugar.
            </p>
          </div>
        )}

        <div className="pt-2 border-t border-[#4d381c]/70 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onRollDice}
            disabled={isRolling}
            className="flex-1 py-2 px-3 bg-gradient-to-r from-[#ba9858] to-[#735322] hover:from-[#d1ad6a] hover:to-[#8c652b] text-[#120b05] font-cinzel font-bold text-xs rounded-lg border border-[#ebcb8b] flex items-center justify-center gap-1.5 shadow-md cursor-pointer transition-all disabled:opacity-50"
          >
            <Sparkles size={13} />
            <span>Tirada de Prueba</span>
          </button>
          <button
            type="button"
            onClick={resetDefaults}
            className="py-2 px-2.5 bg-[#251b11] hover:bg-[#382a1a] text-[#a89069] hover:text-[#dfc596] border border-[#523d21] rounded-lg flex items-center justify-center gap-1 transition-colors cursor-pointer"
            title="Restablecer valores por defecto"
          >
            <RotateCcw size={13} />
            <span className="text-[11px] font-cinzel hidden sm:inline">Defecto</span>
          </button>
        </div>
      </div>
    </div>
  );
};
