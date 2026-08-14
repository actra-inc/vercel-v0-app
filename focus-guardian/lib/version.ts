// デプロイされているビルドを画面から識別するための情報。
// 値は next.config.mjs の env でビルド時に埋め込まれる。
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "0.0.0"
export const BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME || "-"
export const BUILD_COMMIT = process.env.NEXT_PUBLIC_BUILD_COMMIT || "local"
export const BUILD_BRANCH = process.env.NEXT_PUBLIC_BUILD_BRANCH || "local"
export const BUILD_ENV = process.env.NEXT_PUBLIC_BUILD_ENV || "development"

// 本番以外はブランチ名を添えて、どの環境を見ているか分かるようにする
export const ENV_LABEL =
  BUILD_ENV === "production" ? "production" : BUILD_ENV === "preview" ? `preview/${BUILD_BRANCH}` : "local"

/** 例: "v0.1.0 (e09665a)" */
export const VERSION_LABEL = `v${APP_VERSION} (${BUILD_COMMIT})`

/** 例: "v0.1.0 (e09665a) · preview/sub · 2026/08/14 11:23" */
export const FULL_VERSION_LABEL = `${VERSION_LABEL} · ${ENV_LABEL} · ${BUILD_TIME}`
