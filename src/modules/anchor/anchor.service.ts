import {
  BadGatewayException,
  BadRequestException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { ConfigType } from "@nestjs/config";
import axios from "axios";
import * as toml from "toml";
import {
  Account,
  Asset,
  Horizon,
  Memo,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { appConfig } from "../../config/app.config";

interface AnchorToml {
  WEB_AUTH_ENDPOINT?: string;
  TRANSFER_SERVER?: string;
  ANCHOR_QUOTE_SERVER?: string;
  CURRENCIES?: { code: string; issuer?: string }[];
}

@Injectable()
export class AnchorService {
  private tomlCache: { value: AnchorToml; expires: number } | null = null;

  constructor(
    @Inject(appConfig.KEY) private config: ConfigType<typeof appConfig>,
  ) {}

  /** SEP-1: everything (endpoints, issuer) is discovered from stellar.toml. */
  async getToml(): Promise<AnchorToml> {
    if (this.tomlCache && this.tomlCache.expires > Date.now()) {
      return this.tomlCache.value;
    }
    const url = `https://${this.config.anchorHomeDomain}/.well-known/stellar.toml`;
    try {
      const res = await axios.get(url, { timeout: 10000, responseType: "text" });
      const value = toml.parse(res.data) as AnchorToml;
      this.tomlCache = {
        value,
        expires: Date.now() + this.config.tomlCacheTtl * 1000,
      };
      return value;
    } catch (e) {
      throw new BadGatewayException(`Cannot read anchor stellar.toml: ${e.message}`);
    }
  }

  private async endpoint(key: keyof AnchorToml): Promise<string> {
    const value = (await this.getToml())[key];
    if (typeof value !== "string" || !value) {
      throw new BadGatewayException(`Anchor stellar.toml is missing ${key}`);
    }
    return value.replace(/\/$/, "");
  }

  private async call(
    method: "get" | "post",
    url: string,
    opts: { token?: string; params?: any; data?: any } = {},
  ) {
    try {
      const res = await axios.request({
        method,
        url,
        params: opts.params,
        data: opts.data,
        timeout: 15000,
        headers: opts.token ? { Authorization: `Bearer ${opts.token}` } : {},
      });
      return res.data;
    } catch (e) {
      const status = e.response?.status;
      const detail = e.response?.data?.error || e.message;
      if (status && status >= 400 && status < 500) {
        throw new BadRequestException(`Anchor rejected request: ${detail}`);
      }
      throw new BadGatewayException(`Anchor error: ${detail}`);
    }
  }

  async getInfo() {
    const t = await this.getToml();
    const usdc = t.CURRENCIES?.find((c) => c.code === this.config.anchorAssetCode);
    const sep6 = await this.call("get", `${await this.endpoint("TRANSFER_SERVER")}/info`);
    return {
      homeDomain: this.config.anchorHomeDomain,
      asset: { code: this.config.anchorAssetCode, issuer: usdc?.issuer ?? null },
      sep6,
    };
  }

  // SEP-10 (anchor's own auth, separate from Terminal8's JWT)
  async getChallenge(account: string) {
    return this.call("get", await this.endpoint("WEB_AUTH_ENDPOINT"), {
      params: { account },
    });
  }

  async verifyChallenge(transaction: string) {
    return this.call("post", await this.endpoint("WEB_AUTH_ENDPOINT"), {
      data: { transaction },
    });
  }

  // SEP-38
  async getPrice(
    query: { sellAsset: string; buyAsset: string; sellAmount: string },
    token?: string,
  ) {
    return this.call("get", `${await this.endpoint("ANCHOR_QUOTE_SERVER")}/price`, {
      token,
      params: {
        sell_asset: query.sellAsset,
        buy_asset: query.buyAsset,
        sell_amount: query.sellAmount,
        context: "sep6",
      },
    });
  }

  // SEP-6
  async deposit(
    account: string,
    dto: { amount?: string; quoteId?: string },
    token: string,
  ) {
    return this.call("get", `${await this.endpoint("TRANSFER_SERVER")}/deposit`, {
      token,
      params: {
        asset_code: this.config.anchorAssetCode,
        account,
        type: "bank_account",
        amount: dto.amount,
        quote_id: dto.quoteId,
      },
    });
  }

  async withdraw(
    account: string,
    dto: { dest: string; amount?: string; quoteId?: string },
    token: string,
  ) {
    return this.call("get", `${await this.endpoint("TRANSFER_SERVER")}/withdraw`, {
      token,
      params: {
        asset_code: this.config.anchorAssetCode,
        account,
        type: "bank_account",
        dest: dto.dest,
        amount: dto.amount,
        quote_id: dto.quoteId,
      },
    });
  }

  async getTransaction(id: string, token: string) {
    return this.call("get", `${await this.endpoint("TRANSFER_SERVER")}/transaction`, {
      token,
      params: { id },
    });
  }

  /**
   * Sandbox only: tells the mock anchor the customer's TRY bank transfer arrived
   * (what its "Play the bank" button does). Real anchors do not expose this and return 404.
   */
  async simulateBankTransfer(id: string, amount?: string) {
    if (!/^[A-Za-z0-9_-]+$/.test(id)) {
      throw new BadRequestException("Invalid transaction id");
    }
    const base = await this.endpoint("TRANSFER_SERVER");
    try {
      const res = await axios.post(
        `${base}/tx/${id}/simulate-bank-transfer`,
        new URLSearchParams({ ...(amount ? { amount } : {}), _: "1" }).toString(),
        {
          timeout: 20000,
          maxRedirects: 0,
          validateStatus: (status) => status < 400 || status === 302 || status === 303,
        },
      );
      return { ok: true, status: res.status };
    } catch (e) {
      const status = e.response?.status;
      const detail = e.response?.data?.error || e.message;
      if (status && status >= 400 && status < 500) {
        throw new BadRequestException(`Anchor rejected the simulation: ${detail}`);
      }
      throw new BadGatewayException(`Anchor error: ${detail}`);
    }
  }

  /** Builds the unsigned USDC payment (with memo) the user signs to complete an off-ramp. */
  async buildWithdrawPaymentXdr(
    publicKey: string,
    dto: { amount: string; anchorAccount: string; memo: string; memoType?: string },
  ): Promise<{ xdr: string; networkPassphrase: string }> {
    const issuer = (await this.getToml()).CURRENCIES?.find(
      (c) => c.code === this.config.anchorAssetCode,
    )?.issuer;
    if (!issuer) {
      throw new BadGatewayException("Anchor stellar.toml has no issuer for the asset");
    }

    const horizon = new Horizon.Server(this.config.horizonUrl);
    let account;
    try {
      account = await horizon.loadAccount(publicKey);
    } catch {
      throw new BadRequestException("Source account does not exist on the network");
    }

    const memoType = dto.memoType ?? "text";
    const memo =
      memoType === "id"
        ? Memo.id(dto.memo)
        : memoType === "hash"
          ? Memo.hash(dto.memo)
          : Memo.text(dto.memo);

    const tx = new TransactionBuilder(
      new Account(publicKey, account.sequenceNumber()),
      { fee: "100", networkPassphrase: this.config.networkPassphrase },
    )
      .addOperation(
        Operation.payment({
          destination: dto.anchorAccount,
          asset: new Asset(this.config.anchorAssetCode, issuer),
          amount: dto.amount,
        }),
      )
      .addMemo(memo)
      .setTimeout(300)
      .build();

    return { xdr: tx.toXDR(), networkPassphrase: this.config.networkPassphrase };
  }
}
