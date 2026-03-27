import dotenv from 'dotenv';
dotenv.config();

import { startZerodhaCopier } from './brokers/zerodha.js';
import { startAngelOneCopier } from './brokers/angelone.js';

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
