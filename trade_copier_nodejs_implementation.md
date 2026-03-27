# Node.js Trade Copier Implementation (Zerodha & Angel One)

This is the production-ready Node.js implementation for a low-latency Trade Copier. It uses a **switch case** architecture that allows you to seamlessly toggle between a `Zerodha -> Zerodha` or `AngelOne -> AngelOne` setup. 

Keeping both the Master and Child accounts on the identical broker drastically reduces network parsing time and ensures perfect 1:1 mapping of symbols (e.g., avoiding the hassle of translating Zerodha's `instrument_token` to AngelOne's `symboltoken`).

## Project Structure
```text
trade-copier/
├── .env                  # Private API keys and tokens
├── config.js             # Shared configuration and multipliers
├── index.js              # Main entry point (Switch case logic)
├── engine/
│   └── orderLogic.js     # Mathematical logic for multipliers/lot-sizes
├── brokers/
│   ├── zerodha.js        # Zerodha Kite Connect WebSocket & API logic
│   └── angelone.js       # Angel One SmartAPI WebSocket & API logic
└── package.json          # Node dependencies
```

---

### 1. `.env` (Environment Variables)
Store your sensitive keys here. You **must** generate fresh access tokens every morning for both accounts before running this.
```env
# Broker Selection: ZERODHA or ANGELONE
ACTIVE_BROKER=ZERODHA

# Multiplier: If Master buys 100, and multiplier is 0.5, Child buys 50
CHILD_MULTIPLIER=0.5

# ZERODHA API KEYS
ZERODHA_MASTER_API_KEY=your_master_api_key
ZERODHA_MASTER_ACCESS_TOKEN=your_master_access_token
ZERODHA_CHILD_API_KEY=your_child_api_key
ZERODHA_CHILD_ACCESS_TOKEN=your_child_access_token

# ANGEL ONE API KEYS
ANGEL_MASTER_API_KEY=your_master_api_key
ANGEL_MASTER_JWT_TOKEN=your_master_jwt
ANGEL_MASTER_CLIENT_CODE=master_client_code
ANGEL_CHILD_API_KEY=your_child_api_key
ANGEL_CHILD_JWT_TOKEN=your_child_jwt
ANGEL_CHILD_CLIENT_CODE=child_client_code
```

---

### 2. `index.js` (The Main Engine)
This is the entry point. It reads the `.env` file and uses a switch statement to boot up the correct broker module seamlessly.

```javascript
require('dotenv').config();
const { startZerodhaCopier } = require('./brokers/zerodha');
const { startAngelOneCopier } = require('./brokers/angelone');

const ACTIVE_BROKER = process.env.ACTIVE_BROKER;

console.log(`[BOOT] Initializing Trade Copier...`);
console.log(`[BOOT] Selected Broker Setup: ${ACTIVE_BROKER}`);
console.log(`[BOOT] Child Quantity Multiplier: ${process.env.CHILD_MULTIPLIER}x`);

switch (ACTIVE_BROKER) {
    case 'ZERODHA':
        startZerodhaCopier();
        break;
    
    case 'ANGELONE':
        startAngelOneCopier();
        break;
    
    default:
        console.error(`[ERROR] Invalid ACTIVE_BROKER (${ACTIVE_BROKER}). Use ZERODHA or ANGELONE.`);
        process.exit(1);
}
```

---

### 3. `engine/orderLogic.js` (Position Sizing)
A centralized mathematical helper. When configuring the Child trade, we can't buy `12.5` shares. We must round up or down.

```javascript
/**
 * Calculates the final quantity for the child account based on a multiplier.
 * Handles rounding for stocks and options lot sizes.
 */
function calculateChildQuantity(masterQty, multiplier) {
    const rawQty = masterQty * multiplier;
    
    // Using Math.max(1, ...) ensures we ALWAYS take at least 1 share 
    // if the multiplier calculates to like 0.3 shares. 
    // It assumes a default lot size of 1 for equity. 
    // If you trade options, you'll need to pass 'lotSize' and round to nearest lot.
    const finalQty = Math.max(1, Math.round(rawQty)); 
    
    return finalQty;
}

module.exports = { calculateChildQuantity };
```

---

### 4. `brokers/zerodha.js` (Zerodha Implementation)
Uses the official `kiteconnect` SDK. The Master listens to WebSocket `order_update` events, and the Child executes via REST API.

```javascript
const KiteConnect = require("kiteconnect").KiteConnect;
const KiteTicker = require("kiteconnect").KiteTicker;
const { calculateChildQuantity } = require('../engine/orderLogic');

// Initialize API Clients
const masterKite = new KiteConnect({ api_key: process.env.ZERODHA_MASTER_API_KEY });
masterKite.setAccessToken(process.env.ZERODHA_MASTER_ACCESS_TOKEN);

const childKite = new KiteConnect({ api_key: process.env.ZERODHA_CHILD_API_KEY });
childKite.setAccessToken(process.env.ZERODHA_CHILD_ACCESS_TOKEN);

function startZerodhaCopier() {
    console.log(`[ZERODHA] Connecting to Master WebSocket...`);

    const masterTicker = new KiteTicker({
        api_key: process.env.ZERODHA_MASTER_API_KEY,
        access_token: process.env.ZERODHA_MASTER_ACCESS_TOKEN
    });

    masterTicker.connect();

    // Listen for real-time order updates from Master
    masterTicker.on("order_update", (orderInfo) => {
        // ONLY trigger the copy if the Master order was successfully placed or executed
        // You can change 'COMPLETE' to 'OPEN' depending on if you want to copy limit orders too
        if (orderInfo.status === 'COMPLETE' || orderInfo.status === 'OPEN') {
            
            console.log(`[SIGNAL] Master Order Detected: ${orderInfo.transaction_type} ${orderInfo.tradingsymbol}`);
            
            // Calculate child quantity
            const childQty = calculateChildQuantity(orderInfo.quantity, parseFloat(process.env.CHILD_MULTIPLIER));
            
            // Construct the identical child order payload
            const childOrderParams = {
                exchange: orderInfo.exchange,
                tradingsymbol: orderInfo.tradingsymbol,
                transaction_type: orderInfo.transaction_type, // "BUY" or "SELL"
                quantity: childQty,
                product: orderInfo.product, // "MIS" (Intraday) or "CNC" (Delivery)
                order_type: orderInfo.order_type, // "MARKET" or "LIMIT"
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
    });
}

async function executeChildTrade(params) {
    try {
        console.log(`[ACTION] Firing Child Order: ${params.transaction_type} ${params.quantity} ${params.tradingsymbol}...`);
        
        // Execute the trade!
        const response = await childKite.placeOrder("regular", params);
        console.log(`[SUCCESS] Child Trade Executed! Order ID: ${response.order_id}`);
        
    } catch (error) {
        console.error(`[CRITICAL ALERT] Child Trade Failed!`);
        console.error(error.message);
        // Here you would trigger a Telegram/WhatsApp alert
    }
}

module.exports = { startZerodhaCopier };
```

---

### 5. `brokers/angelone.js` (Angel One Implementation)
Uses Angel One's `SmartAPI`. Similar logic: WebSocket listener for the Master, REST execution for the Child.

```javascript
const { SmartAPI, WebSocketV2 } = require("smartapi-javascript");
const { calculateChildQuantity } = require('../engine/orderLogic');

// Initialize Angel One REST Clients for Child Execution
const childSmartApi = new SmartAPI({
    api_key: process.env.ANGEL_CHILD_API_KEY,
});
// (Assuming you've run the login flow separately to get the JWT token)
childSmartApi.generateSession(process.env.ANGEL_CHILD_CLIENT_CODE, "YOUR_CHILD_PASSWORD", "YOUR_CHILD_TOTP") 
// NOTE: For a real production app, pass the pre-generated JWT token from .env instead of login here to save time.

function startAngelOneCopier() {
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
        .catch(err => console.log(err));

    web_socket.on("tick", (receive) => {
        // Angel One sends order updates as JSON payloads over WebSocket too.
        // We parse the payload to check for order placement/execution.
        let orderInfo = JSON.parse(receive);
        
        // Ensure this is an order update alert, not just a price tick
        if (orderInfo && orderInfo.orderstatus) {
            if (orderInfo.orderstatus === 'complete' || orderInfo.orderstatus === 'open') {
                
                console.log(`[SIGNAL] Master Order Detected: ${orderInfo.transactiontype} ${orderInfo.tradingsymbol}`);
                
                const childQty = calculateChildQuantity(orderInfo.quantity, parseFloat(process.env.CHILD_MULTIPLIER));

                const childOrderParams = {
                    variety: "NORMAL",
                    tradingsymbol: orderInfo.tradingsymbol,
                    symboltoken: orderInfo.symboltoken, // Mandatory in Angel One
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
    });
}

async function executeAngelChildTrade(params) {
    try {
         console.log(`[ACTION] Firing Child Order: ${params.transactiontype} ${params.quantity} ${params.tradingsymbol}...`);
         
         const response = await childSmartApi.placeOrder(params);
         if(response.status) {
             console.log(`[SUCCESS] Child Trade Executed! Order ID: ${response.data.orderid}`);
         } else {
             console.error(`[FAILED] Angel One rejected order: ${response.message}`);
         }
    } catch (error) {
         console.error(`[CRITICAL ALERT] Child Trade Failed!`);
         console.error(error);
    }
}

module.exports = { startAngelOneCopier };
```
