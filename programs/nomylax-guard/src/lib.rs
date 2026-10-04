use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

declare_id!("FaSSQbpxHB8Ytzqv4nXR5ZocLkiM6RZH8xJ5sqfsNSx6");

const MAX_RECIPIENTS: usize = 8;

#[program]
pub mod nomylax_guard {
    use super::*;

    pub fn initialize_policy(
        ctx: Context<InitializePolicy>,
        max_transaction_lamports: u64,
        daily_limit_lamports: u64,
        rolling_30d_limit_lamports: u64,
        expires_at: i64,
        enforce_recipient_allowlist: bool,
        approved_recipients: Vec<Pubkey>,
        policy_hash: [u8; 32],
    ) -> Result<()> {
        validate_limits(
            max_transaction_lamports,
            daily_limit_lamports,
            rolling_30d_limit_lamports,
        )?;
        require!(approved_recipients.len() <= MAX_RECIPIENTS, GuardError::TooManyRecipients);

        let clock = Clock::get()?;
        require!(expires_at > clock.unix_timestamp, GuardError::InvalidExpiry);

        let policy = &mut ctx.accounts.policy;
        policy.owner = ctx.accounts.owner.key();
        policy.agent = ctx.accounts.agent.key();
        policy.policy_hash = policy_hash;
        policy.max_transaction_lamports = max_transaction_lamports;
        policy.daily_limit_lamports = daily_limit_lamports;
        policy.rolling_30d_limit_lamports = rolling_30d_limit_lamports;
        policy.spent_today_lamports = 0;
        policy.spent_30d_lamports = 0;
        policy.day_bucket = day_bucket(clock.unix_timestamp);
        policy.window_bucket = window_bucket(clock.unix_timestamp);
        policy.expires_at = expires_at;
        policy.enforce_recipient_allowlist = enforce_recipient_allowlist;
        policy.approved_recipients = [Pubkey::default(); MAX_RECIPIENTS];
        policy.approved_recipient_count = approved_recipients.len() as u8;
        for (index, recipient) in approved_recipients.into_iter().enumerate() {
            policy.approved_recipients[index] = recipient;
        }
        policy.paused = false;
        policy.bump = ctx.bumps.policy;
        Ok(())
    }

    pub fn update_limits(
        ctx: Context<OwnerPolicy>,
        max_transaction_lamports: u64,
        daily_limit_lamports: u64,
        rolling_30d_limit_lamports: u64,
    ) -> Result<()> {
        validate_limits(
            max_transaction_lamports,
            daily_limit_lamports,
            rolling_30d_limit_lamports,
        )?;
        let policy = &mut ctx.accounts.policy;
        policy.max_transaction_lamports = max_transaction_lamports;
        policy.daily_limit_lamports = daily_limit_lamports;
        policy.rolling_30d_limit_lamports = rolling_30d_limit_lamports;
        Ok(())
    }

    pub fn update_controls(
        ctx: Context<OwnerPolicy>,
        expires_at: i64,
        enforce_recipient_allowlist: bool,
        approved_recipients: Vec<Pubkey>,
        policy_hash: [u8; 32],
    ) -> Result<()> {
        require!(approved_recipients.len() <= MAX_RECIPIENTS, GuardError::TooManyRecipients);
        let clock = Clock::get()?;
        require!(expires_at > clock.unix_timestamp, GuardError::InvalidExpiry);

        let policy = &mut ctx.accounts.policy;
        policy.expires_at = expires_at;
        policy.enforce_recipient_allowlist = enforce_recipient_allowlist;
        policy.approved_recipients = [Pubkey::default(); MAX_RECIPIENTS];
        policy.approved_recipient_count = approved_recipients.len() as u8;
        for (index, recipient) in approved_recipients.into_iter().enumerate() {
            policy.approved_recipients[index] = recipient;
        }
        policy.policy_hash = policy_hash;

        emit!(PolicyControlsUpdated {
            policy: policy.key(),
            policy_hash,
            expires_at,
            enforce_recipient_allowlist,
            approved_recipient_count: policy.approved_recipient_count,
        });
        Ok(())
    }

    pub fn set_paused(ctx: Context<OwnerPolicy>, paused: bool) -> Result<()> {
        let policy = &mut ctx.accounts.policy;
        policy.paused = paused;
        emit!(PolicyPauseChanged { policy: policy.key(), paused });
        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, lamports: u64) -> Result<()> {
        require!(lamports > 0, GuardError::InvalidAmount);
        transfer(
            CpiContext::new(
                ctx.accounts.system_program.key(),
                Transfer {
                    from: ctx.accounts.owner.to_account_info(),
                    to: ctx.accounts.policy.to_account_info(),
                },
            ),
            lamports,
        )?;
        emit!(VaultFunded { policy: ctx.accounts.policy.key(), lamports });
        Ok(())
    }

    pub fn execute_payment(ctx: Context<ExecutePayment>, lamports: u64, memo_hash: [u8; 32]) -> Result<()> {
        require!(lamports > 0, GuardError::InvalidAmount);
        let clock = Clock::get()?;
        let policy = &mut ctx.accounts.policy;
        require!(!policy.paused, GuardError::PolicyPaused);
        require!(clock.unix_timestamp <= policy.expires_at, GuardError::PermissionExpired);
        require_keys_eq!(policy.agent, ctx.accounts.agent.key(), GuardError::WrongAgent);
        require!(lamports <= policy.max_transaction_lamports, GuardError::TransactionLimitExceeded);

        if policy.enforce_recipient_allowlist {
            let recipient = ctx.accounts.recipient.key();
            let count = policy.approved_recipient_count as usize;
            require!(
                policy.approved_recipients[..count].contains(&recipient),
                GuardError::RecipientNotApproved
            );
        }

        let current_day = day_bucket(clock.unix_timestamp);
        if policy.day_bucket != current_day {
            policy.day_bucket = current_day;
            policy.spent_today_lamports = 0;
        }
        let current_window = window_bucket(clock.unix_timestamp);
        if policy.window_bucket != current_window {
            policy.window_bucket = current_window;
            policy.spent_30d_lamports = 0;
        }

        let next_day = policy
            .spent_today_lamports
            .checked_add(lamports)
            .ok_or(GuardError::ArithmeticOverflow)?;
        let next_window = policy
            .spent_30d_lamports
            .checked_add(lamports)
            .ok_or(GuardError::ArithmeticOverflow)?;
        require!(next_day <= policy.daily_limit_lamports, GuardError::DailyLimitExceeded);
        require!(next_window <= policy.rolling_30d_limit_lamports, GuardError::RollingLimitExceeded);

        let rent_floor = Rent::get()?.minimum_balance(8 + Policy::INIT_SPACE);
        let policy_info = policy.to_account_info();
        let current_balance = policy_info.lamports();
        require!(
            current_balance >= rent_floor.saturating_add(lamports),
            GuardError::InsufficientVaultBalance
        );

        **policy_info.try_borrow_mut_lamports()? = current_balance
            .checked_sub(lamports)
            .ok_or(GuardError::ArithmeticOverflow)?;
        let recipient_info = ctx.accounts.recipient.to_account_info();
        let recipient_balance = recipient_info.lamports();
        **recipient_info.try_borrow_mut_lamports()? = recipient_balance
            .checked_add(lamports)
            .ok_or(GuardError::ArithmeticOverflow)?;

        policy.spent_today_lamports = next_day;
        policy.spent_30d_lamports = next_window;

        emit!(PaymentExecuted {
            policy: policy.key(),
            policy_hash: policy.policy_hash,
            agent: ctx.accounts.agent.key(),
            recipient: ctx.accounts.recipient.key(),
            lamports,
            memo_hash,
            slot: clock.slot,
        });
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializePolicy<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    /// CHECK: Stored as the authority allowed to invoke execute_payment.
    pub agent: UncheckedAccount<'info>,
    #[account(
        init,
        payer = owner,
        space = 8 + Policy::INIT_SPACE,
        seeds = [b"policy", owner.key().as_ref(), agent.key().as_ref()],
        bump
    )]
    pub policy: Account<'info, Policy>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct OwnerPolicy<'info> {
    pub owner: Signer<'info>,
    #[account(mut, has_one = owner)]
    pub policy: Account<'info, Policy>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut, has_one = owner)]
    pub policy: Account<'info, Policy>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExecutePayment<'info> {
    pub agent: Signer<'info>,
    #[account(mut, has_one = agent)]
    pub policy: Account<'info, Policy>,
    /// CHECK: Validated against the policy allowlist when allowlist enforcement is enabled.
    #[account(mut)]
    pub recipient: UncheckedAccount<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct Policy {
    pub owner: Pubkey,
    pub agent: Pubkey,
    pub policy_hash: [u8; 32],
    pub max_transaction_lamports: u64,
    pub daily_limit_lamports: u64,
    pub rolling_30d_limit_lamports: u64,
    pub spent_today_lamports: u64,
    pub spent_30d_lamports: u64,
    pub day_bucket: i64,
    pub window_bucket: i64,
    pub expires_at: i64,
    pub enforce_recipient_allowlist: bool,
    pub approved_recipients: [Pubkey; MAX_RECIPIENTS],
    pub approved_recipient_count: u8,
    pub paused: bool,
    pub bump: u8,
}

#[event]
pub struct PaymentExecuted {
    pub policy: Pubkey,
    pub policy_hash: [u8; 32],
    pub agent: Pubkey,
    pub recipient: Pubkey,
    pub lamports: u64,
    pub memo_hash: [u8; 32],
    pub slot: u64,
}

#[event]
pub struct PolicyPauseChanged {
    pub policy: Pubkey,
    pub paused: bool,
}

#[event]
pub struct PolicyControlsUpdated {
    pub policy: Pubkey,
    pub policy_hash: [u8; 32],
    pub expires_at: i64,
    pub enforce_recipient_allowlist: bool,
    pub approved_recipient_count: u8,
}

#[event]
pub struct VaultFunded {
    pub policy: Pubkey,
    pub lamports: u64,
}

#[error_code]
pub enum GuardError {
    #[msg("Policy limits are invalid")]
    InvalidLimit,
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Policy is paused")]
    PolicyPaused,
    #[msg("The signer is not this policy's agent")]
    WrongAgent,
    #[msg("Single transaction limit exceeded")]
    TransactionLimitExceeded,
    #[msg("Daily limit exceeded")]
    DailyLimitExceeded,
    #[msg("Rolling 30 day limit exceeded")]
    RollingLimitExceeded,
    #[msg("Policy vault does not have enough spendable lamports")]
    InsufficientVaultBalance,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("Permission has expired")]
    PermissionExpired,
    #[msg("Expiry must be in the future")]
    InvalidExpiry,
    #[msg("Recipient is not approved by this policy")]
    RecipientNotApproved,
    #[msg("Too many approved recipients")]
    TooManyRecipients,
}

fn validate_limits(max_transaction_lamports: u64, daily_limit_lamports: u64, rolling_30d_limit_lamports: u64) -> Result<()> {
    require!(max_transaction_lamports > 0, GuardError::InvalidLimit);
    require!(max_transaction_lamports <= daily_limit_lamports, GuardError::InvalidLimit);
    require!(daily_limit_lamports <= rolling_30d_limit_lamports, GuardError::InvalidLimit);
    Ok(())
}

fn day_bucket(unix_timestamp: i64) -> i64 {
    unix_timestamp.div_euclid(86_400)
}

fn window_bucket(unix_timestamp: i64) -> i64 {
    unix_timestamp.div_euclid(86_400 * 30)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bucket_boundaries_are_deterministic() {
        assert_eq!(day_bucket(86_399), 0);
        assert_eq!(day_bucket(86_400), 1);
        assert_eq!(window_bucket((86_400 * 30) - 1), 0);
        assert_eq!(window_bucket(86_400 * 30), 1);
    }
}
