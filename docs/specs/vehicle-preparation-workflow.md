# Vehicle preparation workflow

Status: implemented locally · Migration: `045_vehicle_preparation_workflow.sql` · Remote rollout: deferred

## Operating rule

A vehicle in `preparation` appears automatically in one shared workshop queue. Cleaning/valet and real vehicle photos are mandatory. Dealers may add service, maintenance, bodywork/paint or other work. Every item retains its state, notes and authenticated completer.

Owner/admin select preparation-team members from existing active dealership users. This is a scoped capability, not a new global role: it grants no CRM, customer, cost, payment or sales authority.

The final action is available only when all required items are done and every optional item is done or deliberately skipped. The photo step additionally requires a persisted `vehicle_photos` record. Final sign-off changes the vehicle to `ready_for_sale`, records actor/time and sets an in-app notification timestamp. Completed checklists remain visible as history.

Commands are tenant-scoped, version checked and replay-safe. Direct writes remain unavailable to authenticated clients.
