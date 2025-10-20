# Matrix Rotation

You're a navigator studying an old map. The map is oriented incorrectly for your current heading. Rotate it `n` quarter-turns clockwise to align it with your direction of travel.

You are given a map `m`, represented as a 2D list of integers, and an integer `n`. Return the map after rotating it 90 degrees _clockwise_ `n` times.

**Constraints:**

- 1 ≤ rows, cols ≤ 10
- 0 ≤ n ≤ 100

**Example:**

`f([[1, 2], [3, 4]], 1)` returns `[[3, 1], [4, 2]]`

`f([[1, 2, 3], [4, 5, 6]], 2)` returns `[[6, 5, 4], [3, 2, 1]]`
