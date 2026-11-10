class LocalDeliveryProvider {
    async createShipment(order) {
        return { provider: "local", trackingId: `LOCAL-${order._id}`, deliveryType: order.userInfo.delivery, status: "pending" };
    }
}
const getDeliveryProvider = () => new LocalDeliveryProvider();
module.exports = { getDeliveryProvider, LocalDeliveryProvider };
