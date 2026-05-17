export const whatsappTemplates = {

  orderPlaced: ({
    customerName,
    orderId,
  }: any) => ({
    template:
      'order_placed',

    variables: {
      customer_name:
        customerName,

      order_id:
        orderId,

      orders_url:
        `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/orders`,
    },
  }),

  orderCancelled: ({
    customerName,
    orderId,
  }: any) => ({
    template:
      'order_cancelled',

    variables: {
      customer_name:
        customerName,

      order_id:
        orderId,
    },
  }),

  returnRequested: ({
    customerName,
    orderId,
  }: any) => ({
    template:
      'return_requested',

    variables: {
      customer_name:
        customerName,

      order_id:
        orderId,
    },
  }),
}