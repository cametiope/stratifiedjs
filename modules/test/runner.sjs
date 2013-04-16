/*
 * Oni Apollo 'test/runner' module
 * Functions for collecting and running test suites
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
   @module  test/runner
   @summary Functions for collecting and running test suites
   @home    sjs:test/runner
*/

// TODO: (tjc) document

var suite = require("./suite.sjs");
var { Event } = require("../cutil.sjs");
var { isArrayLike } = require('../array');
var { each, reduce, toArray, any, filter, map, join } = require('../sequence');
var { rstrip, startsWith } = require('../string');
var object = require('../object');
var sys = require('builtin:apollo-sys');
var http = require('../http');
var logging = require('../logging');

var NullRporter = {};
  
var Runner = exports.Runner = function(opts, reporter) {
  if (!(opts instanceof CompiledOptions)) {
    // build opts with no additional context
    opts = exports.getRunOpts(opts || {}, []);
  }
  this.opts = opts;
  this.reporter = reporter || NullRporter;
  this.loading = Event();
  this.active_contexts = [];
  this.root_contexts = [];
}

Runner.prototype.getModuleList = function(url) {
  var contents;
  if (suite.isBrowser) {
    contents = require('../http').get(url);
  } else {
    var path = http.parseURL(url).path;
    contents = require('../nodejs/fs').readFile(path, 'UTF-8');
  }
  logging.debug(`module list contents: ${contents}`);
  return contents.trim().split("\n");
}

Runner.prototype.loadModules = function(modules, base) {
  modules .. each {|module|
    if (this.opts.testFilter.shouldLoadModule(module)) {
      if (this.reporter.loading) this.reporter.loading(module);
      this.loadModule(module, base);
    } else {
      logging.verbose("skipping module: #{module}");
    }
  }
}

Runner.prototype.loadAll = function(opts) {
  var modules;
  if (!opts.base) {
    throw new Error("opts.base not defined");
  }
  if (opts.hasOwnProperty('moduleList')) {
    var url = sys.canonicalizeURL(opts.moduleList, opts.base);
    modules = this.getModuleList(url, opts.encoding || 'UTF-8');
  } else if (opts.hasOwnProperty('modules')) {
    modules = opts.modules;
  } else {
    throw new Error("no moduleList or modules property provided");
  }
  this.loadModules(modules, opts.base);
}

Runner.prototype.withContext = function(ctx, fn) {
  var existing_contexts = this.active_contexts.slice();
  if (existing_contexts.length > 0) {
    var parent = existing_contexts[existing_contexts.length - 1];
    ctx.parent = parent;
    parent.children.push(ctx);
  } else {
    this.root_contexts.push(ctx);
  }
  this.active_contexts.push(ctx);

  try {
    fn();
  } finally {
    if (this.active_contexts[this.active_contexts.length - 1] != ctx) {
      throw new Error("invalid context nesting");
    }
    this.active_contexts.pop();
  }
};

Runner.prototype.currentContext = function(test) {
  if(this.active_contexts.length < 1) {
    throw new Error("test defined without an active context");
  }
  return this.active_contexts[this.active_contexts.length-1];
}

Runner.prototype.collect = function(fn) {
  suite._withRunner(this, fn);
}

Runner.prototype.loadModule = function(module_name, base) {
  // TODO: what about non-file URLs?
  var canonical_name = sys.canonicalizeURL(module_name, base);

  // ensure the module actually gets reloaded
  // XX maybe replace with require(., {reload:true}) mechanism when we have it.
  delete require.modules[require.resolve(canonical_name).path];

  this.collect() { ||
    // construct a special toplevel context that knows its module path
    var ctx = new suite.context.Cls(module_name, -> require(canonical_name), module_name);
    this.withContext(ctx, -> ctx.collect());
  }
};

Runner.prototype.run = function(reporter) {
  // use `reporter.run` if no reporter func given explicitly
  if (!reporter && this.reporter.run) {
    reporter = this.reporter.run.bind(this.reporter);
  }

  // count the number of tests, while marking them (and their parent contexts)
  // as _enabled while disabling all other contexts
  var total_tests = 0;
  var preprocess_context = function(module, ctx) {
    ctx._enabled = false;
    ctx.children .. each {|child|
      if (child.hasOwnProperty('children')) {
        preprocess_context(module, child);
      } else {
        if (this.opts.testFilter.shouldRun(module, child)) {
          total_tests++;
          child._enabled = true;
          var ctx = child.context;
          while(ctx && !ctx._enabled) {
            ctx._enabled = true;
            ctx = ctx.parent;
          }
        } else {
          child._enabled = false;
        }
      }
    }
  }.bind(this);

  this.root_contexts .. each(ctx -> preprocess_context(ctx.module(), ctx));
  var results = new Results(total_tests);
  with(logging.logContext({level: this.opts.logLevel})) {
    try {
      var unusedFilters = this.opts.testFilter.unusedFilters();
      if (unusedFilters.length > 0) {
        throw new Error("Some filters didn't match anything: #{unusedFilters .. join(", ")}");
      }

      waitfor {
        if (reporter) reporter(results);
      } and {
        var runTest = function(test) {
          var result = new TestResult(test);
          results.testStart.emit(result);
          try {
            if (test.shouldSkip()) {
              results._skip(result, test.skipReason);
            } else {
              test.run();
              results._pass(result);
            }
          } catch (e) {
            results._fail(result, e);
          }
          results.testFinished.emit(result);
        };

        var traverse = function(ctx) {
          if (!ctx._enabled) {
            logging.verbose("Skipping context: #{ctx}");
            return;
          }
          results.contextStart.emit(ctx);

          ctx.withHooks() {||
            ctx.children .. each {|child|
              if (child.hasOwnProperty('children')) {
                traverse(child);
              } else {
                if (child._enabled) {
                  runTest(child);
                } else {
                  logging.verbose("Skipping test: #{child}");
                }
              }
            }
          }
          results.contextEnd.emit(ctx);
        }

        this.root_contexts .. each(traverse);
        results.end.emit();
      }
    } catch (e) {
      results.error(e);
    }
  }
  return results;
}

var TestResult = exports.TestResult = function(test) {
  this.test = test;
  this.description = test.description;
  this.state = null;
}

TestResult.prototype._complete = function(state) {
  if (this.state != null) {
    throw new Error("Test already complete");
  }
  this.state = state;
  object.extend(this, state);
}

TestResult.prototype.pass = function() {
  this._complete({ok: true, skipped: false});
}

TestResult.prototype.fail = function(e) {
  this._complete({ok: false, skipped: false, error: e});
}

TestResult.prototype.skip = function(reason) {
  this._complete({ok: true, skipped: true, reason: reason});
}

var Results = exports.Results = function(total) {
  this.succeeded = 0;
  this.failed = 0;
  this.skipped = 0;
  this.total = total;

  this.testResults = [];
  this.end = Event();
  this.contextStart = Event();
  this.contextEnd = Event();
  this.testStart = Event();
  this.testFinished = Event();
  this.testSucceeded = Event();
  this.testFailed = Event();
  this.testSkipped = Event();
}

Results.prototype.error = function(err) {
  logging.error(err.message);
  this.ok = () -> false;
}

Results.prototype.ok = function() {
  return this.failed == 0;
}

Results.prototype._fail = function(result, err) {
  result.fail(err);
  this.failed += 1;
  this.testResults.push(result);
  this.testFailed.emit(result);
}

Results.prototype._pass = function(result) {
  result.pass(result);
  this.succeeded += 1;
  this.testResults.push(result);
  this.testSucceeded.emit(result);
}
Results.prototype._skip = function(result, reason) {
  result.skip(reason);
  this.skipped += 1;
  this.testResults.push(result);
  this.testSkipped.emit(result);
}

Results.prototype.count = function() {
  return this.testResults.length;
}

var CompiledOptions = function(opts) {
  object.extend(this, opts);
}
CompiledOptions.prototype = {
  // default options
  color: null,
  testSpecs: null,
  //TODO:
  //showPassed: true,
  //showSkipped: true,
  //showFailed: true,
  logLevel: null,
  logCapture: true,
}

exports.getRunOpts = function(opts, args) {
  // takes an options object and produces a version with
  // environmental options (from either `args`, process.args or location.hash) taken into account
  var result = new CompiledOptions();
  var setOpt = function(k, v) {
    if (!(k in result)) {
      throw new Error("Unknown option: #{k}");
    }
    result[k] = v;
  }

  if (opts.defaults) {
    opts.defaults .. object.ownPropertyPairs .. each {|prop|
      setOpt.apply(null, prop);
    }
  }
  
  if (args == undefined) {
    // if none provided, get args from the environment
    if (suite.isBrowser) {
      throw new Error("todo..");
    } else {
      // first argument is the script that invoked us:
      args = process.argv.slice(1);
    }
  }
  // TODO: proper option parsing!
  if (args.length > 0) {
    result.testSpecs = args.map(function(arg) {
      return {
        file: arg,
      }
    });
  }
  result.testFilter = buildTestFilter(result.testSpecs || [], opts.base);
  return result;
};


var CWD = null;
// In node.js we also allow paths relative to cwd()
if (sys.hostenv = "nodejs") {
  CWD = 'file://' + process.cwd() + '/';
}
var canonicalizeAgainst = (p, base) -> sys.canonicalizeURL(p, base)..rstrip('/');

var SuiteFilter = function SuiteFilter(opts, base) {
  this.opts = opts;
  this.used = {};
  this.base = base;
  if (this.opts.file) {
    this.file = opts.file;
    this.used.file = false;
    this.absolutePaths = [this.file .. canonicalizeAgainst(this.base)];
    if (CWD) {
      this.absolutePaths.push(this.file .. canonicalizeAgainst(CWD));
    }
  }
  if (this.opts.test) {
    this.used.test = false;
    this.test = this.opts.test;
  }
}

SuiteFilter.prototype.toString = function() {
  return JSON.stringify(this.opts);
}
SuiteFilter.prototype.shouldLoadModule = function(module_path) {
  if (!this.file) return true;

  if (this._shouldLoadModule(module_path)) {
    this.used.file = true;
    return true;
  }
  return false;
}

SuiteFilter.prototype.shouldRun = function(test_fullname) {
  if (!this.test) return true;
  if (test_fullname.indexOf(this.test) != -1) {
    this.used.test = true;
    return true;
  }
  return false;
}

SuiteFilter.prototype._shouldLoadModule = function(module_path) {
  if(module_path == this.file) return true;

  var absolutePath = module_path .. canonicalizeAgainst(this.base);
  if (this.absolutePaths.indexOf(absolutePath) != -1) return true;
  return this.absolutePaths .. any(p -> absolutePath .. startsWith(p + '/'));
}

var buildTestFilter = exports._buildTestFilter = function(specs, base) {
  var always = () -> true;
  var emptyList = () -> [];

  if (specs.length > 0 && !base) throw new Error("opts.base not defined");
  var filters = specs .. map(s -> new SuiteFilter(s, base)) .. toArray;

  if (specs.length == 0) {
    return {
      shouldLoadModule: always,
      shouldRun: always,
      unusedFilters: emptyList,
    }
  }

  var shouldLoadModule = function(mod) {
    var result = false;
    filters .. each{|suiteFilter|
      if (suiteFilter.shouldLoadModule(mod)) {
        result = true;
      }
    }
    return result;
  }

  var shouldRun = function(mod, test) {
    var result = false;
    var fullname = test.fullDescription();
    filters .. each{|suiteFilter|
      if (suiteFilter.shouldLoadModule(mod) && suiteFilter.shouldRun(fullname)) {
        result = true;
      }
    }
    return result;
  }

  return {
    shouldLoadModule: shouldLoadModule,
    shouldRun: shouldRun,
    unusedFilters: () -> (filters .. filter(s -> (s.used.file === false || s.used.test === false)) .. toArray),
  }
}

exports.run = Runner.run = function(opts, args) {
  logging.debug(`GOT OPTS: ${opts}`);
  var run_opts = exports.getRunOpts(opts, args);
  logging.debug(`GOT RUN_OPTS: ${run_opts}`);
  var reporter = opts.reporter || new (require("./reporter").DefaultReporter)(run_opts);
  var runner = new Runner(run_opts, reporter);
  runner.loadAll(opts);
  return runner.run();
}
