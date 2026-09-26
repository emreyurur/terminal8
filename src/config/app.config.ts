import { registerAs } from "@nestjs/config";
import { resolveNetworkConstants } from "./network.constants";

export const appConfig = registerAs("app", () => {
  const networkPassphrase =
    process.env.NETWORK_PASSPHRASE || "Test SDF Network ; September 2015";
  const network = resolveNetworkConstants(networkPassphrase);

  return {
    horizonUrl:
      process.env.HORIZON_URL || "https://horizon-testnet.stellar.org",
    networkPassphrase,
    isMainnet: network.isMainnet,
    network,

    poolSyncIntervalMs: parseInt(
      process.env.POOL_SYNC_INTERVAL_MS || "300000",
      10,
    ),

    minTvlUsd: parseFloat(process.env.MIN_TVL_USD || "50000"),
    riskWeights: {
      trust: 0.3,
      tvl: 0.3,
      volatility: 0.2,
      apy: 0.2,
    },

    defaultSlippageBps: parseInt(process.env.DEFAULT_SLIPPAGE_BPS || "100", 10),
    maxSlippageBps: parseInt(process.env.MAX_SLIPPAGE_BPS || "500", 10),

    poolCacheTtl: parseInt(process.env.POOL_CACHE_TTL || "300", 10),
    tomlCacheTtl: parseInt(process.env.TOML_CACHE_TTL || "86400", 10),

    anchorHomeDomain:
      process.env.ANCHOR_HOME_DOMAIN || "tr-mock-anchor.fly.dev",
    anchorAssetCode: process.env.ANCHOR_ASSET_CODE || "USDC",

    resendApiKey: process.env.RESEND_API_KEY || "",
    alertFromEmail:
      process.env.ALERT_FROM_EMAIL || "Terminal8 <onboarding@resend.dev>",
    alertsEnabled: process.env.ALERTS_ENABLED !== "false",
    alertCheckIntervalMs: parseInt(
      process.env.ALERT_CHECK_INTERVAL_MS || "60000",
      10,
    ),
    maxAlertsPerUser: parseInt(process.env.MAX_ALERTS_PER_USER || "10", 10),

    jwtSecret: process.env.JWT_SECRET || "fallback-secret",
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || "24h",

    reflectorContractId:
      process.env.REFLECTOR_CONTRACT_ID || network.reflectorContractId,
    sorobanRpcUrl: process.env.SOROBAN_RPC_URL || network.sorobanRpcUrl,
    oracleCacheTtl: parseInt(process.env.ORACLE_CACHE_TTL || "60", 10),
    oracleStaleTtl: parseInt(process.env.ORACLE_STALE_TTL || "300", 10),
    oracleStalenessLimit: parseInt(
      process.env.ORACLE_STALENESS_LIMIT || "3600",
      10,
    ),
  };
});
