import { apiConfig } from '../utils/apiConfig';
import { DEFAULT_REQUEST_TIMEOUT_MS, requestWithMode } from './request';

import type {
  GeminiContentPart,
  GeminiInlineData,
  GeminiInlineDataInput,
  GeminiMessage,
  GeminiRequestPayload,
  GeminiResponse,
  GeminiResult,
} from '@/types/gemini';

const buildModelPath = (model: string): string => `/v1beta/models/${model}:generateContent`;

export class GeminiClientError extends Error {
  status?: number;
  code?: string;
  details?: unknown;
  cause?: unknown;

  constructor(message: string, options: { status?: number; code?: string; details?: unknown; cause?: unknown } = {}) {
    super(message);
    this.name = 'GeminiClientError';
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
    this.cause = options.cause;
  }
}

type GeminiCallParams = {
  prompt: string;
  history?: GeminiMessage[];
  images?: GeminiInlineDataInput[];
  aspectRatio?: string;
  imageSize?: string;
  includeThinking?: boolean;
  useSearch?: boolean;
};

const normalizeBaseUrl = (url: string) => url.replace(/\/$/, '');

const getModelPath = (): string => {
  const model = apiConfig.getGeminiModel().trim();
  return buildModelPath(model || 'gemini-3-pro-image-preview');
};

const getThoughtSignature = (part?: GeminiContentPart): string | undefined => part?.thoughtSignature;

const normalizeInlineData = (inlineData: GeminiInlineData): GeminiInlineData => ({
  data: inlineData.data,
  mimeType: inlineData.mimeType || 'image/png',
});

const cloneHistory = (history: GeminiMessage[] = []): GeminiMessage[] =>
  history.map((message) => ({
    role: message.role,
    parts: (message.parts || []).map((part) => {
      const normalized: GeminiContentPart = {};

      if (typeof part.text === 'string') {
        normalized.text = part.text;
      }

      if (part.inlineData?.data) {
        normalized.inlineData = normalizeInlineData(part.inlineData);
      }

      if (part.thought === true) {
        normalized.thought = true;
      }

      if (part.thoughtSignature) {
        normalized.thoughtSignature = part.thoughtSignature;
      }

      return normalized;
    }),
  }));

const buildUserMessage = (prompt: string, images: GeminiInlineDataInput[] = []): GeminiMessage => {
  const parts: GeminiContentPart[] = [{ text: prompt }];
  images.forEach(({ data, mimeType }) => {
    if (!data) return;
    parts.push({
      inlineData: normalizeInlineData({ data, mimeType: mimeType || 'image/png' }),
    });
  });

  return { role: 'user', parts };
};

const getInlineData = (part?: GeminiContentPart): GeminiInlineData | undefined => part?.inlineData;

const isImageInlineData = (inlineData?: GeminiInlineData): boolean => {
  const mimeType = (inlineData?.mimeType || '').toLowerCase();
  return mimeType.startsWith('image/');
};

const validateHistoryThoughtSignatures = (history: GeminiMessage[]): void => {
  history.forEach((message, messageIndex) => {
    if (message.role !== 'model') return;

    const parts = message.parts || [];
    const hasNonThoughtImage = parts.some((part) => {
      if (part.thought) return false;
      const inlineData = getInlineData(part);
      return Boolean(inlineData?.data && isImageInlineData(inlineData));
    });
    if (!hasNonThoughtImage) return;

    // Gemini 3 image generation/editing: signatures are validated strictly.
    // They are guaranteed on the first non-thought part and every image part, and must be passed back next turn.
    const firstNonThoughtIndex = parts.findIndex((part) => part.thought !== true);
    if (firstNonThoughtIndex >= 0) {
      const signature = getThoughtSignature(parts[firstNonThoughtIndex]);
      if (!signature) {
        throw new GeminiClientError(
          `历史记录中存在缺失 thoughtSignature 的模型内容 part（content #${messageIndex + 1}, part #${firstNonThoughtIndex + 1}）。` +
            `请清空对话或删除该条模型消息后重试。`
        );
      }
    }

    parts.forEach((part, partIndex) => {
      if (part.thought) return;
      const inlineData = getInlineData(part);
      if (!inlineData?.data || !isImageInlineData(inlineData)) return;

      const signature = getThoughtSignature(part);
      if (signature) return;

      throw new GeminiClientError(
        `历史记录中存在缺失 thoughtSignature 的模型图片 part（content #${messageIndex + 1}, part #${partIndex + 1}）。` +
          `请清空对话或删除该条模型消息后重试。`
      );
    });
  });
};

const extractText = (response: GeminiResponse): string => {
  const parts = response.candidates?.[0]?.content?.parts || [];
  const textSegments = parts
    .filter((part) => typeof part.text === 'string')
    .map((part) => part.text as string);

  return textSegments.length > 0 ? textSegments.join('\n\n') : '';
};

const extractImageData = (response: GeminiResponse): string | null => {
  const parts = response.candidates?.[0]?.content?.parts || [];
  let lastImage: string | null = null;
  let lastNonThoughtImage: string | null = null;
  for (const part of parts) {
    const inlineData = getInlineData(part);
    if (inlineData?.data) {
      lastImage = inlineData.data;
      if (!part.thought) {
        lastNonThoughtImage = inlineData.data;
      }
    }
  }
  return lastNonThoughtImage || lastImage;
};

const extractThinkingImages = (response: GeminiResponse): string[] => {
  const thinkingImages: string[] = [];
  const parts = response.candidates?.[0]?.content?.parts || [];
  parts.forEach((part) => {
    if (!part.thought) return;
    const inlineData = getInlineData(part);
    if (inlineData?.data) {
      thinkingImages.push(inlineData.data);
    }
  });
  return thinkingImages;
};

const extractTextParts = (response: GeminiResponse): Array<{ text: string; thought?: boolean }> => {
  const candidateParts = response.candidates?.[0]?.content?.parts || [];
  return candidateParts
    .filter((part) => typeof part.text === 'string')
    .map((part) => ({ text: part.text as string, ...(part.thought ? { thought: true } : {}) }));
};

const buildAssistantMessageFromResponse = (response: GeminiResponse): GeminiMessage | null => {
  const content = response.candidates?.[0]?.content;
  if (!content || !Array.isArray(content.parts)) return null;

  return {
    role: 'model',
    parts: cloneHistory([{ role: 'model', parts: content.parts }])[0].parts,
  };
};

const extractGroundingMetadata = (response: GeminiResponse): unknown => {
  const candidates = response.candidates || [];
  for (const candidate of candidates) {
    if (candidate && 'groundingMetadata' in candidate && candidate.groundingMetadata !== undefined) {
      return candidate.groundingMetadata;
    }
  }

  return response.groundingMetadata;
};

const toGeminiError = (status: number, body: unknown): GeminiClientError => {
  if (body && typeof body === 'object' && 'error' in (body as Record<string, unknown>)) {
    const payload = (body as { error?: { message?: string; status?: string; code?: string } }).error;
    const message = payload?.message || '请求失败';
    return new GeminiClientError(message, {
      status,
      code: payload?.status || payload?.code,
      details: body,
    });
  }

  if (typeof body === 'string' && body.trim().length > 0) {
    return new GeminiClientError(body, { status, details: body });
  }

  return new GeminiClientError('请求失败', { status, details: body });
};

const parseResponse = async (response: Response): Promise<GeminiResponse> => {
  const text = await response.text();

  let parsed: unknown = {};
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!response.ok) {
    throw toGeminiError(response.status, parsed);
  }

  return (parsed || {}) as GeminiResponse;
};

const requestGemini = async (payload: GeminiRequestPayload, apiKey: string, baseUrl: string): Promise<GeminiResponse> => {
  try {
    const response = await requestWithMode({
      url: `${normalizeBaseUrl(baseUrl)}${getModelPath()}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: payload,
      timeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
    });

    return parseResponse(response);
  } catch (error) {
    if (error instanceof GeminiClientError) {
      throw error;
    }
    if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') {
      throw new GeminiClientError('请求超时（已等待 20 分钟）', { details: error });
    }
    throw new GeminiClientError('网络请求失败', { details: error });
  }
};

const callGeminiApi = async ({
  prompt,
  images = [],
  history = [],
  aspectRatio = '1:1',
  imageSize = '2K',
  includeThinking = false,
  useSearch = false,
}: GeminiCallParams): Promise<GeminiResult> => {
  const baseUrl = apiConfig.getUrl();
  const apiKey = apiConfig.getKey();

  if (!baseUrl || !apiKey) {
    throw new GeminiClientError('请先配置 API URL 和 Key');
  }

  const safeHistory = cloneHistory(history);
  validateHistoryThoughtSignatures(safeHistory);
  const userMessage = buildUserMessage(prompt, images);
  const contents = [...safeHistory, userMessage];

  const payload: GeminiRequestPayload = {
    contents,
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: {
        aspectRatio,
        imageSize,
      },
    },
  };

  if (useSearch) {
    payload.tools = [{ google_search: {} }];
  }

  const response = await requestGemini(payload, apiKey, baseUrl);
  const assistantMessage = buildAssistantMessageFromResponse(response);
  const updatedHistory: GeminiMessage[] = assistantMessage ? [...contents, assistantMessage] : contents;

  return {
    text: extractText(response),
    parts: extractTextParts(response),
    imageData: extractImageData(response),
    thinkingImages: includeThinking ? extractThinkingImages(response) : [],
    groundingMetadata: extractGroundingMetadata(response),
    history: updatedHistory,
  };
};

export const geminiClient = {
  generateImage: ({
    prompt,
    aspectRatio,
    imageSize,
    includeThinking,
    history,
  }: Omit<GeminiCallParams, 'images' | 'useSearch'>) =>
    callGeminiApi({ prompt, aspectRatio, imageSize, includeThinking, history }),

  editImage: ({
    imageData,
    editPrompt,
    aspectRatio,
    imageSize,
    includeThinking,
    history,
  }: {
    imageData: string;
    editPrompt: string;
  } & Omit<GeminiCallParams, 'prompt' | 'images' | 'useSearch'>) =>
    callGeminiApi({
      prompt: editPrompt,
      images: [{ data: imageData, mimeType: 'image/png' }],
      aspectRatio,
      imageSize,
      includeThinking,
      history,
    }),

  compositeImages: ({
    prompt,
    imageDataList,
    aspectRatio,
    imageSize,
    includeThinking,
    history,
  }: {
    prompt: string;
    imageDataList: GeminiInlineDataInput[];
  } & Omit<GeminiCallParams, 'images' | 'useSearch'>) =>
    callGeminiApi({
      prompt,
      images: imageDataList,
      aspectRatio,
      imageSize,
      includeThinking,
      history,
    }),

  generateWithSearch: ({
    prompt,
    aspectRatio,
    imageSize,
    includeThinking,
    history,
  }: Omit<GeminiCallParams, 'images' | 'useSearch'>) =>
    callGeminiApi({
      prompt,
      aspectRatio,
      imageSize,
      includeThinking,
      history,
      useSearch: true,
    }),
};
