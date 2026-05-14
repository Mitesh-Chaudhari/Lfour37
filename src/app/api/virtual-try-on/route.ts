import {
  NextRequest,
  NextResponse,
} from 'next/server'

import crypto from 'crypto'

import {
  createClient,
} from '@/lib/supabase/server'

export async function POST(
  req: NextRequest
) {
  try {
    const supabase =
      await createClient()

    // USER

    const {
      data: { user },
    } =
      await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        {
          error:
            'Login required',
        },
        { status: 401 }
      )
    }

    // DAILY LIMIT

    const today =
      new Date()

    today.setHours(
      0,
      0,
      0,
      0
    )

    const {
      count,
    } =
      await supabase
        .from(
          'virtual_tryons'
        )
        .select(
          '*',
          {
            count:
              'exact',
            head: true,
          }
        )
        .eq(
          'user_id',
          user.id
        )
        .gte(
          'created_at',
          today.toISOString()
        )

    if (
      (count || 0) >= 5
    ) {
      return NextResponse.json(
        {
          error:
            'Daily try-on limit reached',
        },
        { status: 429 }
      )
    }

    // FORM

    const formData =
      await req.formData()

    const person =
      formData.get(
        'person'
      ) as File

    const productImage =
      formData.get(
        'productImage'
      ) as string

    const productId =
      formData.get(
        'productId'
      ) as string

    if (
      !person ||
      !productImage
    ) {
      return NextResponse.json(
        {
          error:
            'Missing images',
        },
        { status: 400 }
      )
    }

    // BUFFER

    const bytes =
      await person.arrayBuffer()

    const buffer =
      Buffer.from(bytes)

    // HASH FOR CACHE

    const hash =
      crypto
        .createHash(
          'md5'
        )
        .update(
          buffer
        )
        .digest('hex')

    // CACHE CHECK

    const {
      data: cached,
    } =
      await supabase
        .from(
          'virtual_tryons'
        )
        .select('*')
        .eq(
          'product_image',
          productImage
        )
        .eq(
          'person_image',
          hash
        )
        .eq(
          'status',
          'completed'
        )
        .maybeSingle()

    if (
      cached?.result_image
    ) {
      return NextResponse.json(
        {
          image:
            cached.result_image,
          cached: true,
        }
      )
    }

    // BASE64

    const base64 =
      `data:${person.type};base64,${buffer.toString(
        'base64'
      )}`

    // DB RECORD

    const {
      data: tryon,
      error:
        createError,
    } =
      await supabase
        .from(
          'virtual_tryons'
        )
        .insert({
          user_id:
            user.id,

          product_id:
            productId,

          person_image:
            hash,

          product_image:
            productImage,

          status:
            'processing',
        })
        .select()
        .single()

    if (
      createError
    ) {
      return NextResponse.json(
        {
          error:
            createError.message,
        },
        { status: 500 }
      )
    }

    // FASHN API

    const response =
      await fetch(
        'https://api.fashn.ai/v1/run',
        {
          method:
            'POST',

          headers: {
            Authorization:
              `Bearer ${process.env.FASHN_API_KEY}`,

            'Content-Type':
              'application/json',
          },

          body: JSON.stringify(
            {
              model_name:
                'product-to-model',

              inputs: {
                model_image:
                  base64,

                product_image:
                  productImage,
              },
            }
          ),
        }
      )

    const data =
      await response.json()

    if (
      !response.ok
    ) {
      return NextResponse.json(
        {
          error:
            data.message ||
            'Generation failed',
        },
        { status: 500 }
      )
    }

    const predictionId =
      data.id

    let output =
      null

    // POLLING

    for (
      let i = 0;
      i < 30;
      i++
    ) {
      await new Promise(
        (
          resolve
        ) =>
          setTimeout(
            resolve,
            2000
          )
      )

      const statusRes =
        await fetch(
          `https://api.fashn.ai/v1/status/${predictionId}`,
          {
            headers: {
              Authorization:
                `Bearer ${process.env.FASHN_API_KEY}`,
            },
          }
        )

      const statusData =
        await statusRes.json()

      if (
        statusData.status ===
        'completed'
      ) {
        output =
          statusData
            .output
            ?.image ||
          statusData
            .output?.[0]

        break
      }

      if (
        statusData.status ===
        'failed'
      ) {
        break
      }
    }

    if (!output) {
      await supabase
        .from(
          'virtual_tryons'
        )
        .update({
          status:
            'failed',
        })
        .eq(
          'id',
          tryon.id
        )

      return NextResponse.json(
        {
          error:
            'Generation failed',
        },
        { status: 500 }
      )
    }

    // UPDATE DB

    await supabase
      .from(
        'virtual_tryons'
      )
      .update({
        status:
          'completed',

        result_image:
          output,
      })
      .eq(
        'id',
        tryon.id
      )

    return NextResponse.json(
      {
        image:
          output,
      }
    )

  } catch (err) {
    console.error(err)

    return NextResponse.json(
      {
        error:
          'Failed to generate try-on',
      },
      { status: 500 }
    )
  }
}