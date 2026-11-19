// Supabase Edge Function: send-notification-email
// Disparada de forma assíncrona via Database Webhook em public.notifications (INSERT)
// Não bloqueia as transações nem os fluxos do banco de dados (resiliente a falhas de e-mail).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CRITICAL_TYPES = [
  'appointment_cancelled',
  'appointment_rescheduled',
  'business_approved',
  'business_rejected',
]

const SITE_URL = 'https://schediaagendamentostcc.vercel.app'

serve(async (req) => {
  // Responde imediatamente a preflights CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  try {
    const payload = await req.json()
    // O payload do Supabase Database Webhook contém { type: 'INSERT', table: 'notifications', record: { ... } }
    const record = payload.record || payload

    if (!record || !record.user_id || !record.type) {
      return new Response(JSON.stringify({ ok: true, skipped: 'invalid_payload' }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 1. Apenas processa tipos críticos de notificação
    if (!CRITICAL_TYPES.includes(record.type)) {
      return new Response(JSON.stringify({ ok: true, skipped: 'non_critical_type', type: record.type }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 2. Cria cliente admin para consultar auth.users e profiles
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

    if (!supabaseUrl || !supabaseServiceKey) {
      console.warn('[send-notification-email] Variáveis SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausentes.')
      return new Response(JSON.stringify({ ok: false, error: 'missing_supabase_env' }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // 3. Verifica preferência de e-mail do usuário em public.profiles
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('full_name, email_notifications')
      .eq('id', record.user_id)
      .maybeSingle()

    if (profile && profile.email_notifications === false) {
      return new Response(JSON.stringify({ ok: true, skipped: 'user_disabled_email_notifications' }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 4. Obtém o e-mail do destinatário via auth.admin
    const { data: userData, error: userErr } = await supabaseAdmin.auth.admin.getUserById(record.user_id)
    const recipientEmail = userData?.user?.email

    if (userErr || !recipientEmail) {
      console.warn(`[send-notification-email] E-mail não encontrado para user_id: ${record.user_id}`)
      return new Response(JSON.stringify({ ok: true, skipped: 'recipient_email_not_found' }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 5. Verifica se o provedor de e-mail está configurado (ex.: Resend)
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const emailFrom = Deno.env.get('EMAIL_FROM') || 'Schedia <notificacoes@resend.dev>'

    if (!resendApiKey) {
      console.log(
        `[send-notification-email] RESEND_API_KEY não configurada. E-mail simulado para ${recipientEmail}: "${record.title}". Notificação in-app mantida com sucesso.`
      )
      return new Response(
        JSON.stringify({
          ok: true,
          skipped: 'provider_not_configured',
          note: 'Configure RESEND_API_KEY nos Secrets da Edge Function para envio ativo.',
        }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    }

    // 6. Template HTML responsivo em português (design system roxo Schedia)
    const emailHtml = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(record.title)}</title>
</head>
<body style="margin:0;padding:24px 0;background-color:#0f0f13;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e2e8f0;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:540px;margin:0 auto;background:#181824;border-radius:12px;border:1px solid #2e2e42;overflow:hidden;">
    <tr>
      <td style="padding:28px 32px;background:linear-gradient(135deg, #7c3aed 0%, #4c1d95 100%);">
        <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">Schedia</h1>
        <p style="margin:4px 0 0;color:#ddd6fe;font-size:13px;">Agendamentos e Gestão de Negócios</p>
      </td>
    </tr>
    <tr>
      <td style="padding:32px;">
        <h2 style="margin:0 0 16px;color:#ffffff;font-size:18px;font-weight:600;">${escapeHtml(record.title)}</h2>
        <p style="margin:0 0 24px;color:#cbd5e1;font-size:15px;line-height:1.6;">
          ${escapeHtml(record.body)}
        </p>
        <div style="margin:28px 0 16px;">
          <a href="${SITE_URL}" style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:8px;box-shadow:0 4px 12px rgba(124,58,237,0.35);">
            Acessar o Schedia →
          </a>
        </div>
      </td>
    </tr>
    <tr>
      <td style="padding:20px 32px;background:#13131c;border-top:1px solid #232334;font-size:12px;color:#64748b;text-align:center;">
        Esta é uma notificação automática do sistema Schedia.<br>
        Você pode gerenciar suas notificações acessando sua conta.
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim()

    // 7. Envia via Resend API
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: emailFrom,
        to: [recipientEmail],
        subject: `[Schedia] ${record.title}`,
        html: emailHtml,
      }),
    })

    const resendData = await resendRes.json()

    if (!resendRes.ok) {
      console.error('[send-notification-email] Erro ao enviar pelo Resend:', resendData)
      return new Response(JSON.stringify({ ok: false, error: resendData }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    console.log(`[send-notification-email] E-mail enviado com sucesso para ${recipientEmail}:`, resendData.id)
    return new Response(JSON.stringify({ ok: true, email_id: resendData.id }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    // Nunca falha com 500 para não quebrar webhooks
    console.error('[send-notification-email] Exceção capturada:', err)
    return new Response(JSON.stringify({ ok: false, error: err?.message || 'internal_error' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }
})

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
