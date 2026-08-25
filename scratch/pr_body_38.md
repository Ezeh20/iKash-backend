## Summary
Implements a dedicated background synchronization listener (`StellarListenerService`) and event parser (`StellarEventParserService`) to keep backend database records synchronized with on-chain Stellar/Soroban escrow events.

### Key Changes
- **`StellarListenerService`**: Periodically polls Soroban RPC event streams filtered by contract address, with automatic reconnection, ledger sequence recovery, and fault-tolerant event processing.
- **`StellarEventParserService`**: Normalizes raw contract event payloads into typed `OnChainEscrowEvent` objects (`ESCROW_CREATED`, `ESCROW_FUNDED`, `ESCROW_RELEASED`, `ESCROW_REFUNDED`, `ESCROW_CANCELLED`, `ESCROW_DISPUTED`).
- **Database & Order Synchronization**: Automatically updates `EscrowOnChain` (`escrowStatus`, `txHashLock`, `txHashRelease`) and `Order` (`orderStatus`) within database transactions.
- **Idempotency & Auditing**: Ignores duplicate/replayed events, verifies current status before state transitions, logs structured audit records via `AuditLogService`, and emits notification events.
- **Testing**: Added unit test coverage for event parsing and listener status transitions. All 16 repository test suites (119 tests) passed.

Closes #38
