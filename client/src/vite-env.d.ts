/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Canonical public base URL for invitation links and QR codes (see AdminPanel).
  readonly VITE_PUBLIC_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
