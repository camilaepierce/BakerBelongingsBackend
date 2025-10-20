---
timestamp: 'Thu Oct 16 2025 00:30:22 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251016_003022.923231fb.md]]'
content_id: 762019562f4583500a289932fb6767f82258044afde48f1d0427d0fa39ecfde2
---

# prompt: Please implement a test suite that follows the following concept specification and the provided implementation of an inventory checkout system without using any external tools outside of Deno, MongoDB, and Typescript. Reservation:     **concept** Reservation

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
