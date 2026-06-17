import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StellarService } from '../stellar/stellar.service';
import { UsersRepository } from '../users/users.repository';

const STROOPS_PER_UNIT = 10_000_000n; // USDC usa 7 decimales

@Injectable()
export class SendService {
  constructor(
    private readonly config: ConfigService,
    private readonly stellar: StellarService,
    private readonly users: UsersRepository,
  ) {}

  /** Resuelve alias o dirección y devuelve info del destinatario para confirmación. */
  async resolveRecipient(recipient: string) {
    const { address, alias } = await this.resolve(recipient);

    let exists = false;
    let hasUsdcTrustline = false;
    try {
      const balances = await this.stellar.getBalances(address);
      exists = true;
      hasUsdcTrustline = balances.some((b: any) => b.asset_code === 'USDC');
    } catch {
      // loadAccount lanza si la cuenta no existe en la red
      exists = false;
    }

    return { address, alias, exists, hasUsdcTrustline };
  }

  /** Valida, calcula el fee del 0.3% y arma la transacción USDC sin firmar. */
  async prepare(sourcePublicKey: string, recipient: string, amount: string) {
    const { address, alias } = await this.resolve(recipient);

    if (address === sourcePublicKey) {
      throw new BadRequestException('No puedes enviarte a ti mismo.');
    }

    const amountStroops = this.toStroops(amount);
    if (amountStroops <= 0n) {
      throw new BadRequestException('El monto debe ser mayor a 0.');
    }

    const feeStroops = (amountStroops * BigInt(this.feeBps())) / 10_000n;
    if (feeStroops <= 0n) {
      throw new BadRequestException(
        'El monto es demasiado pequeño para calcular el fee del 0.3%.',
      );
    }

    const feeAddress = this.feeCollector();
    const normalizedAmount = this.fromStroops(amountStroops);
    const feeAmount = this.fromStroops(feeStroops);
    const total = this.fromStroops(amountStroops + feeStroops);

    const { xdr, networkPassphrase } = await this.stellar.buildUnsignedUsdcSend({
      sourcePublicKey,
      destination: address,
      amount: normalizedAmount,
      feeAddress,
      feeAmount,
    });

    return {
      recipient: { address, alias },
      asset: 'USDC',
      amount: normalizedAmount,
      fee: feeAmount,
      total,
      unsignedXdr: xdr,
      networkPassphrase,
    };
  }

  /** Envía a Stellar la transacción ya firmada por el frontend. */
  async submit(signedXdr: string) {
    return this.stellar.submitSignedXdr(signedXdr);
  }

  // --- helpers ---

  /** Resuelve un recipient (alias o dirección G...) a { address, alias }. */
  private async resolve(
    recipient: string,
  ): Promise<{ address: string; alias: string | null }> {
    const value = recipient.trim();

    if (this.isStellarAddress(value)) {
      const user = await this.users.findByPublicKey(value);
      return { address: value, alias: user?.alias ?? null };
    }

    const user = await this.users.findByAlias(value);
    if (!user) {
      throw new NotFoundException(
        `No se encontró ninguna wallet para el alias "${value}".`,
      );
    }
    return { address: user.publicKey, alias: user.alias };
  }

  private isStellarAddress(value: string): boolean {
    return value.length === 56 && value[0] === 'G';
  }

  /** 0.3% en basis points (30 bps) configurable vía SEND_CRYPTO_FEE_PERCENT. */
  private feeBps(): number {
    const percent = Number(
      this.config.get<string>('SEND_CRYPTO_FEE_PERCENT') ?? '0.3',
    );
    if (!Number.isFinite(percent) || percent < 0) {
      return 30;
    }
    return Math.round(percent * 100); // 0.3% -> 30 bps
  }

  private feeCollector(): string {
    const address = this.config.get<string>('IKASH_TREASURY_ADDRESS');
    if (!address) {
      throw new BadRequestException(
        'Falta IKASH_TREASURY_ADDRESS para cobrar el fee.',
      );
    }
    return address;
  }

  /** Convierte un monto decimal (string) a stroops (BigInt), 7 decimales. */
  private toStroops(amount: string): bigint {
    if (!/^\d+(\.\d{1,7})?$/.test(amount)) {
      throw new BadRequestException('Monto inválido. Ej: "1" o "0.1234567"');
    }
    const [intPart, decPart = ''] = amount.split('.');
    const decPadded = decPart.padEnd(7, '0');
    return BigInt(intPart) * STROOPS_PER_UNIT + BigInt(decPadded);
  }

  /** Convierte stroops (BigInt) a string decimal con 7 decimales, sin ceros sobrantes. */
  private fromStroops(stroops: bigint): string {
    const intPart = stroops / STROOPS_PER_UNIT;
    const decPart = stroops % STROOPS_PER_UNIT;
    if (decPart === 0n) return intPart.toString();
    const decStr = decPart.toString().padStart(7, '0').replace(/0+$/, '');
    return `${intPart.toString()}.${decStr}`;
  }
}
