import { useState, useRef, useEffect, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { X, Send, RotateCcw, Mail, Loader2, Mic, MicOff, Minus, Volume2, VolumeX } from 'lucide-react';
import { askFaq, generateDesignImage, type ChatMessage, type CatalogProduct } from '@/services/deepseek';

// Web Speech API types (browser-native, not in default TS lib)
interface SpeechRecognitionResult {
  0: { transcript: string };
  isFinal: boolean;
}
interface SpeechRecognitionEvent extends Event {
  results: { length: number; [index: number]: SpeechRecognitionResult };
  resultIndex: number;
}
interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: Event) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

// Detect browser and return device-specific mic unblock instructions
function getMicUnblockInstructions(): string {
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  const isAndroid = /Android/.test(ua);
  const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
  const isChrome = /Chrome/.test(ua) && !/Edg/.test(ua);
  const isEdge = /Edg/.test(ua);
  const isFirefox = /Firefox/.test(ua);

  if (isIOS) {
    // Both iPhone Safari and iPhone Chrome route through iOS Settings
    return "iPhone: open your Settings app → Safari → Microphone → set to 'Ask'. Then come back to this tab, close it, and reopen tshirtbrothers.com. Tap the mic and allow when asked.";
  }
  if (isAndroid) {
    return "Android: tap the three-dot menu ⋮ in the top right → tap Settings → Site settings → Microphone → find tshirtbrothers.com and change it to Allow. Then reload this page.";
  }
  if (isChrome) {
    return "Chrome: click the three-dot menu ⋮ (top right) → Settings → Privacy and security → Site settings → Microphone. Find tshirtbrothers.com under 'Not allowed to use your microphone' and click the trash 🗑️ icon to remove it. Come back here, reload the page, tap the mic, and click Allow when Chrome asks.";
  }
  if (isEdge) {
    return "Edge: click the three-dot menu ⋯ (top right) → Settings → Cookies and site permissions → Microphone. Find tshirtbrothers.com under 'Block' and remove it. Come back here, reload, tap the mic, and click Allow.";
  }
  if (isSafari) {
    return "Safari (Mac): click Safari in the top menu bar → Settings for tshirtbrothers.com → set Microphone to Allow → reload the page.";
  }
  if (isFirefox) {
    return "Firefox: click the small shield/permissions icon on the LEFT side of the address bar next to tshirtbrothers.com → click the X next to 'Use the Microphone (Blocked)' → reload the page and allow when prompted.";
  }
  return "Open your browser's site settings, find tshirtbrothers.com in the microphone permissions list, and change it to Allow. Then reload this page.";
}

const FAQ_GREETING: ChatMessage = {
  role: 'assistant',
  content: "Hey there! 😊 I'm Tee, your T-Shirt Brothers helper! Ask me anything — products, pricing, turnaround times, you name it. I can even show you products from our catalog!",
};

const DESIGN_GREETING: ChatMessage = {
  role: 'assistant',
  content: "Hey! 🎨 I'm Tee, your design assistant! Describe what you want and I'll create it for you. Try something like:\n\n• \"a fire-breathing dragon logo\"\n• \"happy birthday text with balloons\"\n• \"vintage surf shop emblem\"\n\nI'll generate it and you can add it straight to your canvas!",
};

// Detect intent to start designing on a specific product
const DESIGN_INTENT_PATTERNS = [
  /\b(can i|i want to|i'd like to|let me|help me|i'm gonna|i wanna)\s+(design|customize|print|make|create|put something on)/i,
  /\b(start|open|launch)\s+(a\s+)?design/i,
  /\b(design|customize|put\s+(a\s+)?design)\s+(this|it|on this|on it|that)\b/i,
  /\byes\s*,?\s*(design|take me|let'?s go|open it|open design)/i,
  /\b(design studio|design tool)\b/i,
];

function looksLikeDesignIntent(text: string): boolean {
  return DESIGN_INTENT_PATTERNS.some((re) => re.test(text));
}

// Detect "please generate/create/draw/make me a design of X" intent on the Design Studio page
const GENERATE_INTENT_PATTERNS = [
  /\b(create|generate|draw|make|design|give me|i want|i need|show me|can you (make|create|draw|design))\b/i,
  /\b(picture|image|graphic|logo|illustration|artwork|drawing|design|pic)\s+of\b/i,
  /\b(logo|graphic)\b.*\b(for|of|with)\b/i,
];

function looksLikeGenerateIntent(text: string): boolean {
  return GENERATE_INTENT_PATTERNS.some((re) => re.test(text));
}

// Detect refinement / iteration requests (after a previous generation exists)
const REFINE_INTENT_PATTERNS = [
  /\b(make it|make this|but|now|instead|change|add|remove|without|more|less)\b/i,
  /\b(darker|lighter|bigger|smaller|brighter|softer|bolder|cleaner|simpler|fancier|more colorful|colorful|monochrome|black and white|minimal|detailed)\b/i,
  /\b(try again|regenerate|another|different|variation|new version)\b/i,
  /^(and|plus|also)\b/i,
];

function looksLikeRefineIntent(text: string): boolean {
  return REFINE_INTENT_PATTERNS.some((re) => re.test(text));
}

const STALE_AFTER_MS = 30 * 60 * 1000; // 30 minutes

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const getGreeting = () => {
    try {
      return location.pathname.startsWith('/design') ? DESIGN_GREETING : FAQ_GREETING;
    } catch {
      return FAQ_GREETING;
    }
  };
  const [messages, setMessages] = useState<ChatMessage[]>([FAQ_GREETING]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [speechSupported] = useState(() => getSpeechRecognition() !== null);
  const [focusedProduct, setFocusedProduct] = useState<CatalogProduct | null>(null);
  const [lastActivity, setLastActivity] = useState<number>(Date.now());
  const [lastGeneratedPrompt, setLastGeneratedPrompt] = useState<string>('');
  const [speakEnabled, setSpeakEnabled] = useState(false);

  // Text-to-speech using browser's built-in Web Speech Synthesis API
  function speakText(text: string) {
    if (!speakEnabled || typeof window === 'undefined' || !window.speechSynthesis) return;
    // Strip markdown formatting and fix pronunciations
    const clean = text
      .replace(/\*\*/g, '')
      .replace(/\[.*?\]/g, '')
      .replace(/[#*_~`>]/g, '')
      .replace(/\n+/g, '. ')
      .replace(/\s{2,}/g, ' ')
      // Pronunciation fixes
      .replace(/\bGildan\b/gi, 'Gill-dan')
      .replace(/\bSoftstyle\b/gi, 'Soft-style')
      .replace(/\bDTF\b/g, 'D T F')
      .replace(/\bDTG\b/g, 'D T G')
      .replace(/\btshirtbrothers\.com\b/gi, 'T-Shirt Brothers dot com')
      .replace(/\bCVC\b/g, 'C V C')
      .trim();
    if (!clean) return;
    window.speechSynthesis.cancel(); // stop any previous speech
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = 1.0;
    utterance.pitch = 0.95;
    // Pick a male voice
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v =>
      v.name.includes('Daniel') || // Mac/iOS male
      v.name.includes('Alex') || // Mac male
      v.name.includes('Fred') || // Mac male
      v.name.includes('Google UK English Male') ||
      v.name.includes('Google US English') || // often male
      v.name.includes('David') || // Windows male
      v.name.includes('Mark') || // Windows male
      v.name.includes('James') // various
    );
    if (preferred) utterance.voice = preferred;
    window.speechSynthesis.speak(utterance);
  }
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Has the user actually started a conversation (more than just the greeting)?
  const hasConversation = messages.length > 1;

  function resetChat() {
    setMessages([getGreeting()]);
    setInput('');
    setFocusedProduct(null);
    setLastActivity(Date.now());
    setLastGeneratedPrompt('');
  }

  // Shared image generation flow — used by both initial creation and refinement
  async function runDesignGeneration(basePrompt: string, displayLabel: string) {
    setLoading(true);
    setMessages((m) => [
      ...m,
      { role: 'assistant', content: `🎨 Creating "${displayLabel}" and removing the background... usually takes 15-30 seconds.` },
    ]);
    try {
      // Send prompt directly to DALL-E — skip DeepSeek enhancer to avoid mockup contamination
      const { imageUrl } = await generateDesignImage(basePrompt);
      setLastGeneratedPrompt(basePrompt);
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          content: "Here's your design! Tap **Add to Canvas** to drop it in. Want changes? Just say things like 'make it more colorful', 'add stars', 'try again', or describe a new design.",
          imageUrl,
          imagePrompt: basePrompt,
        },
      ]);
      speakText("Here's your design! Tap Add to Canvas to use it, or tell me what to change.");
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          content: "Sorry, I couldn't generate that design right now. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleMinimize() {
    setOpen(false);
    // Keeps state — reopens where they left off (unless stale)
  }

  function handleClose() {
    setOpen(false);
    resetChat();
    window.speechSynthesis?.cancel();
  }

  function handleOpen() {
    // Auto-reset if the last activity is older than 30 minutes
    if (hasConversation && Date.now() - lastActivity > STALE_AFTER_MS) {
      resetChat();
    }
    setOpen(true);
  }

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  // Listen for Design Studio's "open chat" event
  useEffect(() => {
    function handleOpenChat() {
      handleOpen();
    }
    window.addEventListener('tsb:open-chat', handleOpenChat);
    return () => window.removeEventListener('tsb:open-chat', handleOpenChat);
  }, []);

  // Hide floating bubble on pages where it's integrated differently
  const location = useLocation();
  const hideFloatingBubble = location.pathname.startsWith('/design') || location.pathname.startsWith('/admin') || location.pathname.startsWith('/auth');

  // Stop any ongoing recognition when the widget closes or unmounts
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  async function toggleListening() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const SR = getSpeechRecognition();
    if (!SR) {
      alert('Your browser does not support voice input. Try Chrome, Edge, or Safari.');
      return;
    }

    // Explicitly request mic permission FIRST via getUserMedia.
    // This reliably triggers the browser's permission prompt — the Web Speech API
    // alone can silently fail on Chrome without asking.
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // We only needed the permission — stop the stream immediately
        stream.getTracks().forEach((t) => t.stop());
      }
    } catch (permErr) {
      const name = (permErr as DOMException).name;
      console.warn('[Speech] getUserMedia failed:', name, permErr);
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setMessages((m) => [
          ...m,
          { role: 'assistant', content: "🎤 Mic is blocked. " + getMicUnblockInstructions() },
        ]);
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setMessages((m) => [
          ...m,
          { role: 'assistant', content: "🎤 No microphone found on this device." },
        ]);
      } else {
        setMessages((m) => [
          ...m,
          { role: 'assistant', content: "🎤 Could not access microphone: " + name + ". Please type your question." },
        ]);
      }
      return;
    }

    // Reset input and build full transcript from scratch each session
    const baseInput = input;
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = 'en-US';
    rec.onresult = (e: SpeechRecognitionEvent) => {
      let fullTranscript = '';
      for (let i = 0; i < e.results.length; i++) {
        fullTranscript += e.results[i]?.[0]?.transcript ?? '';
      }
      const separator = baseInput && !baseInput.endsWith(' ') ? ' ' : '';
      setInput((baseInput + separator + fullTranscript).trimStart());
    };
    rec.onerror = (e: Event) => {
      const err = (e as unknown as { error?: string }).error || 'unknown';
      console.warn('[Speech] error:', err);
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        setMessages((m) => [
          ...m,
          {
            role: 'assistant',
            content: "🎤 Mic is blocked. " + getMicUnblockInstructions(),
          },
        ]);
      } else if (err === 'no-speech') {
        setMessages((m) => [
          ...m,
          { role: 'assistant', content: "🎤 Didn't catch that — try again or type it." },
        ]);
      } else if (err !== 'aborted') {
        setMessages((m) => [
          ...m,
          { role: 'assistant', content: "🎤 Voice input not available right now — please type instead." },
        ]);
      }
      setListening(false);
    };
    rec.onend = () => {
      setListening(false);
    };
    try {
      rec.start();
      recognitionRef.current = rec;
      setListening(true);
    } catch (err) {
      console.warn('[Speech] start failed:', err);
      alert('Could not start voice input: ' + (err as Error).message);
      setListening(false);
    }
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = { role: 'user', content: text };
    setMessages((m) => [...m, userMsg]);
    setInput('');
    setLastActivity(Date.now());

    // SHORTCUT: if the user just viewed a product and expresses design intent,
    // immediately open the Design Studio with that product pre-loaded.
    if (focusedProduct && looksLikeDesignIntent(text)) {
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          content: `Opening the Design Studio with the ${focusedProduct.name} now. Let me know if I can help with anything else! 🎨`,
        },
      ]);
      // Give the user a moment to see the message, then navigate
      setTimeout(() => {
        window.location.href = `/design?product=${encodeURIComponent(focusedProduct.ss_id)}`;
      }, 900);
      return;
    }

    // DESIGN STUDIO: when on /design, detect generate-image intent and call AI
    const isOnDesignStudio = location?.pathname?.startsWith('/design');

    if (isOnDesignStudio) {
      // On the design page, EVERY message is a design request by default.
      // No need to detect "generate intent" — the user came here to design.

      if (lastGeneratedPrompt) {
        if (looksLikeGenerateIntent(text) && !looksLikeRefineIntent(text)) {
          // Clearly a new design request — start fresh
          await runDesignGeneration(text, text);
        } else {
          // Refinement of previous design
          const mergedPrompt = `${lastGeneratedPrompt}. Adjustment: ${text}`;
          await runDesignGeneration(mergedPrompt, text);
        }
      } else {
        // First design — generate it
        await runDesignGeneration(text, text);
      }
      return;
    }

    setLoading(true);
    try {
      const history = messages.filter((m) => m !== FAQ_GREETING && m !== DESIGN_GREETING);
      const { reply, products } = await askFaq(text, history);
      setMessages((m) => [...m, { role: 'assistant', content: reply, products }]);
      speakText(reply);
      // If the AI returned fresh products, focus the first one
      if (products && products.length > 0 && products[0]) {
        setFocusedProduct(products[0]);
      }
    } catch (err) {
      setMessages((m) => [...m, {
        role: 'assistant',
        content: "Sorry, I'm having trouble right now. Please call (470) 622-4845 or email kevin@tshirtbrothers.com.",
      }]);
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    resetChat();
  }

  function handleEmailTranscript() {
    const transcript = messages
      .map((m) => `${m.role === 'user' ? 'You' : 'TSB Assistant'}: ${m.content}`)
      .join('\n\n');
    const subject = encodeURIComponent('TShirt Brothers chat transcript');
    const body = encodeURIComponent(transcript + '\n\n---\nSent from tshirtbrothers.com chat');
    window.location.href = `mailto:kevin@tshirtbrothers.com?subject=${subject}&body=${body}`;
  }

  const BOT_IMG = 'https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/tee-bot-nobg.png';

  const TeeCharacter = ({ size = 48 }: { size?: number; waving?: boolean }) => (
    <img src={BOT_IMG} alt="Tee" width={size} style={{ height: 'auto' }} />
  );

  const TeeAvatar = () => (
    <div className="w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
      <img src={BOT_IMG} alt="" className="w-6 h-6 object-contain" />
    </div>
  );

  return (
    <>
      {/* Floating robot — right on desktop, centered on mobile */}
      {!open && !hideFloatingBubble && (
        <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-0">
          {/* Speech bubble */}
          <div className="bg-white border border-orange-200 rounded-2xl px-3 py-1.5 shadow-lg animate-bounce-slow mb-[-4px]">
            <span className="text-xs sm:text-sm font-semibold text-gray-900">
              {hasConversation ? 'I\'m still here!' : 'Hey! Need help? 👋'}
            </span>
          </div>
          {/* Robot button */}
          <button
            onClick={handleOpen}
            aria-label="Chat with Tee"
            className="relative flex items-center justify-center transition-all hover:scale-105 drop-shadow-xl"
          >
            <TeeCharacter size={75} waving={!hasConversation} />
            {hasConversation && (
              <span className="absolute top-2 right-0 bg-blue-500 text-white text-[9px] font-bold w-5 h-5 rounded-full flex items-center justify-center border-2 border-white">
                •
              </span>
            )}
          </button>
        </div>
      )}

      {/* Chat panel */}
      {open && (
        <div className={`fixed z-40 bg-white shadow-2xl border border-gray-200 flex flex-col ${
          location.pathname.startsWith('/design')
            ? 'inset-x-0 bottom-0 top-[45%] rounded-t-2xl sm:inset-auto sm:bottom-5 sm:right-5 sm:w-96 sm:max-h-[600px] sm:rounded-2xl'
            : 'inset-0 sm:inset-auto sm:bottom-5 sm:right-5 sm:w-96 sm:max-h-[600px] sm:rounded-2xl'
        }`}>
          {/* Header */}
          <div className="bg-gradient-to-r from-orange-500 to-orange-600 text-white px-4 py-3 sm:rounded-t-2xl flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm overflow-hidden">
                <TeeCharacter size={28} />
              </div>
              <div>
                <p className="font-semibold text-sm">Tee <span className="text-orange-200 font-normal">· AI Assistant</span></p>
                <p className="text-[11px] text-orange-100 flex items-center gap-1">
                  <span className="inline-block w-2 h-2 bg-green-400 rounded-full"></span>
                  Online — replies in seconds
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  setSpeakEnabled(p => !p);
                  if (!speakEnabled) {
                    // Load voices (some browsers need a user gesture first)
                    window.speechSynthesis?.getVoices();
                  } else {
                    window.speechSynthesis?.cancel();
                  }
                }}
                aria-label={speakEnabled ? 'Mute Tee' : 'Let Tee speak'}
                title={speakEnabled ? 'Mute' : 'Sound on'}
                className={`p-1.5 rounded ${speakEnabled ? 'bg-orange-700' : 'hover:bg-orange-700'}`}
              >
                {speakEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>
              <button
                onClick={handleMinimize}
                aria-label="Minimize chat (keeps conversation)"
                title="Minimize"
                className="p-1.5 hover:bg-orange-700 rounded"
              >
                <Minus className="w-4 h-4" />
              </button>
              <button
                onClick={handleClose}
                aria-label="End chat (clears conversation)"
                title="End chat"
                className="p-1.5 hover:bg-orange-700 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-gray-50">
            {messages.map((m, i) => (
              <div key={i} className="space-y-2">
                {/* Inline product preview "message" */}
                {m.role === 'assistant' && m.content === '__product_preview__' && m.products && m.products[0] ? (
                  <div className="flex justify-start">
                    <div className="w-full max-w-[85%] bg-white border border-orange-300 rounded-2xl rounded-bl-sm shadow-md overflow-hidden">
                      <div className="bg-gray-50 aspect-square flex items-center justify-center p-3">
                        <img
                          src={m.products[0].image_url}
                          alt={m.products[0].name}
                          className="max-w-full max-h-full object-contain"
                        />
                      </div>
                      <div className="p-3 space-y-1">
                        <p className="text-sm font-bold text-gray-900 leading-tight">{m.products[0].name}</p>
                        <p className="text-xs text-gray-500">{m.products[0].brand}</p>
                        {m.products[0].category && (
                          <p className="text-[10px] text-gray-400">{m.products[0].category}</p>
                        )}
                        <button
                          onClick={() => {
                            window.location.href = `/design?product=${encodeURIComponent(m.products![0]!.ss_id)}`;
                          }}
                          className="mt-2 w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2.5 rounded-xl text-sm transition"
                        >
                          🎨 Design this product
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                <div className={`flex items-end gap-1.5 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {m.role === 'assistant' && <TeeAvatar />}
                  <div
                    className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
                      m.role === 'user'
                        ? 'bg-gradient-to-br from-orange-500 to-orange-600 text-white rounded-br-sm shadow-sm'
                        : 'bg-white text-gray-800 border border-gray-200 rounded-bl-sm shadow-sm'
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
                )}
                {/* Generated design image with Add to Canvas button */}
                {m.role === 'assistant' && m.imageUrl && (
                  <div className="flex justify-start">
                    <div className="w-full max-w-[85%] bg-white border border-orange-300 rounded-2xl rounded-bl-sm shadow-md overflow-hidden">
                      <div className="bg-gray-50 aspect-square flex items-center justify-center p-2">
                        <img
                          src={m.imageUrl}
                          alt={m.imagePrompt || 'Generated design'}
                          className="max-w-full max-h-full object-contain"
                        />
                      </div>
                      <div className="p-3 space-y-2">
                        <button
                          onClick={() => {
                            window.dispatchEvent(new CustomEvent('tsb:add-to-canvas', { detail: { imageUrl: m.imageUrl } }));
                            setMessages((msgs) => [
                              ...msgs,
                              { role: 'assistant', content: '✨ Added to your canvas! You can move, resize, and style it in the Design Studio.' },
                            ]);
                          }}
                          className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2.5 rounded-xl text-sm transition"
                        >
                          ✨ Add to Canvas
                        </button>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            disabled={loading}
                            onClick={() => {
                              // Regenerate with the same prompt
                              const promptToReuse = m.imagePrompt || lastGeneratedPrompt;
                              if (promptToReuse) runDesignGeneration(promptToReuse, promptToReuse);
                            }}
                            className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 rounded-xl text-xs disabled:opacity-50"
                          >
                            🔄 Try Again
                          </button>
                          <button
                            disabled={loading}
                            onClick={() => {
                              // Focus the input and pre-fill with a hint so user can type changes
                              if (m.imagePrompt) setLastGeneratedPrompt(m.imagePrompt);
                              setInput('Make it ');
                              // Focus the chat input after a tick so React updates first
                              setTimeout(() => {
                                const el = document.querySelector<HTMLInputElement>('form input[type="text"]');
                                if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
                              }, 50);
                            }}
                            className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 rounded-xl text-xs disabled:opacity-50"
                          >
                            ✏️ Refine
                          </button>
                        </div>
                        <p className="text-[10px] text-gray-500 text-center">
                          Tip: type things like "add stars", "more colorful", "darker", or describe a whole new design.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                {m.role === 'assistant' && m.content !== '__product_preview__' && m.products && m.products.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[10px] text-gray-500 pl-1">
                      Showing {m.products.length} product{m.products.length !== 1 ? 's' : ''} — swipe to see more →
                    </p>
                    <div className="flex gap-2 overflow-x-auto pb-2 snap-x snap-mandatory -mx-4 px-4" style={{ scrollbarWidth: 'thin' }}>
                      {m.products.map((p: CatalogProduct) => {
                        const isFocused = focusedProduct?.ss_id === p.ss_id;
                        return (
                          <button
                            type="button"
                            key={p.id}
                            onClick={() => {
                              setFocusedProduct(p);
                              // Append a preview "message" inline — stays in chat scroll
                              setMessages((msgs) => [
                                ...msgs,
                                { role: 'assistant', content: '__product_preview__', products: [p] },
                              ]);
                              setLastActivity(Date.now());
                            }}
                            className={`flex-shrink-0 w-40 snap-start bg-white border rounded-xl p-2 text-left transition ${
                              isFocused ? 'border-orange-500 ring-2 ring-orange-200 shadow-md' : 'border-gray-200 hover:border-orange-300'
                            }`}
                          >
                            <div className="w-full h-32 bg-gray-50 rounded-lg overflow-hidden flex items-center justify-center mb-2">
                              <img
                                src={p.image_url}
                                alt={p.name}
                                className="w-full h-full object-contain"
                                loading="lazy"
                                onError={(e) => {
                                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            </div>
                            <p className="text-[11px] font-semibold text-gray-900 line-clamp-2 leading-tight min-h-[28px]">{p.name}</p>
                            <p className="text-[9px] text-gray-500 truncate mt-0.5">{p.brand}{p.category ? ' · ' + p.category : ''}</p>
                            <p className="text-[9px] text-orange-600 font-semibold mt-1">Tap to see closer →</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="flex items-end gap-1.5 justify-start">
                <TeeAvatar />
                <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-3 py-2 text-sm text-gray-500 flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Tee is thinking...
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Toolbar */}
          <div className="px-3 py-2 border-t border-gray-100 flex items-center gap-2 text-xs text-gray-500 flex-shrink-0 bg-white">
            <button
              onClick={handleReset}
              className="flex items-center gap-1 hover:text-gray-800"
              title="Start over"
            >
              <RotateCcw className="w-3 h-3" /> Start Over
            </button>
            <span className="text-gray-300">·</span>
            <button
              onClick={handleEmailTranscript}
              className="flex items-center gap-1 hover:text-gray-800"
              title="Email transcript"
            >
              <Mail className="w-3 h-3" /> Email Transcript
            </button>
          </div>

          {/* Input */}
          <form onSubmit={handleSend} className="p-3 border-t border-gray-200 flex gap-2 bg-white sm:rounded-b-2xl flex-shrink-0">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={listening ? 'Listening...' : 'Ask a question...'}
              className="flex-1 border border-gray-200 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              style={{ fontSize: '16px' }}
              disabled={loading}
            />
            {speechSupported && (
              <button
                type="button"
                onClick={toggleListening}
                disabled={loading}
                aria-label={listening ? 'Stop listening' : 'Start voice input'}
                title={listening ? 'Stop listening' : 'Speak your question'}
                className={`rounded-full w-10 h-10 flex items-center justify-center flex-shrink-0 transition-colors ${
                  listening
                    ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }`}
              >
                {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
            )}
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="bg-orange-500 hover:bg-orange-600 text-white rounded-full w-10 h-10 flex items-center justify-center disabled:bg-gray-300 flex-shrink-0 transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>

        </div>
      )}
    </>
  );
}
