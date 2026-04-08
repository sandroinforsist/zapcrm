import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getInstance } from '@/lib/supabase/whatsapp';
import { getEvolutionCredentials } from '@/lib/evolution/helpers';
import * as evolution from '@/lib/evolution/client';
import QRCode from 'qrcode';

type Params = { params: Promise<{ id: string }> };

/** Get QR code for WhatsApp connection */
export async function GET(_request: Request, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('organization_id, role')
    .eq('id', user.id)
    .single();

  if (profileError || !profile?.organization_id) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }

  if (profile.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const { id } = await params;
  const instance = await getInstance(supabase, id);
  if (!instance || instance.organization_id !== profile.organization_id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const creds = await getEvolutionCredentials(supabase, instance);
    const result = await evolution.connectInstance(creds);

    let qrValue = result.base64 || '';

    // If Evolution API didn't return a base64 image, generate it from the code
    if (!qrValue && result.code) {
      console.log('[whatsapp] Evolution API returned code but no base64. Generating QR code locally.');
      qrValue = await QRCode.toDataURL(result.code);
    }

    // Always strip the prefix if it exists, because the frontend adds it
    qrValue = qrValue.replace(/^data:image\/png;base64,/, '');

    return NextResponse.json({
      data: {
        value: qrValue,
        connected: false,
      },
    });
  } catch (err: unknown) {
    console.error('[whatsapp] Failed to get QR Code:', err);
    return NextResponse.json(
      { error: 'Não foi possível obter o QR Code. Verifique se a instância está ativa na Evolution API.' },
      { status: 502 },
    );
  }
}
