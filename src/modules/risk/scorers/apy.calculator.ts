import { Injectable } from "@nestjs/common";

@Injectable()
export class ApyCalculator {
  calculate(
    volume24hUsd: number,
    tvlUsd: number,
    feeBp: number = 30, // Default to 0.3% if not provided
  ): { apy: number; score: number } {
    if (tvlUsd <= 0) return { apy: 0, score: 0 };

    const feeDecimal = feeBp / 10000;
    const dailyFeeIncome = volume24hUsd * feeDecimal;
    const dailyYield = dailyFeeIncome / tvlUsd;

    // (1 + dailyYield)^365 - 1
    // Cap the APY to avoid PostgreSQL 'real' type out of range errors for tiny pools with high volume.
    let apy = Math.pow(1 + dailyYield, 365) - 1;
    if (apy > 999999) {
      apy = 999999;
    }

    let score = 0;
    if (apy >= 0.2) score = 100;
    else if (apy >= 0.1) score = 75;
    else if (apy >= 0.05) score = 50;
    else score = 25;

    return { apy, score };
  }
}
