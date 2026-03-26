export type ChatMode = 'fast' | 'programmer' | 'education' | 'discussion';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  mode?: ChatMode;
  modelSteps?: ModelStep[];
}

export interface ModelStep {
  modelName: string;
  status: 'thinking' | 'drafting' | 'reviewing' | 'fixing' | 'complete';
  content?: string;
}
