# New Deal autosave and cancellation refunds

This supersedes the explicit Save Deal footer. Scope: New Deal, agreement triggers,
pre-invoice cancellation refund recording. No remote migrations applied here.

## Persistence

- Autosave begins on the Car & deposit stage with a valid saved customer, vehicle,
  price and salesperson. Incomplete contact/price fields do not create a Deal.
- A durable browser-tab session identifies one Deal. Each write carries a revision
  and request ID. Requests serialize; retries replay the same result. External Deal
  changes reject stale writes rather than overwriting them.
- The form remains open with the saved Deal reference. Local reload recovery also
  preserves partially entered fields; a visible error/retry and unload warning
  distinguish unsaved changes from confirmed database writes.
- No deposit, trade-in or explicit agreement: Vehicle Interest; stock stays available.
- Confirming an added deposit/trade-in or clicking Agreement without deposit creates
  the agreement and reserves stock atomically. Partial typing never records money.
- Recorded payments cannot be removed from a draft array. Use their reversal flow.
  Recorded trade-ins link to the existing protected edit flow before invoice.
- Print Quote becomes Print Agreement. Finish Deal opens invoice review, not an
  automatic invoice. Cancel and eligible Remove retain distinct semantics.

## Refund before cancellation

- Cancellation is blocked until confirmed net receipts are refunded and unconfirmed
  instruments are resolved. There is no automatic transfer or implicit paid refund.
- A user explicitly confirms an already-paid refund with amount, payment method,
  effective date, optional reference (required for cheque/draft), and reason.
- Partial payments reduce the remaining refundable balance. Excess, stale writes,
  replay duplication, invoiced sales, and unresolved trade-in/lender flows are blocked.
- Original receipts remain intact. Refund and cancellation events record the actual
  completed action, actor, recorded timestamp, effective date, amount and method.
- Opening a cancellation/refund panel creates no financial record or success event.

## Deployment / verification

- Local migrations 083 and 084 extend pending migrations 077–082.
- PGlite tests cover creation/replay, stale/tenant rejection, stock price isolation,
  interest competition, all three agreement triggers, refunds and cancellation.
- Demo mode intentionally blocks persistence. It does not simulate a successful
  financial write; full browser persistence requires a migrated test database.
