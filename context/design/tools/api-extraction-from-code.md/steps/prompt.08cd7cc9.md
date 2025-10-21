---
timestamp: 'Mon Oct 20 2025 14:42:25 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251020_144225.6321d921.md]]'
content_id: 08cd7cc92ab8f28646485dc373d91ed8ac2a90ceaab7ca4802e0faeb4b0e50a8
---

# prompt:

Now, analyze the following Concept Specification and generate the API documentation based on these instructions.

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
