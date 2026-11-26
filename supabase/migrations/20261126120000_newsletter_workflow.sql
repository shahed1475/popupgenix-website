-- Newsletter: richer subscriber records and a safe public sign-up function.
-- The table already exists (see 20250912201324_*); this only extends it.

ALTER TABLE public.newsletter_subscriptions
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'website',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'subscribed'
    CHECK (status IN ('subscribed', 'unsubscribed')),
  ADD COLUMN IF NOT EXISTS unsubscribed_at timestamptz;

-- Replace the open INSERT policy: the public signs up only through the function below.
DROP POLICY IF EXISTS "Anyone can subscribe to newsletter" ON public.newsletter_subscriptions;

CREATE OR REPLACE FUNCTION public.subscribe_newsletter(p_email text, p_source text DEFAULT 'website')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(trim(p_email));
BEGIN
  IF v_email IS NULL OR length(v_email) > 254 OR v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' THEN
    RAISE EXCEPTION 'invalid email';
  END IF;

  -- Idempotent: a repeat sign-up re-activates the row and never reveals it existed.
  INSERT INTO public.newsletter_subscriptions (email, source)
  VALUES (v_email, left(coalesce(p_source, 'website'), 40))
  ON CONFLICT (email) DO UPDATE
    SET status = 'subscribed', unsubscribed_at = NULL, updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.subscribe_newsletter(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.subscribe_newsletter(text, text) TO anon, authenticated;

-- Admins can manage subscribers (view policy already exists).
DROP POLICY IF EXISTS "Admins can update newsletter subscriptions" ON public.newsletter_subscriptions;
CREATE POLICY "Admins can update newsletter subscriptions"
ON public.newsletter_subscriptions FOR UPDATE
USING (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND is_admin = true));

DROP POLICY IF EXISTS "Admins can delete newsletter subscriptions" ON public.newsletter_subscriptions;
CREATE POLICY "Admins can delete newsletter subscriptions"
ON public.newsletter_subscriptions FOR DELETE
USING (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND is_admin = true));

-- Contact form: allow the public to submit (not read) enquiries. Idempotent.
DROP POLICY IF EXISTS "Public can submit contact form" ON public.contact_submissions;
CREATE POLICY "Public can submit contact form"
ON public.contact_submissions FOR INSERT
WITH CHECK (
  length(name) BETWEEN 1 AND 200
  AND length(email) BETWEEN 3 AND 254
  AND length(message) BETWEEN 1 AND 5000
);
