const API_URL_KEY = 'gemini_api_url';
const API_KEY_KEY = 'gemini_api_key';
const API_TYPE_KEY = 'api_type';
const REQUEST_MODE_KEY = 'request_mode';

// Legacy key (backward compatibility)
export const STORAGE_KEY_MODEL = 'chat_model';

const GEMINI_MODEL_KEY = 'gemini_model';
const OPENAI_MODEL_KEY = 'openai_model';
const OPENAI_MODEL_LIST_KEY = 'openai_model_list';

// OpenAI 兼容模式的预设模型列表
export const OPENAI_PRESET_MODELS = [
  'gemini-3-pro-image-preview',
  'gemini-3-pro-preview-image',
  'gemini-3-pro-image-preview-high',
  'gemini-3-pro-image-preview-1k',
] as const;

export type GeminiModelName = string;
export type OpenAIModelName = string;

// Backward compatibility: historically, "ModelName" was a union of a hardcoded list.
export type ModelName = string;

const DEFAULT_GEMINI_MODEL = 'gemini-3-pro-image-preview';
const DEFAULT_OPENAI_MODEL: OpenAIModelName = 'gemini-3-pro-image-preview';

export type ApiType = 'gemini' | 'openai';
export type RequestMode = 'client' | 'server';

const isApiType = (value: unknown): value is ApiType => value === 'gemini' || value === 'openai';
const isRequestMode = (value: unknown): value is RequestMode => value === 'client' || value === 'server';

const safeGetItem = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const safeSetItem = (key: string, value: string): boolean => {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

const safeRemoveItem = (key: string): boolean => {
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
};

const normalizeModelName = (model: string): string => model.trim();

const normalizeModelList = (list: unknown): string[] => {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const item of list) {
    if (typeof item !== 'string') continue;
    const value = item.trim();
    if (!value) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    normalized.push(value);
  }

  return normalized;
};

const tryReadOpenAIModelList = (): { ok: boolean; list: string[] } => {
  const raw = safeGetItem(OPENAI_MODEL_LIST_KEY);
  if (!raw) return { ok: true, list: [] };

  try {
    return { ok: true, list: normalizeModelList(JSON.parse(raw)) };
  } catch {
    return { ok: false, list: [] };
  }
};

let didMigrateLegacyModel = false;
const migrateLegacyModelIfNeeded = () => {
  if (didMigrateLegacyModel) return;
  didMigrateLegacyModel = true;

  const legacyRaw = safeGetItem(STORAGE_KEY_MODEL);
  if (!legacyRaw) return;

  const legacyModel = legacyRaw.trim();
  if (!legacyModel) {
    safeRemoveItem(STORAGE_KEY_MODEL);
    return;
  }

  const existingGeminiModel = safeGetItem(GEMINI_MODEL_KEY)?.trim();
  const existingOpenAIModel = safeGetItem(OPENAI_MODEL_KEY)?.trim();
  const hasAnyNewModelValue = !!(existingGeminiModel || existingOpenAIModel);

  let didWriteAny = false;
  if (!existingGeminiModel) {
    didWriteAny = safeSetItem(GEMINI_MODEL_KEY, legacyModel) || didWriteAny;
  }
  if (!existingOpenAIModel) {
    didWriteAny = safeSetItem(OPENAI_MODEL_KEY, legacyModel) || didWriteAny;
  }

  const { ok, list } = tryReadOpenAIModelList();
  if (ok && !list.includes(legacyModel)) {
    didWriteAny = setOpenAIModelList([...list, legacyModel]) || didWriteAny;
  }

  if (hasAnyNewModelValue || didWriteAny) {
    safeRemoveItem(STORAGE_KEY_MODEL);
  }
};

const getGeminiModel = (): GeminiModelName => {
  migrateLegacyModelIfNeeded();
  const model = safeGetItem(GEMINI_MODEL_KEY);
  const normalized = model ? normalizeModelName(model) : '';
  return normalized || DEFAULT_GEMINI_MODEL;
};

const setGeminiModel = (model: string): void => {
  const normalized = normalizeModelName(model);
  if (!normalized) return;
  safeSetItem(GEMINI_MODEL_KEY, normalized);
};

const getOpenAIModelList = (): string[] => {
  const { list } = tryReadOpenAIModelList();
  // 如果列表为空，返回预设列表
  return list.length > 0 ? list : [...OPENAI_PRESET_MODELS];
};

const setOpenAIModelList = (models: string[]): boolean => {
  return safeSetItem(OPENAI_MODEL_LIST_KEY, JSON.stringify(models));
};

const addOpenAIModel = (model: string): void => {
  const normalized = normalizeModelName(model);
  if (!normalized) return;

  const list = getOpenAIModelList();
  if (list.includes(normalized)) return;

  setOpenAIModelList([...list, normalized]);
};

const removeOpenAIModel = (model: string): void => {
  const normalized = normalizeModelName(model);
  if (!normalized) return;

  const list = getOpenAIModelList();
  const nextList = list.filter((item) => item !== normalized);
  setOpenAIModelList(nextList);

  const currentModel = safeGetItem(OPENAI_MODEL_KEY)?.trim();
  if (currentModel && currentModel === normalized) {
    const fallback = nextList[0] || DEFAULT_OPENAI_MODEL;
    safeSetItem(OPENAI_MODEL_KEY, fallback);
  }
};

const updateOpenAIModel = (oldModel: string, newModel: string): void => {
  const oldNormalized = normalizeModelName(oldModel);
  const newNormalized = normalizeModelName(newModel);
  if (!oldNormalized || !newNormalized) return;

  const list = getOpenAIModelList();
  if (!list.includes(oldNormalized)) return;

  const nextList: string[] = [];
  for (const item of list) {
    const nextItem = item === oldNormalized ? newNormalized : item;
    if (nextList.includes(nextItem)) continue;
    nextList.push(nextItem);
  }

  setOpenAIModelList(nextList);

  const currentModel = safeGetItem(OPENAI_MODEL_KEY)?.trim();
  if (currentModel && currentModel === oldNormalized) {
    safeSetItem(OPENAI_MODEL_KEY, newNormalized);
  }
};

const getOpenAIModel = (): OpenAIModelName => {
  migrateLegacyModelIfNeeded();
  const model = safeGetItem(OPENAI_MODEL_KEY);
  const normalized = model ? normalizeModelName(model) : '';
  if (normalized) return normalized;

  const list = getOpenAIModelList();
  return list[0] || DEFAULT_OPENAI_MODEL;
};

const setOpenAIModel = (model: string): void => {
  const normalized = normalizeModelName(model);
  if (!normalized) return;
  safeSetItem(OPENAI_MODEL_KEY, normalized);
};

// Backward compatibility (existing imports): MODEL_LIST is no longer hardcoded.
// Prefer `apiConfig.getOpenAIModelList()` for new code.
export const MODEL_LIST: ReadonlyArray<string> = new Proxy([] as string[], {
  get(_target, prop) {
    const list = getOpenAIModelList();
    const value = (list as unknown as Record<PropertyKey, unknown>)[prop];
    return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(list) : value;
  },
  ownKeys() {
    return Reflect.ownKeys(getOpenAIModelList());
  },
  getOwnPropertyDescriptor(_target, prop) {
    return Object.getOwnPropertyDescriptor(getOpenAIModelList(), prop);
  },
});

export type ApiConfig = {
  getUrl: () => string;
  getKey: () => string;
  getType: () => ApiType;
  /**
   * API 请求发起方式：客户端直连 or 服务端转发，用于解决 CORS
   */
  getRequestMode: () => RequestMode;

  /**
   * Gemini 模型：支持预设列表选择和自定义模型输入
   */
  getGeminiModel: () => GeminiModelName;
  setGeminiModel: (model: string) => void;

  /**
   * OpenAI 模型：使用独立 key 存储当前选择
   */
  getOpenAIModel: () => OpenAIModelName;
  setOpenAIModel: (model: string) => void;

  /**
   * OpenAI 模型列表（localStorage CRUD）
   */
  getOpenAIModelList: () => string[];
  addOpenAIModel: (model: string) => void;
  removeOpenAIModel: (model: string) => void;
  updateOpenAIModel: (oldModel: string, newModel: string) => void;

  /**
   * Backward compatibility: aliases to the current ApiType model getter/setter.
   */
  getModel: () => ModelName;
  setModel: (model: ModelName) => void;

  setUrl: (url: string) => void;
  setKey: (key: string) => void;
  setType: (type: ApiType) => void;
  setRequestMode: (mode: RequestMode) => void;
  isConfigured: () => boolean;
  clear: () => void;
};

export const apiConfig: ApiConfig = {
  getUrl: () => safeGetItem(API_URL_KEY) || '',
  getKey: () => safeGetItem(API_KEY_KEY) || '',
  getType: () => {
    const stored = safeGetItem(API_TYPE_KEY);
    return isApiType(stored) ? stored : 'gemini';
  },
  getRequestMode: () => {
    const stored = safeGetItem(REQUEST_MODE_KEY);
    return isRequestMode(stored) ? stored : 'client';
  },

  getGeminiModel,
  setGeminiModel,

  getOpenAIModel,
  setOpenAIModel,

  getOpenAIModelList,
  addOpenAIModel,
  removeOpenAIModel,
  updateOpenAIModel,

  getModel: () => (apiConfig.getType() === 'openai' ? getOpenAIModel() : getGeminiModel()),
  setModel: (model: ModelName) => {
    if (apiConfig.getType() === 'openai') {
      setOpenAIModel(model);
      return;
    }
    setGeminiModel(model);
  },

  setUrl: (url: string) => {
    const normalized = url.trim();
    safeSetItem(API_URL_KEY, normalized);
  },
  setKey: (key: string) => {
    const normalized = key.trim();
    safeSetItem(API_KEY_KEY, normalized);
  },
  setType: (type: ApiType) => {
    safeSetItem(API_TYPE_KEY, type);
  },
  setRequestMode: (mode: RequestMode) => {
    safeSetItem(REQUEST_MODE_KEY, mode);
  },
  isConfigured: () => !!(safeGetItem(API_URL_KEY) && safeGetItem(API_KEY_KEY)),
  clear: () => {
    safeRemoveItem(API_URL_KEY);
    safeRemoveItem(API_KEY_KEY);
    safeRemoveItem(API_TYPE_KEY);
    safeRemoveItem(REQUEST_MODE_KEY);

    safeRemoveItem(STORAGE_KEY_MODEL);
    safeRemoveItem(GEMINI_MODEL_KEY);
    safeRemoveItem(OPENAI_MODEL_KEY);
    safeRemoveItem(OPENAI_MODEL_LIST_KEY);
  },
};
