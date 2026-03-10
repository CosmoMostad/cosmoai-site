import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const name = formData.get('name') as string;
    const relation = formData.get('relation') as string;
    const question = formData.get('question') as string;

    if (!name || !question) {
      return NextResponse.redirect(new URL('/?error=missing', req.url));
    }

    // Send email via Resend
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'questions@cosmoprojects.info',
          to: 'cosmo@wrenhealth.app',
          subject: `Question from ${name}${relation ? ` (${relation})` : ''}`,
          text: `Name: ${name}\nRelation: ${relation || 'Not specified'}\n\nQuestion:\n${question}`,
        }),
      });
    }

    return NextResponse.redirect(new URL('/?asked=1#ask', req.url));
  } catch (e) {
    console.error(e);
    return NextResponse.redirect(new URL('/?error=1', req.url));
  }
}
