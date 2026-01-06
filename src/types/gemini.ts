export type GeminiRole = 'user' | 'model';

export type GeminiInlineData = {
  mime_type: string;
  mimeType?: string;
  data: string;
};

export type GeminiContentPart = {
  text?: string;
  inline_data?: GeminiInlineData;
  inlineData?: GeminiInlineData;
  thought?: boolean;
  thought_signature?: string;
  thoughtSignature?: string;
};

export type GeminiMessage = {
  role: GeminiRole;
  parts: GeminiContentPart[];
};

export type GeminiGenerationConfig = {
  responseModalities: Array<'TEXT' | 'IMAGE'>;
  imageConfig: {
    aspectRatio: string;
    imageSize: string;
  };
};

export type GeminiRequestPayload = {
  contents: GeminiMessage[];
  generationConfig: GeminiGenerationConfig;
  tools?: Array<{ google_search: Record<string, never> }>;
};

export type GeminiCandidate = {
  content?: GeminiMessage;
};

export type GeminiResponse = {
  candidates?: GeminiCandidate[];
  groundingMetadata?: unknown;
};

export type GeminiError = {
  message: string;
  status?: number;
  code?: string;
  details?: unknown;
};

export type GeminiInlineDataInput = {
  data: string;
  mimeType?: string;
};

export type GeminiResult = {
  text: string;
  parts: Array<{ text: string; thought?: boolean }>;
  imageData: string | null;
  thinkingImages: string[];
  groundingMetadata?: unknown;
  history: GeminiMessage[];
};
