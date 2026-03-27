import smartApiLib from 'smartapi-javascript';
const { SmartAPI, WebSocketV2 } = smartApiLib;
import { calculateChildQuantity } from '../engine/orderLogic.js';

// Initialize Angel One REST Clients for Child Execution
const childSmartApi = new SmartAPI({
    api_key: process.env.ANGEL_CHILD_API_KEY,
});

export function startAngelOneCopier() {
    console.log(`[ANGEL ONE] Connecting to Master WebSocket...`);

    // Master WebSocket Connection
    let web_socket = new WebSocketV2({
        jwttoken: process.env.ANGEL_MASTER_JWT_TOKEN,
        apikey: process.env.ANGEL_MASTER_API_KEY,
        clientcode: process.env.ANGEL_MASTER_CLIENT_CODE,
        feedtype: process.env.ANGEL_MASTER_JWT_TOKEN // usually access token
    });

    web_socket.connect()
        .then(() => {
            console.log("[ANGEL ONE] Connected to Master Stream. Waiting for trades...");
        })
        .catch(err => console.error(err));

    web_socket.on("tick", (receive) => {
        try {
            // Check if the tick payload contains trade order update data
            let orderInfo = typeof receive === 'string' ? JSON.parse(receive) : receive;
            
            if (orderInfo && orderInfo.orderstatus) {
                if (orderInfo.orderstatus === 'complete' || orderInfo.orderstatus === 'open') {
                    
                    console.log(`[SIGNAL] Master Order Detected: ${orderInfo.transactiontype} ${orderInfo.tradingsymbol}`);
                    
                    const childQty = calculateChildQuantity(orderInfo.quantity, parseFloat(process.env.CHILD_MULTIPLIER));

                    const childOrderParams = {
                        variety: "NORMAL",
                        tradingsymbol: orderInfo.tradingsymbol,
                        symboltoken: orderInfo.symboltoken,
                        transactiontype: orderInfo.transactiontype,
                        exchange: orderInfo.exchange,
                        ordertype: orderInfo.ordertype,
                        producttype: orderInfo.producttype,
                        duration: "DAY",
                        price: orderInfo.price || "0",
                        squareoff: "0",
                        stoploss: "0",
                        quantity: childQty.toString()
                    };

                    executeAngelChildTrade(childOrderParams);
                }
            }
        } catch(e) {
            // Log silent errors or parsing issues
        }
    });

    web_socket.on("error", (err) => {
        console.error("[ANGEL ONE WEBSOCKET ERROR]:", err);
    });
}

async function executeAngelChildTrade(params) {
    try {
         console.log(`[ACTION] Firing Child Order: ${params.transactiontype} ${params.quantity} ${params.tradingsymbol}...`);
         
         // --- NOTE FOR PROD: Uncomment this block when your API keys are registered ---
         // const response = await childSmartApi.placeOrder(params);
         // if(response.status) {
         //    console.log(`[SUCCESS] Child Trade Executed! Order ID: ${response.data.orderid}`);
         // } else {
         //    console.error(`[FAILED] Angel One rejected order: ${response.message}`);
         // }
         
         console.log(`[MOCK SUCCESS] Child Trade Executed with params:`, params);
    } catch (error) {
         console.error(`[CRITICAL ALERT] Child Trade Failed!`);
         console.error(error);
    }
}
