const STROOP = 1e7;

export const floor7 = (n: number) => Math.floor(n * STROOP + 1e-6) / STROOP;
export const ceil7 = (n: number) => Math.ceil(n * STROOP - 1e-6) / STROOP;

/**
 * Amount `x` of the input asset to swap so that the rest of the budget deposits at the pool ratio
 * that exists AFTER that swap (the swap itself moves the pool). Constant product with fee, closed form:
 *   f*x^2 + rIn*(1+f)*x - budget*rIn = 0     where f = 1 - fee
 */
export function swapAmountForDeposit(budget: number, reserveIn: number, feeBp: number): number {
  const f = 1 - feeBp / 10000;
  const b = reserveIn * (1 + f);
  return (-b + Math.sqrt(b * b + 4 * f * budget * reserveIn)) / (2 * f);
}

/** Output of swapping `x` in a constant product pool (fee stays in the pool). */
export function amountOut(x: number, reserveIn: number, reserveOut: number, feeBp: number): number {
  const f = 1 - feeBp / 10000;
  return (reserveOut * f * x) / (reserveIn + f * x);
}

/** Input needed to receive exactly `out` from a constant product pool. */
export function amountIn(out: number, reserveIn: number, reserveOut: number, feeBp: number): number {
  const f = 1 - feeBp / 10000;
  return (reserveIn * out) / ((reserveOut - out) * f);
}

export interface SingleAssetPlanInput {
  /** Total amount of the input asset the user wants to put to work. */
  amount: number;
  reserveIn: number;
  reserveOut: number;
  feeBp: number;
  slippageBps: number;
}

export interface SingleAssetPlan {
  /** Expected amount of the input asset spent on the swap. */
  swapAmount: number;
  /** Exact amount of the other asset received (path payment strict receive). */
  receiveAmount: number;
  /** Upper bound the swap may spend (slippage guard). */
  sendMax: number;
  /** Cap for the input asset in the deposit operation. */
  maxDepositIn: number;
  /** Input asset the deposit is expected to use. */
  expectedDepositIn: number;
  /** Pool price after the swap, in input asset per output asset. */
  priceAfter: number;
  /** Extra cost of the swap versus the pool's spot price, in percent. */
  priceImpactPct: number;
  /** Input asset expected to stay in the wallet (the slippage margin). */
  estimatedLeftoverIn: number;
}

/**
 * Plans "swap part of one asset, deposit the rest" so the user only needs one asset.
 *
 * The swap is a strict-receive path payment, so the other asset arrives in an exact, known amount and the
 * deposit can use all of it. Only the input asset can be left over. The budget is shrunk by the slippage
 * so that even the worst-case swap cost still leaves enough input for the deposit.
 */
export function planSingleAssetDeposit(input: SingleAssetPlanInput): SingleAssetPlan {
  const { amount, reserveIn, reserveOut, feeBp, slippageBps } = input;
  if (!(amount > 0) || !(reserveIn > 0) || !(reserveOut > 0)) {
    throw new Error("Amount and pool reserves must be positive");
  }

  const slip = slippageBps / 10000;
  const budget = amount / (1 + slip);
  const x0 = swapAmountForDeposit(budget, reserveIn, feeBp);

  const receiveAmount = floor7(amountOut(x0, reserveIn, reserveOut, feeBp));
  if (!(receiveAmount > 0) || receiveAmount >= reserveOut) {
    throw new Error("Amount is too small or too large for this pool");
  }

  const swapAmount = amountIn(receiveAmount, reserveIn, reserveOut, feeBp);
  const sendMax = ceil7(swapAmount * (1 + slip));
  const maxDepositIn = floor7(amount - sendMax);

  const priceAfter = (reserveIn + swapAmount) / (reserveOut - receiveAmount);
  const expectedDepositIn = receiveAmount * priceAfter;
  const spot = reserveIn / reserveOut;
  const priceImpactPct = (swapAmount / receiveAmount / spot - 1) * 100;

  if (!(maxDepositIn > 0)) {
    throw new Error("Amount is too small once the slippage margin is reserved");
  }

  return {
    swapAmount,
    receiveAmount,
    sendMax,
    maxDepositIn,
    expectedDepositIn,
    priceAfter,
    priceImpactPct,
    estimatedLeftoverIn: Math.max(0, amount - swapAmount - expectedDepositIn),
  };
}
