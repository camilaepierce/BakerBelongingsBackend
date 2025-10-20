---
timestamp: 'Wed Oct 15 2025 15:29:27 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251015_152927.26adb48c.md]]'
content_id: a68ea441509220225632f84f2248c02c0db478d967d2d87cd73faecffc10a6a4
---

# prompt: Please implement a test suite that follows the following concept specification of an inventory checkout system without using any external tools outside of Deno, MongoDB, and Typescript. Reservation:     **concept** Reservation

```
**purpose** keep track of when items will expire, and send emails to users with expired items  
**principle** when an item is checked out, set the item with the expiry time a predetermined time before and the kerb  
**state**  
a set of Items with
    an exiry Date
    a kerb String
**actions**   
checkoutItem(kerb: String, item: Item)
    **requires** item a valid item, kerb is a resident in the Roles
    **effects** an expiry Date is set
notifyCheckout()
    **effects** sends an email to the kerb as a reminder to check the item back in
```
