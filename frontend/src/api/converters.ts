import { BASE, get } from "./client";

export interface ConverterInfo {
  name: string;
  filename: string;
  description: string;
  inputs: string[];
  size_bytes: number;
  sha256: string;
  /** In-repo native converter (e.g. Parquet output), not vendored from upstream. */
  native?: boolean;
  /** Non-stdlib Python dependencies the script needs (e.g. pyarrow). */
  requires?: string[];
}

export interface ConverterManifest {
  upstream: string;
  commit: string;
  version: string;
  license: string;
  converters: ConverterInfo[];
}

export const convertersApi = {
  list: () => get<ConverterManifest>("/converters"),

  downloadUrl: (name: string) => `${BASE}/converters/${name}`,
};
