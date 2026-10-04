# Incident response

1. Put the affected agent into Safe Mode or pause its on-chain Guard policy if deployed.
2. Reject new economic intents.
3. Disconnect or revoke agent authority.
4. Review recent decisions, recipients, risk signals and Solana signatures.
5. If a Guard vault is deployed, move remaining funds under owner control using the documented recovery path.
6. Rotate affected endpoint credentials or API keys.
7. Preserve transaction signatures and audit records for analysis.
8. Re-enable the agent only after the owner reviews its constitution and root cause.

Never respond to a suspected incident by increasing limits simply to make failing requests pass.
