# ⏳ Notification Retry Backoff Configuration & Policy

This document defines the retry backoff calculation algorithm, validation rules, and configuration parameters for NotifyChain (Issue #707).

---

## 1. Backoff Parameters

| Parameter | Type | Default | Constraints | Description |
|---|---|---|---|---|
| `initialDelayMs` | `number` | `1000` (1s) | `> 0` | Initial delay for the first retry attempt |
| `maxDelayMs` | `number` | `300000` (5m) | `>= initialDelayMs` | Strict maximum upper cap for retry delay |
| `multiplier` | `number` | `2.0` | `>= 1.0` | Exponential scaling factor |
| `jitterRatio` | `number` | `0.2` (±20%) | `0.0 .. 1.0` | Random jitter ratio to avoid thundering herds |
| `maxAttempts` | `number` | `5` | `>= 1` | Maximum retries before dead-letter queueing |

---

## 2. Algorithm & Delay Formula

$$\text{rawDelay} = \min(\text{initialDelayMs} \times \text{multiplier}^{\text{attempt}}, \text{maxDelayMs})$$

$$\text{jitterOffset} = (2 \times \text{random}() - 1) \times (\text{rawDelay} \times \text{jitterRatio})$$

$$\text{boundedDelay} = \max(0, \min(\text{rawDelay} + \text{jitterOffset}, \text{maxDelayMs}))$$

---

## 3. Strict Parameter Validation

Any configuration containing negative intervals, `maxDelayMs < initialDelayMs`, multiplier `< 1.0`, or out-of-range jitter ratios is rejected with descriptive validation errors before the scheduler starts.
