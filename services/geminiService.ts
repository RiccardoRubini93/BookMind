import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Chapter, AnalysisType } from "../types";

// Initialize the API client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Using gemini-2.0-flash-exp as it is currently the most capable multimodal model available
const MODEL_NAME = "gemini-2.0-flash-exp";

export const identifyChapters = async (pdfText: string, pdfBase64?: string): Promise<Chapter[]> => {
  try {
    const parts: any[] = [];
    let prompt = "";

    if (pdfBase64) {
      // OCR Mode / Visual Mode
      prompt = `Analyze this PDF document. Look at the Table of Contents and the initial pages to identify the main chapters.
      If there is no explicit Table of Contents, scan the document structure to identify logical chapter divisions.`;
      
      parts.push({
        inlineData: {
          mimeType: "application/pdf",
          data: pdfBase64
        }
      });
      parts.push({ text: prompt });
    } else {
      // Text Mode
      const textContext = pdfText.substring(0, 60000);
      prompt = `Analyze the beginning of this book (Table of Contents and initial pages) and identify the main chapters.
      
      Text Context:
      ${textContext}`;
      parts.push({ text: prompt });
    }

    parts.push({ text: `Return a list of chapters with their number, exact title found in the text, and a very brief description inferred from the title or context.` });

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              number: { type: Type.STRING, description: "Chapter number (e.g., '1', 'I', 'One')" },
              title: { type: Type.STRING, description: "Exact title of the chapter" },
              description: { type: Type.STRING, description: "Brief description of what this chapter might be about (1 sentence)" }
            },
            required: ["number", "title", "description"]
          }
        }
      }
    });

    if (response.text) {
      return JSON.parse(response.text) as Chapter[];
    }
    throw new Error("No data returned from AI");
  } catch (error) {
    console.error("Gemini Chapter Identification Error:", error);
    throw error;
  }
};

export const analyzeChapterContent = async (
  chapterTitle: string,
  chapterText: string | null,
  type: AnalysisType,
  pdfBase64?: string
): Promise<string> => {
  
  let systemInstruction = "You are an expert literary analyst and educational assistant.";
  let specificPrompt = "";

  // Tailor prompt based on analysis type
  switch (type) {
    case AnalysisType.DETAILED:
      specificPrompt = `Provide a detailed analysis including:
      1. Key Concepts & Main Ideas (Bullet points)
      2. Detailed Summary of arguments
      3. Significant Examples mentioned
      4. Core Conclusions`;
      break;
    case AnalysisType.INSIGHTS:
      specificPrompt = `Focus on insights and application:
      1. Key Insights (What is the hidden meaning?)
      2. Practical Applications (How can this be used?)
      3. Connections to other disciplines or modern context
      4. Thought-provoking quotes`;
      break;
    case AnalysisType.CRITICAL:
      specificPrompt = `Provide a critical review:
      1. Executive Summary
      2. Strengths of the argument
      3. Weaknesses or Logical Gaps
      4. Open Questions for further research`;
      break;
    case AnalysisType.STANDARD:
    default:
      specificPrompt = `Provide a standard, comprehensive summary of the chapter. Keep it clear, concise, and easy to read.`;
      break;
  }

  const parts: any[] = [];

  // Lowered threshold to 100 characters to support short chapters/poems
  if (chapterText && chapterText.length > 100) {
    // Text Mode: We have the specific text for this chapter
    const mainPrompt = `Analyze the content for Chapter: "${chapterTitle}".
    
    ${specificPrompt}
    
    Text Content:
    ${chapterText}`;
    
    parts.push({ text: mainPrompt });
  } else if (pdfBase64) {
    // Visual/OCR Mode: We pass the whole PDF and ask Gemini to find it
    // Note: Passing the whole PDF every time can be heavy, but it ensures we get the content for scanned docs.
    const mainPrompt = `I am providing the full PDF of the book. 
    1. LOCATE the chapter titled "${chapterTitle}".
    2. Read that chapter using your vision/OCR capabilities (ignoring other chapters).
    3. Perform the following analysis:
    
    ${specificPrompt}`;
    
    parts.push({
      inlineData: {
        mimeType: "application/pdf",
        data: pdfBase64
      }
    });
    parts.push({ text: mainPrompt });
  } else {
    throw new Error("Insufficient content to analyze. Neither text nor PDF data provided.");
  }

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: { parts },
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.3,
      }
    });

    return response.text || "Could not generate summary.";
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    throw error;
  }
};

// Helper to clean text for TTS
const prepareTextForSpeech = (text: string): string => {
  return text
    .replace(/\*\*/g, '')          // Remove bold
    .replace(/\*/g, '')            // Remove italics
    .replace(/#{1,6}\s?/g, '')     // Remove headers
    .replace(/`/g, '')             // Remove code blocks
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove links but keep text
    .replace(/^\s*[-•]\s/gm, ', ') // Replace bullet points with commas for flow
    .replace(/\n+/g, '. ')         // Replace newlines with full stops for pauses
    .substring(0, 2000);           // Strict character limit to prevent 500 errors
};

export const generateSpeech = async (text: string): Promise<string> => {
  try {
    // Truncate text if it's too long for a single TTS request (approx limit)
    // Strip markdown to avoid reading special characters
    const safeText = prepareTextForSpeech(text);

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: safeText }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      throw new Error("No audio data returned");
    }
    return base64Audio;
  } catch (error) {
    console.error("Gemini TTS Error:", error);
    throw error;
  }
};

export const generateSlide = async (chapterTitle: string, analysisText: string): Promise<string> => {
  try {
    const prompt = `Create a high-quality, 16:9 infographic-style presentation slide for a book chapter titled "${chapterTitle}".
    The visual should abstractly represent the following key themes from the chapter:
    ${analysisText.substring(0, 500)}...

    Style: Professional, minimal text, vector art or high-quality illustration, educational, clean background.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: { parts: [{ text: prompt }] },
      config: {
        imageConfig: {
          aspectRatio: "16:9",
        }
      }
    });

    // Iterate to find image part
    for (const candidate of response.candidates || []) {
      for (const part of candidate.content?.parts || []) {
        if (part.inlineData && part.inlineData.data) {
          return part.inlineData.data;
        }
      }
    }
    throw new Error("No image generated");
  } catch (error) {
    console.error("Gemini Slide Generation Error:", error);
    throw error;
  }
};