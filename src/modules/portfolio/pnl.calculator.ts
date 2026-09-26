import { Injectable } from "@nestjs/common";
import { UserPosition } from "./entities/user-position.entity";
import { LiquidityPool } from "../scout/entities/liquidity-pool.entity";
import { OracleService } from "../oracle/oracle.service";

@Injectable()
export class PnlCalculator {
  constructor(private readonly oracleService: OracleService) {}

  async calculatePositionMetrics(position: UserPosition, pool: LiquidityPool) {
    const sharesOwned = parseFloat(position.sharesOwned);
    const totalShares = parseFloat(pool.totalShares);

    if (totalShares === 0 || sharesOwned === 0) {
      return { currentValueUsd: 0, pnlUsd: 0, impermanentLossPct: 0 };
    }

    const shareRatio = sharesOwned / totalShares;

    // Current assets based on share ratio
    const currentA = parseFloat(pool.reserveA) * shareRatio;
    const currentB = parseFloat(pool.reserveB) * shareRatio;

    // Current USD prices of A and B from Oracle (or internal pool ratio if oracle fails)
    let priceAUsd = await this.oracleService.getUsdPrice(
      pool.assetACode,
      pool.assetAIssuer,
    );
    let priceBUsd = await this.oracleService.getUsdPrice(
      pool.assetBCode,
      pool.assetBIssuer,
    );

    if (!priceAUsd && priceBUsd) {
      // internal price ratio
      priceAUsd =
        (parseFloat(pool.reserveB) * priceBUsd) / parseFloat(pool.reserveA);
    } else if (!priceBUsd && priceAUsd) {
      priceBUsd =
        (parseFloat(pool.reserveA) * priceAUsd) / parseFloat(pool.reserveB);
    } else if (!priceAUsd && !priceBUsd) {
      priceAUsd = 0;
      priceBUsd = 0;
    }

    const currentValueUsd = currentA * priceAUsd + currentB * priceBUsd;

    const costBasisUsd =
      parseFloat(position.assetADeposited) * priceAUsd +
      parseFloat(position.assetBDeposited) * priceBUsd;

    const pnlUsd = currentValueUsd - costBasisUsd;

    // IL Calculation: Value of current holdings vs value if held outside pool
    const heldOutsideUsd =
      parseFloat(position.assetADeposited) * priceAUsd +
      parseFloat(position.assetBDeposited) * priceBUsd;

    let impermanentLossPct = 0;
    if (heldOutsideUsd > 0 && currentValueUsd < heldOutsideUsd) {
      impermanentLossPct =
        ((heldOutsideUsd - currentValueUsd) / heldOutsideUsd) * 100;
    }

    return {
      currentValueUsd,
      pnlUsd,
      impermanentLossPct,
    };
  }
}
