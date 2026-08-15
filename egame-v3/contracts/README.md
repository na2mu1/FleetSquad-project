# Escrow.sol

## What it does
Holds a buyer's deposited ERC20 (USDT) per trade until the buyer confirms
receipt of the manually-transferred account, then splits funds 92% seller /
8% platform. Includes a 72h auto-release safety valve and a dispute path
resolved by an on-chain arbiter (your platform's admin wallet or multisig).

## Before you deploy this to mainnet
This contract is a **reference implementation** matching the backend's
escrow state machine — it is not audited. Before real funds touch it:

1. **Get a professional audit.** This is non-negotiable for anything
   holding user funds. Budget for at least one reputable firm (OpenZeppelin,
   Trail of Bits, etc.) before mainnet deployment.
2. **Decide your chain.** The brief asks for USDT-TRC20 (Tron), but this
   contract is written in Solidity for EVM chains. Tron uses TVM, which is
   Solidity-*like* but not identical — you'll either deploy this on an EVM
   chain (Ethereum, Polygon, BSC, Arbitrum — all of which have liquid USDT)
   or port it to TVM for native TRC20 support. Decide this early; it
   changes your WalletConnect integration too.
3. **Use a multisig for `arbiter` and `owner`**, never a single EOA, once
   real money is involved.
4. **Add a platform-fee timelock or DAO governance** if you want users to
   trust that commission/arbiter can't be changed unilaterally overnight.
5. **Gas-test `resolveDispute` and `autoRelease` paths**, not just the
   happy path — those are exactly the functions bad actors will probe.

## Local development
```bash
npm install --save-dev hardhat @openzeppelin/contracts
npx hardhat compile
```

Deploy with constructor args: `(usdtTokenAddress, platformWalletAddress, arbiterAddress)`.

## Wiring to the backend
The backend's `/api/escrow` routes already mirror this contract's state
machine 1:1 (see `backend/routes/escrow.js`). To go from simulated to real:
1. Frontend calls `deposit()` via WalletConnect instead of hitting `/api/escrow` directly.
2. Pass the resulting transaction hash to `POST /api/escrow` as `chainTxHash` so the backend mirrors on-chain state into the dashboards.
3. Have a small indexer (or a subgraph) listen for `Released`/`Disputed`/`AutoReleased` events and PATCH the corresponding `escrow_transactions` row — this keeps the DB in sync even if a user closes the tab mid-transaction.
