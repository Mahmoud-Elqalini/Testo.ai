-- 005-group-invitations: reusable group join codes with server-side controls.
-- The usable invitation code is returned only by create/rotate RPCs. Database
-- state stores only a SHA-256 digest and all access goes through RPC functions.

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE private.group_invitations (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  group_id uuid NOT NULL UNIQUE REFERENCES public.groups(id) ON DELETE CASCADE,
  code_hash bytea NOT NULL UNIQUE,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);

CREATE TABLE private.group_invitation_redemption_limits (
  student_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  window_started_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  blocked_until timestamptz
);

ALTER TABLE private.group_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.group_invitation_redemption_limits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE private.group_invitations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE private.group_invitation_redemption_limits FROM PUBLIC, anon, authenticated;

-- pgcrypto may already be installed in either public or extensions, depending
-- on the environment. Resolve its actual schema at migration time, then pin it
-- into these helper definitions so every SECURITY DEFINER function has an empty
-- search_path and schema-qualified cryptographic calls.
DO $migration$
DECLARE
  v_extension_schema text;
BEGIN
  SELECT namespace.nspname
    INTO v_extension_schema
    FROM pg_catalog.pg_extension AS extension
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = extension.extnamespace
   WHERE extension.extname = 'pgcrypto';

  IF v_extension_schema IS NULL THEN
    RAISE EXCEPTION 'The pgcrypto extension must be installed before group invitations';
  END IF;

  EXECUTE pg_catalog.format($definition$
    CREATE OR REPLACE FUNCTION private.group_invitation_new_code()
    RETURNS text
    LANGUAGE sql
    VOLATILE
    SECURITY DEFINER
    SET search_path = ''
    AS $function$
      SELECT pg_catalog.encode(%I.gen_random_bytes(16), 'hex')
    $function$
  $definition$, v_extension_schema);

  EXECUTE pg_catalog.format($definition$
    CREATE OR REPLACE FUNCTION private.group_invitation_code_hash(target_code text)
    RETURNS bytea
    LANGUAGE sql
    IMMUTABLE
    SECURITY DEFINER
    SET search_path = ''
    AS $function$
      SELECT %I.digest(target_code, 'sha256')
    $function$
  $definition$, v_extension_schema);
END;
$migration$;

REVOKE ALL ON FUNCTION private.group_invitation_new_code() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.group_invitation_code_hash(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_group_invitation(target_group_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_code text;
  v_expires_at timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_admin() OR NOT private.owns_group(target_group_id) THEN
    RAISE EXCEPTION 'Invitation management is not available for this group' USING ERRCODE = '42501';
  END IF;

  v_code := private.group_invitation_new_code();

  INSERT INTO private.group_invitations AS existing (
    group_id, code_hash, created_by, created_at, expires_at, revoked_at
  ) VALUES (
    target_group_id,
    private.group_invitation_code_hash(v_code),
    auth.uid(),
    pg_catalog.now(),
    pg_catalog.now() + interval '30 days',
    NULL
  )
  ON CONFLICT (group_id) DO UPDATE
    SET code_hash = EXCLUDED.code_hash,
        created_by = EXCLUDED.created_by,
        created_at = EXCLUDED.created_at,
        expires_at = EXCLUDED.expires_at,
        revoked_at = NULL
  RETURNING existing.expires_at INTO v_expires_at;

  RETURN pg_catalog.jsonb_build_object('code', v_code, 'expires_at', v_expires_at);
END;
$function$;

CREATE OR REPLACE FUNCTION public.rotate_group_invitation(target_group_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_code text;
  v_expires_at timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_admin() OR NOT private.owns_group(target_group_id) THEN
    RAISE EXCEPTION 'Invitation management is not available for this group' USING ERRCODE = '42501';
  END IF;

  v_code := private.group_invitation_new_code();

  INSERT INTO private.group_invitations AS existing (
    group_id, code_hash, created_by, created_at, expires_at, revoked_at
  ) VALUES (
    target_group_id,
    private.group_invitation_code_hash(v_code),
    auth.uid(),
    pg_catalog.now(),
    pg_catalog.now() + interval '30 days',
    NULL
  )
  ON CONFLICT (group_id) DO UPDATE
    SET code_hash = EXCLUDED.code_hash,
        created_by = EXCLUDED.created_by,
        created_at = EXCLUDED.created_at,
        expires_at = EXCLUDED.expires_at,
        revoked_at = NULL
  RETURNING existing.expires_at INTO v_expires_at;

  RETURN pg_catalog.jsonb_build_object('code', v_code, 'expires_at', v_expires_at);
END;
$function$;

CREATE OR REPLACE FUNCTION public.revoke_group_invitation(target_group_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_found boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_admin() OR NOT private.owns_group(target_group_id) THEN
    RAISE EXCEPTION 'Invitation management is not available for this group' USING ERRCODE = '42501';
  END IF;

  UPDATE private.group_invitations
     SET revoked_at = COALESCE(revoked_at, pg_catalog.now())
   WHERE group_id = target_group_id;
  v_found := FOUND;

  RETURN pg_catalog.jsonb_build_object('revoked', v_found);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_group_invitation_status(target_group_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_invitation private.group_invitations%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_admin() OR NOT private.owns_group(target_group_id) THEN
    RAISE EXCEPTION 'Invitation management is not available for this group' USING ERRCODE = '42501';
  END IF;

  SELECT invitation.*
    INTO v_invitation
    FROM private.group_invitations AS invitation
   WHERE invitation.group_id = target_group_id;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'exists', false, 'created_at', NULL, 'expires_at', NULL, 'revoked_at', NULL
    );
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'exists', true,
    'created_at', v_invitation.created_at,
    'expires_at', v_invitation.expires_at,
    'revoked_at', v_invitation.revoked_at
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.redeem_group_invitation(invitation_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_student_id uuid := auth.uid();
  v_limit private.group_invitation_redemption_limits%ROWTYPE;
  v_invitation private.group_invitations%ROWTYPE;
  v_code text;
BEGIN
  IF v_student_id IS NULL OR NOT private.is_student() THEN
    RETURN pg_catalog.jsonb_build_object('success', false);
  END IF;

  INSERT INTO private.group_invitation_redemption_limits (student_id)
  VALUES (v_student_id)
  ON CONFLICT (student_id) DO NOTHING;

  SELECT limits.*
    INTO v_limit
    FROM private.group_invitation_redemption_limits AS limits
   WHERE limits.student_id = v_student_id
   FOR UPDATE;

  IF v_limit.window_started_at <= pg_catalog.now() - interval '15 minutes' THEN
    UPDATE private.group_invitation_redemption_limits
       SET window_started_at = pg_catalog.now(), failed_attempts = 0, blocked_until = NULL
     WHERE student_id = v_student_id
    RETURNING * INTO v_limit;
  END IF;

  IF v_limit.blocked_until IS NOT NULL AND v_limit.blocked_until > pg_catalog.now() THEN
    RETURN pg_catalog.jsonb_build_object('success', false);
  END IF;

  v_code := pg_catalog.lower(pg_catalog.btrim(COALESCE(invitation_code, '')));
  IF v_code !~ '^[a-f0-9]{32}$' THEN
    UPDATE private.group_invitation_redemption_limits
       SET failed_attempts = failed_attempts + 1,
           blocked_until = CASE
             WHEN failed_attempts + 1 >= 5 THEN window_started_at + interval '15 minutes'
             ELSE NULL
           END
     WHERE student_id = v_student_id;
    RETURN pg_catalog.jsonb_build_object('success', false);
  END IF;

  SELECT invitation.*
    INTO v_invitation
    FROM private.group_invitations AS invitation
   WHERE invitation.code_hash = private.group_invitation_code_hash(v_code)
   FOR UPDATE;

  IF NOT FOUND
     OR v_invitation.revoked_at IS NOT NULL
     OR v_invitation.expires_at <= pg_catalog.now()
  THEN
    UPDATE private.group_invitation_redemption_limits
       SET failed_attempts = failed_attempts + 1,
           blocked_until = CASE
             WHEN failed_attempts + 1 >= 5 THEN window_started_at + interval '15 minutes'
             ELSE NULL
           END
     WHERE student_id = v_student_id;
    RETURN pg_catalog.jsonb_build_object('success', false);
  END IF;

  INSERT INTO public.group_students (group_id, student_id)
  VALUES (v_invitation.group_id, v_student_id)
  ON CONFLICT (group_id, student_id) DO NOTHING;

  UPDATE private.group_invitation_redemption_limits
     SET window_started_at = pg_catalog.now(), failed_attempts = 0, blocked_until = NULL
   WHERE student_id = v_student_id;

  RETURN pg_catalog.jsonb_build_object('success', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.create_group_invitation(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rotate_group_invitation(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_group_invitation(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_group_invitation_status(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.redeem_group_invitation(text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_group_invitation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_group_invitation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_group_invitation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_group_invitation_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_group_invitation(text) TO authenticated;
