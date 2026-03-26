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

  private async discussionResponse(prompt: string, onStep?: (step: any) => void): Promise<string> {
    onStep?.({ status: 'thinking', modelName: 'Discussion' });
    
    const [pro, flash, lite] = await Promise.all([
      this.ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `Provide a deep, reasoned perspective on: ${prompt}`,
        config: { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
      }),
      this.ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Provide a quick, factual summary on: ${prompt}`,
        config: { tools: [{ googleSearch: {} }] }
      }),
      this.ai.models.generateContent({
        model: "gemini-3.1-flash-lite-preview",
        contents: `Provide a concise, practical take on: ${prompt}`
      })
    ]);

    onStep?.({ status: 'drafting', modelName: 'Synthesis' });
    const synthesis = await this.ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: `Synthesize a final, best answer for the user based on these 3 internal perspectives:
      1. Deep Reasoned: ${pro.text}
      2. Factual Summary: ${flash.text}
      3. Practical Take: ${lite.text}
      
      User's original query: ${prompt}`,
      config: {
        systemInstruction: "You are the moderator of a panel of 3 expert AI models. Your goal is to combine their insights into the single best possible answer for the user."
      }
    });

    onStep?.({ status: 'complete', modelName: 'Discussion' });
    return synthesis.text || "Failed to synthesize response";
  }

  async chat(
    mode: ChatMode,
    messages: Message[],
    onStep?: (step: any) => void
  ): Promise<string> {
    const lastMessage = messages[messages.length - 1].content;
    
    switch (mode) {
      case 'fast':
        return this.fastResponse(lastMessage);
      case 'programmer':
        return this.programmerResponse(lastMessage, onStep);
      case 'education':
        return this.educationResponse(lastMessage);
      case 'discussion':
        return this.discussionResponse(lastMessage, onStep);
      default:
        return this.fastResponse(lastMessage);
    }
  }

  private async fastResponse(prompt: string): Promise<string> {
    const response = await this.ai.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }]
      }
    });
    return response.text || "No response";
  }

  private async educationResponse(prompt: string): Promise<string> {
    // 3 models discussion simulation for education
    // Model 1: Concept Explainer (Flash)
    // Model 2: Practical Example (Lite)
    // Model 3: Critical Thinker (Pro)
    
    const [explainer, example, critic] = await Promise.all([
      this.ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Explain this concept simply: ${prompt}`,
        config: { tools: [{ googleSearch: {} }] }
      }),
      this.ai.models.generateContent({
        model: "gemini-3.1-flash-lite-preview",
        contents: `Give a practical example for: ${prompt}`
      }),
      this.ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `What are the common misconceptions or advanced nuances about: ${prompt}`,
        config: { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
      })
    ]);

    const synthesis = await this.ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: `Synthesize a comprehensive educational response based on these 3 perspectives:
      1. Explanation: ${explainer.text}
      2. Example: ${example.text}
      3. Nuances: ${critic.text}
      
      User's original query: ${prompt}`,
      config: {
        systemInstruction: "You are an expert educator. Combine the provided perspectives into a clear, structured lesson."
      }
    });

    return synthesis.text || "Failed to synthesize response";
  }

  private async programmerResponse(prompt: string, onStep?: (step: any) => void): Promise<string> {
    // Programmer mode: Think -> Draft -> Check -> Fix loop
    
    onStep?.({ status: 'thinking', modelName: 'Gemini Pro' });
    const plan = await this.ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: `Create a detailed implementation plan for: ${prompt}`,
      config: { thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH } }
    });

    onStep?.({ status: 'drafting', modelName: 'Gemini Pro', content: plan.text });
    const codeDraft = await this.ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: `Based on this plan: ${plan.text}, write the complete code for: ${prompt}`,
    });

    let currentCode = codeDraft.text || "";
    let iterations = 0;
    const maxIterations = 3;

    while (iterations < maxIterations) {
      onStep?.({ status: 'reviewing', modelName: 'Gemini Pro', content: currentCode });
      const review = await this.ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `Review this code for errors, bugs, or inefficiencies: \n\n${currentCode}\n\nReturn a JSON object with exactly two fields: 'hasErrors' (boolean) and 'feedback' (string). If no errors, 'hasErrors' should be false.`,
        config: { 
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

      onStep?.({ status: 'fixing', modelName: 'Gemini Pro', content: reviewData.feedback });
      const fixedCode = await this.ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `Fix the following code based on this feedback: ${reviewData.feedback}\n\nCode:\n${currentCode}`,
      });
      currentCode = fixedCode.text || currentCode;
      iterations++;
    }

    onStep?.({ status: 'complete', modelName: 'Gemini Pro' });
    return currentCode;
  }
}
