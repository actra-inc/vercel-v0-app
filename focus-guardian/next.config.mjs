import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const pkg = require("./package.json")

// ビルド時刻を日本時間の固定文字列として埋め込む
// （表示時に toLocaleString すると サーバー(UTC)とクライアント(JST)で
//   ハイドレーション不一致が起きるため、ここで文字列化しておく）
const buildTime = new Date().toLocaleString("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // デプロイされているビルドを画面から識別するための情報
  // （VERCEL_* はVercelが自動で与えるシステム環境変数）
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_BUILD_TIME: buildTime,
    NEXT_PUBLIC_BUILD_COMMIT: (process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 7) || "local",
    NEXT_PUBLIC_BUILD_BRANCH: process.env.VERCEL_GIT_COMMIT_REF || "local",
    NEXT_PUBLIC_BUILD_ENV: process.env.VERCEL_ENV || "development",
  },
  webpack(config) {
    // Tesseract.js (WASM + Web Worker) の互換性確保
    config.resolve.alias.canvas = false
    config.resolve.alias.encoding = false
    return config
  },
}

export default nextConfig
