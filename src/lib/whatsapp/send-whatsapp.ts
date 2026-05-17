interface SendWhatsappProps {
  phone: string
  template: string
  variables: Record<string, any>
}

export async function sendWhatsapp({
  phone,
  template,
  variables,
}: SendWhatsappProps) {

  try {

    const response =
      await fetch(
        process.env.WHATSAPP_API_URL!,
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json',

            Authorization:
              `Bearer ${process.env.WHATSAPP_API_KEY}`,
          },

          body: JSON.stringify({
            phone,
            template,
            variables,
          }),
        }
      )

    const data =
      await response.json()

    return {
      success: response.ok,
      data,
    }

  } catch (err) {

    console.error(
      'WhatsApp Error:',
      err
    )

    return {
      success: false,
      data: err,
    }
  }
}