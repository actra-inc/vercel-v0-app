// Chrome 組み込み AI「Prompt API」（Gemini Nano）の最小限の型定義。
// 仕様: https://developer.chrome.com/docs/ai/prompt-api
// @types には未収録のため、コードが実際に使う範囲だけをここで宣言する。
// import/export を持たないスクリプト型宣言なので、そのままグローバルに効く。

type LanguageModelAvailability = "unavailable" | "downloadable" | "downloading" | "available"

interface LanguageModelExpectedInput {
  type: "text" | "image" | "audio"
  languages?: string[]
}

interface LanguageModelExpectedOutput {
  type: "text"
  languages?: string[]
}

interface LanguageModelMonitor extends EventTarget {
  addEventListener(
    type: "downloadprogress",
    listener: (event: ProgressEvent) => void,
    options?: boolean | AddEventListenerOptions,
  ): void
}

type LanguageModelImageValue =
  | Blob
  | ImageBitmap
  | ImageData
  | HTMLImageElement
  | HTMLCanvasElement
  | OffscreenCanvas
  | HTMLVideoElement
  | VideoFrame

type LanguageModelMessageContent =
  | { type: "text"; value: string }
  | { type: "image"; value: LanguageModelImageValue }

interface LanguageModelMessage {
  role: "system" | "user" | "assistant"
  content: string | LanguageModelMessageContent[]
}

interface LanguageModelCreateCoreOptions {
  expectedInputs?: LanguageModelExpectedInput[]
  expectedOutputs?: LanguageModelExpectedOutput[]
  temperature?: number
  topK?: number
}

interface LanguageModelCreateOptions extends LanguageModelCreateCoreOptions {
  signal?: AbortSignal
  monitor?: (monitor: LanguageModelMonitor) => void
  initialPrompts?: LanguageModelMessage[]
}

interface LanguageModelPromptOptions {
  /** JSON Schema。指定すると出力がスキーマに拘束される */
  responseConstraint?: Record<string, unknown>
  omitResponseConstraintInput?: boolean
  signal?: AbortSignal
}

interface LanguageModelSession {
  prompt(input: string | LanguageModelMessage[], options?: LanguageModelPromptOptions): Promise<string>
  promptStreaming(input: string | LanguageModelMessage[], options?: LanguageModelPromptOptions): ReadableStream<string>
  clone(options?: { signal?: AbortSignal }): Promise<LanguageModelSession>
  destroy(): void
  readonly inputUsage: number
  readonly inputQuota: number
}

interface LanguageModelParams {
  defaultTemperature: number
  maxTemperature: number
  defaultTopK: number
  maxTopK: number
}

interface LanguageModelStatic {
  availability(options?: LanguageModelCreateCoreOptions): Promise<LanguageModelAvailability>
  create(options?: LanguageModelCreateOptions): Promise<LanguageModelSession>
  params(): Promise<LanguageModelParams | null>
}

// 非対応ブラウザでは未定義。参照側は必ず typeof で確認すること
declare var LanguageModel: LanguageModelStatic | undefined
