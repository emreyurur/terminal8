import { Test } from "@nestjs/testing";
import { BadGatewayException, BadRequestException } from "@nestjs/common";
import axios from "axios";
import { AnchorService } from "./anchor.service";
import { appConfig } from "../../config/app.config";

const mockedAxios = {
  get: jest.spyOn(axios, "get"),
  request: jest.spyOn(axios, "request"),
};

const TOML = `
WEB_AUTH_ENDPOINT="https://anchor.test/auth"
TRANSFER_SERVER="https://anchor.test/sep6/"
ANCHOR_QUOTE_SERVER="https://anchor.test/sep38"
[[CURRENCIES]]
code="USDC"
issuer="GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
`;

describe("AnchorService", () => {
  let service: AnchorService;

  beforeEach(async () => {
    mockedAxios.get.mockReset();
    mockedAxios.request.mockReset();
    const module = await Test.createTestingModule({
      providers: [
        AnchorService,
        {
          provide: appConfig.KEY,
          useValue: {
            anchorHomeDomain: "anchor.test",
            anchorAssetCode: "USDC",
            tomlCacheTtl: 60,
            horizonUrl: "https://horizon-testnet.stellar.org",
            networkPassphrase: "Test SDF Network ; September 2015",
          },
        },
      ],
    }).compile();
    service = module.get(AnchorService);
  });

  const mockToml = () =>
    mockedAxios.get.mockResolvedValueOnce({ data: TOML } as any);

  it("discovers endpoints from stellar.toml and caches it", async () => {
    mockToml();
    await service.getToml();
    await service.getToml();
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    expect(mockedAxios.get).toHaveBeenCalledWith(
      "https://anchor.test/.well-known/stellar.toml",
      expect.any(Object),
    );
  });

  it("sends deposit to the SEP-6 server with bearer token and asset from config", async () => {
    mockToml();
    mockedAxios.request.mockResolvedValueOnce({ data: { id: "tx1" } } as any);

    const res = await service.deposit("GUSER", { amount: "100" }, "anchor-jwt");

    expect(res).toEqual({ id: "tx1" });
    expect(mockedAxios.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://anchor.test/sep6/deposit",
        headers: { Authorization: "Bearer anchor-jwt" },
        params: expect.objectContaining({
          asset_code: "USDC",
          account: "GUSER",
          amount: "100",
        }),
      }),
    );
  });

  it("maps anchor 4xx to BadRequest and 5xx to BadGateway", async () => {
    mockToml();
    mockedAxios.request.mockRejectedValueOnce({
      response: { status: 400, data: { error: "bad iban" } },
      message: "x",
    });
    await expect(
      service.withdraw("GUSER", { dest: "TR00" }, "t"),
    ).rejects.toBeInstanceOf(BadRequestException);

    mockedAxios.request.mockRejectedValueOnce({
      response: { status: 503, data: {} },
      message: "down",
    });
    await expect(service.getTransaction("1", "t")).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it("simulates the sandbox bank transfer with a form post and rejects unsafe ids", async () => {
    mockToml();
    const post = jest
      .spyOn(axios, "post")
      .mockResolvedValueOnce({ status: 303 } as any);

    await expect(
      service.simulateBankTransfer("sep_abc123", "100"),
    ).resolves.toEqual({
      ok: true,
      status: 303,
    });
    expect(post).toHaveBeenCalledWith(
      "https://anchor.test/sep6/tx/sep_abc123/simulate-bank-transfer",
      expect.stringContaining("amount=100"),
      expect.any(Object),
    );

    await expect(
      service.simulateBankTransfer("../evil"),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("fails clearly when stellar.toml lacks an endpoint", async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: 'FOO="bar"' } as any);
    await expect(service.getChallenge("GUSER")).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });
});
