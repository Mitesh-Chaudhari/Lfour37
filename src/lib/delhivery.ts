import axios from 'axios'

const BASE_URL = process.env.DELHIVERY_BASE_PRODUCTION_URL

// ========================================
// FETCH WAYBILL
// ========================================
export async function fetchWaybillNumber() {
    const localHeaders = {
        Authorization: `Token ${process.env.DELHIVERY_API_TOKEN}`,
        Accept: 'application/json',
    }
    try {
        const response = await axios.get(
            `${BASE_URL}/api/v1/packages/fetch/awb/.json?count=1`,
            { headers: localHeaders }
        )
        // Returns the tracking string if available, or undefined
        return response.data; 
    } catch (err) {
        console.error("Failed fetching tracking number quota:", err);
        return null;
    }
}

// ========================================
// CREATE SHIPMENT
// ========================================
export async function createShipment({
    order,
    items,
}: any) {
    // 1. Fetch a tracking ID if your account requires pre-allocation
    const assignedAwb = await fetchWaybillNumber();

    const shipmentData = {
        shipments: [
            {
                // CUSTOMER DETAILS
                name: order.shipping_address.full_name,
                add: order.shipping_address.address_line1,
                pin: order.shipping_address.postal_code,
                city: order.shipping_address.city,
                state: order.shipping_address.state,
                country: 'India',
                phone: order.shipping_address.phone,

                // CRITICAL ADDITIONS
                waybill: assignedAwb || "", // Injects pre-assigned tracking code if required
                client: "248686-YADEVILIFESTYLEPRIVA-do", // Must match your logging account profile string

                // ORDER
                order: order.order_number,
                payment_mode: 'Prepaid',
                order_date: new Date().toISOString().split('T')[0],
                pickup_date: new Date().toISOString().split('T')[0],
                total_amount: order.total,
                cod_amount: 0,
                quantity: String(items.length),

                // PRODUCT DETAILS
                products_desc: items.map((i: any) => i.product_name).join(', '),

                // DIMENSIONS
                dead_weight: '1',
                weight: '1',
                shipment_length: '10',
                shipment_width: '10',
                shipment_height: '10',

                // SELLER
                seller_name: process.env.DELHIVERY_SELLER_NAME,
                seller_add: process.env.DELHIVERY_SELLER_ADDRESS,
                seller_inv: order.order_number,

                // RETURN ADDRESS
                return_name: process.env.DELHIVERY_RETURN_NAME,
                return_add: process.env.DELHIVERY_RETURN_ADDRESS,
                return_city: process.env.DELHIVERY_RETURN_CITY,
                return_state: process.env.DELHIVERY_RETURN_STATE,
                return_country: 'India',
                return_phone: process.env.DELHIVERY_RETURN_PHONE,
                return_pin: process.env.DELHIVERY_RETURN_PIN,

                // GST / HSN
                hsn_code: '61091000',
                invoice_number: order.order_number,
                invoice_date: new Date().toISOString().split('T')[0],
            }
        ],
        pickup_location: {
            name: process.env.DELHIVERY_PICKUP_NAME,
        },
    }

    const formData = new URLSearchParams()
    formData.append('format', 'json')
    formData.append('data', JSON.stringify(shipmentData))

    const localHeaders = {
        Authorization: `Token ${process.env.DELHIVERY_API_TOKEN}`,
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
    }

    const response = await axios({
        method: 'post',
        url: `${BASE_URL}/api/cmu/create.json`,
        headers: localHeaders,
        data: formData,
    })

    console.log('DELHIVERY RESPONSE:', response.data)
    return response.data
}

// ========================================
// TRACK SHIPMENT
// ========================================
export async function trackShipment(awb: string) {
    const localHeaders = {
        Authorization: `Token ${process.env.DELHIVERY_API_TOKEN}`,
        Accept: 'application/json',
    }

    const response = await axios.get(
        `${BASE_URL}/api/v1/packages/json/?waybill=${awb}`,
        { headers: localHeaders }
    )

    return response.data
}
