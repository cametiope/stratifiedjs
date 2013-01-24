/*
 * Oni Apollo 'array' module
 * Functions for working with arrays
 *
 * Part of the Oni Apollo Standard Module Library
 * Version: 'unstable'
 * http://onilabs.com/apollo
 *
 * (c) 2013 Oni Labs, http://onilabs.com
 *
 * This file is licensed under the terms of the MIT License:
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 *
 */
/**
   @module  array
   @summary Functions for working with arrays
   @home    sjs:array
*/

var { Stream } = require('./sequence');

/**
   @function remove
   @altsyntax arr .. remove(elem)
   @param {Array} [arr] 
   @param {Object} [elem] Element to remove
   @return {Boolean} `true` if the element was removed, `false` if `elem` is not in `arr`.
   @summary Removes the first element in the array equal (under `===`) to `elem`. 
*/
function remove(arr, elem) {
  var idx = arr.indexOf(elem);
  if (idx == -1) return false;
  arr.splice(idx, 1);
  return true;
}
exports.remove = remove;

/**
   @function indexValuePairs
   @param {Array} [arr]
   @return {sequence::Stream}
   @summary  Returns a [sequence::Stream] of index-value pairs `[0,arr[0]], [1,arr[1]], ...`
*/
function indexValuePairs(arr) {  
  return Stream(function(r) { for (var i=0; i<arr.length; ++i) r([i,arr[i]]) });
}
exports.indexValuePairs = indexValuePairs;

/**
  @function union
  @param    {Array} [a] Set of unique elements
  @param    {Array} [b] Set of unique elements
  @return   {Array} New set containing union of sets `a` and `b`.
  @summary  Union of `a` and `b`, with duplicate elements (under `===`) appearing only once.
  @desc
    ###Notes:

    * This is a general but naive implementation with a running time `O(size(a)*size(b))`.
    For more specific datatypes (strings or numbers, or objects with unique id's) there are
    more scalable algorithms.

    * `a` and `b` are assumed to be sets, in the sense that they individually don't contain
    duplicate elements.

    * The resulting set will be an Array beginning with all elements in `a` (in the same order
    as they appeared in `a`) and continuing with all elements in `b` not present in `a`. The
    relative order of elements in `b` will be preserved.


    #### Behaviour if `a` or `b` is not a set:

    * If `a` contains duplicate elements, they will also appear in the resulting array. If `b`
    contains duplicate elements, they will appear in the resulting array, unless there is an 
    equal (`===`) element in `a`.
*/
__js function union(a, b) {
  var rv = a.slice();
  var i=0;
  outer:
  for (; i<b.length; ++i) {
    var e_b = b[i];
    for (var j=0; j<a.length; ++j) {
      if (a[j] === e_b) 
        continue outer;
    }
    rv.push(e_b);
  }
  return rv;
}
exports.union = union;
