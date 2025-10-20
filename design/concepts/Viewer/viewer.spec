<concept>
    concept Viewer \[AI\]  
    purpose allow for stakeholders to see information about items within the inventory, as well as similar items to their search  
    principle information about the set of items can be available upon request, seeing the status of a single item, or searching through specific flags or categories   
    state
    a set of Items with
        a itemName String
        a lastCheckout Date 
        a available Flag
        a lastKerb String 
        a set of Categories
        a set of Tags
    actions
    viewAvailable() : a set of Items  
        effects returns the entire subset of items that are available  

    viewItem(itemName: String) : Item  
        requires  itemName refers to an existing item
        effects  returns the listing of requested item

    viewCategory(category: String) : a set of Items  
        effects returns the subset of items that are in the same Category   

    viewTag(tag: String) : a set of Items  
        effects returns the subset of items that have the same Tags   

    viewLastCheckedoutDate(itemName: String) : a Date  
        requires item is a valid item within the state  
        effects returns a date of last checkout  

    viewLastCheckedoutFull(itemName: String) : a Date   
        requires item is a valid item within the state  
        effects returns a date of last checkout   

    *AI Augmentation*  

    viewAdjacent(itemName: String) : a set of Items 
        requires itemName refers to an existing item  
        effects returns items that are similar to requested item   

    viewAutocomplete(itemName: String) : a set of Items 
        effects returns a set of Items with the names that are most similar to the requested itemName   

    recommendItems(interests: String) : a set of Items
        requires interests is natural language text of user describing their interests
        effects returns a set of items with a description of an activity the user could do that matches their interests 
</concept>