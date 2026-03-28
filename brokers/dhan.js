// dhan.js

// Dhan platform API integration

class Dhan {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseUrl = 'https://api.dhan.com/v1';
    }

    // Method to place an order
    placeOrder(orderDetails) {
        return fetch(`${this.baseUrl}/orders`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(orderDetails)
        }).then(response => response.json());
    }

    // Method to connect to websocket for order updates
    connectToWebSocket() {
        const socket = new WebSocket('wss://api.dhan.com/ws/orders');

        socket.onopen = () => {
            console.log('Connected to Dhan WebSocket');
        };

        socket.onmessage = (event) => {
            const orderUpdate = JSON.parse(event.data);
            // Handle order updates
            console.log('Order Update:', orderUpdate);
        };

        socket.onclose = () => {
            console.log('Disconnected from Dhan WebSocket');
        };

        return socket;
    }
}

// Export the Dhan class
module.exports = Dhan;
