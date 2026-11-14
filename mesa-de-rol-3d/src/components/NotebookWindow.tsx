import React, { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Bookmark,
  Calendar,
  Check,
  Copy,
  Dices,
  Download,
  Maximize2,
  Minimize2,
  Minus,
  PenLine,
  Plus,
  Trash2,
  X,
} from 'lucide-react';

const NOTEBOOK_PAGES_KEY = 'mesa_rol_3d_notebook_pages';
const NOTEBOOK_ACTIVE_PAGE_KEY = 'mesa_rol_3d_notebook_active_page';

interface NotebookPage {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

const DEFAULT_PAGES: NotebookPage[] = [
  {
    id: 'page-diario',
    title: 'Diario de Viaje',
    content:
      'Capítulo I: El despertar en la encrucijada.\n\nEl viento aúlla entre los riscos olvidados. Mi personaje se ajusta el manto mientras el cielo presagia tormenta...\n\n- Objetivo actual: Descubrir qué ocultan las ruinas del valle.\n- Pistas: Una runa grabada en una moneda de cobre antigua.',
    createdAt: Date.now() - 3600000,
    updatedAt: Date.now() - 3600000,
  },
  {
    id: 'page-pnjs',
    title: 'PNJs & Aliados',
    content:
      'Personajes encontrados en el camino:\n\n• El Posadero Tuerto (Neutral, busca noticias de la capital).\n• Hermana Vanya (Sacerdotisa errante, sospecha de un culto local).',
    createdAt: Date.now() - 1800000,
    updatedAt: Date.now() - 1800000,
  },
  {
    id: 'page-inventario',
    title: 'Inventario & Botín',
    content:
      'Equipo del Aventurero:\n\n- Espada de hierro desgastada\n- Odre de vino y 3 raciones secas\n- Pedernal y yesca\n- Cuerda de cáñamo (15 metros)\n- 14 monedas de plata',
    createdAt: Date.now() - 900000,
    updatedAt: Date.now() - 900000,
  },
];

interface NotebookWindowProps {
  isOpen: boolean;
  isMinimized: boolean;
  onClose: () => void;
  onMinimize: () => void;
  onRestore: () => void;
  fontSize?: number;
  latestRollNotation?: string;
}

export const NotebookWindow: React.FC<NotebookWindowProps> = ({
  isOpen,
  isMinimized,
  onClose,
  onMinimize,
  fontSize = 16,
  latestRollNotation,
}) => {
  const [pages, setPages] = useState<NotebookPage[]>(() => {
    try {
      const saved = localStorage.getItem(NOTEBOOK_PAGES_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // Ignore storage error
    }
    return DEFAULT_PAGES;
  });

  const [activePageId, setActivePageId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(NOTEBOOK_ACTIVE_PAGE_KEY);
      if (saved) return saved;
    } catch {
      // Ignore storage error
    }
    return DEFAULT_PAGES[0].id;
  });

  const [isMaximized, setIsMaximized] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);

  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(NOTEBOOK_PAGES_KEY, JSON.stringify(pages));
    } catch {
      // Ignore storage error
    }
  }, [pages]);

  useEffect(() => {
    try {
      localStorage.setItem(NOTEBOOK_ACTIVE_PAGE_KEY, activePageId);
    } catch {
      // Ignore storage error
    }
  }, [activePageId]);

  const activePage: NotebookPage =
    pages.find((p) => p.id === activePageId) ||
    pages[0] || {
      id: 'empty',
      title: 'Página 1',
      content: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

  const updateContent = (content: string) => {
    setPages((prev) =>
      prev.map((p) => (p.id === activePage.id ? { ...p, content, updatedAt: Date.now() } : p))
    );
  };

  const updateTitle = (title: string) => {
    const trimmed = title.trim() || 'Sin Título';
    setPages((prev) =>
      prev.map((p) => (p.id === activePage.id ? { ...p, title: trimmed, updatedAt: Date.now() } : p))
    );
  };

  const addNewPage = () => {
    const newPage: NotebookPage = {
      id: `page-${Date.now()}`,
      title: `Página ${pages.length + 1}`,
      content: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setPages((prev) => [...prev, newPage]);
    setActivePageId(newPage.id);
  };

  const deleteCurrentPage = () => {
    if (pages.length <= 1) {
      if (window.confirm('¿Quieres limpiar esta página de notas?')) {
        updateContent('');
      }
      return;
    }
    if (window.confirm(`¿Eliminar la página "${activePage.title}"?`)) {
      const remaining = pages.filter((p) => p.id !== activePage.id);
      setPages(remaining);
      setActivePageId(remaining[0].id);
    }
  };

  const insertTimestamp = () => {
    const now = new Date();
    const stamp = `\n📅 [${now.toLocaleDateString()} - ${now.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })}]: `;
    updateContent((activePage.content || '') + stamp);
    setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(
        textareaRef.current.value.length,
        textareaRef.current.value.length
      );
    }, 50);
  };

  const insertLatestRoll = () => {
    if (!latestRollNotation) return;
    const stamp = `\n🎲 [Tirada: ${latestRollNotation}] `;
    updateContent((activePage.content || '') + stamp);
    setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(
        textareaRef.current.value.length,
        textareaRef.current.value.length
      );
    }, 50);
  };

  const copyCurrentPage = async () => {
    try {
      await navigator.clipboard.writeText(
        `${activePage.title}\n====================\n\n${activePage.content}`
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard errors
    }
  };

  const exportAllNotes = () => {
    let text = `LIBRETA DE NOTAS - MESA DE ROL 3D\nGenerado: ${new Date().toLocaleString()}\n=====================================\n\n`;
    pages.forEach((p) => {
      text += `### ${p.title} ###\n`;
      text += `Última edición: ${new Date(p.updatedAt).toLocaleString()}\n`;
      text += `-------------------------------------\n`;
      text += `${p.content}\n\n=====================================\n\n`;
    });
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Notas-Rol-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (!isOpen) return null;

  return (
    <div
      onWheel={(e) => e.stopPropagation()}
      className={`hud-panel fixed z-40 flex flex-col bg-[#24170d] border-2 border-[#b89355] shadow-[0_18px_50px_rgba(0,0,0,0.95)] rounded-2xl transition-all duration-200 select-text overflow-hidden ${
        isMinimized
          ? 'hidden'
          : isMaximized
          ? 'inset-x-2 sm:inset-x-3 top-2 sm:top-3 bottom-[calc(var(--footer-h,44px)+12px)] rounded-xl'
          : 'bottom-[calc(var(--footer-h,44px)+10px)] left-2 sm:left-4 w-[calc(100vw-16px)] sm:w-[min(480px,47vw)] lg:w-[min(540px,48vw)] h-[min(580px,calc(100dvh-var(--footer-h,44px)-20px))] max-h-[calc(100dvh-var(--footer-h,44px)-20px)]'
      }`}
    >
      <div className="flex items-center justify-between px-3.5 py-2 bg-gradient-to-r from-[#211409] via-[#2f1d0f] to-[#211409] border-b-2 border-[#664620] select-none shrink-0 relative">
        <div className="absolute top-1.5 left-2 w-1.5 h-1.5 rounded-full bg-[#d4af37] shadow-[inset_0_1px_1px_#000]" />
        <div className="absolute top-1.5 right-2 w-1.5 h-1.5 rounded-full bg-[#d4af37] shadow-[inset_0_1px_1px_#000]" />

        <div className="flex items-center gap-2 pl-2">
          <BookOpen size={16} className="text-[#ffd875] drop-shadow" />
          <span className="font-cinzel font-bold text-xs text-[#ffd875] tracking-widest uppercase flex items-center gap-1.5">
            Libreta de Notas
            <span className="text-[10px] text-[#9c825a] font-mono normal-case">
              ({pages.length} {pages.length === 1 ? 'pág' : 'págs'})
            </span>
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={copyCurrentPage}
            className="p-1 text-[#b39569] hover:text-[#ffd875] hover:bg-[#3d2714] rounded transition-colors cursor-pointer"
            title="Copiar contenido de esta página"
          >
            {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
          </button>
          <button
            type="button"
            onClick={exportAllNotes}
            className="p-1 text-[#b39569] hover:text-[#ffd875] hover:bg-[#3d2714] rounded transition-colors cursor-pointer"
            title="Descargar todas las notas en archivo .txt"
          >
            <Download size={14} />
          </button>
          <button
            type="button"
            onClick={onMinimize}
            className="p-1 text-[#b39569] hover:text-[#ffd875] hover:bg-[#3d2714] rounded transition-colors cursor-pointer"
            title="Minimizar a la barra de tareas"
          >
            <Minus size={14} />
          </button>
          <button
            type="button"
            onClick={() => setIsMaximized(!isMaximized)}
            className="p-1 text-[#b39569] hover:text-[#ffd875] hover:bg-[#3d2714] rounded transition-colors cursor-pointer"
            title={isMaximized ? 'Restaurar tamaño' : 'Maximizar'}
          >
            {isMaximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-[#b39569] hover:text-[#f87171] hover:bg-[#3f161a] rounded transition-colors cursor-pointer"
            title="Cerrar libreta"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1 px-3 py-1.5 bg-[#1a0f07] border-b border-[#442c16] overflow-x-auto no-scrollbar shrink-0 select-none">
        {pages.map((page, idx) => {
          const isActive = page.id === activePage.id;
          return (
            <button
              key={page.id}
              type="button"
              onClick={() => {
                setActivePageId(page.id);
                setIsEditingTitle(false);
              }}
              className={`px-2.5 py-1 rounded-t-md text-xs font-cinzel font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap border-t border-x ${
                isActive
                  ? 'bg-[#f4ebd0] text-[#2c1a0e] border-[#bba47a] shadow-[0_-2px_6px_rgba(0,0,0,0.3)] font-bold'
                  : 'bg-[#291b0f] text-[#a88a5b] border-[#3d2715] hover:bg-[#362314] hover:text-[#ffd875]'
              }`}
              title={page.title}
            >
              <Bookmark size={11} className={isActive ? 'text-[#a13b29]' : 'text-[#806847]'} />
              <span className="truncate max-w-[110px]">{page.title || `Pág. ${idx + 1}`}</span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={addNewPage}
          className="p-1 ml-1 rounded bg-[#27190e] hover:bg-[#382314] text-[#ffd875] border border-[#4d3319] hover:border-[#ba9858] transition-colors cursor-pointer shrink-0"
          title="Añadir nueva página a la libreta"
        >
          <Plus size={13} />
        </button>
      </div>

      <div className="flex items-center justify-between px-3 py-1 bg-[#201309] border-b border-[#3b2512] text-xs select-none shrink-0">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={insertTimestamp}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#2c1c0f] hover:bg-[#3a2514] text-[#cfb68a] hover:text-[#ffd875] text-[11px] font-mono border border-[#442b15] transition-colors cursor-pointer"
            title="Añadir fecha y hora actual en la nota"
          >
            <Calendar size={11} className="text-[#d4af37]" />
            <span>Fecha</span>
          </button>

          {latestRollNotation && (
            <button
              type="button"
              onClick={insertLatestRoll}
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#2c1c0f] hover:bg-[#3a2514] text-[#cfb68a] hover:text-[#ffd875] text-[11px] font-mono border border-[#442b15] transition-colors cursor-pointer"
              title={`Pegar última tirada (${latestRollNotation}) en la nota`}
            >
              <Dices size={11} className="text-[#79f5be]" />
              <span className="truncate max-w-[100px]">{latestRollNotation}</span>
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={deleteCurrentPage}
          className="flex items-center gap-1 text-[11px] text-[#a85f5f] hover:text-[#f87171] cursor-pointer hover:bg-[#331417] px-1.5 py-0.5 rounded transition-colors"
          title="Eliminar esta página de notas"
        >
          <Trash2 size={11} />
          <span className="hidden sm:inline">Eliminar pág.</span>
        </button>
      </div>

      <div className="flex-1 min-h-0 flex flex-col relative bg-[#f7f0dc] text-[#24170d] overflow-hidden">
        <div className="absolute top-0 bottom-0 left-0 w-8 bg-[#eddcb9] border-r border-[#d4bd92] flex flex-col items-center justify-around py-3 z-10 pointer-events-none select-none opacity-85">
          {Array.from({ length: 12 }).map((_, idx) => (
            <div
              key={idx}
              className="w-3.5 h-3.5 rounded-full bg-[#2a1a10] border border-[#523d21] shadow-[inset_0_2px_4px_#000] flex items-center justify-center"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-[#150c07]" />
            </div>
          ))}
        </div>

        <div className="absolute top-0 bottom-0 left-12 w-[1.5px] bg-[#d97c7c]/50 z-10 pointer-events-none" />

        <div className="absolute top-0 right-7 w-4 h-12 bg-gradient-to-b from-[#8f1d24] to-[#b32b34] shadow-md z-20 pointer-events-none border-x border-[#590f13] flex flex-col justify-end">
          <div className="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-b-[8px] border-b-[#f7f0dc]" />
        </div>

        <div className="pl-16 pr-14 pt-3 pb-2 border-b border-[#e2cfab] flex items-center gap-2 select-none shrink-0 bg-[#f4ebd0]/90">
          {isEditingTitle ? (
            <input
              ref={titleInputRef}
              type="text"
              defaultValue={activePage.title}
              onBlur={(e) => {
                updateTitle(e.target.value);
                setIsEditingTitle(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  updateTitle(e.currentTarget.value);
                  setIsEditingTitle(false);
                }
              }}
              autoFocus
              className="font-cinzel font-bold text-sm text-[#2a190e] bg-[#fdf9ee] border border-[#ba9858] rounded px-2 py-0.5 focus:outline-none w-full"
            />
          ) : (
            <div
              onClick={() => setIsEditingTitle(true)}
              className="flex items-center gap-1.5 cursor-pointer group flex-1"
              title="Haz clic para cambiar el título de esta página"
            >
              <span className="font-cinzel font-bold text-sm text-[#2a190e] group-hover:text-[#803816] transition-colors">
                {activePage.title}
              </span>
              <PenLine size={12} className="text-[#a88a5b] opacity-50 group-hover:opacity-100 transition-opacity" />
            </div>
          )}

          <span className="text-[10px] font-mono text-[#8a7049] shrink-0">
            {new Date(activePage.updatedAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>

        <div className="flex-1 min-h-0 relative overflow-hidden pl-14 pr-4 py-2">
          <textarea
            ref={textareaRef}
            value={activePage.content}
            onChange={(e) => updateContent(e.target.value)}
            placeholder="Escribe aquí tus notas de la sesión, pistas encontradas, nombres de lugares, sospechas y botín..."
            style={{
              fontSize: `${fontSize}px`,
              lineHeight: '28px',
              backgroundImage: 'repeating-linear-gradient(transparent, transparent 27px, #e2cfab 27px, #e2cfab 28px)',
              backgroundAttachment: 'local',
            }}
            className="w-full h-full bg-transparent border-none outline-none resize-none font-serif text-[#1e1309] placeholder-[#9c8466]/70 leading-[28px] custom-scrollbar focus:ring-0 p-0 selection:bg-[#d4af37]/30"
          />
        </div>

        <div className="pl-14 pr-4 py-1 bg-[#ede0be] border-t border-[#d8c39e] flex items-center justify-between text-[10px] font-mono text-[#785f3e] select-none shrink-0">
          <span>
            {activePage.content ? activePage.content.trim().split(/\s+/).filter(Boolean).length : 0} palabras •{' '}
            {activePage.content.length} caracteres
          </span>
          <span className="italic">Autoguardado en local</span>
        </div>
      </div>
    </div>
  );
};
