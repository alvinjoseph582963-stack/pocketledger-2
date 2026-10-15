# PocketLedger Cloud Sync setup

1. In `app.js`, replace `YOUR_SUPABASE_PROJECT_URL` with your Supabase project URL and `YOUR_SUPABASE_ANON_KEY` with your `sb_publishable_...` key. Keep the quotation marks. Never use a `service_role` or secret key in browser code.
2. In Supabase Dashboard → SQL Editor, run:

```sql
create table if not exists public.pocketledger_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.pocketledger_data enable row level security;
create policy "Users can read their own PocketLedger data" on public.pocketledger_data for select to authenticated using (auth.uid() = user_id);
create policy "Users can insert their own PocketLedger data" on public.pocketledger_data for insert to authenticated with check (auth.uid() = user_id);
create policy "Users can update their own PocketLedger data" on public.pocketledger_data for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

If you already created any policies with the same names, remove them first or use different names.
3. Deploy the files to Vercel. Open the site, create an account, and sign in on each device with the same account.
4. If email confirmation is enabled, confirm the signup email before signing in.

Important: the first successful login loads cloud data into the browser. If the cloud row is empty, the current device data is uploaded. To avoid overwriting existing records, sign in first on the device that has the correct latest data. Keep a JSON backup too.
