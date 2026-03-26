import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageSquare, 
  Code, 
  GraduationCap, 
  Zap, 
  Users, 
  Send, 
  Settings, 
  Trash2, 
  ChevronRight,
  ChevronDown,
  LayoutGrid,
  Loader2,
  CheckCircle2,
  Copy,
  Check,
  AlertCircle,
  Key,
  Square
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { cn } from './lib/utils';
import { ChatMode, Message, ModelStep, ChatSession } from './types';
import { GeminiService } from './services/gemini';

export default function App() {
  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem('gemini_api_key') || '');
  const [selectedMode, setSelectedMode] = useState<ChatMode>('fast');
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    const saved = localStorage.getItem('chat_sessions');
    return saved ? JSON.parse(saved) : [];
  });
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(() => {
    const saved = localStorage.getItem('current_session_id');
    return saved || null;
  });
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentSteps, setCurrentSteps] = useState<ModelStep[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isApiKeyValid, setIsApiKeyValid] = useState<boolean | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isModeMenuOpen, setIsModeMenuOpen] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Sync current session messages
  useEffect(() => {
    if (currentSessionId) {
      const session = sessions.find(s => s.id === currentSessionId);
      if (session) {
        setMessages(session.messages);
      }
    } else {
      setMessages([]);
    }
  }, [currentSessionId, sessions]);

  // Persist sessions
  useEffect(() => {
    localStorage.setItem('chat_sessions', JSON.stringify(sessions));
    if (currentSessionId) {
      localStorage.setItem('current_session_id', currentSessionId);
    } else {
      localStorage.removeItem('current_session_id');
    }
  }, [sessions, currentSessionId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, currentSteps]);

  const handleSend = async () => {
    if (!input.trim() || !apiKey || isLoading) return;

    let sessionId = currentSessionId;
    if (!sessionId) {
      sessionId = Date.now().toString();
      const newSession: ChatSession = {
        id: sessionId,
        title: input.slice(0, 30) + (input.length > 30 ? '...' : ''),
        messages: [],
        timestamp: Date.now(),
        mode: selectedMode
      };
      setSessions(prev => [newSession, ...prev]);
      setCurrentSessionId(sessionId);
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: Date.now(),
      mode: selectedMode
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    
    // Update session with user message
    setSessions(prev => prev.map(s => 
      s.id === sessionId ? { ...s, messages: updatedMessages } : s
    ));

    setInput('');
    setIsLoading(true);
    setCurrentSteps([]);
    const requestStartTime = Date.now();
    setStartTime(requestStartTime);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const assistantMessageId = (Date.now() + 1).toString();
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      mode: selectedMode,
      modelSteps: [],
      isStreaming: true
    };

    setMessages(prev => [...prev, assistantMessage]);

    try {
      const gemini = new GeminiService(apiKey);
      let fullContent = '';
      
      const stream = gemini.chatStream(selectedMode, updatedMessages, (step) => {
        setCurrentSteps(prev => {
          const existing = prev.findIndex(s => s.modelName === step.modelName);
          if (existing >= 0) {
            const next = [...prev];
            next[existing] = step;
            return next;
          }
          return [...prev, step];
        });
      }, abortController.signal);

      for await (const chunk of stream) {
        if (abortController.signal.aborted) break;
        fullContent += chunk;
        setMessages(prev => prev.map(m => 
          m.id === assistantMessageId ? { ...m, content: fullContent } : m
        ));
      }

      if (abortController.signal.aborted) {
        setMessages(prev => prev.map(m => 
          m.id === assistantMessageId ? { ...m, isStreaming: false, content: fullContent + "\n\n*[Generation cancelled]*" } : m
        ));
        return;
      }

      const endTime = Date.now();
      const duration = (endTime - requestStartTime) / 1000;

      const finalAssistantMessage: Message = {
        ...assistantMessage,
        content: fullContent,
        isStreaming: false,
        modelSteps: currentSteps,
        metadata: { duration }
      };

      setMessages(prev => prev.map(m => 
        m.id === assistantMessageId ? finalAssistantMessage : m
      ));

      // Update session with assistant message
      setSessions(prev => prev.map(s => 
        s.id === sessionId ? { ...s, messages: [...updatedMessages, finalAssistantMessage] } : s
      ));

    } catch (error: any) {
      console.error(error);
      const errorMessage: Message = {
        id: (Date.now() + 2).toString(),
        role: 'system',
        content: `Error: ${error.message || 'Something went wrong. Please check your API key.'}`,
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setCurrentSteps([]);
      abortControllerRef.current = null;
    }
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const saveApiKey = (key: string) => {
    setApiKey(key);
    localStorage.setItem('gemini_api_key', key);
    setIsApiKeyValid(null);
  };

  const validateKey = async () => {
    if (!apiKey) return;
    setIsValidating(true);
    try {
      const gemini = new GeminiService(apiKey);
      const isValid = await gemini.validateApiKey();
      setIsApiKeyValid(isValid);
    } catch (error) {
      setIsApiKeyValid(false);
    } finally {
      setIsValidating(false);
    }
  };

  const clearChat = () => {
    if (messages.length === 0) return;
    if (confirm('Hapus semua pesan dalam sesi ini?')) {
      if (currentSessionId) {
        const updatedSessions = sessions.map(s => 
          s.id === currentSessionId ? { ...s, messages: [] } : s
        );
        setSessions(updatedSessions);
        setMessages([]);
      }
    }
  };

  const deleteAllSessions = () => {
    if (sessions.length === 0) return;
    if (confirm('Hapus seluruh riwayat chat? Tindakan ini tidak dapat dibatalkan.')) {
      setSessions([]);
      setCurrentSessionId(null);
      setMessages([]);
    }
  };

  const deleteSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm('Hapus sesi ini?')) {
      const updatedSessions = sessions.filter(s => s.id !== id);
      setSessions(updatedSessions);
      if (currentSessionId === id) {
        setCurrentSessionId(null);
        setMessages([]);
      }
    }
  };

  const deleteMessage = (id: string) => {
    const updatedMessages = messages.filter(m => m.id !== id);
    setMessages(updatedMessages);
    if (currentSessionId) {
      setSessions(prev => prev.map(s => 
        s.id === currentSessionId ? { ...s, messages: updatedMessages } : s
      ));
    }
  };

  const newChat = () => {
    setCurrentSessionId(null);
    setSelectedMode('fast');
    setInput('');
  };

  return (
    <div className="flex h-screen h-[100dvh] bg-[#0a0a0a] text-white font-sans overflow-hidden">
      {/* Sidebar */}
      <AnimatePresence mode="wait">
        {isSidebarOpen && (
          <>
            {/* Mobile Overlay */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 md:hidden"
            />
            <motion.aside
              initial={{ x: -300, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -300, opacity: 0 }}
              className="w-72 bg-[#141414] border-r border-white/10 flex flex-col z-40 h-full fixed md:relative shadow-2xl md:shadow-none"
            >
              <div className="p-6 flex items-center gap-3 border-b border-white/5">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                  <Zap className="w-6 h-6 text-white" />
                </div>
                <h1 className="text-xl font-bold tracking-tight">TripleGemini</h1>
              </div>

              <div className="p-4 border-b border-white/5">
                <button 
                  onClick={newChat}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-blue-500 hover:bg-blue-600 rounded-xl transition-all font-semibold shadow-lg shadow-blue-500/20"
                >
                  <MessageSquare className="w-5 h-5" />
                  <span>New Session</span>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-6">
                <section className="flex-1 overflow-hidden flex flex-col">
                  <div className="flex items-center justify-between px-2 mb-3">
                    <label className="text-[10px] uppercase tracking-widest text-white/40 font-bold">
                      Recent Sessions
                    </label>
                    {sessions.length > 0 && (
                      <button 
                        onClick={deleteAllSessions}
                        className="text-[9px] uppercase tracking-tighter text-red-400/60 hover:text-red-400 font-bold transition-colors"
                      >
                        Delete All
                      </button>
                    )}
                  </div>
                  <div className="flex-1 overflow-y-auto px-2 space-y-1 custom-scrollbar">
                    {sessions.map(session => (
                      <button
                        key={session.id}
                        onClick={() => setCurrentSessionId(session.id)}
                        className={cn(
                          "w-full flex items-center justify-between group px-3 py-2.5 rounded-xl transition-all text-left border border-transparent",
                          currentSessionId === session.id 
                            ? "bg-blue-500/10 border-blue-500/20 text-blue-400" 
                            : "hover:bg-white/5 text-white/60 hover:text-white"
                        )}
                      >
                        <div className="flex items-center gap-3 overflow-hidden">
                          <MessageSquare className="w-4 h-4 flex-shrink-0" />
                          <span className="text-xs truncate">{session.title}</span>
                        </div>
                        <Trash2 
                          onClick={(e) => deleteSession(e, session.id)}
                          className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all" 
                        />
                      </button>
                    ))}
                    {sessions.length === 0 && (
                      <p className="text-[10px] text-white/20 text-center py-4 uppercase tracking-widest">No history yet</p>
                    )}
                  </div>
                </section>

                <section>
                  <label className="text-[10px] uppercase tracking-widest text-white/40 font-bold mb-3 block px-2">
                    Configuration
                  </label>
                  <div className="px-2 space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm text-white/60">
                        <div className="flex items-center gap-2">
                          <Key className="w-4 h-4" />
                          <span>Gemini API Key</span>
                        </div>
                        {isApiKeyValid !== null && (
                          <span className={cn(
                            "text-[10px] font-bold uppercase px-1.5 py-0.5 rounded",
                            isApiKeyValid ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                          )}>
                            {isApiKeyValid ? "Valid" : "Invalid"}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <input 
                          type="password"
                          value={apiKey}
                          onChange={(e) => saveApiKey(e.target.value)}
                          placeholder="Enter your API key..."
                          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500/50 transition-colors"
                        />
                        <button 
                          onClick={() => saveApiKey('')}
                          className="p-2 bg-white/5 border border-white/10 rounded-lg hover:bg-red-500/10 hover:text-red-400 transition-colors"
                          title="Clear API Key"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={validateKey}
                          disabled={!apiKey || isValidating}
                          className="p-2 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-50"
                          title="Validate API Key"
                        >
                          {isValidating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>
                </section>
              </div>

              <div className="p-4 border-t border-white/5">
                <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-gray-700 to-gray-600 flex items-center justify-center text-xs font-bold">
                    VZ
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">User Session</p>
                    <p className="text-[10px] text-white/40 uppercase tracking-tighter">Connected</p>
                  </div>
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative min-w-0 h-full overflow-hidden">
        <header className="h-16 flex-shrink-0 border-b border-white/5 flex items-center justify-between px-4 md:px-6 bg-[#0a0a0a]/80 backdrop-blur-xl z-20">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-white/5 rounded-lg transition-colors"
            >
              <ChevronRight className={cn("w-5 h-5 transition-transform", isSidebarOpen && "rotate-180")} />
            </button>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-white/80">TripleGemini AI</span>
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-4">
            <button 
              onClick={clearChat}
              disabled={messages.length === 0}
              className="p-2 hover:bg-red-500/10 text-white/40 hover:text-red-400 rounded-lg transition-colors disabled:opacity-20"
              title="Clear current chat"
            >
              <Trash2 className="w-5 h-5" />
            </button>
            <ModeSelector 
              selectedMode={selectedMode} 
              onSelect={(mode) => {
                setSelectedMode(mode);
                setIsModeMenuOpen(false);
              }}
              isOpen={isModeMenuOpen}
              setIsOpen={setIsModeMenuOpen}
            />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto min-h-0 relative scroll-smooth">
          <div className="max-w-4xl mx-auto w-full p-4 md:p-6">
            {messages.length === 0 ? (
              <div className="min-h-[60vh] flex flex-col items-center justify-center text-center space-y-8 py-12">
                <div className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center mb-4">
                  <MessageSquare className="w-10 h-10 text-white/20" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl md:text-3xl font-bold tracking-tight px-4">How can I help you today?</h2>
                  <p className="text-white/40 leading-relaxed max-w-md mx-auto px-6 text-sm md:text-base">
                    Select a specialized mode and start chatting. 
                    TripleGemini uses collaborative reasoning to provide the best possible answers.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-2xl px-6">
                  <QuickAction icon={<Code />} label="Write a React hook" onClick={() => setInput("Write a custom React hook for local storage management.")} />
                  <QuickAction icon={<Zap />} label="Explain Quantum Physics" onClick={() => setInput("Explain Quantum Physics in simple terms.")} />
                </div>
              </div>
            ) : (
              <div className="space-y-8 pb-12">
                {messages.map((msg) => (
                  <ChatMessage 
                    key={msg.id} 
                    message={msg} 
                    onDelete={() => deleteMessage(msg.id)}
                  />
                ))}
                
                {isLoading && (
                  <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                      <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                    </div>
                    <div className="flex-1 space-y-4">
                      <div className="h-4 bg-white/5 rounded w-1/4 animate-pulse" />
                      <div className="space-y-2">
                        {currentSteps.map((step, i) => (
                          <motion.div 
                            key={i}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/5"
                          >
                            {step.status === 'complete' ? (
                              <CheckCircle2 className="w-4 h-4 text-green-400" />
                            ) : (
                              <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                            )}
                            <div className="flex-1">
                              <p className="text-xs font-medium text-white/80">{step.modelName}</p>
                              <p className="text-[10px] text-white/40 uppercase tracking-widest">{step.status}</p>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </div>

        <div className="flex-shrink-0 p-4 md:p-6 border-t border-white/5 bg-[#0a0a0a]/95 backdrop-blur-md z-20">
          <div className="max-w-4xl mx-auto relative">
            <div className="absolute -top-12 left-0 right-0 flex justify-center pointer-events-none">
              <AnimatePresence>
                {isLoading && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="px-4 py-1 bg-blue-500 text-[10px] font-bold uppercase tracking-widest rounded-full shadow-lg shadow-blue-500/20"
                  >
                    {selectedMode} mode active
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            
            <div className="relative group">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={apiKey ? "Ask anything..." : "Please enter your API key in the sidebar first"}
                disabled={!apiKey || isLoading}
                className="w-full bg-[#1a1a1a] border border-white/10 rounded-2xl px-4 md:px-6 py-4 pr-14 md:pr-16 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all min-h-[56px] max-h-[200px] resize-none shadow-2xl"
                rows={1}
              />
              {isLoading ? (
                <button
                  onClick={handleCancel}
                  className="absolute right-2 md:right-3 bottom-2 md:bottom-3 p-2 md:p-2.5 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-all shadow-lg"
                  title="Cancel generation"
                >
                  <Square className="w-5 h-5 fill-current" />
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || !apiKey}
                  className="absolute right-2 md:right-3 bottom-2 md:bottom-3 p-2 md:p-2.5 bg-white text-black rounded-xl hover:bg-white/90 disabled:opacity-50 disabled:hover:bg-white transition-all shadow-lg"
                >
                  <Send className="w-5 h-5" />
                </button>
              )}
            </div>
            <p className="text-center text-[10px] text-white/20 mt-3 md:mt-4 uppercase tracking-widest">
              Powered by Google Gemini • Multi-Model Collaborative Reasoning
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

function ModeSelector({ selectedMode, onSelect, isOpen, setIsOpen }: any) {
  const modes: { id: ChatMode; label: string; desc: string; icon: any; color: string }[] = [
    { id: 'fast', label: 'Fast', desc: 'Quick response', icon: <Zap className="w-4 h-4" />, color: 'blue' },
    { id: 'programmer', label: 'Coder', desc: 'Code expert', icon: <Code className="w-4 h-4" />, color: 'orange' },
    { id: 'education', label: 'Edu', desc: 'Learn concept', icon: <GraduationCap className="w-4 h-4" />, color: 'green' },
    { id: 'discussion', label: 'Panel', desc: 'Multi-perspective', icon: <Users className="w-4 h-4" />, color: 'purple' },
  ];

  const currentMode = modes.find(m => m.id === selectedMode) || modes[0];

  return (
    <div className="relative">
      {/* Desktop Segmented Control */}
      <div className="hidden lg:flex items-center gap-1 bg-white/5 p-1 rounded-2xl border border-white/10 shadow-inner relative overflow-hidden">
        {modes.map((mode) => (
          <button
            key={mode.id}
            onClick={() => onSelect(mode.id)}
            className={cn(
              "relative z-10 flex flex-col items-start gap-0.5 px-4 py-2 rounded-xl transition-all",
              selectedMode === mode.id ? "text-white" : "text-white/40 hover:text-white/60"
            )}
          >
            <div className="flex items-center gap-2">
              {mode.icon}
              <span className="text-[11px] font-bold uppercase tracking-wider">{mode.label}</span>
            </div>
            <span className="text-[9px] font-medium opacity-60">{mode.desc}</span>
            {selectedMode === mode.id && (
              <motion.div
                layoutId="activeMode"
                className={cn(
                  "absolute inset-0 -z-10 rounded-xl shadow-lg",
                  mode.color === 'blue' && "bg-blue-500 shadow-blue-500/20",
                  mode.color === 'orange' && "bg-orange-500 shadow-orange-500/20",
                  mode.color === 'green' && "bg-green-500 shadow-green-500/20",
                  mode.color === 'purple' && "bg-purple-500 shadow-purple-500/20"
                )}
                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Mobile/Tablet Visual Dropdown */}
      <div className="lg:hidden">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "flex items-center gap-3 px-4 py-2 bg-white/5 border border-white/10 rounded-xl transition-all hover:bg-white/10",
            isOpen && "border-blue-500/50 bg-blue-500/5"
          )}
        >
          <div className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center shadow-lg",
            currentMode.color === 'blue' && "bg-blue-500 shadow-blue-500/20",
            currentMode.color === 'orange' && "bg-orange-500 shadow-orange-500/20",
            currentMode.color === 'green' && "bg-green-500 shadow-green-500/20",
            currentMode.color === 'purple' && "bg-purple-500 shadow-purple-500/20"
          )}>
            {currentMode.icon}
          </div>
          <div className="text-left">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 leading-none mb-1">Mode</p>
            <p className="text-xs font-bold uppercase tracking-wider leading-none">{currentMode.label}</p>
          </div>
          <ChevronDown className={cn("w-4 h-4 text-white/40 transition-transform", isOpen && "rotate-180")} />
        </button>

        <AnimatePresence>
          {isOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsOpen(false)}
                className="fixed inset-0 z-40"
              />
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute right-0 top-full mt-2 w-64 bg-[#141414] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 p-2 space-y-1"
              >
                {modes.map((mode) => (
                  <button
                    key={mode.id}
                    onClick={() => onSelect(mode.id)}
                    className={cn(
                      "w-full flex items-center gap-4 p-3 rounded-xl transition-all text-left group",
                      selectedMode === mode.id ? "bg-white/5 text-white" : "text-white/40 hover:bg-white/5 hover:text-white"
                    )}
                  >
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center transition-all shadow-lg",
                      selectedMode === mode.id
                        ? (mode.color === 'blue' ? "bg-blue-500 shadow-blue-500/20" : 
                           mode.color === 'orange' ? "bg-orange-500 shadow-orange-500/20" : 
                           mode.color === 'green' ? "bg-green-500 shadow-green-500/20" : 
                           "bg-purple-500 shadow-purple-500/20")
                        : "bg-white/5 group-hover:bg-white/10"
                    )}>
                      {React.cloneElement(mode.icon, { className: "w-5 h-5" })}
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider">{mode.label}</p>
                      <p className="text-[10px] font-medium opacity-40">{mode.desc}</p>
                    </div>
                  </button>
                ))}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function QuickAction({ icon, label, onClick }: any) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 p-4 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/5 transition-all text-left group"
    >
      <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center group-hover:bg-white/10 transition-colors">
        {React.cloneElement(icon, { className: "w-5 h-5 text-white/60 group-hover:text-white" })}
      </div>
      <span className="text-sm font-medium text-white/60 group-hover:text-white">{label}</span>
    </button>
  );
}

function CodeBlock({ language, value }: { language: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl overflow-hidden my-6 border border-white/10 group/code bg-[#0d0d0d] shadow-2xl w-full max-w-full">
      <div className="bg-white/5 px-4 py-2.5 text-[10px] uppercase tracking-widest font-bold text-white/40 border-b border-white/10 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500/40" />
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/40" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-500/40" />
          </div>
          <span className="bg-white/5 px-2 py-0.5 rounded text-white/60">{language}</span>
        </div>
        <button 
          onClick={copyToClipboard}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all duration-200",
            copied ? "bg-green-500/20 text-green-400" : "bg-white/5 text-white/40 hover:text-white hover:bg-white/10"
          )}
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          <span className="font-semibold">{copied ? "Copied!" : "Copy"}</span>
        </button>
      </div>
      <div className="overflow-x-auto custom-scrollbar">
        <SyntaxHighlighter
          style={vscDarkPlus}
          language={language}
          PreTag="div"
          customStyle={{ 
            margin: 0, 
            padding: '1.5rem', 
            background: 'transparent',
            fontSize: '0.875rem',
            lineHeight: '1.7',
            fontFamily: '"JetBrains Mono", "Fira Code", monospace'
          }}
        >
          {value}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}

function ChatMessage({ message, onDelete }: { message: Message, onDelete: () => void }) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "flex gap-4 md:gap-6 group",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      <div className={cn(
        "w-8 h-8 md:w-10 md:h-10 rounded-xl md:rounded-2xl flex items-center justify-center flex-shrink-0 shadow-xl",
        isUser ? "bg-white text-black" : 
        isSystem ? "bg-red-500/20 text-red-400" : 
        message.mode === 'discussion' ? "bg-purple-500 text-white" : 
        message.mode === 'programmer' ? "bg-orange-500 text-white" :
        message.mode === 'education' ? "bg-green-500 text-white" :
        "bg-blue-500 text-white"
      )}>
        {isUser ? <Users className="w-4 h-4 md:w-5 md:h-5" /> : 
         isSystem ? <AlertCircle className="w-4 h-4 md:w-5 md:h-5" /> : 
         message.mode === 'discussion' ? <Users className="w-4 h-4 md:w-5 md:h-5" /> : 
         message.mode === 'programmer' ? <Code className="w-4 h-4 md:w-5 md:h-5" /> :
         message.mode === 'education' ? <GraduationCap className="w-4 h-4 md:w-5 md:h-5" /> :
         <Zap className="w-4 h-4 md:w-5 md:h-5" />}
      </div>
      
      <div className={cn(
        "flex-1 max-w-[90%] md:max-w-[85%] space-y-2 min-w-0",
        isUser ? "text-right" : "text-left"
      )}>
        <div className={cn(
          "inline-block max-w-full p-4 md:p-6 rounded-2xl md:rounded-3xl text-sm leading-relaxed shadow-2xl relative overflow-hidden",
          isUser ? "bg-white/5 border border-white/10 rounded-tr-none" : "bg-[#141414] border border-white/5 rounded-tl-none",
          isSystem && "bg-red-500/5 border-red-500/20 text-red-200"
        )}>
          {!isUser && !isSystem && (
            <button 
              onClick={onDelete}
              className="absolute -right-2 -top-2 p-1.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
          <div className="prose prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-transparent prose-pre:p-0 prose-code:text-blue-400 prose-sm md:prose-base">
            <ReactMarkdown
              components={{
                code({ node, inline, className, children, ...props }: any) {
                  const match = /language-(\w+)/.exec(className || '');
                  const codeContent = String(children).replace(/\n$/, '');
                  return !inline && match ? (
                    <CodeBlock language={match[1]} value={codeContent} />
                  ) : (
                    <code className={cn("bg-white/10 px-1.5 py-0.5 rounded text-blue-300 font-mono text-[0.9em]", className)} {...props}>
                      {children}
                    </code>
                  );
                },
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        </div>
        <div className={cn(
          "flex items-center gap-2 text-[10px] text-white/20 uppercase tracking-widest px-2",
          isUser ? "justify-end" : "justify-start"
        )}>
          <span>{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          {message.mode && <span>• {message.mode} mode</span>}
          {message.metadata?.duration && <span>• {message.metadata.duration.toFixed(1)}s</span>}
        </div>
      </div>
    </motion.div>
  );
}
