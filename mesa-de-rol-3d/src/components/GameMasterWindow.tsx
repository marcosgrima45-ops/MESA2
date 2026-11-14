import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Dices,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  Settings2,
  Sparkles,
  Square,
  Trash2,
  TriangleAlert,
  Type,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { ORACLE_SYSTEM_PROMPT, OracleEntry, getOracleEntry } from '../data/oracleData';
import { DEFAULT_OLLAMA_CONFIG, DiceType, OllamaConfig, RollResult } from '../types';
import {
  configureOracleSpeech,
  enqueueOracleSpeech,
  getAvailableSpanishVoices,
  isSpeechSynthesisSupported,
  pickBestSpanishGoogleVoice,
  speakOracleText,
  stopOracleSpeech,
} from '../utils/oracleSpeech';

const ORACLE_MESSAGES_KEY = 'mesa_rol_3d_oracle_messages';
const OLLAMA_CONFIG_KEY = 'mesa_rol_3d_ollama_config';
const SYSTEM_PROMPT_KEY = 'mesa_rol_3d_system_prompt';
const FONT_SIZE_KEY = 'mesa_rol_3d_font_size';
const ORACLE_SPEECH_ENABLED_KEY = 'mesa_rol_3d_oracle_speech_enabled';
const ORACLE_SPEECH_VOICE_KEY = 'mesa_rol_3d_oracle_speech_voice';
const ORACLE_SPEECH_RATE_KEY = 'mesa_rol_3d_oracle_speech_rate';

interface ChatMessage {
  id: string;
  sender: 'gm' | 'player' | 'system';
  text: string;
  timestamp: number;
  diceRoll?: number;
  oracleCardId?: number;
}

const WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome-1',
  sender: 'gm',
  text: '¡Saludos, aventurero! Soy el Oráculo. Las 100 facetas del destino están preparadas para guiar tu viaje. Describe la escena inicial de tu personaje o realiza una tirada de incertidumbre para comenzar.\n\n¿Quién eres y qué buscas en estas tierras?',
  timestamp: Date.now(),
};

interface GameMasterWindowProps {
  isOpen: boolean;
  isMinimized: boolean;
  onClose: () => void;
  onMinimize: () => void;
  onRestore: () => void;
  onTrigger3DRoll: (type: DiceType) => void;
  latestRollResult: RollResult | null;
  is3DRolling: boolean;
  fontSize?: number;
  onFontSizeChange?: (size: number) => void;
  resetSignal?: number;
}

export const GameMasterWindow: React.FC<GameMasterWindowProps> = ({
  isOpen,
  isMinimized,
  onClose,
  onMinimize,
  onTrigger3DRoll,
  latestRollResult,
  is3DRolling,
  fontSize: propFontSize,
  onFontSizeChange,
  resetSignal = 0,
}) => {
  const [localFontSize, setLocalFontSize] = useState<number>(() => {
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

  const fontSize = propFontSize ?? localFontSize;

  const updateFontSize = (next: number | ((prev: number) => number)) => {
    const val = typeof next === 'function' ? next(fontSize) : next;
    const clamped = Math.max(12, Math.min(28, val));
    setLocalFontSize(clamped);
    onFontSizeChange?.(clamped);
    try {
      localStorage.setItem(FONT_SIZE_KEY, clamped.toString());
    } catch {
      // Ignore storage error
    }
  };

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved =
        localStorage.getItem(ORACLE_MESSAGES_KEY) || localStorage.getItem('mesa_rol_3d_gm_messages');
      if (saved) return JSON.parse(saved);
    } catch {
      // Ignore storage error
    }
    return [WELCOME_MESSAGE];
  });

  useEffect(() => {
    if (resetSignal > 0) {
      stopOracleSpeech();
      setActiveSpeakingMessageId(null);
      setMessages([
        {
          id: `welcome-${Date.now()}`,
          sender: 'gm',
          text: 'Comienza una nueva partida. Las sombras del pasado se disipan y se abre un nuevo destino.\n\n¿Quién es tu personaje y dónde comienza su aventura?',
          timestamp: Date.now(),
        },
      ]);
    }
  }, [resetSignal]);

  const [ollamaConfig, setOllamaConfig] = useState<OllamaConfig>(() => {
    try {
      const saved = localStorage.getItem(OLLAMA_CONFIG_KEY);
      if (saved) return { ...DEFAULT_OLLAMA_CONFIG, ...JSON.parse(saved) };
    } catch {
      // Ignore storage error
    }
    return DEFAULT_OLLAMA_CONFIG;
  });

  const [systemPrompt, setSystemPrompt] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(SYSTEM_PROMPT_KEY);
      if (saved) return saved;
    } catch {
      // Ignore storage error
    }
    return ORACLE_SYSTEM_PROMPT;
  });

  const [inputText, setInputText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const [, setConnectionError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [expandedCardId, setExpandedCardId] = useState<number | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const [detectedModels, setDetectedModels] = useState<string[]>([]);
  const [waitingForOracleRoll, setWaitingForOracleRoll] = useState(false);

  const [speechEnabled, setSpeechEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(ORACLE_SPEECH_ENABLED_KEY);
      if (saved !== null) return saved === 'true';
    } catch {
      // Ignore storage error
    }
    return true;
  });

  const [speechVoiceURI, setSpeechVoiceURI] = useState<string>(() => {
    try {
      return localStorage.getItem(ORACLE_SPEECH_VOICE_KEY) || 'auto';
    } catch {
      return 'auto';
    }
  });

  const [speechRate, setSpeechRate] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(ORACLE_SPEECH_RATE_KEY);
      if (saved) {
        const parsed = parseFloat(saved);
        if (!isNaN(parsed) && parsed >= 0.75 && parsed <= 1.4) return parsed;
      }
    } catch {
      // Ignore storage error
    }
    return 1.02;
  });

  const [spanishVoices, setSpanishVoices] = useState<SpeechSynthesisVoice[]>(() =>
    getAvailableSpanishVoices()
  );
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [activeSpeakingMessageId, setActiveSpeakingMessageId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const speechEnabledRef = useRef<boolean>(speechEnabled);
  speechEnabledRef.current = speechEnabled;

  useEffect(() => {
    try {
      localStorage.setItem(ORACLE_MESSAGES_KEY, JSON.stringify(messages));
    } catch {
      // Ignore storage error
    }
  }, [messages]);

  useEffect(() => {
    try {
      localStorage.setItem(OLLAMA_CONFIG_KEY, JSON.stringify(ollamaConfig));
    } catch {
      // Ignore storage error
    }
  }, [ollamaConfig]);

  useEffect(() => {
    try {
      localStorage.setItem(SYSTEM_PROMPT_KEY, systemPrompt);
    } catch {
      // Ignore storage error
    }
  }, [systemPrompt]);

  useEffect(() => {
    try {
      localStorage.setItem(ORACLE_SPEECH_ENABLED_KEY, speechEnabled.toString());
    } catch {
      // Ignore storage error
    }
    configureOracleSpeech({
      enabled: speechEnabled,
      voiceURI: speechVoiceURI,
      rate: speechRate,
      pitch: 0.98,
    });
    if (!speechEnabled) {
      stopOracleSpeech();
      setActiveSpeakingMessageId(null);
    }
  }, [speechEnabled, speechVoiceURI, speechRate]);

  useEffect(() => {
    try {
      localStorage.setItem(ORACLE_SPEECH_VOICE_KEY, speechVoiceURI);
    } catch {
      // Ignore storage error
    }
  }, [speechVoiceURI]);

  useEffect(() => {
    try {
      localStorage.setItem(ORACLE_SPEECH_RATE_KEY, speechRate.toString());
    } catch {
      // Ignore storage error
    }
  }, [speechRate]);

  useEffect(() => {
    configureOracleSpeech({
      enabled: speechEnabled,
      voiceURI: speechVoiceURI,
      rate: speechRate,
      pitch: 0.98,
      onSpeakingChange: (speaking) => {
        setIsSpeaking(speaking);
        if (!speaking) {
          setActiveSpeakingMessageId(null);
        }
      },
    });

    if (!isSpeechSynthesisSupported()) return;

    const refreshVoices = () => {
      setSpanishVoices(getAvailableSpanishVoices());
    };
    refreshVoices();
    window.speechSynthesis.addEventListener('voiceschanged', refreshVoices);

    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', refreshVoices);
      stopOracleSpeech();
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      stopOracleSpeech();
      setActiveSpeakingMessageId(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isMinimized && isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isMinimized, isOpen, isGenerating]);

  const checkConnection = async () => {
    setConnectionStatus('checking');
    setConnectionError(null);
    try {
      const base = ollamaConfig.endpoint.replace(/\/+$/, '');
      const res = await fetch(`${base}/api/tags`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) throw new Error(`Respuesta HTTP ${res.status}`);
      const data = await res.json();
      const models: string[] = Array.isArray(data.models)
        ? data.models.map((m: { name: string }) => m.name)
        : [];
      setDetectedModels(models);
      setConnectionStatus('connected');
    } catch (err) {
      setConnectionStatus('disconnected');
      setConnectionError(err instanceof Error ? err.message : 'No se pudo conectar a Ollama');
    }
  };

  useEffect(() => {
    checkConnection();
  }, [ollamaConfig.endpoint]);

  useEffect(() => {
    if (waitingForOracleRoll && !is3DRolling && latestRollResult) {
      setWaitingForOracleRoll(false);
      let roll = latestRollResult.total;
      if (roll < 1 || roll > 100) {
        roll = ((Math.abs(roll) - 1) % 100) + 1;
      }
      sendMessage(inputText, roll);
      setInputText('');
    }
  }, [is3DRolling, waitingForOracleRoll, latestRollResult]);

  const sendMessage = async (text: string, oracleRoll?: number) => {
    if (isGenerating) return;

    stopOracleSpeech();
    setActiveSpeakingMessageId(null);

    let oracleEntry: OracleEntry | undefined;
    if (oracleRoll !== undefined) {
      oracleEntry = getOracleEntry(oracleRoll);
    }

    const userText =
      text.trim() || (oracleEntry ? `[Consulta al Oráculo 1d100: #${oracleRoll}]` : '¿Qué ocurre ahora?');

    const playerMsg: ChatMessage = {
      id: `player-${Date.now()}`,
      sender: 'player',
      text: userText,
      timestamp: Date.now(),
      diceRoll: oracleRoll,
      oracleCardId: oracleEntry?.id,
    };

    const updatedMessages = [...messages, playerMsg];
    setMessages(updatedMessages);
    setIsGenerating(true);
    abortControllerRef.current = new AbortController();

    try {
      const base = ollamaConfig.endpoint.replace(/\/+$/, '');
      const chatPayload: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
      chatPayload.push({ role: 'system', content: systemPrompt });

      updatedMessages.slice(-8).forEach((msg) => {
        if (msg.sender === 'player') {
          let content = msg.text;
          if (msg.oracleCardId) {
            const card = getOracleEntry(msg.oracleCardId);
            if (card) {
              content += `\n\n[DATOS DEL ORÁCULO 1d100 (Tirada: #${msg.oracleCardId})]:\n${JSON.stringify(
                card,
                null,
                2
              )}`;
            }
          }
          chatPayload.push({ role: 'user', content });
        } else if (msg.sender === 'gm') {
          chatPayload.push({ role: 'assistant', content: msg.text });
        }
      });

      const gmMsgId = `oracle-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        {
          id: gmMsgId,
          sender: 'gm',
          text: '...',
          timestamp: Date.now(),
          diceRoll: oracleRoll,
          oracleCardId: oracleEntry?.id,
        },
      ]);

      const res = await fetch(`${base}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: ollamaConfig.model,
          messages: chatPayload,
          options: { temperature: ollamaConfig.temperature },
          stream: true,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!res.ok) throw new Error(`Error en Ollama: HTTP ${res.status} ${res.statusText}`);
      if (!res.body) throw new Error('La respuesta de Ollama no tiene cuerpo legible');

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let accumulated = '';
      let spokenLength = 0;

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value, { stream: true }).split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.message?.content) {
              accumulated += parsed.message.content;
              setMessages((prev) =>
                prev.map((m) => (m.id === gmMsgId ? { ...m, text: accumulated } : m))
              );

              if (speechEnabledRef.current) {
                const pending = accumulated.slice(spokenLength);
                const boundaryMatch = pending.match(/^([\s\S]*(?:[.!?…]|\n))(?=\s)/);
                if (boundaryMatch && boundaryMatch[1].trim()) {
                  const completedSegment = boundaryMatch[1];
                  spokenLength += completedSegment.length;
                  setActiveSpeakingMessageId(gmMsgId);
                  enqueueOracleSpeech(completedSegment, { enabled: true });
                }
              }
            }
          } catch {
            // Ignore partial JSON lines
          }
        }
      }

      if (!accumulated.trim()) {
        accumulated =
          'El silencio reina en la escena mientras las fuerzas del destino aguardan tu próximo movimiento.';
        setMessages((prev) => prev.map((m) => (m.id === gmMsgId ? { ...m, text: accumulated } : m)));
      }

      if (speechEnabledRef.current) {
        const remaining = accumulated.slice(spokenLength).trim();
        if (remaining) {
          setActiveSpeakingMessageId(gmMsgId);
          enqueueOracleSpeech(remaining, { enabled: true });
        }
      }
      setConnectionStatus('connected');
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      stopOracleSpeech();
      setActiveSpeakingMessageId(null);
      const errMsg = err instanceof Error ? err.message : 'Error al comunicarse con Ollama';
      setConnectionStatus('disconnected');
      setConnectionError(errMsg);
      setMessages((prev) => [
        ...prev.filter((m) => m.text !== '...'),
        {
          id: `sys-${Date.now()}`,
          sender: 'system',
          text: `⚠️ No se pudo obtener respuesta del Oráculo en ${ollamaConfig.endpoint}. Verifica que Ollama esté ejecutándose con CORS activado (\`set OLLAMA_ORIGINS=* && ollama serve\`).`,
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  const handleSend = () => {
    if (!inputText.trim() || isGenerating) return;
    sendMessage(inputText);
    setInputText('');
  };

  const handleOracle3DRoll = () => {
    if (isGenerating || is3DRolling) return;
    setWaitingForOracleRoll(true);
    onTrigger3DRoll('d100');
  };

  const handleAbort = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsGenerating(false);
    }
    stopOracleSpeech();
    setActiveSpeakingMessageId(null);
  };

  const handleClearChat = () => {
    if (window.confirm('¿Seguro que deseas reiniciar el diálogo con el Oráculo y borrar los mensajes?')) {
      stopOracleSpeech();
      setActiveSpeakingMessageId(null);
      setMessages([
        {
          id: `welcome-${Date.now()}`,
          sender: 'gm',
          text: 'Se abre un nuevo capítulo. El mundo vuelve a ser un lienzo en blanco. ¿Quién es tu personaje y dónde comienza su aventura?',
          timestamp: Date.now(),
        },
      ]);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      onWheel={(e) => e.stopPropagation()}
      className={`hud-panel fixed z-40 flex flex-col bg-[#140e08]/98 border border-[#ba9858]/80 shadow-[0_12px_40px_rgba(0,0,0,0.85)] backdrop-blur-md transition-all duration-200 select-text ${
        isMinimized
          ? 'hidden'
          : isMaximized
          ? 'inset-x-2 sm:inset-x-3 top-2 sm:top-3 bottom-[calc(var(--footer-h,44px)+12px)] rounded-xl'
          : 'bottom-[calc(var(--footer-h,44px)+10px)] right-2 sm:right-4 w-[calc(100vw-16px)] sm:w-[min(480px,47vw)] lg:w-[min(520px,48vw)] h-[min(580px,calc(100dvh-var(--footer-h,44px)-20px))] max-h-[calc(100dvh-var(--footer-h,44px)-20px)] rounded-xl'
      }`}
    >
      <div className="flex items-center justify-between px-3 py-2 bg-[#1b120a] border-b border-[#3e2c19] rounded-t-xl select-none shrink-0">
        <div className="flex items-center gap-2">
          <div
            className="flex items-center gap-1.5 cursor-pointer"
            onClick={checkConnection}
            title={
              connectionStatus === 'connected'
                ? 'Oráculo conectado a Ollama'
                : connectionStatus === 'checking'
                ? 'Verificando conexión...'
                : 'Desconectado de Ollama. Clic para reintentar.'
            }
          >
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                connectionStatus === 'connected'
                  ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                  : connectionStatus === 'checking'
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]'
              }`}
            />
            <span className="font-cinzel font-bold text-xs text-[#ffd875] tracking-widest uppercase flex items-center gap-1">
              ORÁCULO
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {isSpeaking && (
            <button
              type="button"
              onClick={() => {
                stopOracleSpeech();
                setActiveSpeakingMessageId(null);
              }}
              className="px-1.5 py-1 rounded bg-[#2d1a10] hover:bg-[#402315] text-[#ffd875] flex items-center gap-1 text-[10px] font-mono border border-[#ba9858]/50 transition-colors cursor-pointer"
              title="Detener lectura del Oráculo"
            >
              <Square size={10} className="fill-current text-[#f59e0b]" />
              <span className="hidden sm:inline">Callar</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              const next = !speechEnabled;
              setSpeechEnabled(next);
              if (!next) {
                stopOracleSpeech();
                setActiveSpeakingMessageId(null);
              }
            }}
            className={`p-1 rounded hover:bg-[#2e2114] transition-colors cursor-pointer ${
              speechEnabled ? 'text-[#79f5be]' : 'text-[#8f7447] hover:text-[#ffd875]'
            }`}
            title={
              speechEnabled
                ? 'Voz automática del Oráculo (Google español): Activada. Clic para silenciar.'
                : 'Voz automática del Oráculo: Silenciada. Clic para activar.'
            }
          >
            {speechEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </button>
          <button
            type="button"
            onClick={() => setShowSettings(!showSettings)}
            className={`p-1 rounded hover:bg-[#2e2114] transition-colors cursor-pointer ${
              showSettings ? 'text-[#ffd875] bg-[#2e2114]' : 'text-[#8f7447] hover:text-[#ffd875]'
            }`}
            title="Ajustes de conexión, Voz y Prompt del Oráculo"
          >
            <Settings2 size={14} />
          </button>
          <button
            type="button"
            onClick={onMinimize}
            className="p-1 text-[#8f7447] hover:text-[#ffd875] hover:bg-[#2e2114] rounded transition-colors cursor-pointer"
            title="Minimizar a la barra de tareas"
          >
            <Minus size={14} />
          </button>
          <button
            type="button"
            onClick={() => setIsMaximized(!isMaximized)}
            className="p-1 text-[#8f7447] hover:text-[#ffd875] hover:bg-[#2e2114] rounded transition-colors cursor-pointer"
            title={isMaximized ? 'Restaurar tamaño' : 'Maximizar'}
          >
            {isMaximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-[#8f7447] hover:text-[#f87171] hover:bg-[#381014] rounded transition-colors cursor-pointer"
            title="Cerrar ventana del Oráculo"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-1 px-3 py-1.5 bg-[#140c06] border-b border-[#3e2c19] text-xs select-none shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-[11px] font-mono text-[#a88a5b]">
            <Type size={13} className="text-[#d4af37]" />
            <span className="hidden sm:inline">Tamaño de letra:</span>
          </div>
          <div className="flex items-center gap-1.5 bg-[#1d120a] border border-[#3e2c19] px-2 py-0.5 rounded-md">
            <button
              type="button"
              onClick={() => updateFontSize((prev) => Math.max(12, prev - 1))}
              disabled={fontSize <= 12}
              className="w-5 h-5 flex items-center justify-center rounded bg-[#27180e] hover:bg-[#382314] text-[#cfb68a] hover:text-[#ffd875] disabled:opacity-30 cursor-pointer transition-colors"
              title="Hacer letra más pequeña [-]"
            >
              <Minus size={11} />
            </button>
            <input
              type="range"
              min="12"
              max="26"
              step="1"
              value={fontSize}
              onChange={(e) => updateFontSize(Number(e.target.value))}
              className="w-20 sm:w-28 accent-[#d4af37] h-1.5 bg-[#2b1c10] rounded cursor-pointer"
              title={`Deslizador de tamaño: ${fontSize}px`}
            />
            <button
              type="button"
              onClick={() => updateFontSize((prev) => Math.min(26, prev + 1))}
              disabled={fontSize >= 26}
              className="w-5 h-5 flex items-center justify-center rounded bg-[#27180e] hover:bg-[#382314] text-[#cfb68a] hover:text-[#ffd875] disabled:opacity-30 cursor-pointer transition-colors"
              title="Hacer letra más grande [+]"
            >
              <Plus size={11} />
            </button>
            <span className="font-mono text-[11px] text-[#ffd875] font-bold min-w-[28px] text-center">
              {fontSize}px
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => updateFontSize(13)}
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono cursor-pointer transition-colors ${
              fontSize === 13 ? 'bg-[#3d2b17] text-[#ffd875] font-bold' : 'text-[#8a7049] hover:text-[#ffd875]'
            }`}
            title="Pequeña (13px)"
          >
            A-
          </button>
          <button
            type="button"
            onClick={() => updateFontSize(16)}
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono cursor-pointer transition-colors ${
              fontSize === 16 ? 'bg-[#3d2b17] text-[#ffd875] font-bold' : 'text-[#8a7049] hover:text-[#ffd875]'
            }`}
            title="Normal (16px)"
          >
            A
          </button>
          <button
            type="button"
            onClick={() => updateFontSize(20)}
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono cursor-pointer transition-colors ${
              fontSize === 20 ? 'bg-[#3d2b17] text-[#ffd875] font-bold' : 'text-[#8a7049] hover:text-[#ffd875]'
            }`}
            title="Grande (20px)"
          >
            A+
          </button>
          <button
            type="button"
            onClick={() => updateFontSize(24)}
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono cursor-pointer transition-colors ${
              fontSize === 24 ? 'bg-[#3d2b17] text-[#ffd875] font-bold' : 'text-[#8a7049] hover:text-[#ffd875]'
            }`}
            title="Extra grande (24px)"
          >
            A++
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="bg-[#120b06] border-b border-[#443019] p-3 text-xs space-y-3 shrink-0 animate-fade-in max-h-[260px] overflow-y-auto custom-scrollbar">
          <div className="flex items-center justify-between pb-1 border-b border-[#2b1f13]">
            <span className="font-cinzel font-bold text-[#ffd875]">Ajustes del Oráculo & Conexión</span>
            <button
              type="button"
              onClick={checkConnection}
              className="flex items-center gap-1 text-[10px] text-[#79f5be] hover:underline cursor-pointer"
            >
              <RefreshCw size={11} className={connectionStatus === 'checking' ? 'animate-spin' : ''} />
              <span>Probar conexión</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-mono text-[#a88a5b] mb-0.5">Servidor Ollama:</label>
              <input
                type="text"
                value={ollamaConfig.endpoint}
                onChange={(e) => setOllamaConfig((prev) => ({ ...prev, endpoint: e.target.value }))}
                className="w-full bg-[#1e150d] border border-[#3e2c19] rounded px-2 py-1 text-[#dfc596] font-mono text-xs focus:border-[#d4af37] focus:outline-none"
                placeholder="http://localhost:11434"
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono text-[#a88a5b] mb-0.5">Modelo seleccionado:</label>
              <div className="flex gap-1">
                <input
                  type="text"
                  value={ollamaConfig.model}
                  onChange={(e) => setOllamaConfig((prev) => ({ ...prev, model: e.target.value }))}
                  className="w-full bg-[#1e150d] border border-[#3e2c19] rounded px-2 py-1 text-[#dfc596] font-mono text-xs focus:border-[#d4af37] focus:outline-none"
                  placeholder="modelo-ia"
                />
                {detectedModels.length > 0 && (
                  <select
                    value={ollamaConfig.model}
                    onChange={(e) => setOllamaConfig((prev) => ({ ...prev, model: e.target.value }))}
                    className="bg-[#24170d] border border-[#3e2c19] text-[#ffd875] text-xs rounded px-1 cursor-pointer"
                    title="Modelos disponibles en tu Ollama"
                  >
                    <option value="" disabled>
                      Detectados
                    </option>
                    {detectedModels.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-0.5">
              <label className="text-[10px] font-mono text-[#a88a5b]">
                Instrucciones del Oráculo (System Prompt):
              </label>
              <button
                type="button"
                onClick={() => setSystemPrompt(ORACLE_SYSTEM_PROMPT)}
                className="text-[9px] text-[#8f7447] hover:text-[#ffd875] flex items-center gap-1 cursor-pointer"
                title="Restablecer prompt original del Oráculo"
              >
                <RotateCcw size={10} />
                Restablecer
              </button>
            </div>
            <textarea
              rows={3}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="w-full bg-[#181008] border border-[#3e2c19] rounded p-1.5 text-[#cfb68a] font-mono text-[11px] focus:border-[#d4af37] focus:outline-none"
            />
          </div>

          <div className="p-2 rounded-lg bg-[#181008] border border-[#3e2c19] space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-cinzel font-bold text-[#79f5be] flex items-center gap-1.5">
                <Volume2 size={13} />
                <span>Voz del Oráculo (Google español)</span>
              </span>
              <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-[#dfc596]">
                <input
                  type="checkbox"
                  checked={speechEnabled}
                  onChange={(e) => setSpeechEnabled(e.target.checked)}
                  className="accent-[#79f5be] cursor-pointer"
                />
                <span>Leer respuestas automáticamente</span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-end">
              <div>
                <label className="block text-[10px] font-mono text-[#a88a5b] mb-0.5">
                  Voz seleccionada ({pickBestSpanishGoogleVoice(speechVoiceURI)?.name || 'Predeterminada es-ES'}):
                </label>
                <select
                  value={speechVoiceURI}
                  onChange={(e) => setSpeechVoiceURI(e.target.value)}
                  className="w-full bg-[#1e150d] border border-[#3e2c19] rounded px-2 py-1 text-[#dfc596] text-[11px] focus:border-[#d4af37] focus:outline-none cursor-pointer"
                >
                  <option value="auto">Automática (Priorizar Google español)</option>
                  {spanishVoices.map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {v.name} ({v.lang})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <div className="flex items-center justify-between text-[10px] font-mono text-[#a88a5b] mb-0.5">
                    <span>Velocidad:</span>
                    <span className="text-[#ffd875] font-bold">{speechRate.toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.8"
                    max="1.3"
                    step="0.02"
                    value={speechRate}
                    onChange={(e) => setSpeechRate(parseFloat(e.target.value))}
                    className="w-full accent-[#d4af37] h-1.5 bg-[#2b1c10] rounded cursor-pointer"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActiveSpeakingMessageId(null);
                    speakOracleText(
                      'El viento susurra entre las ruinas antiguas. El Oráculo escucha tu destino.',
                      {
                        force: true,
                        voiceURI: speechVoiceURI,
                        rate: speechRate,
                        pitch: 0.98,
                      }
                    );
                  }}
                  className="px-2.5 py-1 rounded bg-[#27190e] hover:bg-[#382313] border border-[#ba9858]/60 text-[#ffd875] text-[11px] font-cinzel font-bold cursor-pointer shrink-0"
                  title="Escuchar una frase de prueba con la voz seleccionada"
                >
                  Probar voz
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-[#2b1f13]">
            <button
              type="button"
              onClick={handleClearChat}
              className="flex items-center gap-1 text-[11px] text-[#f87171] hover:text-[#fca5a5] cursor-pointer"
            >
              <Trash2 size={12} />
              <span>Limpiar diálogo actual</span>
            </button>
            <span className="text-[10px] text-[#806847]">Oráculo: 100 fichas integradas offline</span>
          </div>
        </div>
      )}

      {connectionStatus === 'disconnected' && !showSettings && (
        <div className="bg-[#260d10] border-b border-[#ef4444]/40 p-2 text-xs flex items-start gap-2 text-[#fca5a5] shrink-0">
          <TriangleAlert size={15} className="text-[#f87171] shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1">
            <p className="font-semibold text-[11px]">
              No se detecta conexión con Ollama ({ollamaConfig.endpoint})
            </p>
            <p className="text-[10px] text-[#fecaca]/80 leading-snug">
              Inicia Ollama con los permisos de navegador ejecutando en la consola:{' '}
              <code className="bg-[#140608] px-1 py-0.5 rounded text-[#ffd875] font-mono">
                set OLLAMA_ORIGINS=* &amp;&amp; ollama serve
              </code>
            </p>
          </div>
          <button
            type="button"
            onClick={checkConnection}
            className="px-2 py-1 bg-[#3d1318] hover:bg-[#521b22] text-[#fff] text-[10px] font-bold rounded cursor-pointer shrink-0"
          >
            Reintentar
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3 custom-scrollbar text-sm">
        {messages.map((msg) => {
          const isPlayer = msg.sender === 'player';
          const isSystem = msg.sender === 'system';
          const card = msg.oracleCardId ? getOracleEntry(msg.oracleCardId) : undefined;
          const isExpanded = expandedCardId === msg.oracleCardId;

          if (isSystem) {
            return (
              <div
                key={msg.id}
                className="p-2 bg-[#2a1315]/80 border border-[#7f1d1d]/60 rounded-lg text-xs text-[#fca5a5]"
              >
                {msg.text}
              </div>
            );
          }

          return (
            <div key={msg.id} className={`flex flex-col gap-1 ${isPlayer ? 'items-end' : 'items-start'}`}>
              <div
                style={{ fontSize: `${Math.max(10, fontSize - 4)}px` }}
                className="flex items-center gap-1.5 px-1 font-mono text-[#8f7447]"
              >
                <span className={isPlayer ? 'text-[#ffd875] font-bold' : 'text-[#79f5be] font-bold'}>
                  {isPlayer ? 'Jugador' : 'Oráculo'}
                </span>
                <span>•</span>
                <span>
                  {new Date(msg.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                {!isPlayer && msg.text && msg.text !== '...' && (
                  <button
                    type="button"
                    onClick={() => {
                      if (isSpeaking && activeSpeakingMessageId === msg.id) {
                        stopOracleSpeech();
                        setActiveSpeakingMessageId(null);
                      } else {
                        setActiveSpeakingMessageId(msg.id);
                        speakOracleText(msg.text, {
                          force: true,
                          voiceURI: speechVoiceURI,
                          rate: speechRate,
                          pitch: 0.98,
                        });
                      }
                    }}
                    className={`ml-1 p-0.5 rounded hover:bg-[#2a1d11] transition-colors cursor-pointer ${
                      isSpeaking && activeSpeakingMessageId === msg.id
                        ? 'text-[#ffd875] animate-pulse'
                        : 'text-[#8f7447] hover:text-[#79f5be]'
                    }`}
                    title={
                      isSpeaking && activeSpeakingMessageId === msg.id
                        ? 'Detener lectura'
                        : 'Escuchar respuesta del Oráculo'
                    }
                  >
                    {isSpeaking && activeSpeakingMessageId === msg.id ? (
                      <Square size={11} className="fill-current" />
                    ) : (
                      <Volume2 size={12} />
                    )}
                  </button>
                )}
              </div>

              <div
                style={{ fontSize: `${fontSize}px` }}
                className={`p-3 rounded-xl max-w-[92%] leading-relaxed shadow-sm select-text ${
                  isPlayer
                    ? 'bg-[#24170d] border border-[#523d21] text-[#f7e6c4] rounded-tr-none'
                    : 'bg-[#181109] border border-[#3e2c19] text-[#e0ceb0] rounded-tl-none whitespace-pre-wrap'
                }`}
              >
                {card && (
                  <div
                    style={{ fontSize: `${Math.max(11, fontSize - 3)}px` }}
                    className="mb-2 bg-[#120a05] border border-[#523d21] rounded-lg p-2"
                  >
                    <div
                      className="flex items-center justify-between cursor-pointer text-[#ffd875] font-cinzel font-bold"
                      onClick={() => setExpandedCardId(isExpanded ? null : card.id)}
                    >
                      <span className="flex items-center gap-1.5">
                        <Dices size={Math.max(13, fontSize - 1)} className="text-[#d4af37]" />
                        <span>
                          Oráculo 1d100: #{card.id} — {card.simbolo}
                        </span>
                      </span>
                      <span className="text-[10px] text-[#a88a5b] flex items-center gap-1">
                        {card.si_no}
                        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </span>
                    </div>

                    {isExpanded && (
                      <div
                        style={{ fontSize: `${Math.max(11, fontSize - 3)}px` }}
                        className="mt-2 pt-2 border-t border-[#312010] grid grid-cols-2 gap-1.5 text-[#b39569] font-sans"
                      >
                        <div>
                          <strong className="text-[#ffd875]">Encuentro:</strong> {card.encuentro}
                        </div>
                        <div>
                          <strong className="text-[#ffd875]">Lugar:</strong> {card.lugar} ({card.terreno})
                        </div>
                        <div>
                          <strong className="text-[#ffd875]">Problema:</strong> {card.problema}
                        </div>
                        <div>
                          <strong className="text-[#ffd875]">Giro:</strong> {card.giro_trama}
                        </div>
                        <div>
                          <strong className="text-[#ffd875]">Objeto:</strong> {card.objeto}
                        </div>
                        <div>
                          <strong className="text-[#ffd875]">Criatura:</strong> {card.criatura}
                        </div>
                        <div className="col-span-2 text-[10px] text-[#8a724f] italic mt-1">
                          &quot;{card.rumor_leyenda}&quot;
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div>{msg.text}</div>
              </div>
            </div>
          );
        })}

        {isGenerating && (
          <div className="flex items-center gap-2 text-xs text-[#d4af37] animate-pulse px-2 py-1 font-cinzel">
            <Sparkles size={14} className="animate-spin" />
            <span>El Oráculo está consultando el destino...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="flex flex-wrap items-center gap-1 px-3 py-1 bg-[#120b06] border-t border-[#2a1d11] text-[11px] shrink-0">
        <button
          type="button"
          onClick={() => {
            setInputText('¿Qué encuentro a mi alrededor en esta escena?');
            textareaRef.current?.focus();
          }}
          className="px-2 py-0.5 rounded bg-[#1f140a] hover:bg-[#2c1d10] border border-[#3b2917] text-[#a88a5b] hover:text-[#ffd875] whitespace-nowrap cursor-pointer transition-colors"
        >
          👁️ Observar escena
        </button>
        <button
          type="button"
          onClick={() => {
            setInputText('¿Tengo éxito en mi intento?');
            textareaRef.current?.focus();
          }}
          className="px-2 py-0.5 rounded bg-[#1f140a] hover:bg-[#2c1d10] border border-[#3b2917] text-[#a88a5b] hover:text-[#ffd875] whitespace-nowrap cursor-pointer transition-colors"
        >
          ⚖️ Pregunta Sí/No
        </button>
        <button
          type="button"
          onClick={() => {
            setInputText('¿Quién es la persona o criatura que aparece?');
            textareaRef.current?.focus();
          }}
          className="px-2 py-0.5 rounded bg-[#1f140a] hover:bg-[#2c1d10] border border-[#3b2917] text-[#a88a5b] hover:text-[#ffd875] whitespace-nowrap cursor-pointer transition-colors"
        >
          👤 Encuentro PNJ
        </button>
        <button
          type="button"
          onClick={() => {
            setInputText('Un giro inesperado sacude la situación.');
            textareaRef.current?.focus();
          }}
          className="px-2 py-0.5 rounded bg-[#1f140a] hover:bg-[#2c1d10] border border-[#3b2917] text-[#a88a5b] hover:text-[#ffd875] whitespace-nowrap cursor-pointer transition-colors"
        >
          ⚡ Giro de trama
        </button>
      </div>

      <div className="p-2.5 bg-[#170f08] border-t border-[#3e2c19] rounded-b-xl flex flex-col gap-2 shrink-0">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            rows={2}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Escribe lo que hace tu personaje o consulta al Oráculo..."
            style={{ fontSize: `${Math.max(13, fontSize)}px` }}
            className="flex-1 bg-[#1f150d] border border-[#443019] rounded-lg px-2.5 py-1.5 text-[#f0dfc0] placeholder-[#6e5839] focus:outline-none focus:border-[#d4af37] resize-none font-sans leading-relaxed"
          />
          <div className="flex flex-col gap-1">
            {isGenerating ? (
              <button
                type="button"
                onClick={handleAbort}
                className="p-2 rounded-lg bg-[#3d1318] hover:bg-[#521b22] text-[#fca5a5] font-bold text-xs flex items-center justify-center transition-all cursor-pointer"
                title="Detener respuesta"
              >
                <X size={16} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSend}
                disabled={!inputText.trim()}
                className="p-2 rounded-lg bg-gradient-to-r from-[#d4af37] to-[#9e762b] hover:from-[#e6c14e] hover:to-[#b38833] text-[#120a04] font-bold text-xs flex items-center justify-center transition-all disabled:opacity-40 cursor-pointer shadow-md"
                title="Enviar mensaje al Oráculo [Enter]"
              >
                <Send size={15} />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#2a1d11]">
          <button
            type="button"
            onClick={handleOracle3DRoll}
            disabled={isGenerating || is3DRolling}
            className="flex-1 py-1.5 px-3 rounded-lg bg-[#27190e] hover:bg-[#382313] border border-[#ba9858]/60 hover:border-[#ffd875] text-[#ffd875] font-cinzel font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer disabled:opacity-50"
            title="Lanza el d100 en la mesa 3D y consulta automáticamente la ficha correspondiente en el oráculo"
          >
            <Dices size={15} className="text-[#d4af37]" />
            <span>Consultar Oráculo (1d100 3D)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              const roll = Math.floor(Math.random() * 100) + 1;
              sendMessage(inputText, roll);
              setInputText('');
            }}
            disabled={isGenerating}
            className="py-1.5 px-2.5 rounded-lg bg-[#1a1109] hover:bg-[#26180c] border border-[#3b2917] text-[#a88a5b] hover:text-[#ffd875] text-[11px] font-mono transition-all cursor-pointer disabled:opacity-50"
            title="Tirada instantánea 1d100 sin animación física"
          >
            ⚡ d100 Rápido
          </button>
        </div>
      </div>
    </div>
  );
};
