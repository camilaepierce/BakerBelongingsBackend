---
timestamp: 'Wed Oct 15 2025 15:23:54 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251015_152354.3c718c73.md]]'
content_id: b49822d8426b9a42a8e346f6dac0bdc22f60c7ae4146c44dfd4092897be23292
---

# prompt: Please implement a test suite that follows the following concept specification of an inventory checkout system name Reservation:     **concept** Reservation

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
