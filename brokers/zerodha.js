import KiteConnectLib from 'kiteconnect';
// KiteConnect SDK exports classes, so we destructure from the default export
const { KiteConnect, KiteTicker } = KiteConnectLib;
import { calculateChildQuantity } from '../engine/orderLogic.js';

// Initialize API Clients
const masterKite = new KiteConnect({ api_key: process.env.ZERODHA_MASTER_API_KEY });
if (process.env.ZERODHA_MASTER_ACCESS_TOKEN) {
    masterKite.setAccessToken(process.env.ZERODHA_MASTER_ACCESS_TOKEN);
}

const childKite = new KiteConnect({ api_key: process.env.ZERODHA_CHILD_API_KEY });
if (process.env.ZERODHA_CHILD_ACCESS_TOKEN) {
    childKite.setAccessToken(process.env.ZERODHA_CHILD_ACCESS_TOKEN);
}

export function startZerodhaCopier() {
    console.log(`[ZERODHA] Connecting to Master WebSocket...`);

    const masterTicker = new KiteTicker({
        api_key: process.env.ZERODHA_MASTER_API_KEY,
        access_token: process.env.ZERODHA_MASTER_ACCESS_TOKEN
    });

    masterTicker.connect();

    // Listen for real-time order updates from Master
    masterTicker.on("order_update", (orderInfo) => {
        if (orderInfo.status === 'COMPLETE' || orderInfo.status === 'OPEN') {
            
            console.log(`[SIGNAL] Master Order Detected: ${orderInfo.transaction_type} ${orderInfo.tradingsymbol}`);
            
            // Calculate child quantity
            const childQty = calculateChildQuantity(orderInfo.quantity, parseFloat(process.env.CHILD_MULTIPLIER));
            
            // Construct the identical child order payload
            const childOrderParams = {
                exchange: orderInfo.exchange,
                tradingsymbol: orderInfo.tradingsymbol,
                transaction_type: orderInfo.transaction_type,
                quantity: childQty,
                product: orderInfo.product,
                order_type: orderInfo.order_type,
                validity: orderInfo.validity,
            };

            // If it's a Limit order, carry over the price
            if (orderInfo.order_type === 'LIMIT') {
                childOrderParams.price = orderInfo.price;
            }

            executeChildTrade(childOrderParams);
        }
    });

    masterTicker.on("connect", () => {
        console.log("[ZERODHA] Connected to Master Stream. Waiting for trades...");
        // You generally don't need to manually subscribe to order_updates, KiteTicker pushes them automatically for your account
    });
}

async function executeChildTrade(params) {
    try {
        console.log(`[ACTION] Firing Child Order: ${params.transaction_type} ${params.quantity} ${params.tradingsymbol}...`);
        
        // --- NOTE FOR PROD: Uncomment this block when your API keys are registered ---
        // const response = await childKite.placeOrder("regular", params);
        // console.log(`[SUCCESS] Child Trade Executed! Order ID: ${response.order_id}`);
        
        console.log(`[MOCK SUCCESS] Child Trade Executed with params:`, params);
    } catch (error) {
        console.error(`[CRITICAL ALERT] Child Trade Failed!`);
        console.error(error.message);
    }
}
