# Changes
Reservation required updating the state, specifically the amount of information saved per item in the set of Items. Additionally, checkinItem() and getInventoryData() were not part of the original spec, but required with implementation.

# Issues
A major issue was keeping the Reservation and Viewer concepts separate. Moving forward, these could be kept as a single concept that manages the database back-end.