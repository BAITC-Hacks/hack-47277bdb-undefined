ALTER TABLE "ProductStock"
  ADD CONSTRAINT "ProductStock_quantity_nonnegative" CHECK ("quantity" >= 0),
  ADD CONSTRAINT "ProductStock_reserved_nonnegative" CHECK ("reserved" >= 0),
  ADD CONSTRAINT "ProductStock_reserved_lte_quantity" CHECK ("reserved" <= "quantity");

ALTER TABLE "ProductOffer"
  ADD CONSTRAINT "ProductOffer_webPrice_nonnegative" CHECK ("webPrice" >= 0),
  ADD CONSTRAINT "ProductOffer_storePrice_nonnegative" CHECK ("storePrice" IS NULL OR "storePrice" >= 0),
  ADD CONSTRAINT "ProductOffer_deliveryEstimateHours_nonnegative" CHECK ("deliveryEstimateHours" IS NULL OR "deliveryEstimateHours" >= 0);

ALTER TABLE "CartItem"
  ADD CONSTRAINT "CartItem_quantity_positive" CHECK ("quantity" >= 1);

ALTER TABLE "OneClickOrder"
  ADD CONSTRAINT "OneClickOrder_quantity_positive" CHECK ("quantity" >= 1);

ALTER TABLE "OrderItem"
  ADD CONSTRAINT "OrderItem_quantity_positive" CHECK ("quantity" >= 1),
  ADD CONSTRAINT "OrderItem_unitPrice_nonnegative" CHECK ("unitPrice" >= 0),
  ADD CONSTRAINT "OrderItem_lineTotal_nonnegative" CHECK ("lineTotal" >= 0);

ALTER TABLE "OrderStockReservation"
  ADD CONSTRAINT "OrderStockReservation_quantity_positive" CHECK ("quantity" >= 1);

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_subtotal_nonnegative" CHECK ("subtotal" >= 0),
  ADD CONSTRAINT "Order_deliveryPrice_nonnegative" CHECK ("deliveryPrice" >= 0),
  ADD CONSTRAINT "Order_total_nonnegative" CHECK ("total" >= 0);

ALTER TABLE "DeliveryRule"
  ADD CONSTRAINT "DeliveryRule_minimumFreeDeliveryAmount_nonnegative" CHECK ("minimumFreeDeliveryAmount" IS NULL OR "minimumFreeDeliveryAmount" >= 0),
  ADD CONSTRAINT "DeliveryRule_deliveryPrice_nonnegative" CHECK ("deliveryPrice" IS NULL OR "deliveryPrice" >= 0),
  ADD CONSTRAINT "DeliveryRule_estimatedHours_nonnegative" CHECK ("estimatedHours" IS NULL OR "estimatedHours" >= 0);
