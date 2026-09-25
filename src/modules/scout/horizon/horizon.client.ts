import { Injectable, Inject, Logger } from "@nestjs/common";
import axios, { AxiosInstance } from "axios";
import { ConfigType } from "@nestjs/config";
import { appConfig } from "../../../config/app.config";
import {
  HorizonPoolResponse,
  HorizonTradeResponse,
  HorizonAccountResponse,
  HorizonPaginatedResponse,
} from "./horizon.types";

@Injectable()
export class HorizonClient {
  private readonly axios: AxiosInstance;
  private rateLimitRemaining = 3600;
  private readonly logger = new Logger(HorizonClient.name);

  constructor(
    @Inject(appConfig.KEY) private config: ConfigType<typeof appConfig>,
  ) {
    this.axios = axios.create({
      baseURL: this.config.horizonUrl,
      timeout: 15000,
    });

    this.axios.interceptors.response.use(
      (res) => {
        if (res.headers["x-ratelimit-remaining"]) {
          this.rateLimitRemaining = parseInt(
            res.headers["x-ratelimit-remaining"],
            10,
          );
        }
        return res;
      },
      async (error) => {
        const status = error.response?.status;
        if (status === 429 || status === 503 || status === 504) {
          this.logger.debug(`Horizon API overloaded (status ${status}). Retrying after 3s delay...`);
          await new Promise((resolve) => setTimeout(resolve, 3000));
          return this.axios(error.config);
        }
        throw error;
      },
    );
  }

  async fetchAllPools(): Promise<HorizonPoolResponse[]> {
    let records: HorizonPoolResponse[] = [];
    let nextUrl = "/liquidity_pools?limit=200";

    while (nextUrl) {
      const response =
        await this.axios.get<HorizonPaginatedResponse<HorizonPoolResponse>>(
          nextUrl,
        );
      const newRecords = response.data._embedded.records;
      records = records.concat(newRecords);

      if (newRecords.length < 200) {
        break; // Son sayfa
      }
      nextUrl = response.data._links.next.href;
      await new Promise((resolve) => setTimeout(resolve, 500)); // Proactive delay
    }
    return records;
  }

  async fetchPool(poolId: string): Promise<HorizonPoolResponse | null> {
    try {
      const response = await this.axios.get<HorizonPoolResponse>(`/liquidity_pools/${poolId}`);
      return response.data;
    } catch (error) {
      if (error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async fetchPoolTrades(
    poolId: string,
    hours = 24,
  ): Promise<HorizonTradeResponse[]> {
    const records: HorizonTradeResponse[] = [];
    let nextUrl = `/liquidity_pools/${poolId}/trades?limit=200&order=desc`;
    const cutoffTime = new Date(Date.now() - hours * 3600 * 1000).getTime();

    while (nextUrl) {
      const response =
        await this.axios.get<HorizonPaginatedResponse<HorizonTradeResponse>>(
          nextUrl,
        );
      const newRecords = response.data._embedded.records;

      let reachedCutoff = false;
      for (const record of newRecords) {
        const tradeTime = new Date(record.ledger_close_time).getTime();
        if (tradeTime < cutoffTime) {
          reachedCutoff = true;
          break;
        }
        records.push(record);
      }

      if (reachedCutoff || newRecords.length < 200) {
        break;
      }
      nextUrl = response.data._links.next.href;
      await new Promise((resolve) => setTimeout(resolve, 500)); // Proactive delay
    }
    return records;
  }

  async fetchAccount(
    publicKey: string,
  ): Promise<HorizonAccountResponse | null> {
    try {
      const response = await this.axios.get<HorizonAccountResponse>(
        `/accounts/${publicKey}`,
      );
      return response.data;
    } catch (error) {
      if (error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * İki asset arasındaki trade'leri çeker (VWAP hesaplaması için).
   * base: satılan asset, counter: alınan asset
   */
  async fetchTradesByAssets(
    baseCode: string,
    baseIssuer: string,
    counterCode: string,
    counterIssuer: string,
    hours = 24,
  ): Promise<HorizonTradeResponse[]> {
    // Horizon trade query parametreleri
    const params: Record<string, string> = {
      limit: "200",
      order: "desc",
    };

    // Base asset
    if (baseCode === "native" || (!baseIssuer && baseCode === "XLM")) {
      params.base_asset_type = "native";
    } else {
      params.base_asset_type =
        baseCode.length <= 4 ? "credit_alphanum4" : "credit_alphanum12";
      params.base_asset_code = baseCode;
      params.base_asset_issuer = baseIssuer;
    }

    // Counter asset
    if (counterCode === "native" || (!counterIssuer && counterCode === "XLM")) {
      params.counter_asset_type = "native";
    } else {
      params.counter_asset_type =
        counterCode.length <= 4 ? "credit_alphanum4" : "credit_alphanum12";
      params.counter_asset_code = counterCode;
      params.counter_asset_issuer = counterIssuer;
    }

    const records: HorizonTradeResponse[] = [];
    const cutoffTime = new Date(Date.now() - hours * 3600 * 1000).getTime();

    try {
      let nextUrl = "/trades";
      let currentParams = params;

      while (nextUrl) {
        const response = await this.axios.get<
          HorizonPaginatedResponse<HorizonTradeResponse>
        >(nextUrl, { params: currentParams });
        const newRecords = response.data._embedded.records;

        // After first request, params are embedded in nextUrl, so we don't pass them again
        currentParams = undefined as any;

        let reachedCutoff = false;
        for (const record of newRecords) {
          const tradeTime = new Date(record.ledger_close_time).getTime();
          if (tradeTime < cutoffTime) {
            reachedCutoff = true;
            break;
          }
          records.push(record);
        }

        if (reachedCutoff || newRecords.length < 200) {
          break;
        }
        nextUrl = response.data._links.next.href;
        await new Promise((resolve) => setTimeout(resolve, 500)); // Proactive delay
      }
    } catch (e) {
      if (e.response?.status === 404) {
        // Belirtilen asset çifti için hiç trade bulunamadığında Horizon 404 döner. Bunu yoksayıyoruz.
        return [];
      }
      this.logger.warn(
        `Failed to fetch trades for ${baseCode}/${counterCode}: ${e.message}`,
      );
    }

    return records;
  }

  async fetchPoolOperations(
    poolId: string,
    cursor: string,
    limit: number = 200,
  ): Promise<{ records: any[]; hasMore: boolean }> {
    const response = await this.axios.get(
      `/liquidity_pools/${poolId}/operations`,
      { params: { cursor, limit, order: "asc" } },
    );
    const records = response.data._embedded.records;
    return { records, hasMore: records.length >= limit };
  }
}
