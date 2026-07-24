-- The runtime role — the reason RLS actually bites.
--
-- Neon's default neondb_owner carries BYPASSRLS, so the app must NEVER connect
-- as it. docflow_app is a plain role: no ownership, no bypass — policies apply.
-- neondb_owner remains migrations-only. The password is NOT set here (a
-- committed password would be a leaked secret): scripts/set-app-role-password.mjs
-- sets it from the untracked .env.

DO $$
BEGIN
  CREATE ROLE docflow_app LOGIN;
EXCEPTION
  WHEN duplicate_object THEN NULL; -- re-runnable on shadow/reset databases
END
$$;

GRANT USAGE ON SCHEMA public TO docflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO docflow_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO docflow_app;

-- Future tables created by migrations (as neondb_owner) get the same grants.
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO docflow_app;
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO docflow_app;

-- The migrations ledger is none of the runtime business. Guarded: the shadow
-- database replays this SQL without ever creating the ledger table.
DO $$
BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    REVOKE ALL ON TABLE "_prisma_migrations" FROM docflow_app;
  END IF;
END
$$;
--
-- (handled above)
