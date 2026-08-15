import { Injectable, Logger } from '@nestjs/common';
import {
  OnChainEscrowEvent,
  OnChainEscrowEventType,
  SorobanEventRaw,
} from './types/stellar-event.types';

@Injectable()
export class StellarEventParserService {
  private readonly logger = new Logger(StellarEventParserService.name);

  /**
   * Parse a raw Soroban contract event or JSON payload into a normalized OnChainEscrowEvent.
   * Returns null if the event is not a recognized escrow event or is malformed.
   */
  parseEvent(rawEvent: SorobanEventRaw | any): OnChainEscrowEvent | null {
    if (!rawEvent || typeof rawEvent !== 'object') {
      return null;
    }

    try {
      const contractId = rawEvent.contractId || rawEvent.contract_id;
      const txHash = rawEvent.txHash || rawEvent.tx_hash || rawEvent.transactionHash || '';
      const ledgerSequence = Number(rawEvent.ledger || rawEvent.ledgerSequence || 0);
      const eventIndex = Number(rawEvent.eventIndex || rawEvent.index || 0);

      if (!contractId) {
        this.logger.debug('Event missing contractId, skipping');
        return null;
      }

      // Determine event type from topics or direct eventType field
      const topics: string[] = Array.isArray(rawEvent.topic)
        ? rawEvent.topic.map((t) => this.stringifyTopic(t))
        : Array.isArray(rawEvent.topics)
          ? rawEvent.topics.map((t: any) => this.stringifyTopic(t))
          : [];

      const directType = rawEvent.eventType || rawEvent.event_type || rawEvent.type;
      const eventType = this.resolveEventType(directType, topics);

      if (!eventType) {
        this.logger.debug(`Could not resolve escrow event type for event ${rawEvent.id}`);
        return null;
      }

      const eventId =
        rawEvent.id ||
        `${txHash}:${ledgerSequence}:${eventIndex}`;

      const engagementId = this.extractEngagementId(rawEvent, topics);
      const amount = this.extractAmount(rawEvent);

      return {
        eventId,
        eventType,
        contractId,
        txHash,
        ledgerSequence,
        eventIndex,
        engagementId,
        amount,
        timestamp: rawEvent.ledgerClosedAt ? new Date(rawEvent.ledgerClosedAt) : new Date(),
        payload: typeof rawEvent.value === 'object' ? rawEvent.value : { value: rawEvent.value },
      };
    } catch (err: any) {
      this.logger.warn(`Failed to parse event: ${err.message}`);
      return null;
    }
  }

  private stringifyTopic(topic: any): string {
    if (typeof topic === 'string') return topic;
    if (topic && typeof topic === 'object') {
      if (topic._value) return String(topic._value);
      if (topic.value) return String(topic.value);
      return JSON.stringify(topic);
    }
    return String(topic);
  }

  private resolveEventType(
    directType: any,
    topics: string[],
  ): OnChainEscrowEventType | null {
    const candidateStr = [
      directType,
      ...topics,
    ]
      .filter(Boolean)
      .join(' ')
      .toUpperCase();

    if (candidateStr.includes('ESCROW_CREATED') || candidateStr.includes('INITIALIZE') || candidateStr.includes('CREATED')) {
      return 'ESCROW_CREATED';
    }
    if (candidateStr.includes('ESCROW_FUNDED') || candidateStr.includes('FUND')) {
      return 'ESCROW_FUNDED';
    }
    if (candidateStr.includes('ESCROW_RELEASED') || candidateStr.includes('RELEASE')) {
      return 'ESCROW_RELEASED';
    }
    if (candidateStr.includes('ESCROW_REFUNDED') || candidateStr.includes('REFUND')) {
      return 'ESCROW_REFUNDED';
    }
    if (candidateStr.includes('ESCROW_CANCELLED') || candidateStr.includes('CANCEL')) {
      return 'ESCROW_CANCELLED';
    }
    if (candidateStr.includes('ESCROW_DISPUTED') || candidateStr.includes('DISPUTE')) {
      return 'ESCROW_DISPUTED';
    }

    return null;
  }

  private extractEngagementId(rawEvent: any, topics: string[]): string | undefined {
    if (rawEvent.engagementId) return String(rawEvent.engagementId);
    if (rawEvent.orderId) return String(rawEvent.orderId);

    if (rawEvent.value && typeof rawEvent.value === 'object') {
      if (rawEvent.value.engagementId) return String(rawEvent.value.engagementId);
      if (rawEvent.value.orderId) return String(rawEvent.value.orderId);
      if (rawEvent.value.engagement_id) return String(rawEvent.value.engagement_id);
    }

    for (const t of topics) {
      if (t.startsWith('order_') || t.startsWith('eng_') || /^[0-9a-fA-F-]{36}$/.test(t)) {
        return t;
      }
    }

    return undefined;
  }

  private extractAmount(rawEvent: any): string | undefined {
    if (rawEvent.amount) return String(rawEvent.amount);
    if (rawEvent.value && typeof rawEvent.value === 'object' && rawEvent.value.amount) {
      return String(rawEvent.value.amount);
    }
    return undefined;
  }
}
