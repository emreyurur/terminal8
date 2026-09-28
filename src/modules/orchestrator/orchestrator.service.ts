import { Injectable, BadRequestException, Inject } from "@nestjs/common";
import { ConfigType } from "@nestjs/config";
import { appConfig } from "../../config/app.config";
import {
  BuildTransactionDto,
  TransactionAction,
} from "./dto/transaction-request.dto";
import { BuiltTransactionDto } from "./dto/transaction-response.dto";
import { ScoutService } from "../scout/scout.service";
import { RiskService } from "../risk/risk.service";
import { XdrBuilderService } from "./services/xdr-builder.service";
import { SlippageService } from "./services/slippage.service";

@Injectable()
export class OrchestratorService {
  constructor(
    @Inject(appConfig.KEY) private config: ConfigType<typeof appConfig>,
    private readonly scoutService: ScoutService,
    private readonly riskService: RiskService,
    private readonly xdrBuilder: XdrBuilderService,
    private readonly slippageService: SlippageService,
  ) {}

  async buildTransaction(
    publicKey: string,
    dto: BuildTransactionDto,
  ): Promise<BuiltTransactionDto> {
    let pool = await this.scoutService.getPool(dto.poolId);
    if (!pool) {
      pool = await this.scoutService.forceFetchPool(dto.poolId);
    }
    if (!pool) {
      throw new BadRequestException("Pool not found");
    }

    // Risk Check
    // const risk = await this.riskService.getRiskByPoolId(dto.poolId);
    //if (risk && risk.riskLevel === RISK_LEVELS.HIGH) {
    //  throw new BadRequestException('Cannot interact with HIGH risk pools');
    //}

    // Fiyatlama (Basit AMM kuralı üzerinden anlık fiyat tahmini)
    // Gerçekte bu, pool'un reserve'lerine bakarak hesaplanmalıdır.
    const reserveA = parseFloat(pool.reserveA);
    const reserveB = parseFloat(pool.reserveB);
    const totalShares = parseFloat(pool.totalShares);

    if (reserveA === 0 || reserveB === 0) {
      throw new BadRequestException("Pool is empty");
    }

    let xdr: string;

    if (dto.action === TransactionAction.DEPOSIT) {
      if (!dto.amountA || !dto.amountB) {
        throw new BadRequestException(
          "amountA and amountB required for deposit",
        );
      }

      // Fiyat sınırı (Stellar expects Price of A in terms of B, which is B/A)
      const currentPrice = reserveB / reserveA;
      const slippageBps =
        dto.slippageBps || this.config.defaultSlippageBps || 100;
      const slippageFactor = slippageBps / 10000;

      const minPrice = currentPrice * (1 - slippageFactor);
      const maxPrice = currentPrice * (1 + slippageFactor);

      xdr = await this.xdrBuilder.buildDepositXdr(
        publicKey,
        pool,
        dto.amountA,
        dto.amountB,
        minPrice,
        maxPrice,
      );
    } else {
      // WITHDRAW
      if (!dto.shareAmount) {
        throw new BadRequestException("shareAmount required for withdraw");
      }

      // Pool'daki payın oranı
      const shareRatio = dto.shareAmount / totalShares;
      const expectedA = reserveA * shareRatio;
      const expectedB = reserveB * shareRatio;

      const { minA, minB } = this.slippageService.calculateMinAmounts(
        expectedA,
        expectedB,
        dto.slippageBps,
      );

      xdr = await this.xdrBuilder.buildWithdrawXdr(
        publicKey,
        pool,
        dto.shareAmount,
        minA,
        minB,
      );
    }

    return {
      xdr,
      networkPassphrase: this.config.networkPassphrase,
    };
  }
}
