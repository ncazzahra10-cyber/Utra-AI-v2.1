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
  Loader2,
  CheckCircle2,
  AlertCircle,
  Key
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { cn } from './lib/utils';
import { ChatMode, Message, ModelStep } from './types';
import { GeminiService } from './services/gemini';

export default function App() {
  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem('gemini_api_key') || '');
  const [mode, setMode] = useState<ChatMode>('fast');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentSteps, setCurrentSteps] = useState<ModelStep[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isApiKeyValid, setIsApiKeyValid] = useState<boolean | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, currentSteps]);

  const handleSend = async () => {
    if (!input.trim() || !apiKey || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: Date.now(),
      mode: mode as ChatMode
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setCurrentSteps([]);

    try {
      const gemini = new GeminiService(apiKey);
      const response = await gemini.chat(mode, [...messages, userMessage], (step) => {
        setCurrentSteps(prev => {
          const existing = prev.findIndex(s => s.modelName === step.modelName);
          if (existing >= 0) {
            const next = [...prev];
            next[existing] = step;
            return next;
          }
          return [...prev, step];
        });
      });

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response,
        timestamp: Date.now(),
        mode: mode,
        modelSteps: currentSteps
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error: any) {
      console.error(error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'system',
        content: `Error: ${error.message || 'Something went wrong. Please check your API key.'}`,
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setCurrentSteps([]);
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
    if (confirm('Are you sure you want to delete all messages?')) {
      setMessages([]);
    }
  };

  const newChat = () => {
    setMessages([]);
    setMode('fast');
    setInput('');
  };

  return (
    <div className="flex h-screen bg-[#0a0a0a] text-white font-sans overflow-hidden">
      {/* Sidebar */}
      <AnimatePresence mode="wait">
        {isSidebarOpen && (
          <motion.aside
            initial={{ x: -300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -300, opacity: 0 }}
            className="w-72 bg-[#141414] border-r border-white/10 flex flex-col z-20"
          >
            <div className="p-6 flex items-center gap-3 border-bottom border-white/5">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-xl font-bold tracking-tight">TripleGemini</h1>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              <section>
                <label className="text-[10px] uppercase tracking-widest text-white/40 font-bold mb-3 block px-2">
                  Chat Modes
                </label>
                <div className="space-y-1">
                  <ModeButton 
                    active={mode === 'fast'} 
                    onClick={() => setMode('fast')}
                    icon={<Zap className="w-4 h-4" />}
                    label="Fast Response"
                    description="Quick & efficient answers"
                  />
                  <ModeButton 
                    active={mode === 'programmer'} 
                    onClick={() => setMode('programmer')}
                    icon={<Code className="w-4 h-4" />}
                    label="Programmer"
                    description="Deep code reasoning & review"
                  />
                  <ModeButton 
                    active={mode === 'education'} 
                    onClick={() => setMode('education')}
                    icon={<GraduationCap className="w-4 h-4" />}
                    label="Education"
                    description="Structured learning & concepts"
                  />
                  <ModeButton 
                    active={mode === 'discussion'} 
                    onClick={() => setMode('discussion')}
                    icon={<Users className="w-4 h-4" />}
                    label="Discussion"
                    description="3-model collaborative reasoning"
                  />
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
                        onClick={validateKey}
                        disabled={!apiKey || isValidating}
                        className="p-2 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-50"
                      >
                        {isValidating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <button 
                      onClick={newChat}
                      className="flex items-center justify-center gap-2 px-3 py-2 text-sm bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors font-medium"
                    >
                      <MessageSquare className="w-4 h-4" />
                      <span>New Chat</span>
                    </button>
                    <button 
                      onClick={clearChat}
                      className="flex items-center justify-center gap-2 px-3 py-2 text-sm border border-red-500/20 text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Delete</span>
                    </button>
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
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative min-w-0">
        <header className="h-16 border-b border-white/5 flex items-center justify-between px-6 bg-[#0a0a0a]/80 backdrop-blur-xl z-10">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-white/5 rounded-lg transition-colors"
            >
              <ChevronRight className={cn("w-5 h-5 transition-transform", isSidebarOpen && "rotate-180")} />
            </button>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-white/80 capitalize">{mode} Mode</span>
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button className="p-2 hover:bg-white/5 rounded-lg transition-colors text-white/60">
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-2xl mx-auto space-y-6">
              <div className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center mb-4">
                <MessageSquare className="w-10 h-10 text-white/20" />
              </div>
              <h2 className="text-3xl font-bold tracking-tight">How can I help you today?</h2>
              <p className="text-white/40 leading-relaxed">
                Select a specialized mode from the sidebar and start chatting. 
                TripleGemini uses collaborative reasoning to provide the best possible answers.
              </p>
              <div className="grid grid-cols-2 gap-4 w-full">
                <QuickAction icon={<Code />} label="Write a React hook" onClick={() => setInput("Write a custom React hook for local storage management.")} />
                <QuickAction icon={<Zap />} label="Explain Quantum Physics" onClick={() => setInput("Explain Quantum Physics in simple terms.")} />
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto w-full space-y-8">
              {messages.map((msg) => (
                <ChatMessage key={msg.id} message={msg} />
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

        <div className="p-6 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a] to-transparent">
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
                    Processing with {mode} mode...
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
                className="w-full bg-[#141414] border border-white/10 rounded-2xl px-6 py-4 pr-16 text-sm focus:outline-none focus:border-white/20 transition-all min-h-[60px] max-h-[200px] resize-none shadow-2xl"
                rows={1}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || !apiKey || isLoading}
                className="absolute right-3 bottom-3 p-2.5 bg-white text-black rounded-xl hover:bg-white/90 disabled:opacity-50 disabled:hover:bg-white transition-all shadow-lg"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
            <p className="text-center text-[10px] text-white/20 mt-4 uppercase tracking-widest">
              Powered by Google Gemini • Multi-Model Collaborative Reasoning
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

function ModeButton({ active, onClick, icon, label, description }: any) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 p-3 rounded-xl transition-all group",
        active ? "bg-white/10 text-white" : "text-white/40 hover:bg-white/5 hover:text-white/60"
      )}
    >
      <div className={cn(
        "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
        active ? "bg-blue-500 text-white" : "bg-white/5 group-hover:bg-white/10"
      )}>
        {icon}
      </div>
      <div className="text-left flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-[10px] truncate opacity-60">{description}</p>
      </div>
    </button>
  );
}

function QuickAction({ icon, label, onClick }: any) {
  return (
    <button 
      onClick={onClick}
      className="flex items-center gap-3 p-4 bg-white/5 border border-white/5 rounded-2xl hover:bg-white/10 hover:border-white/10 transition-all text-left group"
    >
      <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform">
        {React.cloneElement(icon, { className: "w-5 h-5 text-white/40" })}
      </div>
      <span className="text-sm font-medium text-white/60">{label}</span>
    </button>
  );
}

function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "flex gap-6",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      <div className={cn(
        "w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-xl",
        isUser ? "bg-white text-black" : 
        isSystem ? "bg-red-500/20 text-red-400" : 
        message.mode === 'discussion' ? "bg-purple-500 text-white" : 
        message.mode === 'programmer' ? "bg-orange-500 text-white" :
        message.mode === 'education' ? "bg-green-500 text-white" :
        "bg-blue-500 text-white"
      )}>
        {isUser ? <Users className="w-5 h-5" /> : 
         isSystem ? <AlertCircle className="w-5 h-5" /> : 
         message.mode === 'discussion' ? <Users className="w-5 h-5" /> : 
         message.mode === 'programmer' ? <Code className="w-5 h-5" /> :
         message.mode === 'education' ? <GraduationCap className="w-5 h-5" /> :
         <Zap className="w-5 h-5" />}
      </div>
      
      <div className={cn(
        "flex-1 max-w-[85%] space-y-2",
        isUser ? "text-right" : "text-left"
      )}>
        <div className={cn(
          "inline-block p-6 rounded-3xl text-sm leading-relaxed shadow-2xl",
          isUser ? "bg-white/5 border border-white/10 rounded-tr-none" : "bg-[#141414] border border-white/5 rounded-tl-none",
          isSystem && "bg-red-500/5 border-red-500/20 text-red-200"
        )}>
          <div className="prose prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-black/50 prose-pre:border prose-pre:border-white/10 prose-code:text-blue-400">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        </div>
        <p className="text-[10px] text-white/20 uppercase tracking-widest px-2">
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          {message.mode && ` • ${message.mode} mode`}
        </p>
      </div>
    </motion.div>
  );
}
