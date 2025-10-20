<concept>
    **concept** Reservation  
    **purpose** keep track of when items will expire, and send emails to users with expired items  
    **principle** when an item is checked out, set the item with the expiry time a predetermined time before and the kerb  
    **state**  
    a set of Items with
        an itemName String
        a category String
        a lastCheckout Date
        a lastKerb String
        an available Flag
    **actions**   
    checkoutItem(kerb: String, item: Item)
        **requires** item a valid item, kerb is a resident in the Roles
        **effects** an expiry Date is set
    notifyCheckout()
        **effects** sends an email to the kerb as a reminder to check the item back in
    getInventoryData() : set of Items
        **effects** returns inventory
    checkinItem(itemName)
</concept>