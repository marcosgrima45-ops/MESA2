export interface OracleSpeechOptions {
  enabled?: boolean;
  force?: boolean;
  voiceURI?: string;
  rate?: number;
  pitch?: number;
  onSpeakingChange?: (speaking: boolean) => void;
}

const DEFAULT_RATE = 1.02;
const DEFAULT_PITCH = 0.98;
const MAX_CHUNK_CHARS = 165;

let activeSessionId = 0;
let chunkQueue: string[] = [];
let isSpeakingActive = false;
let currentUtteranceRef: SpeechSynthesisUtterance | null = null;
let speakingChangeListener: ((speaking: boolean) => void) | null = null;
let activeOptions: Required<Omit<OracleSpeechOptions, 'onSpeakingChange' | 'force'>> = {
  enabled: true,
  voiceURI: 'auto',
  rate: DEFAULT_RATE,
  pitch: DEFAULT_PITCH,
};

function notifySpeaking(speaking: boolean) {
  isSpeakingActive = speaking;
  speakingChangeListener?.(speaking);
}

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}

export function getAvailableSpanishVoices(): SpeechSynthesisVoice[] {
  if (!isSpeechSynthesisSupported()) return [];
  const voices = window.speechSynthesis.getVoices();
  const spanishVoices = voices.filter((v) => v.lang.toLowerCase().startsWith('es'));
  return sortSpanishVoices(spanishVoices);
}

function scoreSpanishVoice(voice: SpeechSynthesisVoice): number {
  const name = voice.name.toLowerCase();
  const lang = voice.lang.toLowerCase();

  if (name === 'google español' || (name.includes('google') && name.includes('español') && !name.includes('estados unidos'))) {
    return 1000;
  }
  if (name.includes('google') && lang === 'es-es') {
    return 950;
  }
  if (name.includes('google') && name.includes('español')) {
    return 900;
  }
  if (name.includes('google') && lang.startsWith('es')) {
    return 850;
  }
  if (name.includes('natural') || name.includes('neural') || name.includes('online')) {
    return lang === 'es-es' ? 750 : 700;
  }
  if (lang === 'es-es') return 500;
  if (lang.startsWith('es')) return 400;
  return 0;
}

function sortSpanishVoices(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  return [...voices].sort((a, b) => scoreSpanishVoice(b) - scoreSpanishVoice(a));
}

export function pickBestSpanishGoogleVoice(preferredVoiceURI = 'auto'): SpeechSynthesisVoice | null {
  if (!isSpeechSynthesisSupported()) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  if (preferredVoiceURI && preferredVoiceURI !== 'auto') {
    const exact = voices.find((v) => v.voiceURI === preferredVoiceURI || v.name === preferredVoiceURI);
    if (exact) return exact;
  }

  const spanish = getAvailableSpanishVoices();
  return spanish[0] || null;
}

export function cleanOracleTextForSpeech(rawText: string): string {
  if (!rawText) return '';

  let text = rawText;

  // Replace markdown code fences or inline backticks while preserving inner readable text
  text = text.replace(/```[\s\S]*?```/g, (block) => block.replace(/```[^\n]*\n?|```/g, ' '));
  text = text.replace(/`([^`]+)`/g, '$1');

  // Remove markdown links [label](url) -> label
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // Remove markdown headings and blockquote markers at line start
  text = text.replace(/^\s{0,3}#{1,6}\s+/gm, '');
  text = text.replace(/^\s*>\s?/gm, '');

  // Convert list item prefixes into clean pauses
  text = text.replace(/^\s*[-*•+]\s+/gm, '. ');
  text = text.replace(/^\s*(\d+)\.\s+/gm, '$1. ');

  // Remove bold/italic/strikethrough formatting tokens
  text = text.replace(/\*{1,3}|_{1,3}|~~/g, '');

  // Remove emojis and decorative pictographs so TTS does not read symbol names
  try {
    text = text.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, ' ');
  } catch {
    // Fallback for engines without Unicode property escapes
    text = text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, ' ');
  }
  text = text.replace(/[\uFE0F\u200D]/g, '');

  // Normalize dashes and slashes into natural pauses
  text = text.replace(/\s*[—–]\s*/g, ', ');
  text = text.replace(/\s+\/\s+/g, ', ');

  // Convert line breaks without terminal punctuation into natural pauses
  text = text.replace(/([^\n.!?:;…])\s*\n+\s*/g, '$1. ');
  text = text.replace(/\n+/g, ' ');

  // Collapse repeated punctuation/spaces
  text = text.replace(/\.{4,}/g, '...');
  text = text.replace(/\s+([,.;:!?])/g, '$1');
  text = text.replace(/([.!?])(?=[^\s"»”')])/g, '$1 ');
  text = text.replace(/\s{2,}/g, ' ').trim();

  // Remove stray leading dots created by list normalization
  text = text.replace(/^[.,;:\s]+/, '').trim();

  return text;
}

function splitLongPhrase(phrase: string, maxLen: number): string[] {
  if (phrase.length <= maxLen) return [phrase];

  const parts: string[] = [];
  const clauses = phrase.split(/(?<=[,;:])\s+/);
  let current = '';

  for (const clause of clauses) {
    if (!clause) continue;
    if (!current) {
      current = clause;
    } else if (current.length + 1 + clause.length <= maxLen) {
      current = `${current} ${clause}`;
    } else {
      parts.push(current);
      current = clause;
    }
  }
  if (current) parts.push(current);

  // If any clause still exceeds maxLen, break cleanly on word boundaries
  const finalParts: string[] = [];
  for (const part of parts) {
    if (part.length <= maxLen) {
      finalParts.push(part);
      continue;
    }
    const words = part.split(/\s+/);
    let line = '';
    for (const word of words) {
      if (!line) {
        line = word;
      } else if (line.length + 1 + word.length <= maxLen) {
        line = `${line} ${word}`;
      } else {
        finalParts.push(line);
        line = word;
      }
    }
    if (line) finalParts.push(line);
  }

  return finalParts;
}

export function splitIntoNaturalChunks(cleanedText: string): string[] {
  if (!cleanedText) return [];

  // Split into sentences preserving terminal punctuation (. ! ? …)
  const rawSentences = cleanedText.match(/[^.!?…]+(?:[.!?…]+|$)/g) || [cleanedText];
  const chunks: string[] = [];

  for (const raw of rawSentences) {
    const sentence = raw.trim();
    if (!sentence) continue;
    if (sentence.length <= MAX_CHUNK_CHARS) {
      chunks.push(sentence);
    } else {
      chunks.push(...splitLongPhrase(sentence, MAX_CHUNK_CHARS));
    }
  }

  return chunks;
}

function speakNextChunk(sessionId: number) {
  if (!isSpeechSynthesisSupported()) {
    notifySpeaking(false);
    return;
  }

  if (sessionId !== activeSessionId) return;

  const nextChunk = chunkQueue.shift();
  if (!nextChunk) {
    currentUtteranceRef = null;
    notifySpeaking(false);
    return;
  }

  const utterance = new SpeechSynthesisUtterance(nextChunk);
  const voice = pickBestSpanishGoogleVoice(activeOptions.voiceURI);

  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang || 'es-ES';
  } else {
    utterance.lang = 'es-ES';
  }

  utterance.rate = Math.max(0.6, Math.min(1.6, activeOptions.rate));
  utterance.pitch = Math.max(0.5, Math.min(1.5, activeOptions.pitch));
  utterance.volume = 1;

  utterance.onend = () => {
    if (sessionId !== activeSessionId) return;
    currentUtteranceRef = null;
    speakNextChunk(sessionId);
  };

  utterance.onerror = () => {
    if (sessionId !== activeSessionId) return;
    currentUtteranceRef = null;
    speakNextChunk(sessionId);
  };

  // Hold module-level reference to prevent Chrome GC bug mid-utterance
  currentUtteranceRef = utterance;
  notifySpeaking(true);

  try {
    window.speechSynthesis.speak(utterance);
  } catch {
    currentUtteranceRef = null;
    notifySpeaking(false);
  }
}

export function configureOracleSpeech(options: OracleSpeechOptions) {
  if (options.onSpeakingChange !== undefined) {
    speakingChangeListener = options.onSpeakingChange;
  }
  activeOptions = {
    enabled: options.enabled ?? activeOptions.enabled,
    voiceURI: options.voiceURI ?? activeOptions.voiceURI,
    rate: options.rate ?? activeOptions.rate,
    pitch: options.pitch ?? activeOptions.pitch,
  };
}

export function stopOracleSpeech() {
  activeSessionId += 1;
  chunkQueue = [];
  currentUtteranceRef = null;
  if (isSpeechSynthesisSupported()) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // Ignore speech cancel errors
    }
  }
  notifySpeaking(false);
}

export function enqueueOracleSpeech(rawText: string, options?: OracleSpeechOptions) {
  if (options) configureOracleSpeech(options);
  if (!(options?.force || activeOptions.enabled) || !isSpeechSynthesisSupported()) return;

  const cleaned = cleanOracleTextForSpeech(rawText);
  const chunks = splitIntoNaturalChunks(cleaned);
  if (!chunks.length) return;

  chunkQueue.push(...chunks);

  if (!isSpeakingActive && !currentUtteranceRef) {
    speakNextChunk(sessionIdOrCurrent());
  }
}

function sessionIdOrCurrent(): number {
  return activeSessionId;
}

export function speakOracleText(rawText: string, options?: OracleSpeechOptions) {
  stopOracleSpeech();
  if (options) configureOracleSpeech(options);
  if (!(options?.force || activeOptions.enabled) || !isSpeechSynthesisSupported()) return;

  const cleaned = cleanOracleTextForSpeech(rawText);
  const chunks = splitIntoNaturalChunks(cleaned);
  if (!chunks.length) return;

  chunkQueue = chunks;
  speakNextChunk(activeSessionId);
}
