export type ChatMode = 'fast' | 'programmer' | 'education' | 'discussion';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  mode?: ChatMode;
  modelSteps?: ModelStep[];
  isStreaming?: boolean;
  metadata?: {
    duration?: number;
  };
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  timestamp: number;
  mode: ChatMode;
}

export interface ModelStep {
  modelName: string;
  status: 'thinking' | 'drafting' | 'reviewing' | 'fixing' | 'complete';
  content?: string;
}
