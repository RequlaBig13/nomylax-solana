# Risk model

## NRS

A single value from 0 to 100.

| Band | Range |
|---|---|
| LOW | 0 to 29 |
| MODERATE | 30 to 54 |
| HIGH | 55 to 74 |
| CRITICAL | 75 to 100 |

## Factors

| Factor | Weight | Derivation |
|---|---|---|
| Unknown recipient | 0.22 | Allowlist match, or the adapter's verification flag |
| Policy deviation | 0.19 | Size of the breach against transaction and daily limits |
| Amount anomaly | 0.14 | Distance above the agent's normal transaction size |
| Spend velocity | 0.14 | Day-to-date spend including this request against the daily limit |
| Contract risk | 0.12 | Supplied by the adapter, defaults to a low baseline |
| Liquidity risk | 0.10 | Share of free treasury consumed, excluding the reserve |
| Operational failures | 0.09 | Recorded failures against the configured threshold |

## Severity floor

A weighted mean lets benign signals dilute a dangerous one. A payment inside
every limit, sent to an unknown address through a high risk contract, scored 46
under the mean alone. That is the shape of a drain and it must not read as
moderate.

Any single factor at or above 90 floors the score at 55. Two or more floor it
at 75. The floor is deterministic and reported on the result as `escalation`,
so an owner can always see why a score was raised.

## Explainability

Every score returns its seven components with their weights, plus the
escalation string when a floor applied. No random component exists. Identical
inputs always produce an identical score, which `tests/policy.test.ts` asserts
across repeated evaluation.
