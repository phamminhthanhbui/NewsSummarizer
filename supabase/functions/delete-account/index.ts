import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: cors });

    const url = Deno.env.get('SUPABASE_URL');
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !serviceRole) return Response.json({ error: 'Server auth is not configured' }, { status: 500, headers: cors });

    // Service-role key stays only inside the Edge Function. It must never be bundled in the app.
    const admin = createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error: userError } = await admin.auth.getUser(token);
    if (userError || !data.user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: cors });

    const revenueCatSecret = Deno.env.get('REVENUECAT_SECRET_API_KEY');
    if (revenueCatSecret) {
      const rc = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(data.user.id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${revenueCatSecret}`, 'Content-Type': 'application/json' },
      });
      // RevenueCat documents 404 as an idempotent success for "ensure deleted" flows.
      if (rc.status !== 200 && rc.status !== 404) {
        const detail = await rc.text().catch(() => '');
        throw new Error(`RevenueCat deletion failed (${rc.status}) ${detail}`.trim());
      }
    }

    const { error } = await admin.auth.admin.deleteUser(data.user.id);
    if (error) throw error;

    return Response.json({ ok: true, revenueCatDeleted: Boolean(revenueCatSecret) }, { status: 200, headers: cors });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Delete failed' }, { status: 500, headers: cors });
  }
});
