/**
 * Calculates the final quantity for the child account based on a multiplier.
 * Handles rounding for stocks and options lot sizes.
 */
export function calculateChildQuantity(masterQty, multiplier) {
    const rawQty = masterQty * multiplier;
    
    // Using Math.max(1, ...) ensures we ALWAYS take at least 1 share 
    // if the multiplier calculates to like 0.3 shares. 
    // It assumes a default lot size of 1 for equity. 
    const finalQty = Math.max(1, Math.round(rawQty)); 
    
    return finalQty;
}
