# Nested List Wrapping


Given a nested list structure, replace every list with a singleton list
  containing that list. Non-list elements should remain unchanged.



**Constraints:**



  
- Nesting depth ≤ 5
  
- Elements can be integers or lists
  
- Apply transformation recursively to all nested lists




**Examples:**


`f([1, 2, 3])`returns`[[1, 2, 3]]`


`f([1, 2, [3, 4]])`returns`[[1, 2, [[3, 4]]]]`



  `f([1, 2, [3, 4, [5]], [6, 7]])`returns`[[1, 2, [[3, 4, [[5]]]], [[6, 7]]]]`



`f(5)`returns`5`(non-list elements unchanged)
