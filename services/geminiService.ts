import { GoogleGenAI } from "@google/genai";

const getClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.error("API_KEY is missing from environment variables.");
    return null;
  }
  return new GoogleGenAI({ apiKey });
};

export const improveText = async (text: string, instruction: string): Promise<string | null> => {
  const ai = getClient();
  if (!ai) return null;

  try {
    const model = ai.models;
    const response = await model.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `You are a professional editor assistant. 
      Instruction: ${instruction}
      
      Input Text: "${text}"
      
      Return ONLY the improved text, no explanations.`,
    });

    return response.text?.trim() || null;
  } catch (error) {
    console.error("Gemini API Error:", error);
    return null;
  }
};

export const generateContinuation = async (text: string): Promise<string | null> => {
  const ai = getClient();
  if (!ai) return null;

  try {
    const model = ai.models;
    const response = await model.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Continue the following text in the same style and tone. keep it brief (approx 2 sentences).
      
      Input Text: "${text}"`,
    });

    return response.text?.trim() || null;
  } catch (error) {
    console.error("Gemini API Error:", error);
    return null;
  }
};