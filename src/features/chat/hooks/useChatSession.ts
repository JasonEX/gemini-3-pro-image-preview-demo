import { useCallback, useEffect, useReducer, useRef } from 'react';
import { geminiClient } from '../services/geminiClient';
import { openaiClient } from '../services/openaiClient';
import { apiConfig } from '../utils/apiConfig';
import { createSessionId } from '../utils/session';
import { limitUploads, toUploadItems } from '../utils/files';
import type { UploadItem, ChatMessage, ChatMode, AspectRatio, ImageSize } from '../types';
import type { GeminiContentPart, GeminiInlineDataInput, GeminiMessage, GeminiResult } from '@/types/gemini';

const messageId = (): string =>
  (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`);

const now = (): string => new Date().toISOString();

enum ChatRequestKind {
  Edit = 'EDIT',
  Composite = 'COMPOSITE',
  Search = 'SEARCH',
  Generate = 'GENERATE',
}

const INCLUDE_THINKING_STORAGE_KEY = 'gemini_include_thinking';
const FORCE_IMAGE_GUIDANCE_STORAGE_KEY = 'gemini_force_image_guidance';
const CHAT_PERSIST_STORAGE_KEY = 'gemini_chat_persist_v1';

const readIncludeThinking = (): boolean => {
  if (typeof window === 'undefined') return false;

  try {
    const stored = window.localStorage?.getItem(INCLUDE_THINKING_STORAGE_KEY);
    return stored === 'true';
  } catch (error) {
    console.warn('无法从 localStorage 读取 includeThinking 状态：', error);
    return false;
  }
};

const readForceImageGuidance = (): boolean => {
  if (typeof window === 'undefined') return false;

  try {
    const stored = window.localStorage?.getItem(FORCE_IMAGE_GUIDANCE_STORAGE_KEY);
    return stored === 'true';
  } catch (error) {
    console.warn('无法从 localStorage 读取 forceImageGuidance 状态：', error);
    return false;
  }
};

const writeIncludeThinking = (value: boolean): void => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage?.setItem(INCLUDE_THINKING_STORAGE_KEY, String(value));
  } catch (error) {
    console.warn('无法写入 includeThinking 状态到 localStorage：', error);
  }
};

const writeForceImageGuidance = (value: boolean): void => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage?.setItem(FORCE_IMAGE_GUIDANCE_STORAGE_KEY, String(value));
  } catch (error) {
    console.warn('无法写入 forceImageGuidance 状态到 localStorage：', error);
  }
};

export type ChatState = {
  sessionId: string;
  messages: ChatMessage[];
  history: GeminiMessage[];
  prompt: string;
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
  includeThinking: boolean;
  forceImageGuidance: boolean;
  hasSavedConversation: boolean;
  savedConversationAt: string | null;
  uploadedImages: UploadItem[];
  lastImageData: string | null;
  loading: boolean;
};

type PersistedChatPayload = {
  sessionId: string;
  messages: ChatMessage[];
  history: GeminiMessage[];
  prompt: string;
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
  includeThinking: boolean;
  forceImageGuidance: boolean;
  lastImageData: string | null;
};

type PersistedChat = {
  version: 1;
  savedAt: string;
  payload: PersistedChatPayload;
};

const parsePersistedChat = (raw: string): PersistedChat | null => {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as PersistedChat;
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.version !== 1) return null;
    if (!parsed.savedAt || typeof parsed.savedAt !== 'string') return null;
    if (!parsed.payload || typeof parsed.payload !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
};

const readPersistedChat = (): PersistedChat | null => {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage?.getItem(CHAT_PERSIST_STORAGE_KEY) || '';
    return parsePersistedChat(raw);
  } catch (error) {
    console.warn('无法从 localStorage 读取对话记录：', error);
    return null;
  }
};

const slimPersistPayload = (payload: PersistedChatPayload): PersistedChatPayload => {
  const slimMessages = payload.messages.map((m) => ({
    ...m,
    images: undefined,
    imageData: undefined,
    thinkingImages: undefined,
  }));

  const slimHistory = payload.history.map((msg) => ({
    role: msg.role,
    parts: msg.parts
      .filter((p) => typeof p.text === 'string' && p.text.trim().length > 0)
      .map((p) => ({ text: p.text as string })),
  }));

  return {
    ...payload,
    messages: slimMessages,
    history: slimHistory,
    lastImageData: null,
  };
};

const writePersistedChat = (payload: PersistedChatPayload): { savedAt: string; didFallback: boolean } => {
  if (typeof window === 'undefined') return { savedAt: '', didFallback: false };

  const savedAt = new Date().toISOString();
  const full: PersistedChat = { version: 1, savedAt, payload };

  try {
    window.localStorage?.setItem(CHAT_PERSIST_STORAGE_KEY, JSON.stringify(full));
    return { savedAt, didFallback: false };
  } catch {
    try {
      const slim: PersistedChat = { version: 1, savedAt, payload: slimPersistPayload(payload) };
      window.localStorage?.setItem(CHAT_PERSIST_STORAGE_KEY, JSON.stringify(slim));
      return { savedAt, didFallback: true };
    } catch (error2) {
      console.warn('无法写入对话记录到 localStorage：', error2);
      return { savedAt, didFallback: true };
    }
  }
};

const clearPersistedChat = (): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage?.removeItem(CHAT_PERSIST_STORAGE_KEY);
  } catch (error) {
    console.warn('无法清理对话记录：', error);
  }
};

const readSavedConversationMeta = (): { hasSavedConversation: boolean; savedConversationAt: string | null } => {
  const saved = readPersistedChat();
  return { hasSavedConversation: !!saved, savedConversationAt: saved?.savedAt || null };
};

const dataUrlToInlineData = (dataUrl: string): GeminiInlineDataInput | null => {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const match = dataUrl.match(/^data:(.+?);base64,(.*)$/);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
};

const rebuildHistoryFromMessages = (messages: ChatMessage[]): GeminiMessage[] => {
  const history: GeminiMessage[] = [];

  messages.forEach((msg) => {
    if (msg.role === 'system') return;

    if (msg.role === 'user') {
      const parts: GeminiContentPart[] = [];
      if (msg.text) parts.push({ text: msg.text });
      (msg.images || [])
        .map(dataUrlToInlineData)
        .filter(Boolean)
        .forEach((inline) => {
          parts.push({ inline_data: { mime_type: inline!.mimeType || 'image/png', data: inline!.data } });
        });
      history.push({ role: 'user', parts: parts.length ? parts : [{ text: '' }] });
      return;
    }

    // assistant
    const parts: GeminiContentPart[] = [];
    const textParts = (msg.parts || []).filter((p) => p.text && !p.thought).map((p) => p.text);
    if (textParts.length > 0) {
      parts.push({ text: textParts.join('\n\n') });
    } else if (msg.text) {
      parts.push({ text: msg.text });
    }
    if (msg.imageData) {
      parts.push({ inline_data: { mime_type: 'image/png', data: msg.imageData } });
    }
    history.push({ role: 'model', parts: parts.length ? parts : [{ text: '' }] });
  });

  return history;
};

const resolveLastImageData = (messages: ChatMessage[]): string | null => {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m.role === 'assistant' && m.imageData) return m.imageData;
  }
  return null;
};

type ChatAction =
  | { type: 'setPrompt'; payload: string }
  | { type: 'setAspectRatio'; payload: AspectRatio }
  | { type: 'setImageSize'; payload: ImageSize }
  | { type: 'setIncludeThinking'; payload: boolean }
  | { type: 'setForceImageGuidance'; payload: boolean }
  | { type: 'setSavedConversationMeta'; payload: { hasSavedConversation: boolean; savedConversationAt: string | null } }
  | { type: 'restoreSavedConversation'; payload: { savedAt: string; payload: PersistedChatPayload } }
  | { type: 'deleteMessage'; payload: string }
  | { type: 'addUploads'; payload: UploadItem[] }
  | { type: 'removeUpload'; payload: string }
  | { type: 'clearUploads' }
  | { type: 'appendMessage'; payload: ChatMessage }
  | { type: 'setHistory'; payload: GeminiMessage[] }
  | { type: 'setLastImage'; payload: string | null }
  | { type: 'setLoading'; payload: boolean }
  | { type: 'reset' };

const createInitialState = (): ChatState => ({
  sessionId: createSessionId(),
  messages: [],
  history: [],
  prompt: '',
  aspectRatio: '1:1',
  imageSize: '2K',
  includeThinking: readIncludeThinking(),
  forceImageGuidance: readForceImageGuidance(),
  ...readSavedConversationMeta(),
  uploadedImages: [],
  lastImageData: null,
  loading: false,
});

function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'setPrompt':
      return { ...state, prompt: action.payload };
    case 'setAspectRatio':
      return { ...state, aspectRatio: action.payload };
    case 'setImageSize':
      return { ...state, imageSize: action.payload };
    case 'setIncludeThinking':
      return { ...state, includeThinking: action.payload };
    case 'setForceImageGuidance':
      return { ...state, forceImageGuidance: action.payload };
    case 'setSavedConversationMeta':
      return {
        ...state,
        hasSavedConversation: action.payload.hasSavedConversation,
        savedConversationAt: action.payload.savedConversationAt,
      };
    case 'restoreSavedConversation': {
      const { payload, savedAt } = action.payload;
      return {
        ...state,
        sessionId: payload.sessionId || createSessionId(),
        messages: payload.messages || [],
        history: payload.history || [],
        prompt: payload.prompt || '',
        aspectRatio: payload.aspectRatio || '1:1',
        imageSize: payload.imageSize || '2K',
        includeThinking: payload.includeThinking ?? state.includeThinking,
        forceImageGuidance: payload.forceImageGuidance ?? state.forceImageGuidance,
        uploadedImages: [],
        lastImageData: payload.lastImageData || resolveLastImageData(payload.messages || []),
        loading: false,
        hasSavedConversation: true,
        savedConversationAt: savedAt,
      };
    }
    case 'deleteMessage': {
      const nextMessages = state.messages.filter((m) => m.id !== action.payload);
      const nextHistory = rebuildHistoryFromMessages(nextMessages);
      const nextLastImageData = resolveLastImageData(nextMessages);
      return {
        ...state,
        messages: nextMessages,
        history: nextHistory,
        lastImageData: nextLastImageData,
      };
    }
    case 'addUploads':
      return { ...state, uploadedImages: [...state.uploadedImages, ...action.payload] };
    case 'removeUpload':
      return { ...state, uploadedImages: state.uploadedImages.filter((img) => img.id !== action.payload) };
    case 'clearUploads':
      return { ...state, uploadedImages: [] };
    case 'appendMessage':
      return { ...state, messages: [...state.messages, action.payload] };
    case 'setHistory':
      return { ...state, history: action.payload };
    case 'setLastImage':
      return { ...state, lastImageData: action.payload };
    case 'setLoading':
      return { ...state, loading: action.payload };
    case 'reset':
      return createInitialState();
    default:
      return state;
  }
}

const buildUserLabel = (mode: ChatMode, text: string): string => {
  if (mode === 'edit') return `✏️ ${text}`;
  if (mode === 'search') return `🔍 ${text}`;
  return text;
};

const toSystemMessage = (text: string, isError = false): ChatMessage => ({
  id: messageId(),
  role: 'system',
  text,
  isError,
  timestamp: now(),
});

const toUserMessage = (text: string, images: string[]): ChatMessage => ({
  id: messageId(),
  role: 'user',
  text,
  images: images.length > 0 ? images : undefined,
  timestamp: now(),
});

const toAssistantMessage = (response: GeminiResult): ChatMessage => ({
  id: messageId(),
  role: 'assistant',
  text: response.text,
  parts: response.parts?.length ? response.parts : undefined,
  imageData: response.imageData ?? undefined,
  thinkingImages: response.thinkingImages.length ? response.thinkingImages : undefined,
  timestamp: now(),
});

type RequestContext = {
  promptText: string;
  labelledPrompt: string;
  imageDataList: GeminiInlineDataInput[];
  history: GeminiMessage[];
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
  includeThinking: boolean;
  lastImageData: string | null;
};

const getClient = () => {
  const apiType = apiConfig.getType();
  return apiType === 'openai' ? openaiClient : geminiClient;
};

const requestHandlers: Record<ChatRequestKind, (ctx: RequestContext) => Promise<GeminiResult>> = {
  [ChatRequestKind.Edit]: ({ lastImageData, promptText, aspectRatio, imageSize, includeThinking, history }) => {
    if (!lastImageData) {
      return Promise.reject(new Error('没有可编辑的图片'));
    }
    const client = getClient();
    return client.editImage({
      imageData: lastImageData,
      editPrompt: promptText,
      aspectRatio,
      imageSize,
      includeThinking,
      history,
    });
  },
  [ChatRequestKind.Composite]: ({ labelledPrompt, imageDataList, aspectRatio, imageSize, includeThinking, history }) => {
    const client = getClient();
    return client.compositeImages({
      prompt: labelledPrompt,
      imageDataList,
      aspectRatio,
      imageSize,
      includeThinking,
      history,
    });
  },
  [ChatRequestKind.Search]: ({ promptText, aspectRatio, imageSize, includeThinking, history }) => {
    const client = getClient();
    return client.generateWithSearch({
      prompt: promptText,
      aspectRatio,
      imageSize,
      includeThinking,
      history,
    });
  },
  [ChatRequestKind.Generate]: ({ labelledPrompt, aspectRatio, imageSize, includeThinking, history }) => {
    const client = getClient();
    return client.generateImage({
      prompt: labelledPrompt,
      aspectRatio,
      imageSize,
      includeThinking,
      history,
    });
  },
};

const resolveRequestKind = (mode: ChatMode, hasUploads: boolean): ChatRequestKind => {
  if (mode === 'edit') return ChatRequestKind.Edit;
  if (hasUploads) return ChatRequestKind.Composite;
  if (mode === 'search') return ChatRequestKind.Search;
  return ChatRequestKind.Generate;
};

const normalizeFiles = (files?: FileList | File[] | null): File[] => {
  if (!files) return [];
  if (Array.isArray(files)) return files;
  return Array.from(files);
};

export type ChatActions = {
  setPrompt: (value: string) => void;
  setAspectRatio: (value: AspectRatio) => void;
  setImageSize: (value: ImageSize) => void;
  setIncludeThinking: (value: boolean) => void;
  setForceImageGuidance: (value: boolean) => void;
  addUploads: (files?: FileList | File[] | null) => Promise<void>;
  removeUpload: (id: string) => void;
  deleteMessage: (id: string) => void;
  restoreSavedConversation: () => void;
  clearSavedConversation: () => void;
  sendPrompt: (mode?: ChatMode) => Promise<void>;
  reset: () => Promise<void>;
  downloadImage: (base64: string) => void;
};

export type UseChatSessionResult = {
  state: ChatState;
  actions: ChatActions;
};

const FORCE_IMAGE_GUIDANCE_PREFIX =
  '请你根据下面要求直接生成图片，不要回复纯文字。\n' +
  '如果你具备工具调用/函数调用能力，请直接调用系统中“生成图片/绘图/图像生成”等相关工具来产出图片结果；不要只返回文字描述或提示词。';

const applyForceImageGuidance = (prompt: string): string => {
  const trimmedStart = prompt.trimStart();
  if (!trimmedStart) return FORCE_IMAGE_GUIDANCE_PREFIX;

  const firstLine = FORCE_IMAGE_GUIDANCE_PREFIX.split('\n')[0];
  if (trimmedStart.startsWith(firstLine)) return prompt;

  return `${FORCE_IMAGE_GUIDANCE_PREFIX}\n\n${prompt}`;
};

export function useChatSession(): UseChatSessionResult {
  const [state, dispatch] = useReducer(chatReducer, undefined, createInitialState);
  const didPersistRef = useRef(false);

  useEffect(() => {
    if (!didPersistRef.current) {
      didPersistRef.current = true;
      return;
    }

    const hasConversation =
      state.messages.length > 0 || state.history.length > 0 || Boolean(state.lastImageData);

    if (!hasConversation) {
      if (state.hasSavedConversation) {
        clearPersistedChat();
        dispatch({
          type: 'setSavedConversationMeta',
          payload: { hasSavedConversation: false, savedConversationAt: null },
        });
      }
      return;
    }

    const persistedPayload: PersistedChatPayload = {
      sessionId: state.sessionId,
      messages: state.messages,
      history: state.history,
      prompt: state.prompt,
      aspectRatio: state.aspectRatio,
      imageSize: state.imageSize,
      includeThinking: state.includeThinking,
      forceImageGuidance: state.forceImageGuidance,
      lastImageData: state.lastImageData,
    };

    const { savedAt } = writePersistedChat(persistedPayload);
    if (!state.hasSavedConversation || state.savedConversationAt !== savedAt) {
      dispatch({
        type: 'setSavedConversationMeta',
        payload: { hasSavedConversation: true, savedConversationAt: savedAt },
      });
    }
  }, [
    state.sessionId,
    state.messages,
    state.history,
    state.prompt,
    state.aspectRatio,
    state.imageSize,
    state.includeThinking,
    state.forceImageGuidance,
    state.lastImageData,
    state.hasSavedConversation,
    state.savedConversationAt,
  ]);

  const addUploads = useCallback(
    async (files?: FileList | File[] | null) => {
      const incoming = normalizeFiles(files);
      if (incoming.length === 0) return;

      const usableFiles = limitUploads(state.uploadedImages.length, incoming);
      const items = await toUploadItems(usableFiles);

      if (incoming.length > usableFiles.length) {
        dispatch({ type: 'appendMessage', payload: toSystemMessage('最多只能上传 14 张图片', true) });
      }

      dispatch({ type: 'addUploads', payload: items });
    },
    [state.uploadedImages.length]
  );

  const removeUpload = useCallback((id: string) => dispatch({ type: 'removeUpload', payload: id }), []);

  const reset = useCallback(async () => {
    const confirmed = window.confirm('重置对话？这将清除历史记录。');
    if (!confirmed) return;
    clearPersistedChat();
    dispatch({ type: 'reset' });
  }, []);

  const downloadImage = useCallback((base64: string) => {
    const link = document.createElement('a');
    link.href = `data:image/png;base64,${base64}`;
    link.download = `gemini-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  const sendPrompt = useCallback(
    async (mode: ChatMode = 'generate') => {
      const apiType = apiConfig.getType();
      if (apiType === 'openai') {
        if (mode === 'edit' || mode === 'search') {
          dispatch({
            type: 'appendMessage',
            payload: toSystemMessage('OpenAI 兼容模式不支持此功能', true),
          });
          return;
        }
      }

      const trimmedPrompt = state.prompt.trim();
      const promptText = state.forceImageGuidance ? applyForceImageGuidance(trimmedPrompt) : trimmedPrompt;

      if (!trimmedPrompt && mode !== 'edit') return;
      if (mode === 'edit' && !state.lastImageData) {
        dispatch({ type: 'appendMessage', payload: toSystemMessage('没有可编辑的图片', true) });
        return;
      }

      const userText = buildUserLabel(mode, promptText);
      const imageDataList: GeminiInlineDataInput[] = state.uploadedImages.map(({ base64, mimeType }) => ({
        data: base64,
        mimeType,
      }));

      const userMessage = toUserMessage(userText, state.uploadedImages.map((img) => img.dataUrl));

      dispatch({ type: 'appendMessage', payload: userMessage });
      dispatch({ type: 'clearUploads' });
      dispatch({ type: 'setPrompt', payload: '' });
      dispatch({ type: 'setLoading', payload: true });

      // OpenAI 兼容模式下使用安全的默认值，避免不支持的参数影响请求
      const aspectRatio = apiType === 'openai' ? ('1:1' as AspectRatio) : state.aspectRatio;
      const imageSize = apiType === 'openai' ? ('1K' as ImageSize) : state.imageSize;

      const requestKind = resolveRequestKind(mode, imageDataList.length > 0);
      const requestContext: RequestContext = {
        promptText,
        labelledPrompt: userText,
        imageDataList,
        history: state.history,
        aspectRatio,
        imageSize,
        includeThinking: state.includeThinking,
        lastImageData: state.lastImageData,
      };

      try {
        const response = await requestHandlers[requestKind](requestContext);
        const assistantMessage = toAssistantMessage(response);

        dispatch({ type: 'appendMessage', payload: assistantMessage });
        dispatch({ type: 'setHistory', payload: response.history });
        if (response.imageData) {
          dispatch({ type: 'setLastImage', payload: response.imageData });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : '未知错误';
        dispatch({ type: 'appendMessage', payload: toSystemMessage(`错误：${message}`, true) });
      } finally {
        dispatch({ type: 'setLoading', payload: false });
      }
    },
    [
      state.prompt,
      state.uploadedImages,
      state.history,
      state.aspectRatio,
      state.imageSize,
      state.includeThinking,
      state.forceImageGuidance,
      state.lastImageData,
    ]
  );

  return {
    state,
    actions: {
      setPrompt: (value: string) => dispatch({ type: 'setPrompt', payload: value }),
      setAspectRatio: (value: AspectRatio) => dispatch({ type: 'setAspectRatio', payload: value }),
      setImageSize: (value: ImageSize) => dispatch({ type: 'setImageSize', payload: value }),
      setIncludeThinking: (value: boolean) => {
        writeIncludeThinking(value);
        dispatch({ type: 'setIncludeThinking', payload: value });
      },
      setForceImageGuidance: (value: boolean) => {
        writeForceImageGuidance(value);
        dispatch({ type: 'setForceImageGuidance', payload: value });
      },
      addUploads,
      removeUpload,
      deleteMessage: (id: string) => dispatch({ type: 'deleteMessage', payload: id }),
      restoreSavedConversation: () => {
        const saved = readPersistedChat();
        if (!saved) {
          dispatch({ type: 'appendMessage', payload: toSystemMessage('没有找到可加载的历史对话', true) });
          return;
        }
        writeIncludeThinking(saved.payload.includeThinking);
        writeForceImageGuidance(saved.payload.forceImageGuidance);
        dispatch({ type: 'restoreSavedConversation', payload: { savedAt: saved.savedAt, payload: saved.payload } });
      },
      clearSavedConversation: () => {
        clearPersistedChat();
        dispatch({
          type: 'setSavedConversationMeta',
          payload: { hasSavedConversation: false, savedConversationAt: null },
        });
      },
      sendPrompt,
      reset,
      downloadImage,
    },
  };
}
