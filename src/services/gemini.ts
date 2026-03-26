import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import { ChatMode, Message } from "../types";

export class GeminiService {
  private ai: GoogleGenAI;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async validateApiKey(): Promise<boolean> {
    try {
      await this.ai.models.generateContent({
        model: "gemini-3.1-flash-lite-preview",
        contents: "Hi",
      });
      return true;
    } catch (error) {
      console.error("API Key Validation Error:", error);
      return false;
    }
  }

  async *chatStream(
    mode: ChatMode,
    messages: Message[],
    onStep?: (step: any) => void,
    signal?: AbortSignal
  ): AsyncGenerator<string> {
    const history = messages.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    }));
    
    const lastMessage = messages[messages.length - 1].content;
    const languageInstruction = "IMPORTANT: You MUST respond in the same language as the user's query.";
    
    if (signal?.aborted) return;

    switch (mode) {
      case 'fast':
        yield* this.fastResponseStream(lastMessage, history, languageInstruction, signal);
        break;
      case 'programmer':
        yield* this.programmerResponseStream(lastMessage, history, languageInstruction, onStep, signal);
        break;
      case 'education':
        yield* this.educationResponseStream(lastMessage, history, languageInstruction, signal);
        break;
      case 'discussion':
        yield* this.discussionResponseStream(lastMessage, history, languageInstruction, onStep, signal);
        break;
      default:
        yield* this.fastResponseStream(lastMessage, history, languageInstruction, signal);
    }
  }

  private async *fastResponseStream(prompt: string, history: any[], languageInstruction: string, signal?: AbortSignal): AsyncGenerator<string> {
    const response = await this.ai.models.generateContentStream({
      model: "gemini-3.1-flash-lite-preview",
      contents: history,
      config: {
        systemInstruction: languageInstruction,
        tools: [{ googleSearch: {} }]
      }
    });
    for await (const chunk of response) {
      if (signal?.aborted) break;
      yield chunk.text || "";
    }
  }

  private async *educationResponseStream(prompt: string, history: any[], languageInstruction: string, signal?: AbortSignal): AsyncGenerator<string> {
    if (signal?.aborted) return;
    const [explainer, example, critic] = await Promise.all([
      this.ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: history,
        config: { 
          systemInstruction: `${languageInstruction}\n\nYou are the Concept Explainer. Explain the user's query simply.`,
          tools: [{ googleSearch: {} }] 
        }
      }),
      this.ai.models.generateContent({
        model: "gemini-3.1-flash-lite-preview",
        contents: history,
        config: { 
          systemInstruction: `${languageInstruction}\n\nYou are the Practical Example expert. Provide a real-world example for the user's query.`
        }
      }),
      this.ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: history,
        config: { 
          systemInstruction: `${languageInstruction}\n\nYou are the Critical Thinker. Discuss misconceptions or advanced nuances about the user's query.`
        }
      })
    ]);

    if (signal?.aborted) return;

    const synthesis = await this.ai.models.generateContentStream({
      model: "gemini-3-flash-preview",
      contents: `Synthesize a comprehensive educational response based on these 3 perspectives:
      1. Explanation: ${explainer.text}
      2. Example: ${example.text}
      3. Nuances: ${critic.text}
      
      User's original query: ${prompt}`,
      config: {
        systemInstruction: `${languageInstruction}\n\nYou are an expert educator. Combine the provided perspectives into a clear, structured lesson.`
      }
    });

    for await (const chunk of synthesis) {
      if (signal?.aborted) break;
      yield chunk.text || "";
    }
  }

  private async *programmerResponseStream(prompt: string, history: any[], languageInstruction: string, onStep?: (step: any) => void, signal?: AbortSignal): AsyncGenerator<string> {
    if (signal?.aborted) return;
    onStep?.({ status: 'thinking', modelName: 'Gemini Flash' });
    const plan = await this.ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: history,
      config: { 
        systemInstruction: `${languageInstruction}\n\nYou are a senior software architect. Create a detailed implementation plan for the user's query.`
      }
    });

    if (signal?.aborted) return;
    onStep?.({ status: 'drafting', modelName: 'Gemini Flash', content: plan.text });
    const codeDraft = await this.ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Based on this plan: ${plan.text}, write the complete code for: ${prompt}`,
      config: { systemInstruction: languageInstruction }
    });

    let currentCode = codeDraft.text || "";
    let iterations = 0;
    const maxIterations = 2; // Reduced for free tier

    while (iterations < maxIterations) {
      if (signal?.aborted) return;
      onStep?.({ status: 'reviewing', modelName: 'Gemini Flash', content: currentCode });
      const review = await this.ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Review this code for errors, bugs, or inefficiencies: \n\n${currentCode}\n\nReturn a JSON object with exactly two fields: 'hasErrors' (boolean) and 'feedback' (string). If no errors, 'hasErrors' should be false.`,
        config: { 
          systemInstruction: languageInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              hasErrors: { type: Type.BOOLEAN },
              feedback: { type: Type.STRING }
            },
            required: ["hasErrors", "feedback"]
          }
        }
      });

      const reviewData = JSON.parse(review.text || '{"hasErrors": false}');
      if (!reviewData.hasErrors) break;

      if (signal?.aborted) return;
      onStep?.({ status: 'fixing', modelName: 'Gemini Flash', content: reviewData.feedback });
      const fixedCode = await this.ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Fix the following code based on this feedback: ${reviewData.feedback}\n\nCode:\n${currentCode}`,
        config: { systemInstruction: languageInstruction }
      });
      currentCode = fixedCode.text || currentCode;
      iterations++;
    }

    if (signal?.aborted) return;
    onStep?.({ status: 'complete', modelName: 'Gemini Flash' });
    
    // Final stream of the result
    const finalStream = await this.ai.models.generateContentStream({
      model: "gemini-3-flash-preview",
      contents: `Present this final code clearly with explanations: \n\n${currentCode}`,
      config: { systemInstruction: languageInstruction }
    });

    for await (const chunk of finalStream) {
      if (signal?.aborted) break;
      yield chunk.text || "";
    }
  }

  private async *discussionResponseStream(prompt: string, history: any[], languageInstruction: string, onStep?: (step: any) => void, signal?: AbortSignal): AsyncGenerator<string> {
    if (signal?.aborted) return;
    onStep?.({ status: 'thinking', modelName: 'Discussion' });
    
    const [pro, flash, lite] = await Promise.all([
      this.ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: history,
        config: { 
          systemInstruction: `${languageInstruction}\n\nProvide a deep, reasoned perspective on the user's query.`
        }
      }),
      this.ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: history,
        config: { 
          systemInstruction: `${languageInstruction}\n\nProvide a quick, factual summary on the user's query.`,
          tools: [{ googleSearch: {} }] 
        }
      }),
      this.ai.models.generateContent({
        model: "gemini-3.1-flash-lite-preview",
        contents: history,
        config: { 
          systemInstruction: `${languageInstruction}\n\nProvide a concise, practical take on the user's query.`
        }
      })
    ]);

    if (signal?.aborted) return;
    onStep?.({ status: 'drafting', modelName: 'Synthesis' });
    const synthesis = await this.ai.models.generateContentStream({
      model: "gemini-3-flash-preview",
      contents: `Synthesize a final, best answer for the user based on these 3 internal perspectives:
      1. Deep Reasoned: ${pro.text}
      2. Factual Summary: ${flash.text}
      3. Practical Take: ${lite.text}
      
      User's original query: ${prompt}`,
      config: {
        systemInstruction: `${languageInstruction}\n\nYou are the moderator of a panel of 3 expert AI models. Your goal is to combine their insights into the single best possible answer for the user.`
      }
    });

    for await (const chunk of synthesis) {
      if (signal?.aborted) break;
      yield chunk.text || "";
    }

    onStep?.({ status: 'complete', modelName: 'Discussion' });
  }
}
