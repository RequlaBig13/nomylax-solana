# Economics

## Customer

Teams running autonomous agents that spend money: research agents buying data
and compute, trading and yield agents, operations agents paying infrastructure.
The buyer is whoever is accountable for the treasury, not the person who wrote
the agent.

## Problem

Agent frameworks solved capability and skipped authority. An agent holding a
private key inherits the full authority of its owner, and its worst decision
costs exactly as much to execute as its best one.

## Value

A bounded loss. The question changes from "could this agent drain the treasury"
to "what is the most this agent can lose in a day", which is a number the owner
sets.

## Why they pay

Nobody funds an autonomous agent from a real treasury without a limit they
control. Nomylax is the thing that makes the first funded agent possible, and
the audit trail is what makes it defensible afterwards.

## Model

| Tier | Price | Scope |
|---|---|---|
| Guardian | Free | One agent, shadow mode, full policy engine |
| Operator | Subscription | Multiple agents, live execution, audit export |
| Fleet | Higher tier | Workspace controls, multiple treasuries, SSO |
| Protocol | Custom | Self hosted, dedicated executor, support terms |

**No billing integration exists.** These tiers are a stated model, not an
implemented product. Nothing in the codebase charges anyone.

## Costs

RPC calls, database, execution gas, hosting. Cost scales with decision volume
rather than value controlled, so margin improves as treasuries grow.

## Expansion

Per agent, then per treasury, then per organisation. An agent count grows on
its own once the first one is trusted.

## Orion relevance

An agent store needs agents that can be funded safely. Nomylax is the control
layer that makes a listed agent fundable by someone who did not write it.
