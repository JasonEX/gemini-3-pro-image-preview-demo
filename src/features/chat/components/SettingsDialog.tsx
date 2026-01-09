import { useMemo, useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { apiConfig, type ApiType, type RequestMode } from '../utils/apiConfig';
import { allowedProxyBaseUrls, isAllowedProxyTargetUrl } from '@/config/proxyAllowlist';

type SettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [url, setUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiType, setApiType] = useState<ApiType>('gemini');
  const [requestMode, setRequestMode] = useState<RequestMode>(apiConfig.getRequestMode());
  const [pendingRequestMode, setPendingRequestMode] = useState<RequestMode | null>(null);
  const [riskDialogOpen, setRiskDialogOpen] = useState(false);
  const [error, setError] = useState('');

  // Gemini 模型配置
  const [geminiModel, setGeminiModel] = useState('');

  const [openAIModels, setOpenAIModels] = useState<string[]>([]);
  const [newOpenAIModel, setNewOpenAIModel] = useState('');
  const [openAIAddError, setOpenAIAddError] = useState('');

  const [editingOpenAIModel, setEditingOpenAIModel] = useState<string | null>(null);
  const [editingOpenAIModelValue, setEditingOpenAIModelValue] = useState('');
  const [openAIEditError, setOpenAIEditError] = useState('');

  const [deleteConfirmModel, setDeleteConfirmModel] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setUrl(apiConfig.getUrl() || 'https://www.packyapi.com');
      setApiKey(apiConfig.getKey());
      setApiType(apiConfig.getType());
      setRequestMode(apiConfig.getRequestMode());
      setPendingRequestMode(null);
      setRiskDialogOpen(false);
      setError('');

      // Gemini 模型
      setGeminiModel(apiConfig.getGeminiModel());

      setOpenAIModels(apiConfig.getOpenAIModelList());
      setNewOpenAIModel('');
      setOpenAIAddError('');
      setEditingOpenAIModel(null);
      setEditingOpenAIModelValue('');
      setOpenAIEditError('');
      setDeleteConfirmModel(null);
    }
  }, [open]);

  useEffect(() => {
    if (apiType !== 'openai') {
      setNewOpenAIModel('');
      setOpenAIAddError('');
      setEditingOpenAIModel(null);
      setEditingOpenAIModelValue('');
      setOpenAIEditError('');
      setDeleteConfirmModel(null);
    }
  }, [apiType]);

  const handleSave = () => {
    if (!url.trim()) {
      setError('请输入 API URL');
      return;
    }
    if (!apiKey.trim()) {
      setError('请输入 API Key');
      return;
    }
    apiConfig.setUrl(url.trim());
    apiConfig.setKey(apiKey.trim());
    apiConfig.setType(apiType);
    apiConfig.setRequestMode(requestMode);
    // 保存 Gemini 模型
    if (geminiModel.trim()) {
      apiConfig.setGeminiModel(geminiModel.trim());
    }
    onOpenChange(false);
  };

  const handleReset = () => {
    apiConfig.clear();
    setUrl('https://www.packyapi.com');
    setApiKey('');
    setApiType('gemini');
    setRequestMode(apiConfig.getRequestMode());
    setPendingRequestMode(null);
    setRiskDialogOpen(false);
    setError('');

    // 重置 Gemini 模型为默认值
    setGeminiModel(apiConfig.getGeminiModel());

    setOpenAIModels([]);
    setNewOpenAIModel('');
    setOpenAIAddError('');
    setEditingOpenAIModel(null);
    setEditingOpenAIModelValue('');
    setOpenAIEditError('');
    setDeleteConfirmModel(null);
  };

  const getApiPathHint = () => {
    if (apiType === 'gemini') {
      return `${url || '{url}'}/v1beta/models/${geminiModel || '{model}'}:generateContent`;
    }
    return `${url || '{url}'}/v1/chat/completions`;
  };

  const displayRequestMode = pendingRequestMode ?? requestMode;
  const serverUrlAllowed = url.trim().length === 0 ? false : isAllowedProxyTargetUrl(url.trim());

  const requestModeDescription =
    displayRequestMode === 'server'
      ? '由本服务端代您转发请求，可绕过浏览器 CORS，但 Key 会随请求发给服务端；且仅允许白名单域名，详见 proxy.allowlist.json。'
      : '浏览器直接请求 API，可能遇到 CORS，局域网/内网分享时尤为常见。';

  const handleRequestModeChange = (next: RequestMode) => {
    if (next === requestMode) return;

    if (next === 'server') {
      setPendingRequestMode('server');
      setRiskDialogOpen(true);
      return;
    }

    setPendingRequestMode(null);
    setRequestMode('client');
    apiConfig.setRequestMode('client');
  };

  const confirmServerMode = () => {
    setRiskDialogOpen(false);
    setPendingRequestMode(null);
    setRequestMode('server');
    apiConfig.setRequestMode('server');
  };

  const cancelServerMode = () => {
    setRiskDialogOpen(false);
    setPendingRequestMode(null);
    setRequestMode('client');
    apiConfig.setRequestMode('client');
  };

  const normalizedOpenAIModels = useMemo(() => openAIModels.map((item) => item.trim()).filter(Boolean), [openAIModels]);

  const refreshOpenAIModels = () => setOpenAIModels(apiConfig.getOpenAIModelList());

  const startEditingModel = (modelName: string) => {
    setEditingOpenAIModel(modelName);
    setEditingOpenAIModelValue(modelName);
    setOpenAIEditError('');
  };

  const cancelEditingModel = () => {
    setEditingOpenAIModel(null);
    setEditingOpenAIModelValue('');
    setOpenAIEditError('');
  };

  const submitNewModel = () => {
    const normalized = newOpenAIModel.trim();
    if (!normalized) {
      setOpenAIAddError('请输入模型名称');
      return;
    }
    if (normalizedOpenAIModels.includes(normalized)) {
      setOpenAIAddError('模型名称已存在');
      return;
    }

    apiConfig.addOpenAIModel(normalized);
    refreshOpenAIModels();
    setNewOpenAIModel('');
    setOpenAIAddError('');
  };

  const submitEditModel = () => {
    if (!editingOpenAIModel) return;

    const oldName = editingOpenAIModel.trim();
    const nextName = editingOpenAIModelValue.trim();

    if (!nextName) {
      setOpenAIEditError('请输入模型名称');
      return;
    }

    if (nextName === oldName) {
      cancelEditingModel();
      return;
    }

    if (normalizedOpenAIModels.includes(nextName)) {
      setOpenAIEditError('模型名称已存在');
      return;
    }

    apiConfig.updateOpenAIModel(oldName, nextName);
    refreshOpenAIModels();
    cancelEditingModel();
  };

  const confirmDeleteModel = () => {
    if (!deleteConfirmModel) return;
    apiConfig.removeOpenAIModel(deleteConfirmModel);
    refreshOpenAIModels();
    if (editingOpenAIModel === deleteConfirmModel) cancelEditingModel();
    setDeleteConfirmModel(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>设置</DialogTitle>
          <DialogDescription>
            管理您的应用首选项和 API 连接
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4">
          {/* API 配置 */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground">API 配置</h3>
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="api-type">API 类型</Label>
                <Select value={apiType} onValueChange={(value: ApiType) => setApiType(value)}>
                  <SelectTrigger id="api-type" className="w-full">
                    <SelectValue placeholder="选择 API 类型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gemini">Gemini (原生格式)</SelectItem>
                    <SelectItem value="openai">OpenAI 兼容格式</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {apiType === 'gemini'
                    ? '使用 Gemini 原生 API 格式，支持图片生成和编辑'
                    : '使用 OpenAI 兼容 API 格式，适用于普通 Chat 对话'}
                </p>
              </div>

              {/* Gemini 模型 ID 输入 */}
              {apiType === 'gemini' && (
                <div className="space-y-2">
                  <Label htmlFor="gemini-model">模型 ID</Label>
                  <Input
                    id="gemini-model"
                    value={geminiModel}
                    onChange={(e) => setGeminiModel(e.target.value)}
                    placeholder="gemini-3-pro-image-preview"
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground">
                    输入 Gemini 模型名称，如 gemini-3-pro-image-preview
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="api-url">API URL</Label>
                <Input
                  id="api-url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://www.packyapi.com"
                  className="w-full"
                />
                <div className="flex flex-wrap gap-2 pt-1">
                  {allowedProxyBaseUrls.map((baseUrl) => (
                    <Button
                      key={baseUrl}
                      type="button"
                      size="sm"
                      variant={url.trim() === baseUrl ? 'secondary' : 'outline'}
                      className="h-7 px-2 text-xs"
                      onClick={() => setUrl(baseUrl)}
                      title={`使用 ${baseUrl}`}
                    >
                      {baseUrl.replace(/^https:\/\//, '')}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  请求地址：{getApiPathHint()}
                </p>
                {displayRequestMode === 'server' && url.trim() && !serverUrlAllowed && (
                  <p className="text-xs text-destructive">
                    当前 URL 不在服务端转发白名单中（请改用上方快捷选项，或修改 proxy.allowlist.json 后重新部署）。
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="api-key">API Key</Label>
                <Input
                  id="api-key"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="输入您的 API Key"
                />
                <p className="text-xs text-muted-foreground">
                  {apiType === 'gemini'
                    ? 'Key 将通过 x-goog-api-key 头部发送'
                    : 'Key 将通过 Authorization: Bearer 头部发送'}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="request-mode">请求方式</Label>
                <Select value={displayRequestMode} onValueChange={(value: RequestMode) => handleRequestModeChange(value)}>
                  <SelectTrigger id="request-mode">
                    <SelectValue placeholder="选择请求方式" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="client">客户端直连</SelectItem>
                    <SelectItem value="server">服务端转发</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{requestModeDescription}</p>
              </div>
            </div>
          </div>

          {apiType === 'openai' && (
            <div className="pt-6 space-y-4">
              <Separator />
              <div className="space-y-1">
                <h3 className="text-sm font-medium text-muted-foreground">OpenAI 模型管理</h3>
                <p className="text-xs text-muted-foreground">
                  管理可选模型列表（用于聊天栏下拉选择），变更将立即写入 localStorage。
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="openai-model-new">新增模型</Label>
                <div className="flex gap-2">
                  <Input
                    id="openai-model-new"
                    value={newOpenAIModel}
                    onChange={(e) => {
                      setNewOpenAIModel(e.target.value);
                      if (openAIAddError) setOpenAIAddError('');
                    }}
                    placeholder="例如：gpt-4o-mini"
                    className="h-9"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') submitNewModel();
                    }}
                  />
                  <Button type="button" variant="secondary" className="h-9" onClick={submitNewModel}>
                    <Plus className="h-4 w-4 mr-2" />
                    新增
                  </Button>
                </div>
                {openAIAddError && <p className="text-xs text-destructive">{openAIAddError}</p>}
              </div>

              <div className="rounded-lg border overflow-hidden">
                <div className="bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  当前模型列表
                </div>
                {openAIModels.length === 0 ? (
                  <div className="px-3 py-3 text-sm text-muted-foreground">
                    暂无模型，请先添加一个（例如 gpt-4o-mini）。
                  </div>
                ) : (
                  <div className="divide-y">
                    {openAIModels.map((item) => {
                      const isEditing = editingOpenAIModel === item;
                      return (
                        <div key={item} className="flex items-center gap-2 px-3 py-2">
                          <div className="min-w-0 flex-1">
                            {isEditing ? (
                              <div className="space-y-1">
                                <Input
                                  value={editingOpenAIModelValue}
                                  onChange={(e) => {
                                    setEditingOpenAIModelValue(e.target.value);
                                    if (openAIEditError) setOpenAIEditError('');
                                  }}
                                  className="h-8"
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') submitEditModel();
                                    if (e.key === 'Escape') cancelEditingModel();
                                  }}
                                />
                                {openAIEditError && <p className="text-xs text-destructive">{openAIEditError}</p>}
                              </div>
                            ) : (
                              <div className="truncate text-sm font-mono text-foreground">{item}</div>
                            )}
                          </div>

                          <div className="flex items-center gap-1">
                            {isEditing ? (
                              <>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={submitEditModel}
                                  title="保存"
                                >
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={cancelEditingModel}
                                  title="取消"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => startEditingModel(item)}
                                  title="编辑"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                  onClick={() => setDeleteConfirmModel(item)}
                                  title="删除"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {error && (
            <p className="mt-4 text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleReset}>
            重置
          </Button>
          <Button onClick={handleSave}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* 删除模型确认 */}
      <Dialog
        open={!!deleteConfirmModel}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setDeleteConfirmModel(null);
        }}
      >
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>删除模型</DialogTitle>
            <DialogDescription>
              确认删除该模型吗？删除后会立即从列表中移除。
            </DialogDescription>
          </DialogHeader>
          <div className="text-sm">
            <span className="text-muted-foreground">模型：</span>
            <span className="font-mono">{deleteConfirmModel ?? ''}</span>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteConfirmModel(null)}>
              取消
            </Button>
            <Button variant="destructive" onClick={confirmDeleteModel}>
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 切换到服务端转发的风险提示 */}
      <Dialog
        open={riskDialogOpen}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) cancelServerMode();
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>切换到服务端转发</DialogTitle>
            <DialogDescription>
              该模式可解决浏览器直连的 CORS/跨域问题，但存在 Key 传输风险。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>
              服务端<strong>不会保存</strong>您的 Key，但为了代您发起请求转发，Key <strong>不可避免</strong>会在网络中传输到服务端。
            </p>
            <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-1">
              <li>不要在不受信任的网络环境中分享本页面地址，尤其是局域网/公网转发。</li>
              <li>建议使用低余额/临时 Key 进行测试。</li>
              <li>如需最高安全性，请使用客户端直连并确保目标 API 支持 CORS。</li>
              <li>服务端转发仅允许白名单域名，可在 proxy.allowlist.json 或环境变量中调整。</li>
            </ul>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={cancelServerMode}>
              取消
            </Button>
            <Button variant="destructive" onClick={confirmServerMode}>
              确定，知晓风险
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
