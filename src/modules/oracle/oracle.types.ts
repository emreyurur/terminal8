export interface OracleAsset {
  code: string;
  issuer?: string | null;
}

export interface PriceData {
  price: number;
  timestamp: number;
  ageSeconds: number;
}
