import axios from "axios";

const API_BASE = "/api";

export const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
});

/* ------------------------------------------------------------------ */
/*  HUGGINGFACE BACKEND (deployed BDH model)                           */
/* ------------------------------------------------------------------ */
const HF_API_URL =
  import.meta.env.VITE_BDH_API_URL || "http://localhost:7860";

export const hfBackend = {
  checkHealth: async (): Promise<{
    status: string;
    model_loaded: boolean;
    device: string;
  }> => {
    const res = await fetch(`${HF_API_URL}/`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) throw new Error(`HF health check failed: ${res.status}`);
    return res.json();
  },

  generate: async (
    prompt: string,
    maxNewTokens = 100,
    temperature = 1.0,
    topK = 3
  ): Promise<{
    generated_text: string;
    prompt: string;
    tokens_generated: number;
  }> => {
    const res = await fetch(`${HF_API_URL}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        max_new_tokens: maxNewTokens,
        temperature,
        top_k: topK,
      }),
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: "Unknown error" }));
      throw new Error(error.detail || `Generation failed: ${res.status}`);
    }
    return res.json();
  },
};

/* ------------------------------------------------------------------ */
/*  Backend connection status (reactive)                               */
/* ------------------------------------------------------------------ */
type StatusListener = (connected: boolean) => void;
const _listeners = new Set<StatusListener>();
let _backendConnected = false;

export function onBackendStatus(fn: StatusListener) {
  _listeners.add(fn);
  fn(_backendConnected);
  return () => _listeners.delete(fn);
}
export function isBackendConnected() {
  return _backendConnected;
}
function _setConnected(v: boolean) {
  if (v !== _backendConnected) {
    _backendConnected = v;
    _listeners.forEach((fn) => fn(v));
  }
}

let _polling = false;
export function startHealthPoll() {
  if (_polling) return;
  _polling = true;
  const poll = async () => {
    try {
      await axios.get("/health", { timeout: 4000 });
      _setConnected(true);
    } catch {
      _setConnected(false);
    }
  };
  poll();
  setInterval(poll, 5000);
}

api.interceptors.response.use(
  (res) => {
    _setConnected(true);
    return res;
  },
  (err) => {
    if (!err.response) {
      _setConnected(false);
    }
    return Promise.reject(err);
  },
);

export const inference = {
  run: (text: string, modelName = "french") =>
    api.post("/inference/run", { text, model_name: modelName }),

  generate: (prompt: string, modelName = "french", maxTokens = 50) =>
    api.post("/inference/generate", {
      prompt,
      model_name: modelName,
      max_tokens: maxTokens,
    }),

  extractDetailed: (text: string, modelName = "french") =>
    api.post("/inference/extract-detailed", { text, model_name: modelName }),
};

export const analysis = {
  sparsity: (texts: string[], modelName = "french") =>
    api.post("/analysis/sparsity", { texts, model_name: modelName }),

  probeConcept: (
    conceptName: string,
    examples: string[],
    modelName = "french",
  ) =>
    api.post("/analysis/probe-concept", {
      concept_name: conceptName,
      examples,
      model_name: modelName,
    }),

  neuronFingerprint: (
    conceptName: string,
    words: string[],
    modelName = "french",
  ) =>
    api.post("/analysis/neuron-fingerprint", {
      concept_name: conceptName,
      examples: words,
      model_name: modelName,
    }),

  compare: (text: string, modelNames: string[]) =>
    api.post("/analysis/compare", { text, model_names: modelNames }),

  getConceptCategories: () => api.get("/analysis/concept-categories"),

  synapseTrack: (
    sentence: string,
    synapses: { layer: number; head: number; neuron: number }[],
    modelName = "french",
  ) =>
    api.post("/analysis/synapse-track", {
      sentence,
      synapses,
      model_name: modelName,
    }),
};

export const models = {
  list: () => api.get("/models/list"),

  getInfo: (modelName: string) => api.get(`/models/${modelName}`),

  load: (modelName: string, checkpointPath?: string) =>
    api.post("/models/load", {
      model_name: modelName,
      checkpoint_path: checkpointPath,
    }),

  unload: (modelName: string) => api.post(`/models/${modelName}/unload`),

  getGraph: (modelName: string, threshold = 0.01) =>
    api.get(`/models/${modelName}/graph`, { params: { threshold } }),
};

export const visualization = {
  playback: (text: string, modelName = "french", includeAttention = false) =>
    api.post("/visualization/playback", {
      text,
      model_name: modelName,
      include_attention: includeAttention,
    }),

  hebbianTrack: (text: string, modelName = "french") =>
    api.post("/visualization/hebbian-track", { text, model_name: modelName }),

  getArchitectureSpec: () => api.get("/visualization/architecture-spec"),

  getColorScheme: () => api.get("/visualization/color-scheme"),
};

export async function loadPlaybackJSON(filename: string) {
  const response = await fetch(`/playback/${filename}`);
  if (!response.ok) throw new Error(`Failed to load ${filename}`);
  return response.json();
}

export const health = () => axios.get("/health", { timeout: 4000 });

export const graph = {
  getClusters: (modelName: string, head = 0, beta = 1.0, maxNodes = 400) =>
    api.get(`/graph/clusters/${modelName}`, {
      params: { head, beta, max_nodes: maxNodes },
      timeout: 60000,
    }),

  activate: (text: string, modelName = "french", head = 0, layer = -1) =>
    api.post("/graph/activate", {
      text,
      model_name: modelName,
      head,
      layer,
    }),

  clearCache: () => api.delete("/graph/cache"),
};
