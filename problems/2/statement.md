# List Generation


Given three integers`n`,`u`, and`s`,
  return any list of integers such that:



  
- `len(result) == n`(the list has exactly n elements)
  
- 
    `len(set(result)) == u`(the list has exactly u unique elements)
  
- `sum(result) == s`(the sum of all elements equals s)




**Constraints:**



  
- 1 ≤ u ≤ n ≤ 20
  
- -1000 ≤ s ≤ 1000
  
- A valid solution is guaranteed to exist




**Example:**



  `f(5, 3, 10)`could return`[0, 0, 2, 3, 5]`(length 5,
  3 unique values, sum 10)



  `f(3, 1, 9)`could return`[3, 3, 3]`(length 3, 1
  unique value, sum 9)
