# AutoShare Contract API Examples

Reference examples for integrating with the AutoShare Soroban contract.
All Stellar CLI invocations target testnet; swap `--network testnet` for `--network mainnet` in production.

---

## subscribe (create)

Creates a new AutoShare group and locks in the initial payment for `usage_count` usages.

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `id` | `BytesN<32>` | Unique group identifier (32-byte hex) |
| `name` | `String` | Human-readable group name |
| `creator` | `Address` | Wallet address of the creator |
| `usage_count` | `u32` | Number of usages to pre-purchase |
| `payment_token` | `Address` | Token contract address used for payment |

**Stellar CLI**

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source creator-key \
  --network testnet \
  -- \
  create \
  --id 0000000000000000000000000000000000000000000000000000000000000001 \
  --name "Team Alpha Plan" \
  --creator GABC1234...XYZ \
  --usage_count 100 \
  --payment_token CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
```

**Expected outcome**

- A new group is stored on-chain with `is_active = true` and `usage_count = 100`.
- Contract emits `AutoshareCreated { creator, group_id }`.
- The creator's wallet is debited `usage_count × usage_fee` tokens.

**JavaScript / TypeScript SDK**

```typescript
import { Contract, SorobanRpc, TransactionBuilder, Networks, BASE_FEE } from "@stellar/stellar-sdk";

const CONTRACT_ID = "<CONTRACT_ID>";
const server = new SorobanRpc.Server("https://soroban-testnet.stellar.org");

const groupId = Buffer.alloc(32, 0);
groupId[31] = 1; // unique id bytes

const tx = new TransactionBuilder(creatorAccount, {
  fee: BASE_FEE,
  networkPassphrase: Networks.TESTNET,
})
  .addOperation(
    contract.call(
      "create",
      xdr.ScVal.scvBytes(groupId),             // id
      nativeToScVal("Team Alpha Plan"),         // name
      nativeToScVal(creatorAddress, { type: "address" }), // creator
      nativeToScVal(100, { type: "u32" }),      // usage_count
      nativeToScVal(tokenAddress, { type: "address" }),   // payment_token
    )
  )
  .setTimeout(30)
  .build();
```

---

## execute_payment (topup_subscription)

Tops up an existing group by purchasing additional usages.

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `id` | `BytesN<32>` | Group identifier |
| `additional_usages` | `u32` | Number of usages to add |
| `payment_token` | `Address` | Token used for payment |
| `payer` | `Address` | Address authorising the payment |

**Stellar CLI**

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source payer-key \
  --network testnet \
  -- \
  topup_subscription \
  --id 0000000000000000000000000000000000000000000000000000000000000001 \
  --additional_usages 50 \
  --payment_token CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC \
  --payer GABC1234...XYZ
```

**Expected outcome**

- `usage_count` for the group increases by `50`.
- Payer is debited `50 × usage_fee` tokens.
- A `PaymentHistory` record is appended for the payer and the group.

**JavaScript / TypeScript SDK**

```typescript
const tx = new TransactionBuilder(payerAccount, {
  fee: BASE_FEE,
  networkPassphrase: Networks.TESTNET,
})
  .addOperation(
    contract.call(
      "topup_subscription",
      xdr.ScVal.scvBytes(groupId),
      nativeToScVal(50, { type: "u32" }),
      nativeToScVal(tokenAddress, { type: "address" }),
      nativeToScVal(payerAddress, { type: "address" }),
    )
  )
  .setTimeout(30)
  .build();
```

---

## cancel (deactivate_group)

Deactivates a group. Only the creator can call this. The group data is preserved on-chain for audit purposes.

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `id` | `BytesN<32>` | Group identifier |
| `caller` | `Address` | Must match the group's creator address |

**Stellar CLI**

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source creator-key \
  --network testnet \
  -- \
  deactivate_group \
  --id 0000000000000000000000000000000000000000000000000000000000000001 \
  --caller GABC1234...XYZ
```

**Expected outcome**

- Group `is_active` is set to `false`.
- Contract emits `GroupDeactivated { creator, group_id }`.
- Subsequent payment attempts against the group will fail with an error.

**Error cases**

| Error | Cause |
|-------|-------|
| `Unauthorized` | `caller` does not match the group creator |
| `GroupNotFound` | No group exists for the given `id` |
| `GroupAlreadyInactive` | Group is already deactivated |

**JavaScript / TypeScript SDK**

```typescript
const tx = new TransactionBuilder(creatorAccount, {
  fee: BASE_FEE,
  networkPassphrase: Networks.TESTNET,
})
  .addOperation(
    contract.call(
      "deactivate_group",
      xdr.ScVal.scvBytes(groupId),
      nativeToScVal(creatorAddress, { type: "address" }),
    )
  )
  .setTimeout(30)
  .build();
```

---

## Re-activating a cancelled group

Use `activate_group` with the same `id` and creator `caller` to restore the group.

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source creator-key \
  --network testnet \
  -- \
  activate_group \
  --id 0000000000000000000000000000000000000000000000000000000000000001 \
  --caller GABC1234...XYZ
```

---

> Full interface specification: [`contract/contracts/hello-world/src/interfaces/autoshare.rs`](../contract/contracts/hello-world/src/interfaces/autoshare.rs)
