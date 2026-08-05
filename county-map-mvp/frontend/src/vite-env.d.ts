/// <reference types="vite/client" />

declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>;
  export default classes;
}

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_COUNTY_TOPOJSON_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
