import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Memo,
  Networks,
  Operation,
  TransactionBuilder,
} from 'stellar-sdk';
import { AMOUNT_REGEX } from '../../lib/constants/regex';
import { describeHorizonError } from '../../lib/utils/stellar-error.util';

type NetworkType = 'testnet' | 'public';

@Injectable()
export class StellarService {
  private readonly server: Horizon.Server;
  private readonly networkPassphrase: string;
  private readonly signerSecret?: string;

  constructor(private readonly config: ConfigService) {
    const horizonUrl =
      this.config.get<string>('STELLAR_HORIZON_URL') ??
      'https://horizon-testnet.stellar.org';

    const network = (this.config.get<string>('STELLAR_NETWORK') ??
      'testnet') as NetworkType;

    this.networkPassphrase =
      network === 'public' ? Networks.PUBLIC : Networks.TESTNET;

    this.signerSecret = this.config.get<string>('STELLAR_SIGNER_SECRET');

    this.server = new Horizon.Server(horizonUrl);
  }

  /** Passphrase of the configured network (testnet/public). */
  getNetworkPassphrase() {
    return this.networkPassphrase;
  }

  async getAccount(publicKey: string) {
    this.assertPublicKey(publicKey);
    return this.server.loadAccount(publicKey);
  }

  async getBalances(publicKey: string) {
    const account = await this.getAccount(publicKey);

    return account.balances.map((b: any) => ({
      asset_type: b.asset_type,
      asset_code: b.asset_code ?? null,
      asset_issuer: b.asset_issuer ?? null,
      balance: b.balance,
      limit: b.limit ?? null,
    }));
  }

  async getTransactions(publicKey: string, limit = 10) {
    this.assertPublicKey(publicKey);

    const res = await this.server
      .transactions()
      .forAccount(publicKey)
      .order('desc')
      .limit(Math.min(Math.max(limit, 1), 200))
      .call();

    return res.records.map((t: any) => ({
      id: t.id,
      hash: t.hash,
      created_at: t.created_at,
      memo_type: t.memo_type,
      memo: t.memo,
      successful: t.successful,
      fee_charged: t.fee_charged,
      source_account: t.source_account,
    }));
  }

  /**
   * Sends a payment signed by your backend.
   * For production: prefer client-side signing or custody the secret with KMS/HSM.
   */
  async sendPayment(params: {
    destination: string;
    amount: string; // "1.5"
    memo?: string;
    asset?: { code: string; issuer?: string }; // defaults to XLM if omitted
  }) {
    if (!this.signerSecret) {
      throw new BadRequestException(
        'STELLAR_SIGNER_SECRET is missing to sign the transaction.',
      );
    }

    this.assertPublicKey(params.destination);
    this.assertAmount(params.amount);

    const sourceKeypair = Keypair.fromSecret(this.signerSecret);
    const sourcePublicKey = sourceKeypair.publicKey();

    // Load the source account
    const account = await this.server.loadAccount(sourcePublicKey);

    // Asset (XLM or token)
    const asset = this.buildAsset(params.asset);

    // Build the transaction
    let builder = new TransactionBuilder(account, {
      fee: String(BASE_FEE),
      networkPassphrase: this.networkPassphrase,
    }).addOperation(
      Operation.payment({
        destination: params.destination,
        asset,
        amount: params.amount,
      }),
    );

    if (params.memo) {
      // Memo text: limit is roughly 28 bytes
      builder = builder.addMemo(Memo.text(params.memo));
    }

    const tx = builder.setTimeout(60).build();

    // Sign + submit
    tx.sign(sourceKeypair);
    const res = await this.server.submitTransaction(tx);

    return {
      hash: res.hash,
      ledger: res.ledger,
      successful: res.successful,
    };
  }

  /**
   * Builds an UNSIGNED USDC transaction for the Send Crypto flow.
   * Includes a payment to the recipient and a second payment with the fee to the collector.
   * The frontend signs the resulting XDR; the backend only builds it.
   */
  async buildUnsignedUsdcSend(params: {
    sourcePublicKey: string;
    destination: string;
    amount: string;
    feeAddress: string;
    feeAmount: string;
  }) {
    this.assertPublicKey(params.sourcePublicKey);
    this.assertPublicKey(params.destination);
    this.assertPublicKey(params.feeAddress);
    this.assertAmount(params.amount);
    this.assertAmount(params.feeAmount);

    const usdc = this.getUsdcAsset();

    const account = await this.server.loadAccount(params.sourcePublicKey);

    const tx = new TransactionBuilder(account, {
      fee: String(BASE_FEE),
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        Operation.payment({
          destination: params.destination,
          asset: usdc,
          amount: params.amount,
        }),
      )
      .addOperation(
        Operation.payment({
          destination: params.feeAddress,
          asset: usdc,
          amount: params.feeAmount,
        }),
      )
      .setTimeout(180)
      .build();

    return {
      xdr: tx.toXDR(),
      networkPassphrase: this.networkPassphrase,
    };
  }

  /**
   * Receives an XDR already signed by the client and submits it to Stellar.
   * Translates Horizon errors into clear messages.
   */
  async submitSignedXdr(signedXdr: string) {
    let tx;
    try {
      tx = TransactionBuilder.fromXDR(signedXdr, this.networkPassphrase);
    } catch {
      throw new BadRequestException('Invalid or malformed signedXdr.');
    }

    try {
      const res = await this.server.submitTransaction(tx as any);
      return {
        hash: res.hash,
        ledger: res.ledger,
        successful: res.successful,
      };
    } catch (err: any) {
      throw new BadRequestException(describeHorizonError(err));
    }
  }

  /** Builds the USDC Asset from the configured issuer. */
  private getUsdcAsset() {
    const issuer = this.config.get<string>('TRUSTLESS_WORK_USDC_ISSUER');
    if (!issuer) {
      throw new BadRequestException(
        'TRUSTLESS_WORK_USDC_ISSUER is missing to operate with USDC.',
      );
    }
    this.assertPublicKey(issuer);
    return new Asset('USDC', issuer);
  }

  private buildAsset(asset?: { code: string; issuer?: string }) {
    if (!asset || asset.code === 'XLM') return Asset.native();

    if (!asset.issuer) {
      throw new BadRequestException(
        'Non-native assets require an issuer (e.g. USDC issuer).',
      );
    }

    this.assertPublicKey(asset.issuer);
    return new Asset(asset.code, asset.issuer);
  }

  private assertPublicKey(key: string) {
    // simple validation (avoids extra dependencies)
    if (!key || key[0] !== 'G' || key.length < 50) {
      throw new BadRequestException('Invalid public key (must start with G...).');
    }
  }

  private assertAmount(amount: string) {
    // Stellar uses up to 7 decimals, and the amount must be > 0
    if (!AMOUNT_REGEX.test(amount) || Number(amount) <= 0) {
      throw new BadRequestException('Invalid amount. e.g. "1" or "0.1234567"');
    }
  }
}