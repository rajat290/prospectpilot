export type StructuredResponseRequest = {
  apiKey: string;
  model: string;
  name: string;
  schema: Record<string, unknown>;
  system: string;
  user: string;
  maxOutputTokens?: number;
};

export type StructuredResponse<T> = {
  providerResponseId?: string;
  output: T;
  inputTokens?: number;
  outputTokens?: number;
};

export async function createStructuredResponse<T>(request: StructuredResponseRequest): Promise<StructuredResponse<T>> {
  if (!request.apiKey) throw new Error("OPENAI_API_KEY is not configured.");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${request.apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: request.model,
      store: false,
      input: [
        { role: "system", content: request.system },
        { role: "user", content: request.user }
      ],
      max_output_tokens: request.maxOutputTokens ?? 1800,
      text: {
        format: {
          type: "json_schema",
          name: request.name,
          strict: true,
          schema: request.schema
        }
      }
    }),
    signal: AbortSignal.timeout(45_000)
  });
  const payload = await response.json() as OpenAiResponse;
  if (!response.ok) throw new Error(sanitizeOpenAiError(payload, response.status));
  const content = payload.output?.flatMap((item) => item.content ?? []);
  const text = payload.output_text || content?.find((item) => item.type === "output_text")?.text;
  if (!text) {
    const refusal = content?.find((item) => item.type === "refusal")?.refusal;
    throw new Error(refusal ? `OpenAI refused the structured request: ${refusal}` : "OpenAI returned no structured output.");
  }
  return {
    providerResponseId: payload.id,
    output: JSON.parse(text) as T,
    inputTokens: payload.usage?.input_tokens,
    outputTokens: payload.usage?.output_tokens
  };
}

type OpenAiResponse = {
  id?: string;
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string; refusal?: string }> }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string; code?: string };
};

function sanitizeOpenAiError(payload: OpenAiResponse, status: number) {
  const message = payload.error?.message || `OpenAI request failed with HTTP ${status}.`;
  return message.replace(/sk-[A-Za-z0-9_-]+/g, "[redacted-api-key]").slice(0, 1000);
}
