import dotenv from 'dotenv';
dotenv.config();

export const config = {
    ACTIVE_BROKER: process.env.ACTIVE_BROKER || 'ZERODHA',
    CHILD_MULTIPLIER: parseFloat(process.env.CHILD_MULTIPLIER) || 0.5,
};
