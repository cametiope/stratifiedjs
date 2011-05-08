/*
 * Oni Apollo 'node-utils' module
 * Stratified utilities for interfacing with plain nodejs code
 *
 * Part of the Oni Apollo Standard Module Library
 * 0.12+
 * http://onilabs.com/apollo
 *
 * (c) 2011 Oni Labs, http://onilabs.com
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
  @module    node-utils
  @summary   Stratified utilities for interfacing with plain nodejs code
  @hostenv   nodejs
*/

if (require('sjs:__sys').hostenv != 'nodejs') 
  throw new Error('node-utils only runs in a nodejs environment');

/**
`   @function waitforEvent
   @summary Blocks until the specified event is triggered on the given event emitter
   @param   {EventEmitter} [emitter] NodeJS event emitter
   @param   {String} [event] Event to listen for
   @return  {Array} arguments array returned by the emitter into event listener
*/
exports.waitforEvent = function(emitter, event) {
  waitfor (var rv) {
    function listener(x) { resume(arguments); }
    emitter.on(event, listener);
  }
  finally {
    emitter.removeListener(event, listener);
  }
  return rv;
};

/**
  @class EventQueue
  @summary Listens for specified events and stores them in a queue.
  @desc
     Use function [node-utils.eventQueue](#node-utils/eventQueue) to construct a new
     EventQueue object.

  @function  eventQueue
  @summary Constructs a new EventQueue object.
  @return  {EventQueue}
  @param   {EventEmitter} [emitter] NodeJS event emitter
  @param   {String} [event] Event to listen for
  @desc
    The returned [EventQueue](#node-utils/EventQueue) object proceeds to listen for
    events immediately in the background, and continues to do so until
    [EventQueue.stop](#node-utils/EventQueue/stop) is called.

    Alternatively, as [EventQueue](#node-utils/EventQueue) implements a
    [__finally__](#node-utils/EventQueue/__finally__) method, it can be used in a
    'using' block:

    `using (var Q = require('node-utils').eventQueue(emitter, event)) {
      while (true) {
        var data = Q.get();
        ...
      }
    }`

    Here the 'using' construct will automatically call the
    [EventQueue](#node-utils/EventQueue)'s
    [__finally__](#node-utils/EventQueue/__finally__) method when the 'using' code
    block is exited.
*/
exports.eventQueue = function(emitter, event) {
  return (new EventQueue(emitter, event));
};

function EventQueue(emitter, event) {
  // XXX we queue up to 100 events max. Does this need to be configurable?
  var capacity = 100;
  this._queue = new (require("./cutil").Queue)(capacity, true);
  this.emitter = emitter;
  this.event = event;

  var me = this;
  this._handleEvent = function() {
    me._queue.put(Array.prototype.slice.call(arguments, 0));
  };
  emitter.on(event, this._handleEvent);
}

EventQueue.prototype = {
  /**
    @function EventQueue.count
    @summary  Returns current number of events in the queue.
    @return   {Integer}
   */
  count: function() { 
    return this._queue.count();
  },

  /**
    @function  EventQueue.get
    @summary   Retrieve the next event from the queue; blocks if the queue is empty.
               Safe to be called from multiple strata concurrently.
    @return {Array} event data retrieved from head of queue.
   */
  get: function() {
    return this._queue.get();
  },

  /**
    @function  EventQueue.stop
    @summary   Stop listening for events.
    @desc
       See 'More information' section under [node-utils.eventQueue](#node-utils/eventQueue)
       for an alternative to calling [EventQueue.stop](#node-utils/EventQueue/stop)
       manually.
   */
  stop: function() {
    this.emitter.removeListener(this.event, this._handleEvent);
  },

  /**
    @function  EventQueue.__finally__
    @summary   Calls [EventQueue.stop](#node-utils/EventQueue/stop).
               Allows EventQueue to be used a 'using' construct.
    @desc
       See 'More information' section under [node-utils.eventQueue](#node-utils/eventQueue).
   */
  __finally__: function() { this.stop(); }
};