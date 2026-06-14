# Supabase Cron Jobs Setup Guide

This guide shows you how to set up automated cron jobs in Supabase to handle trial expiration and reminders.

## Prerequisites
- Supabase project with CLI installed
- `pg_cron` extension enabled (available on Pro plan and above)

## Option 1: Using Supabase Dashboard (Recommended)

### Step 1: Enable pg_cron Extension
1. Go to your Supabase project dashboard
2. Navigate to **Database** → **Extensions**
3. Search for `pg_cron`
4. Click **Enable**

### Step 2: Create Cron Jobs

Go to **SQL Editor** and run:

\`\`\`sql
-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Job 1: Expire trials every hour
SELECT cron.schedule(
    'expire-trials-hourly',           -- Job name
    '0 * * * *',                      -- Every hour at minute 0
    $$SELECT expire_trials()$$        -- SQL command
);

-- Job 2: Check for trials ending soon (daily at 9 AM UTC)
SELECT cron.schedule(
    'trial-ending-reminders-daily',
    '0 9 * * *',                      -- Every day at 9 AM UTC
    $$
    -- This would typically send emails, for now just log
    INSERT INTO subscription_history (subscription_id, action, new_state, performed_by)
    SELECT 
        s.id,
        'trial_ending_reminder_sent',
        jsonb_build_object(
            'email', trials.email,
            'days_remaining', trials.days_remaining
        ),
        'system'
    FROM (SELECT * FROM get_trials_ending_soon(3)) AS trials
    JOIN subscriptions s ON s.user_id = trials.user_id;
    $$
);

-- Job 3: Clean up old subscription history (monthly)
SELECT cron.schedule(
    'cleanup-old-history-monthly',
    '0 0 1 * *',                      -- First day of month at midnight
    $$
    DELETE FROM subscription_history 
    WHERE created_at < NOW() - INTERVAL '1 year';
    $$
);
\`\`\`

### Step 3: Verify Cron Jobs

\`\`\`sql
-- List all scheduled jobs
SELECT * FROM cron.job;

-- Check job execution history
SELECT * FROM cron.job_run_details 
ORDER BY start_time DESC 
LIMIT 10;
\`\`\`

---

## Option 2: Using Supabase Edge Functions (Alternative)

If you're on the Free plan or prefer serverless functions:

### Step 1: Create Edge Function

\`\`\`bash
cd Backend-Main
supabase functions new expire-trials
\`\`\`

### Step 2: Implement Function

**File**: `supabase/functions/expire-trials/index.ts`

\`\`\`typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Call the expire_trials() database function
    const { data, error } = await supabase.rpc("expire_trials");

    if (error) throw error;

    return new Response(
      JSON.stringify({
        success: true,
        expired_count: data,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
\`\`\`

### Step 3: Deploy Function

\`\`\`bash
supabase functions deploy expire-trials
\`\`\`

### Step 4: Set up External Cron Service

Use a service like **Cron-job.org** or **GitHub Actions**:

**GitHub Actions** (`.github/workflows/expire-trials.yml`):

\`\`\`yaml
name: Expire Trials Cron Job

on:
  schedule:
    - cron: '0 * * * *'  # Every hour
  workflow_dispatch:  # Manual trigger

jobs:
  expire-trials:
    runs-on: ubuntu-latest
    steps:
      - name: Call Supabase Function
        run: |
          curl -X POST \\
            'https://YOUR_PROJECT.supabase.co/functions/v1/expire-trials' \\
            -H "Authorization: Bearer \${{ secrets.SUPABASE_ANON_KEY }}" \\
            -H "Content-Type: application/json"
\`\`\`

---

## Option 3: Using Your Backend Server (Easiest for Development)

If you're running your FastAPI backend continuously:

### Step 1: Install APScheduler

\`\`\`bash
cd Backend-Main
pip install apscheduler
\`\`\`

### Step 2: Create Scheduler Service

**File**: `Backend-Main/app/services/scheduler_service.py`

\`\`\`python
"""
Background scheduler for subscription tasks
"""
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
import structlog

from app.core.database import async_session_maker

logger = structlog.get_logger()

scheduler = AsyncIOScheduler()


async def expire_trials_job():
    """Expire trials that have ended"""
    async with async_session_maker() as session:
        try:
            result = await session.execute(text("SELECT expire_trials()"))
            expired_count = result.scalar()
            logger.info("expired_trials", count=expired_count)
        except Exception as e:
            logger.error("expire_trials_failed", error=str(e))


async def trial_reminders_job():
    """Get trials ending soon for email reminders"""
    async with async_session_maker() as session:
        try:
            result = await session.execute(
                text("SELECT * FROM get_trials_ending_soon(3)")
            )
            trials_ending = result.fetchall()
            
            logger.info(
                "trials_ending_soon", 
                count=len(trials_ending),
                users=[row.email for row in trials_ending]
            )
            
            # TODO: Send actual emails here
            for trial in trials_ending:
                logger.info(
                    "trial_reminder",
                    email=trial.email,
                    days_remaining=trial.days_remaining
                )
                
        except Exception as e:
            logger.error("trial_reminders_failed", error=str(e))


def start_scheduler():
    """Start the background scheduler"""
    
    # Expire trials every hour
    scheduler.add_job(
        expire_trials_job,
        CronTrigger(minute=0),  # Every hour at :00
        id="expire_trials",
        replace_existing=True,
    )
    
    # Check for trial reminders daily at 9 AM
    scheduler.add_job(
        trial_reminders_job,
        CronTrigger(hour=9, minute=0),  # Every day at 9:00 AM
        id="trial_reminders",
        replace_existing=True,
    )
    
    scheduler.start()
    logger.info("scheduler_started", 
               jobs=["expire_trials", "trial_reminders"])


def stop_scheduler():
    """Stop the background scheduler"""
    scheduler.shutdown()
    logger.info("scheduler_stopped")
\`\`\`

### Step 3: Update Main App

**File**: `Backend-Main/app/main.py`

\`\`\`python
from app.services.scheduler_service import start_scheduler, stop_scheduler

@app.on_event("startup")
async def startup_event():
    """Run on application startup"""
    logger.info("application_starting")
    start_scheduler()  # Add this line

@app.on_event("shutdown")
async def shutdown_event():
    """Run on application shutdown"""
    logger.info("application_shutting_down")
    stop_scheduler()  # Add this line
\`\`\`

### Step 4: Update Requirements

\`\`\`bash
echo "apscheduler==3.10.4" >> Backend-Main/requirements.txt
pip install -r Backend-Main/requirements.txt
\`\`\`

---

## Monitoring Cron Jobs

### Check Job Execution

\`\`\`sql
-- For pg_cron
SELECT 
    jobid,
    jobname,
    schedule,
    command,
    nodename,
    nodeport,
    database,
    username
FROM cron.job;

-- Check recent runs
SELECT 
    runid,
    jobid,
    start_time,
    end_time,
    status,
    return_message
FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 20;
\`\`\`

### Check Subscription History

\`\`\`sql
-- View automated actions
SELECT 
    action,
    performed_by,
    created_at,
    new_state
FROM subscription_history
WHERE performed_by = 'system'
ORDER BY created_at DESC
LIMIT 50;
\`\`\`

---

## Troubleshooting

### Cron job not running?

1. **Check extension is enabled**:
   \`\`\`sql
   SELECT * FROM pg_extension WHERE extname = 'pg_cron';
   \`\`\`

2. **Check job status**:
   \`\`\`sql
   SELECT * FROM cron.job WHERE jobname = 'expire-trials-hourly';
   \`\`\`

3. **Check for errors**:
   \`\`\`sql
   SELECT * FROM cron.job_run_details 
   WHERE status = 'failed' 
   ORDER BY start_time DESC;
   \`\`\`

### Manual testing

\`\`\`sql
-- Test expire_trials function manually
SELECT expire_trials();

-- Test trial reminders function manually
SELECT * FROM get_trials_ending_soon(3);
\`\`\`

---

## Recommended Setup

**For Production**:
- ✅ Use **pg_cron** (Option 1) for reliability
- ✅ Set up monitoring alerts
- ✅ Log all job executions

**For Development**:
- ✅ Use **APScheduler** (Option 3) for simplicity
- ✅ Run manually when needed

**For Free Tier**:
- ✅ Use **Edge Functions + GitHub Actions** (Option 2)
- ✅ Costs $0 with GitHub's free minutes

---

## Next Steps

1. Choose your preferred method above
2. Set up the cron jobs
3. Monitor the first few executions
4. Set up email integration for trial reminders

**You're all set! 🎉**
