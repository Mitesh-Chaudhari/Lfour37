import { NextRequest, NextResponse }
    from 'next/server'

import { createAdminClient }
    from '@/lib/supabase/server'

import {
    sendWhatsAppTemplate,
} from '@/lib/whatsapp'

export async function POST(
    req: NextRequest
) {
    try {

        const supabase =
            await createAdminClient()

        const { phone } =
            await req.json()

        const otp =
            Math.floor(
                100000 +
                Math.random() * 900000
            ).toString()

        await supabase
            .from('phone_otps')
            .delete()
            .eq('phone', phone)

        const { data, error } =
            await supabase
                .from('phone_otps')
                .insert({
                    phone,
                    otp,
                    verified: false,
                    expires_at: new Date(
                        Date.now() + 10 * 60 * 1000
                    ).toISOString(),
                })
                .select()

        if (error) {
            console.error(error)

            return NextResponse.json(
                {
                    error: 'Failed to save OTP',
                },
                {
                    status: 500,
                }
            )
        }

        console.log(
            'OTP INSERT DATA:',
            data
        )

        console.log(
            'OTP INSERT ERROR:',
            error
        )

        const result =
            await sendWhatsAppTemplate({
                phone,
                templateName:
                    'phone_otp_verify',
                variables: [otp],
            })

        if (!result) {
            return NextResponse.json(
                {
                    error:
                        'Failed to send OTP',
                },
                {
                    status: 500,
                }
            )
        }

        return NextResponse.json({
            success: true,
        })

    } catch (err: any) {

        return NextResponse.json(
            {
                error:
                    err.message,
            },
            {
                status: 500,
            }
        )
    }
}