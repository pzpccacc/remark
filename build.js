(function outer(modules, cache, entries){

  /**
   * Global
   */

  var global = (function(){ return this; })();

  /**
   * Require `name`.
   *
   * @param {String} name
   * @param {Boolean} jumped
   * @api public
   */

  function require(name, jumped){
    if (cache[name]) return cache[name].exports;
    if (modules[name]) return call(name, require);
    throw new Error('cannot find module "' + name + '"');
  }

  /**
   * Call module `id` and cache it.
   *
   * @param {Number} id
   * @param {Function} require
   * @return {Function}
   * @api private
   */

  function call(id, require){
    var m = { exports: {} };
    var mod = modules[id];
    var name = mod[2];
    var fn = mod[0];

    fn.call(m.exports, function(req){
      var dep = modules[id][1][req];
      return require(dep || req);
    }, m, m.exports, outer, modules, cache, entries);

    // store to cache after successful resolve
    cache[id] = m;

    // expose as `name`.
    if (name) cache[name] = cache[id];

    return cache[id].exports;
  }

  /**
   * Require all entries exposing them on global if needed.
   */

  for (var id in entries) {
    if (entries[id]) {
      global[entries[id]] = require(id);
    } else {
      require(id);
    }
  }

  /**
   * Duo flag.
   */

  require.duo = true;

  /**
   * Expose cache.
   */

  require.cache = cache;

  /**
   * Expose modules
   */

  require.modules = modules;

  /**
   * Return newest require.
   */

   return require;
})({
1: [function(require, module, exports) {
'use strict';

/*
 * Dependencies.
 */

var mdast = require('wooorm/mdast@0.20.0');
var debounce = require('component/debounce@1.0.0');
var keycode = require('timoxley/keycode');
var query = require('component/querystring');
var Quill = require('quilljs/quill');

/*
 * Methods.
 */

var Delta = Quill.require('delta');

/*
 * Constants.
 */

var defaultText = 'Here’s a tiny demo for **mdast**.\n\nIts focus is to _showcase_ how the options above work.\n\nCheers!\n\n---\n\nP.S. I’ve added some nice keyboard sortcuts (`b`, `i`, `u`, and `/`)\nfor your convenience, and some syntax highlighting to show things are\nworking!\n\nP.P.S. You can also permalink the current document using `⌘+s` or `Ctrl+s`.';

/*
 * DOM elements.
 */

var $options = [].concat([].slice.call(document.getElementsByTagName('input')), [].slice.call(document.getElementsByTagName('select')));

/*
 * Editors.
 */

var write = new Quill(document.getElementById('write'), {
    'formats': []
});

var read = new Quill(document.getElementById('read'), {
    'readOnly': true
});

/*
 * Options.
 */

var options = {};

/*
 * Shortcuts.
 */

var keyboard = write.modules.keyboard;
var hotkeys = keyboard.hotkeys;

/*
 * Quill does not remove bold, italic, underline
 * when settings formats to `0`
 */

delete hotkeys[66];
delete hotkeys[73];
delete hotkeys[85];

/**
 * Add a callback for key.
 *
 * @param {number} key
 * @param {function(Range)} callback
 */
function addKey(key, callback) {
    keyboard.addHotkey({
        'key': keycode(key),
        'metaKey': true
    }, function (range) {
        console.log('addKey: ', range);
        callback(range);

        return false;
    });
}

/**
 * Add a format callback for key.
 *
 * @param {number} key
 * @param {string} before
 * @param {string?} [after]
 */
function addFormatKey(key, before, after) {
    addKey(key, function (range) {
        var start = range.start;
        var end = range.end;

        write.insertText(start, before);
        write.insertText(end + before.length, after || before);
        write.setSelection(start + before.length, end + before.length);
    });
}

/*
 * Listen.
 */

addFormatKey('b', '**');
addFormatKey('i', '_');
addFormatKey('u', '~~');
addFormatKey('/', '<!--', '-->');

addKey('s', setPermalink);

/**
 * Visit.
 *
 * @param {Node} tree
 * @param {string} [type]
 * @param {function(node)} callback
 */
function visit(tree, type, callback) {
    if (!callback) {
        callback = type;
        type = null;
    }

    function one(node) {
        if (!type || node.type === type) {
            callback(node);
        }

        if (node.children) {
            node.children.forEach(one);
        }
    }

    one(tree);
}

/**
 * Create a formatter.
 *
 * @param {Quill} quill
 * @param {Node} ast
 * @return {Function}
 */
function formatFactory(quill, ast) {
    var editor = quill.editor;

    /**
     * Format nodes of type `type`.
     *
     * @param {string?} type
     * @param {Object} formats
     */
    return function (type, formats) {
        visit(ast, type, function (node) {
            var start = node.position.start.offset;
            var end = node.position.end.offset;
            var delta = new Delta().retain(start).retain(end - start, formats);
            var index = 0;

            delta.ops.forEach(function (op) {
                if (op.attributes) {
                    Object.keys(op.attributes).forEach(function (name) {
                        editor._formatAt(index, op.retain, name, op.attributes[name]);
                    });
                }

                index += op.retain;
            });
        });
    };
}

/**
 * Calculate offsets for `lines`.
 *
 * @param {Array.<string>} lines
 * @return {Array.<number>}
 */
function toOffsets(lines) {
    var total = 0;

    return lines.map(function (value) {
        return total += value.length + 1;
    });
}

/**
 * Add an offset based on `columns` to `position`.
 *
 * @param {Object} position
 * @return {Array.<number>} offsets
 */
function addRange(position, offsets) {
    position.offset = (offsets[position.line - 2] || 0) + position.column - 1;
}

/**
 * Add ranges for `doc` to `ast`.
 *
 * @param {string} doc
 * @return {Node} ast
 */
function addRanges(doc, ast) {
    var offsets = toOffsets(doc.split('\n'));

    visit(ast, function (node) {
        addRange(node.position.start, offsets);
        addRange(node.position.end, offsets);
    });
}

/**
 * Highlight `doc`, with `editor`.
 *
 * @return {Quill} quill
 * @param {string} doc
 */
function highlight(quill, doc) {
    var tree = mdast.parse(doc, options);
    var format = formatFactory(quill, tree);

    addRanges(doc, tree);

    format('strong', { 'bold': true });
    format('emphasis', { 'italic': true });
    format('delete', { 'strike': true });

    format('link', { 'color': '#4183c4' });
    format('image', { 'color': '#4183c4' });
    format('footnote', { 'color': '#4183c4' });

    format('escape', { 'color': '#cb4b16' });

    format('inlineCode', { 'font': 'monospace', 'background': '#f7f7f7' });
    format('code', { 'font': 'monospace', 'background': '#f7f7f7' });
    format('yaml', { 'font': 'monospace', 'background': '#f7f7f7' });
    format('html', { 'font': 'monospace', 'background': '#f7f7f7' });

    format('heading', { 'size': '18px' });
}

/**
 * Change.
 */
function onchange() {
    var ast = mdast.parse(write.getText(), options);
    var doc = mdast.stringify(ast, options);

    read.setText(doc);

    highlight(read, doc);
}

/**
 * Get permalink.
 */
function getPermalink() {
    var variables = query.parse(window.location.search);

    for (var key in variables) {
        if (key === 'text') return variables[key];
    }

    return null;
}

/**
 * Get permalink.
 */
function setPermalink() {
    var variables = query.parse(window.location.search);

    variables.text = write.getText() || '';

    window.location.search = '?' + query.stringify(variables);
}

/*
 * Debounce. This is only for the formatting.
 */

var debouncedChange = debounce(onchange, 100);

/*
 * Setting changes.
 */

function ontextchange($target, name) {
    options[name] = $target.value;
}

function onnumberchange($target, name) {
    options[name] = Number($target.value);
}

function oncheckboxchange($target, name) {
    options[name] = $target.checked;
}

function onselectchange($target, name) {
    var $option = $target.selectedOptions[0];

    if ($option) options[name] = $option.value;
}

function onsettingchange(event) {
    var $target = event.target;
    var type = $target.hasAttribute('type') ? $target.type : event.target.nodeName.toLowerCase();

    if (!$target.hasAttribute('name')) return;

    onsettingchange[type in onsettingchange ? type : 'text']($target, $target.name);

    debouncedChange();
}

onsettingchange.select = onselectchange;
onsettingchange.checkbox = oncheckboxchange;
onsettingchange.text = ontextchange;
onsettingchange.number = onnumberchange;

/*
 * Listen.
 */

window.addEventListener('change', onsettingchange);

/*
 * Initial answer.
 */

write.on('text-change', debouncedChange);

$options.forEach(function ($node) {
    return onsettingchange({ 'target': $node });
});

write.setText(getPermalink() || defaultText);

/*
 * Focus editor.
 */

write.focus();
}, {"wooorm/mdast@0.20.0":2,"component/debounce@1.0.0":3,"timoxley/keycode":4,"component/querystring":5,"quilljs/quill":6}],
2: [function(require, module, exports) {
'use strict';

/*
 * Dependencies.
 */

var Ware = require('ware');
var parser = require('./lib/parse.js');
var stringifier = require('./lib/stringify.js');
var File = require('./lib/file.js');
var utilities = require('./lib/utilities.js');

/*
 * Methods.
 */

var clone = utilities.clone;
var Parser = parser.Parser;
var parseProto = Parser.prototype;
var Compiler = stringifier.Compiler;
var compileProto = Compiler.prototype;

/**
 * Throws if passed an exception.
 *
 * Here until the following PR is merged into
 * segmentio/ware:
 *
 *   https://github.com/segmentio/ware/pull/21
 *
 * @param {Error?} exception
 */
function fail(exception) {
    if (exception) {
        throw exception;
    }
}

/**
 * Create a custom, cloned, Parser.
 *
 * @return {Function}
 */
function constructParser() {
    var customProto;
    var expressions;
    var key;

    /**
     * Extensible prototype.
     */
    function CustomProto() {}

    CustomProto.prototype = parseProto;

    customProto = new CustomProto();

    /**
     * Extensible constructor.
     */
    function CustomParser() {
        Parser.apply(this, arguments);
    }

    CustomParser.prototype = customProto;

    /*
     * Construct new objects for things that plugin's
     * might modify.
     */

    customProto.blockTokenizers = clone(parseProto.blockTokenizers);
    customProto.blockMethods = clone(parseProto.blockMethods);
    customProto.inlineTokenizers = clone(parseProto.inlineTokenizers);
    customProto.inlineMethods = clone(parseProto.inlineMethods);

    expressions = parseProto.expressions;
    customProto.expressions = {};

    for (key in expressions) {
        customProto.expressions[key] = clone(expressions[key]);
    }

    return CustomParser;
}

/**
 * Create a custom, cloned, Compiler.
 *
 * @return {Function}
 */
function constructCompiler() {
    var customProto;

    /**
     * Extensible prototype.
     */
    function CustomProto() {}

    CustomProto.prototype = compileProto;

    customProto = new CustomProto();

    /**
     * Extensible constructor.
     */
    function CustomCompiler() {
        Compiler.apply(this, arguments);
    }

    CustomCompiler.prototype = customProto;

    return CustomCompiler;
}

/**
 * Construct an MDAST instance.
 *
 * @constructor {MDAST}
 */
function MDAST() {
    var self = this;

    if (!(self instanceof MDAST)) {
        return new MDAST();
    }

    self.ware = new Ware();
    self.attachers = [];

    self.Parser = constructParser();
    self.Compiler = constructCompiler();
}

/**
 * Attach a plugin.
 *
 * @param {Function|Array.<Function>} attach
 * @param {Object?} options
 * @return {MDAST}
 */
function use(attach, options) {
    var self = this;
    var index;
    var transformer;

    if (!(self instanceof MDAST)) {
        self = new MDAST();
    }

    /*
     * Multiple attachers.
     */

    if ('length' in attach && typeof attach !== 'function') {
        index = attach.length;

        while (attach[--index]) {
            self.use(attach[index]);
        }

        return self;
    }

    /*
     * Single plugin.
     */

    if (self.attachers.indexOf(attach) === -1) {
        transformer = attach(self, options);

        self.attachers.push(attach);

        if (transformer) {
            self.ware.use(transformer);
        }
    }

    return self;
}

/**
 * Apply transformers to `node`.
 *
 * @param {Node} ast
 * @param {File?} [file]
 * @param {Function?} [done]
 * @return {Node} - `ast`.
 */
function run(ast, file, done) {
    var self = this;

    if (typeof file === 'function') {
        done = file;
        file = null;
    }

    file = new File(file);

    done = typeof done === 'function' ? done : fail;

    if (typeof ast !== 'object' && typeof ast.type !== 'string') {
        utilities.raise(ast, 'ast');
    }

    /*
     * Only run when this is an instance of MDAST.
     */

    if (self.ware) {
        self.ware.run(ast, file, done);
    } else {
        done(null, ast, file);
    }

    return ast;
}

/**
 * Wrapper to pass a file to `parser`.
 */
function parse(value, options) {
    return parser.call(this, new File(value), options);
}

/**
 * Wrapper to pass a file to `stringifier`.
 */
function stringify(ast, file, options) {
    if (options === null || options === undefined) {
        options = file;
        file = null;
    }

    return stringifier.call(this, ast, new File(file), options);
}

/**
 * Parse a value and apply transformers.
 *
 * @param {string|File} value
 * @param {Object?} [options]
 * @param {Function?} [done]
 * @return {string?}
 */
function process(value, options, done) {
    var file = new File(value);
    var self = this instanceof MDAST ? this : new MDAST();
    var result = null;
    var ast;

    if (typeof options === 'function') {
        done = options;
        options = null;
    }

    /**
     * Invoked when `run` completes. Hoists `result` into
     * the upper scope to return something for sync
     * operations.
     */
    function callback(exception) {
        if (exception) {
            (done || fail)(exception);
        } else {
            result = self.stringify(ast, file, options);

            if (done) {
                done(null, result, file);
            }
        }
    }

    ast = self.parse(file, options);
    self.run(ast, file, callback);

    return result;
}

/*
 * Methods.
 */

var proto = MDAST.prototype;

proto.use = use;
proto.parse = parse;
proto.run = run;
proto.stringify = stringify;
proto.process = process;

/*
 * Functions.
 */

MDAST.use = use;
MDAST.parse = parse;
MDAST.run = run;
MDAST.stringify = stringify;
MDAST.process = process;

/*
 * Expose `mdast`.
 */

module.exports = MDAST;
}, {"ware":7,"./lib/parse.js":8,"./lib/stringify.js":9,"./lib/file.js":10,"./lib/utilities.js":11}],
7: [function(require, module, exports) {
/**
 * Module Dependencies
 */

var slice = [].slice;
var wrap = require('wrap-fn');

/**
 * Expose `Ware`.
 */

module.exports = Ware;

/**
 * Throw an error.
 *
 * @param {Error} error
 */

function fail (err) {
  throw err;
}

/**
 * Initialize a new `Ware` manager, with optional `fns`.
 *
 * @param {Function or Array or Ware} fn (optional)
 */

function Ware (fn) {
  if (!(this instanceof Ware)) return new Ware(fn);
  this.fns = [];
  if (fn) this.use(fn);
}

/**
 * Use a middleware `fn`.
 *
 * @param {Function or Array or Ware} fn
 * @return {Ware}
 */

Ware.prototype.use = function (fn) {
  if (fn instanceof Ware) {
    return this.use(fn.fns);
  }

  if (fn instanceof Array) {
    for (var i = 0, f; f = fn[i++];) this.use(f);
    return this;
  }

  this.fns.push(fn);
  return this;
};

/**
 * Run through the middleware with the given `args` and optional `callback`.
 *
 * @param {Mixed} args...
 * @param {Function} callback (optional)
 * @return {Ware}
 */

Ware.prototype.run = function () {
  var fns = this.fns;
  var ctx = this;
  var i = 0;
  var last = arguments[arguments.length - 1];
  var done = 'function' == typeof last && last;
  var args = done
    ? slice.call(arguments, 0, arguments.length - 1)
    : slice.call(arguments);

  // next step
  function next (err) {
    if (err) return (done || fail)(err);
    var fn = fns[i++];
    var arr = slice.call(args);

    if (!fn) {
      return done && done.apply(null, [null].concat(args));
    }

    wrap(fn, next).apply(ctx, arr);
  }

  next();

  return this;
};

}, {"wrap-fn":12}],
12: [function(require, module, exports) {
/**
 * Module Dependencies
 */

var noop = function(){};
var co = require('co');

/**
 * Export `wrap-fn`
 */

module.exports = wrap;

/**
 * Wrap a function to support
 * sync, async, and gen functions.
 *
 * @param {Function} fn
 * @param {Function} done
 * @return {Function}
 * @api public
 */

function wrap(fn, done) {
  done = once(done || noop);

  return function() {
    // prevents arguments leakage
    // see https://github.com/petkaantonov/bluebird/wiki/Optimization-killers#3-managing-arguments
    var i = arguments.length;
    var args = new Array(i);
    while (i--) args[i] = arguments[i];

    var ctx = this;

    // done
    if (!fn) {
      return done.apply(ctx, [null].concat(args));
    }

    // async
    if (fn.length > args.length) {
      // NOTE: this only handles uncaught synchronous errors
      try {
        return fn.apply(ctx, args.concat(done));
      } catch (e) {
        return done(e);
      }
    }

    // generator
    if (generator(fn)) {
      return co(fn).apply(ctx, args.concat(done));
    }

    // sync
    return sync(fn, done).apply(ctx, args);
  }
}

/**
 * Wrap a synchronous function execution.
 *
 * @param {Function} fn
 * @param {Function} done
 * @return {Function}
 * @api private
 */

function sync(fn, done) {
  return function () {
    var ret;

    try {
      ret = fn.apply(this, arguments);
    } catch (err) {
      return done(err);
    }

    if (promise(ret)) {
      ret.then(function (value) { done(null, value); }, done);
    } else {
      ret instanceof Error ? done(ret) : done(null, ret);
    }
  }
}

/**
 * Is `value` a generator?
 *
 * @param {Mixed} value
 * @return {Boolean}
 * @api private
 */

function generator(value) {
  return value
    && value.constructor
    && 'GeneratorFunction' == value.constructor.name;
}


/**
 * Is `value` a promise?
 *
 * @param {Mixed} value
 * @return {Boolean}
 * @api private
 */

function promise(value) {
  return value && 'function' == typeof value.then;
}

/**
 * Once
 */

function once(fn) {
  return function() {
    var ret = fn.apply(this, arguments);
    fn = noop;
    return ret;
  };
}

}, {"co":13}],
13: [function(require, module, exports) {

/**
 * slice() reference.
 */

var slice = Array.prototype.slice;

/**
 * Expose `co`.
 */

module.exports = co;

/**
 * Wrap the given generator `fn` and
 * return a thunk.
 *
 * @param {Function} fn
 * @return {Function}
 * @api public
 */

function co(fn) {
  var isGenFun = isGeneratorFunction(fn);

  return function (done) {
    var ctx = this;

    // in toThunk() below we invoke co()
    // with a generator, so optimize for
    // this case
    var gen = fn;

    // we only need to parse the arguments
    // if gen is a generator function.
    if (isGenFun) {
      var args = slice.call(arguments), len = args.length;
      var hasCallback = len && 'function' == typeof args[len - 1];
      done = hasCallback ? args.pop() : error;
      gen = fn.apply(this, args);
    } else {
      done = done || error;
    }

    next();

    // #92
    // wrap the callback in a setImmediate
    // so that any of its errors aren't caught by `co`
    function exit(err, res) {
      setImmediate(function(){
        done.call(ctx, err, res);
      });
    }

    function next(err, res) {
      var ret;

      // multiple args
      if (arguments.length > 2) res = slice.call(arguments, 1);

      // error
      if (err) {
        try {
          ret = gen.throw(err);
        } catch (e) {
          return exit(e);
        }
      }

      // ok
      if (!err) {
        try {
          ret = gen.next(res);
        } catch (e) {
          return exit(e);
        }
      }

      // done
      if (ret.done) return exit(null, ret.value);

      // normalize
      ret.value = toThunk(ret.value, ctx);

      // run
      if ('function' == typeof ret.value) {
        var called = false;
        try {
          ret.value.call(ctx, function(){
            if (called) return;
            called = true;
            next.apply(ctx, arguments);
          });
        } catch (e) {
          setImmediate(function(){
            if (called) return;
            called = true;
            next(e);
          });
        }
        return;
      }

      // invalid
      next(new TypeError('You may only yield a function, promise, generator, array, or object, '
        + 'but the following was passed: "' + String(ret.value) + '"'));
    }
  }
}

/**
 * Convert `obj` into a normalized thunk.
 *
 * @param {Mixed} obj
 * @param {Mixed} ctx
 * @return {Function}
 * @api private
 */

function toThunk(obj, ctx) {

  if (isGeneratorFunction(obj)) {
    return co(obj.call(ctx));
  }

  if (isGenerator(obj)) {
    return co(obj);
  }

  if (isPromise(obj)) {
    return promiseToThunk(obj);
  }

  if ('function' == typeof obj) {
    return obj;
  }

  if (isObject(obj) || Array.isArray(obj)) {
    return objectToThunk.call(ctx, obj);
  }

  return obj;
}

/**
 * Convert an object of yieldables to a thunk.
 *
 * @param {Object} obj
 * @return {Function}
 * @api private
 */

function objectToThunk(obj){
  var ctx = this;
  var isArray = Array.isArray(obj);

  return function(done){
    var keys = Object.keys(obj);
    var pending = keys.length;
    var results = isArray
      ? new Array(pending) // predefine the array length
      : new obj.constructor();
    var finished;

    if (!pending) {
      setImmediate(function(){
        done(null, results)
      });
      return;
    }

    // prepopulate object keys to preserve key ordering
    if (!isArray) {
      for (var i = 0; i < pending; i++) {
        results[keys[i]] = undefined;
      }
    }

    for (var i = 0; i < keys.length; i++) {
      run(obj[keys[i]], keys[i]);
    }

    function run(fn, key) {
      if (finished) return;
      try {
        fn = toThunk(fn, ctx);

        if ('function' != typeof fn) {
          results[key] = fn;
          return --pending || done(null, results);
        }

        fn.call(ctx, function(err, res){
          if (finished) return;

          if (err) {
            finished = true;
            return done(err);
          }

          results[key] = res;
          --pending || done(null, results);
        });
      } catch (err) {
        finished = true;
        done(err);
      }
    }
  }
}

/**
 * Convert `promise` to a thunk.
 *
 * @param {Object} promise
 * @return {Function}
 * @api private
 */

function promiseToThunk(promise) {
  return function(fn){
    promise.then(function(res) {
      fn(null, res);
    }, fn);
  }
}

/**
 * Check if `obj` is a promise.
 *
 * @param {Object} obj
 * @return {Boolean}
 * @api private
 */

function isPromise(obj) {
  return obj && 'function' == typeof obj.then;
}

/**
 * Check if `obj` is a generator.
 *
 * @param {Mixed} obj
 * @return {Boolean}
 * @api private
 */

function isGenerator(obj) {
  return obj && 'function' == typeof obj.next && 'function' == typeof obj.throw;
}

/**
 * Check if `obj` is a generator function.
 *
 * @param {Mixed} obj
 * @return {Boolean}
 * @api private
 */

function isGeneratorFunction(obj) {
  return obj && obj.constructor && 'GeneratorFunction' == obj.constructor.name;
}

/**
 * Check for plain object.
 *
 * @param {Mixed} val
 * @return {Boolean}
 * @api private
 */

function isObject(val) {
  return val && Object == val.constructor;
}

/**
 * Throw `err` in a new stack.
 *
 * This is used when co() is invoked
 * without supplying a callback, which
 * should only be for demonstrational
 * purposes.
 *
 * @param {Error} err
 * @api private
 */

function error(err) {
  if (!err) return;
  setImmediate(function(){
    throw err;
  });
}

}, {}],
8: [function(require, module, exports) {
/**
 * @author Titus Wormer
 * @copyright 2015 Titus Wormer. All rights reserved.
 * @module Parse
 * @fileoverview Parse a markdown document into an
 *   abstract syntax tree.
 */

'use strict';

/*
 * Dependencies.
 */

var he = require('he');
var repeat = require('repeat-string');
var utilities = require('./utilities.js');
var defaultExpressions = require('./expressions.js');
var defaultOptions = require('./defaults.js').parse;

/*
 * Methods.
 */

var clone = utilities.clone;
var copy = utilities.copy;
var raise = utilities.raise;
var trim = utilities.trim;
var trimRightLines = utilities.trimRightLines;
var clean = utilities.clean;
var validate = utilities.validate;
var normalize = utilities.normalizeIdentifier;
var objectCreate = utilities.create;

/*
 * Characters.
 */

var AT_SIGN = '@';
var CARET = '^';
var EQUALS = '=';
var EXCLAMATION_MARK = '!';
var MAILTO_PROTOCOL = 'mailto:';
var NEW_LINE = '\n';
var SPACE = ' ';
var TAB = '\t';
var EMPTY = '';
var LT = '<';
var GT = '>';
var BRACKET_OPEN = '[';

/*
 * Types.
 */

var BLOCK = 'block';
var INLINE = 'inline';
var HORIZONTAL_RULE = 'horizontalRule';
var HTML = 'html';
var YAML = 'yaml';
var TABLE = 'table';
var TABLE_CELL = 'tableCell';
var TABLE_HEADER = 'tableHeader';
var TABLE_ROW = 'tableRow';
var PARAGRAPH = 'paragraph';
var TEXT = 'text';
var CODE = 'code';
var LIST = 'list';
var LIST_ITEM = 'listItem';
var FOOTNOTE_DEFINITION = 'footnoteDefinition';
var HEADING = 'heading';
var BLOCKQUOTE = 'blockquote';
var LINK = 'link';
var IMAGE = 'image';
var FOOTNOTE = 'footnote';
var ESCAPE = 'escape';
var STRONG = 'strong';
var EMPHASIS = 'emphasis';
var DELETE = 'delete';
var INLINE_CODE = 'inlineCode';
var BREAK = 'break';
var ROOT = 'root';

/**
 * Wrapper around he's `decode` function.
 *
 * @example
 *   decode('&amp;'); // '&'
 *   decode('&amp'); // '&'
 *
 * @param {string} value
 * @param {function(string)} eat
 * @return {string}
 * @throws {Error} - When `eat.file.quiet` is not `true`.
 *   However, by default `he` does not throw on incorrect
 *   encoded entities, but when
 *   `he.decode.options.strict: true`, they occur on
 *   entities with a missing closing semi-colon.
 */
function decode(value, eat) {
    try {
        return he.decode(value);
    } catch (exception) {
        eat.file.fail(exception, eat.now());
    }
}

/**
 * Factory to de-escape a value, based on an expression
 * at `key` in `scope`.
 *
 * @example
 *   var expressions = {escape: /\\(a)/}
 *   var descape = descapeFactory(expressions, 'escape');
 *
 * @param {Object} scope - Map of expressions.
 * @param {string} key - Key in `map` at which the
 *   non-global expression exists.
 * @return {function(string): string} - Function which
 *   takes a value and returns its unescaped version.
 */
function descapeFactory(scope, key) {
    var globalExpression;
    var expression;

    /**
     * Private method to get a global expression
     * from the expression at `key` in `scope`.
     * This method is smart about not recreating
     * the expressions every time.
     *
     * @private
     * @return {RegExp}
     */
    function generate() {
        if (scope[key] !== globalExpression) {
            globalExpression = scope[key];
            expression = new RegExp(scope[key].source.replace(CARET, EMPTY), 'g');
        }

        return expression;
    }

    /**
     * De-escape a string using the expression at `key`
     * in `scope`.
     *
     * @example
     *   var expressions = {escape: /\\(a)/}
     *   var descape = descapeFactory(expressions, 'escape');
     *   descape('\a'); // 'a'
     *
     * @param {string} value - Escaped string.
     * @return {string} - Unescaped string.
     */
    function descape(value) {
        return value.replace(generate(), '$1');
    }

    return descape;
}

/*
 * Tab size.
 */

var TAB_SIZE = 4;

/*
 * Expressions.
 */

var EXPRESSION_RIGHT_ALIGNMENT = /^[ \t]*-+:[ \t]*$/;
var EXPRESSION_CENTER_ALIGNMENT = /^[ \t]*:-+:[ \t]*$/;
var EXPRESSION_LEFT_ALIGNMENT = /^[ \t]*:-+[ \t]*$/;
var EXPRESSION_TABLE_FENCE = /^[ \t]*|\|[ \t]*$/g;
var EXPRESSION_TABLE_INITIAL = /^[ \t]*\|[ \t]*/g;
var EXPRESSION_TABLE_CONTENT = /((?:\\[\s\S]|[^\|])+?)([ \t]?\|[ \t]?\n?|\n?$)/g;
var EXPRESSION_TABLE_BORDER = /[ \t]*\|[ \t]*/;
var EXPRESSION_BLOCK_QUOTE = /^[ \t]*>[ \t]?/gm;
var EXPRESSION_BULLET = /^([ \t]*)([*+-]|\d+[.)])( {1,4}(?! )| |\t)([^\n]*)/;
var EXPRESSION_PEDANTIC_BULLET = /^([ \t]*)([*+-]|\d+[.)])([ \t]+)/;
var EXPRESSION_INITIAL_INDENT = /^( {1,4}|\t)?/gm;
var EXPRESSION_INITIAL_TAB = /^( {4}|\t)?/gm;
var EXPRESSION_HTML_LINK_OPEN = /^<a /i;
var EXPRESSION_HTML_LINK_CLOSE = /^<\/a>/i;
var EXPRESSION_LOOSE_LIST_ITEM = /\n\n(?!\s*$)/;
var EXPRESSION_TASK_ITEM = /^\[([\ \t]|x|X)\][\ \t]/;

/*
 * A map of characters, and their column length,
 * which can be used as indentation.
 */

var INDENTATION_CHARACTERS = objectCreate;

INDENTATION_CHARACTERS[SPACE] = SPACE.length;
INDENTATION_CHARACTERS[TAB] = TAB_SIZE;

/**
 * Gets indentation information for a line.
 *
 * @example
 *   getIndent('  foo');
 *   // {indent: 2, stops: {1: 0, 2: 1}}
 *
 *   getIndent('\tfoo');
 *   // {indent: 4, stops: {4: 0}}
 *
 *   getIndent('  \tfoo');
 *   // {indent: 4, stops: {1: 0, 2: 1, 4: 2}}
 *
 *   getIndent('\t  foo')
 *   // {indent: 6, stops: {4: 0, 5: 1, 6: 2}}
 *
 * @param {string} value - Indented line.
 * @return {Object}
 */
function getIndent(value) {
    var index = 0;
    var indent = 0;
    var character = value.charAt(index);
    var stops = {};
    var size;

    while (character in INDENTATION_CHARACTERS) {
        size = INDENTATION_CHARACTERS[character];

        indent += size;

        if (size > 1) {
            indent = Math.floor(indent / size) * size;
        }

        stops[indent] = index;

        character = value.charAt(++index);
    }

    return {
        'indent': indent,
        'stops': stops
    };
}

/**
 * Remove the minimum indent from every line in `value`.
 * Supports both tab, spaced, and mixed indentation (as
 * well as possible).
 *
 * @example
 *   removeIndentation('  foo'); // 'foo'
 *   removeIndentation('    foo', 2); // '  foo'
 *   removeIndentation('\tfoo', 2); // '  foo'
 *   removeIndentation('  foo\n bar'); // ' foo\n bar'
 *
 * @param {string} value
 * @param {number?} [maximum] - Maximum indentation
 *   to remove.
 * @return {string} - Unindented `value`.
 */
function removeIndentation(value, maximum) {
    var values = value.split(NEW_LINE);
    var position = values.length + 1;
    var minIndent = Infinity;
    var matrix = [];
    var index;
    var indentation;
    var stops;
    var padding;

    values.unshift(repeat(SPACE, maximum) + EXCLAMATION_MARK);

    while (position--) {
        indentation = getIndent(values[position]);

        matrix[position] = indentation.stops;

        if (trim(values[position]).length === 0) {
            continue;
        }

        if (indentation.indent) {
            if (indentation.indent > 0 && indentation.indent < minIndent) {
                minIndent = indentation.indent;
            }
        } else {
            minIndent = Infinity;

            break;
        }
    }

    if (minIndent !== Infinity) {
        position = values.length;

        while (position--) {
            stops = matrix[position];
            index = minIndent;

            while (index && !(index in stops)) {
                index--;
            }

            if (trim(values[position]).length !== 0 && minIndent && index !== minIndent) {
                padding = TAB;
            } else {
                padding = EMPTY;
            }

            values[position] = padding + values[position].slice(index in stops ? stops[index] + 1 : 0);
        }
    }

    values.shift();

    return values.join(NEW_LINE);
}

/**
 * Ensure that `value` is at least indented with
 * `indent` spaces.  Does not support tabs. Does support
 * multiple lines.
 *
 * @example
 *   ensureIndentation('foo', 2); // '  foo'
 *   ensureIndentation('  foo', 4); // '    foo'
 *
 * @param {string} value
 * @param {number} indent - The maximum amount of
 *   spacing to insert.
 * @return {string} - indented `value`.
 */
function ensureIndentation(value, indent) {
    var values = value.split(NEW_LINE);
    var length = values.length;
    var index = -1;
    var line;
    var position;

    while (++index < length) {
        line = values[index];

        position = -1;

        while (++position < indent) {
            if (line.charAt(position) !== SPACE) {
                values[index] = repeat(SPACE, indent - position) + line;
                break;
            }
        }
    }

    return values.join(NEW_LINE);
}

/**
 * Get the alignment from a table rule.
 *
 * @example
 *   getAlignment([':-', ':-:', '-:', '--']);
 *   // ['left', 'center', 'right', null];
 *
 * @param {Array.<string>} cells
 * @return {Array.<string?>}
 */
function getAlignment(cells) {
    var results = [];
    var index = -1;
    var length = cells.length;
    var alignment;

    while (++index < length) {
        alignment = cells[index];

        if (EXPRESSION_RIGHT_ALIGNMENT.test(alignment)) {
            results[index] = 'right';
        } else if (EXPRESSION_CENTER_ALIGNMENT.test(alignment)) {
            results[index] = 'center';
        } else if (EXPRESSION_LEFT_ALIGNMENT.test(alignment)) {
            results[index] = 'left';
        } else {
            results[index] = null;
        }
    }

    return results;
}

/**
 * Construct a state `toggler`: a function which inverses
 * `property` in context based on its current value.
 * The by `toggler` returned function restores that value.
 *
 * @example
 *   var context = {};
 *   var key = 'foo';
 *   var val = true;
 *   context[key] = val;
 *   context.enter = stateToggler(key, val);
 *   context[key]; // true
 *   var exit = context.enter();
 *   context[key]; // false
 *   var nested = context.enter();
 *   context[key]; // false
 *   nested();
 *   context[key]; // false
 *   exit();
 *   context[key]; // true
 *
 * @param {string} key - Property to toggle.
 * @param {boolean} state - It's default state.
 * @return {function(): function()} - Enter.
 */
function stateToggler(key, state) {
    /**
     * Construct a toggler for the bound `key`.
     *
     * @return {Function} - Exit state.
     */
    function enter() {
        var self = this;
        var current = self[key];

        self[key] = !state;

        /**
         * State canceler, cancels the state, if allowed.
         */
        function exit() {
            self[key] = current;
        }

        return exit;
    }

    return enter;
}

/**
 * Construct a state toggler which doesn't toggle.
 *
 * @example
 *   var context = {};
 *   var key = 'foo';
 *   var val = true;
 *   context[key] = val;
 *   context.enter = noopToggler();
 *   context[key]; // true
 *   var exit = context.enter();
 *   context[key]; // true
 *   exit();
 *   context[key]; // true
 *
 * @return {function(): function()} - Enter.
 */
function noopToggler() {
    /**
     * No-operation.
     */
    function exit() {}

    /**
     * @return {Function}
     */
    function enter() {
        return exit;
    }

    return enter;
}

/*
 * Define nodes of a type which can be merged.
 */

var MERGEABLE_NODES = objectCreate();

/**
 * Merge two text nodes: `token` into `prev`.
 *
 * @param {Object} prev - Preceding sibling.
 * @param {Object} token - Following sibling.
 * @return {Object} - `prev`.
 */
MERGEABLE_NODES.text = function (prev, token) {
    prev.value += token.value;

    return prev;
};

/**
 * Merge two blockquotes: `token` into `prev`, unless in
 * CommonMark mode.
 *
 * @param {Object} prev - Preceding sibling.
 * @param {Object} token - Following sibling.
 * @return {Object} - `prev`, or `token` in CommonMark mode.
 */
MERGEABLE_NODES.blockquote = function (prev, token) {
    if (this.options.commonmark) {
        return token;
    }

    prev.children = prev.children.concat(token.children);

    return prev;
};

/**
 * Merge two lists: `token` into `prev`. Knows, about
 * which bullets were used.
 *
 * @param {Object} prev - Preceding sibling.
 * @param {Object} token - Following sibling.
 * @return {Object} - `prev`, or `token` when the lists are
 *   of different types (a different bullet is used).
 */
MERGEABLE_NODES.list = function (prev, token) {
    if (!this.currentBullet || this.currentBullet !== this.previousBullet || this.currentBullet.length !== 1) {
        return token;
    }

    prev.children = prev.children.concat(token.children);

    return prev;
};

/**
 * Tokenise a line.  Unsets `currentBullet` and
 * `previousBullet` if more than one lines are found, thus
 * preventing lists from merging when they use different
 * bullets.
 *
 * @example
 *   tokenizeNewline(eat, '\n\n');
 *
 * @param {function(string)} eat
 * @param {string} $0 - Lines.
 */
function tokenizeNewline(eat, $0) {
    if ($0.length > 1) {
        this.currentBullet = null;
        this.previousBullet = null;
    }

    eat($0);
}

/**
 * Tokenise an indented code block.
 *
 * @example
 *   tokenizeCode(eat, '\tfoo');
 *
 * @param {function(string)} eat
 * @param {string} $0 - Whole code.
 * @return {Node} - `code` node.
 */
function tokenizeCode(eat, $0) {
    $0 = trimRightLines($0);

    return eat($0)(this.renderCodeBlock(removeIndentation($0, TAB_SIZE), null, eat));
}

/**
 * Tokenise a fenced code block.
 *
 * @example
 *   var $0 = '```js\nfoo()\n```';
 *   tokenizeFences(eat, $0, '', '```', '`', 'js', 'foo()\n');
 *
 * @param {function(string)} eat
 * @param {string} $0 - Whole code.
 * @param {string} $1 - Initial spacing.
 * @param {string} $2 - Initial fence.
 * @param {string} $3 - Fence marker.
 * @param {string} $4 - Programming language flag.
 * @param {string} $5 - Content.
 * @return {Node} - `code` node.
 */
function tokenizeFences(eat, $0, $1, $2, $3, $4, $5) {
    $0 = trimRightLines($0);

    /*
     * If the initial fence was preceded by spaces,
     * exdent that amount of white space from the code
     * block.  Because it's possible that the code block
     * is exdented, we first have to ensure at least
     * those spaces are available.
     */

    if ($1) {
        $5 = removeIndentation(ensureIndentation($5, $1.length), $1.length);
    }

    return eat($0)(this.renderCodeBlock($5, $4, eat));
}

/**
 * Tokenise an ATX-style heading.
 *
 * @example
 *   tokenizeHeading(eat, ' # foo', ' ', '#', ' ', 'foo');
 *
 * @param {function(string)} eat
 * @param {string} $0 - Whole heading.
 * @param {string} $1 - Initial spacing.
 * @param {string} $2 - Hashes.
 * @param {string} $3 - Internal spacing.
 * @param {string} $4 - Content.
 * @return {Node} - `heading` node.
 */
function tokenizeHeading(eat, $0, $1, $2, $3, $4) {
    var offset = this.offset;
    var now = eat.now();
    var line = now.line;
    var prefix = $1 + $2 + $3;

    offset[line] = (offset[line] || 0) + prefix.length;

    return eat($0)(this.renderHeading($4, $2.length, now));
}

/**
 * Tokenise a Setext-style heading.
 *
 * @example
 *   tokenizeLineHeading(eat, 'foo\n===', '', 'foo', '=');
 *
 * @param {function(string)} eat
 * @param {string} $0 - Whole heading.
 * @param {string} $1 - Initial spacing.
 * @param {string} $2 - Content.
 * @param {string} $3 - Underline marker.
 * @return {Node} - `heading` node.
 */
function tokenizeLineHeading(eat, $0, $1, $2, $3) {
    var now = eat.now();

    now.column += $1.length;

    return eat($0)(this.renderHeading($2, $3 === EQUALS ? 1 : 2, now));
}

/**
 * Tokenise a horizontal rule.
 *
 * @example
 *   tokenizeHorizontalRule(eat, '***');
 *
 * @param {function(string)} eat
 * @param {string} $0 - Whole rule.
 * @return {Node} - `horizontalRule` node.
 */
function tokenizeHorizontalRule(eat, $0) {
    return eat($0)(this.renderVoid(HORIZONTAL_RULE));
}

/**
 * Tokenise a blockquote.
 *
 * @example
 *   tokenizeList(eat, '> Foo');
 *
 * @param {function(string)} eat
 * @param {string} $0 - Whole blockquote.
 * @return {Node} - `blockquote` node.
 */
function tokenizeBlockquote(eat, $0) {
    var now = eat.now();

    $0 = trimRightLines($0);

    return eat($0)(this.renderBlockquote($0, now));
}

/**
 * Tokenise a list.
 *
 * @example
 *   tokenizeList(eat, '- Foo', '', '-');
 *
 * @param {function(string)} eat
 * @param {string} $0 - Whole list.
 * @param {string} $1 - Indent.
 * @param {string} $2 - Bullet.
 * @return {Node} - `list` node.
 */
function tokenizeList(eat, $0, $1, $2) {
    var self = this;
    var firstBullet = $2;
    var matches = trimRightLines($0).match(self.rules.item);
    var length = matches.length;
    var index = 0;
    var isLoose = false;
    var now;
    var bullet;
    var add;
    var item;
    var enterTop;
    var exitBlockquote;
    var node;
    var indent;
    var size;
    var position;
    var end;

    /*
     * Determine if all list-items belong to the
     * same list.
     */

    if (!self.options.pedantic) {
        while (++index < length) {
            bullet = self.rules.bullet.exec(matches[index])[0];

            if (firstBullet !== bullet && (firstBullet.length === 1 && bullet.length === 1 || bullet.charAt(bullet.length - 1) !== firstBullet.charAt(firstBullet.length - 1))) {
                matches = matches.slice(0, index);
                matches[index - 1] = trimRightLines(matches[index - 1]);
                length = matches.length;

                break;
            }
        }
    }

    if (self.options.commonmark) {
        index = -1;

        while (++index < length) {
            item = matches[index];
            indent = self.rules.indent.exec(item);
            indent = indent[1] + repeat(SPACE, indent[2].length) + indent[3];
            size = getIndent(indent).indent;
            position = indent.length;
            end = item.length;

            while (++position < end) {
                if (item.charAt(position) === NEW_LINE && item.charAt(position - 1) === NEW_LINE && getIndent(item.slice(position + 1)).indent < size) {
                    matches[index] = item.slice(0, position - 1);

                    matches = matches.slice(0, index + 1);
                    length = matches.length;

                    break;
                }
            }
        }
    }

    self.previousBullet = self.currentBullet;
    self.currentBullet = firstBullet;

    index = -1;

    add = eat(EMPTY);

    enterTop = self.exitTop();
    exitBlockquote = self.enterBlockquote();

    node = add(self.renderList([], firstBullet));

    while (++index < length) {
        item = matches[index];
        now = eat.now();

        item = eat(item)(self.renderListItem(item, now), node);

        if (item.loose) {
            isLoose = true;
        }

        if (index !== length - 1) {
            eat(NEW_LINE);
        }
    }

    node.loose = isLoose;

    node.position.end = eat.now();

    enterTop();
    exitBlockquote();

    return node;
}

/**
 * Tokenise HTML.
 *
 * @example
 *   tokenizeHtml(eat, '<span>foo</span>');
 *
 * @param {function(string)} eat
 * @param {string} $0 - Whole HTML.
 * @return {Node} - `html` node.
 */
function tokenizeHtml(eat, $0) {
    $0 = trimRightLines($0);

    return eat($0)(this.renderRaw(HTML, $0));
}

/**
 * Tokenise a definition.
 *
 * @example
 *   var $0 = '[foo]: http://example.com "Example Domain"';
 *   var $1 = 'foo';
 *   var $2 = 'http://example.com';
 *   var $3 = 'Example Domain';
 *   tokenizeDefinition(eat, $0, $1, $2, $3);
 *
 * @property {boolean} onlyAtTop
 * @property {boolean} notInBlockquote
 * @param {function(string)} eat
 * @param {string} $0 - Whole definition.
 * @param {string} $1 - Key.
 * @param {string} $2 - URL.
 * @param {string} $3 - Title.
 * @return {Node} - `definition` node.
 */
function tokenizeDefinition(eat, $0, $1, $2, $3) {
    var link = $2;

    /*
     * Remove angle-brackets from `link`.
     */

    if (link.charAt(0) === LT && link.charAt(link.length - 1) === GT) {
        link = link.slice(1, -1);
    }

    return eat($0)({
        'type': 'definition',
        'identifier': normalize($1),
        'title': $3 || null,
        'link': this.descape(link)
    });
}

tokenizeDefinition.onlyAtTop = true;
tokenizeDefinition.notInBlockquote = true;

/**
 * Tokenise YAML front matter.
 *
 * @example
 *   var $0 = '---\nfoo: bar\n---';
 *   var $1 = 'foo: bar';
 *   tokenizeYAMLFrontMatter(eat, $0, $1);
 *
 * @property {boolean} onlyAtStart
 * @param {function(string)} eat
 * @param {string} $0 - Whole front matter.
 * @param {string} $1 - Content.
 * @return {Node} - `yaml` node.
 */
function tokenizeYAMLFrontMatter(eat, $0, $1) {
    return eat($0)(this.renderRaw(YAML, $1 ? trimRightLines($1) : EMPTY));
}

tokenizeYAMLFrontMatter.onlyAtStart = true;

/**
 * Tokenise a footnote definition.
 *
 * @example
 *   var $0 = '[foo]: Bar.';
 *   var $1 = '[foo]';
 *   var $2 = 'foo';
 *   var $3 = 'Bar.';
 *   tokenizeFootnoteDefinition(eat, $0, $1, $2, $3);
 *
 * @property {boolean} onlyAtTop
 * @property {boolean} notInBlockquote
 * @param {function(string)} eat
 * @param {string} $0 - Whole definition.
 * @param {string} $1 - Whole key.
 * @param {string} $2 - Key.
 * @param {string} $3 - Whole value.
 * @return {Node} - `footnoteDefinition` node.
 */
function tokenizeFootnoteDefinition(eat, $0, $1, $2, $3) {
    var self = this;
    var now = eat.now();
    var line = now.line;
    var offset = self.offset;

    $3 = $3.replace(EXPRESSION_INITIAL_TAB, function (value) {
        offset[line] = (offset[line] || 0) + value.length;
        line++;

        return EMPTY;
    });

    now.column += $1.length;

    return eat($0)(self.renderFootnoteDefinition(normalize($2), $3, now));
}

tokenizeFootnoteDefinition.onlyAtTop = true;
tokenizeFootnoteDefinition.notInBlockquote = true;

/**
 * Tokenise a table.
 *
 * @example
 *   var $0 = ' | foo |\n | --- |\n | bar |';
 *   var $1 = ' | foo |';
 *   var $2 = '| foo |';
 *   var $3 = ' | --- |';
 *   var $4 = '| --- |';
 *   var $5 = ' | bar |';
 *   tokenizeTable(eat, $0, $1, $2, $3, $4, $5);
 *
 * @property {boolean} onlyAtTop
 * @param {function(string)} eat
 * @param {string} $0 - Whole table.
 * @param {string} $1 - Whole heading.
 * @param {string} $2 - Trimmed heading.
 * @param {string} $3 - Whole alignment.
 * @param {string} $4 - Trimmed alignment.
 * @param {string} $5 - Rows.
 * @return {Node} - `table` node.
 */
function tokenizeTable(eat, $0, $1, $2, $3, $4, $5) {
    var self = this;
    var now;
    var node;
    var index;
    var length;

    node = eat(EMPTY)({
        'type': TABLE,
        'align': [],
        'children': []
    });

    /**
     * Eat a fence.  Returns an empty string so it can be
     * passed to `String#replace()`.
     *
     * @param {string} value - Fence.
     * @return {string} - Empty string.
     */
    function eatFence(value) {
        eat(value);

        return EMPTY;
    }

    /**
     * Factory to eat a cell to a bound `row`.
     *
     * @param {Object} row - Parent to add cells to.
     * @return {Function} - `eatCell` bound to `row`.
     */
    function eatCellFactory(row) {
        /**
         * Eat a cell.  Returns an empty string so it can be
         * passed to `String#replace()`.
         *
         * @param {string} value - Complete match.
         * @param {string} content - Cell content.
         * @param {string} pipe - Fence.
         * @return {string} - Empty string.
         */
        function eatCell(value, content, pipe) {
            now = eat.now();

            eat(content)(self.renderInline(TABLE_CELL, content.trim(), now), row);

            eat(pipe);

            return EMPTY;
        }

        return eatCell;
    }

    /**
     * Eat a row of type `type`.
     *
     * @param {string} type - Type of the returned node,
     *   such as `tableHeader` or `tableRow`.
     * @param {string} value - Row, including initial and
     *   final fences.
     */
    function renderRow(type, value) {
        var row = eat(EMPTY)(self.renderParent(type, []), node);

        value.replace(EXPRESSION_TABLE_INITIAL, eatFence).replace(EXPRESSION_TABLE_CONTENT, eatCellFactory(row));

        row.position.end = eat.now();
    }

    /*
     * Add the table's header.
     */

    renderRow(TABLE_HEADER, $1);

    eat(NEW_LINE);

    /*
     * Add the table's alignment.
     */

    eat($3);

    $4 = $4.replace(EXPRESSION_TABLE_FENCE, EMPTY).split(EXPRESSION_TABLE_BORDER);

    node.align = getAlignment($4);

    /*
     * Add the table rows to table's children.
     */

    $5 = trimRightLines($5).split(NEW_LINE);

    index = -1;
    length = $5.length;

    while (++index < length) {
        renderRow(TABLE_ROW, $5[index]);

        if (index !== length - 1) {
            eat(NEW_LINE);
        }
    }

    node.position.end = eat.now();

    return node;
}

tokenizeTable.onlyAtTop = true;

/**
 * Tokenise a paragraph token.
 *
 * @example
 *   tokenizeParagraph(eat, 'Foo.');
 *
 * @param {function(string)} eat
 * @param {string} $0 - Whole paragraph.
 * @return {Node?} - `paragraph` node, when the node does
 *   not just contain white space.
 */
function tokenizeParagraph(eat, $0) {
    var now = eat.now();

    if (trim($0) === EMPTY) {
        eat($0);

        return null;
    }

    $0 = trimRightLines($0);

    return eat($0)(this.renderInline(PARAGRAPH, $0, now));
}

/**
 * Tokenise a text token.
 *
 * @example
 *   tokenizeText(eat, 'foo');
 *
 * @param {function(string)} eat
 * @param {string} $0 - Whole text.
 * @return {Node} - `text` node.
 */
function tokenizeText(eat, $0) {
    return eat($0)(this.renderRaw(TEXT, $0));
}

/**
 * Create a code-block token.
 *
 * @example
 *   renderCodeBlock('foo()', 'js', now());
 *
 * @param {string?} [value] - Code.
 * @param {string?} [language] - Optional language flag.
 * @param {Function} eat
 * @return {Object} - `code` node.
 */
function renderCodeBlock(value, language, eat) {
    return {
        'type': CODE,
        'lang': language ? decode(this.descape(language), eat) : null,
        'value': trimRightLines(value || EMPTY)
    };
}

/**
 * Create a list token.
 *
 * @example
 *   var children = [renderListItem('- foo')];
 *   renderList(children, '-');
 *
 * @param {string} children - Children.
 * @param {string} bullet - First bullet.
 * @return {Object} - `list` node.
 */
function renderList(children, bullet) {
    var start = parseInt(bullet, 10);

    if (start !== start) {
        start = null;
    }

    /*
     * `loose` should be added later.
     */

    return {
        'type': LIST,
        'ordered': bullet.length > 1,
        'start': start,
        'loose': null,
        'children': children
    };
}

/**
 * Create a list-item using overly simple mechanics.
 *
 * @example
 *   renderPedanticListItem('- _foo_', now());
 *
 * @param {string} value - List-item.
 * @param {Object} position - List-item location.
 * @return {string} - Cleaned `value`.
 */
function renderPedanticListItem(value, position) {
    var self = this;
    var offset = self.offset;
    var line = position.line;

    /**
     * A simple replacer which removed all matches,
     * and adds their length to `offset`.
     *
     * @param {string} $0
     * @return {string}
     */
    function replacer($0) {
        offset[line] = (offset[line] || 0) + $0.length;
        line++;

        return EMPTY;
    }

    /*
     * Remove the list-item's bullet.
     */

    value = value.replace(EXPRESSION_PEDANTIC_BULLET, replacer);

    /*
     * The initial line is also matched by the below, so
     * we reset the `line`.
     */

    line = position.line;

    return value.replace(EXPRESSION_INITIAL_INDENT, replacer);
}

/**
 * Create a list-item using sane mechanics.
 *
 * @example
 *   renderNormalListItem('- _foo_', now());
 *
 * @param {string} value - List-item.
 * @param {Object} position - List-item location.
 * @return {string} - Cleaned `value`.
 */
function renderNormalListItem(value, position) {
    var self = this;
    var offset = self.offset;
    var line = position.line;
    var bullet;
    var rest;
    var lines;
    var trimmedLines;
    var index;
    var length;
    var max;

    /*
     * Remove the list-item's bullet.
     */

    value = value.replace(EXPRESSION_BULLET, function ($0, $1, $2, $3, $4) {
        bullet = $1 + $2 + $3;
        rest = $4;

        /*
         * Make sure that the first nine numbered list items
         * can indent with an extra space.  That is, when
         * the bullet did not receive an extra final space.
         */

        if (Number($2) < 10 && bullet.length % 2 === 1) {
            $2 = SPACE + $2;
        }

        max = $1 + repeat(SPACE, $2.length) + $3;

        return max + rest;
    });

    lines = value.split(NEW_LINE);

    trimmedLines = removeIndentation(value, getIndent(max).indent).split(NEW_LINE);

    /*
     * We replaced the initial bullet with something
     * else above, which was used to trick
     * `removeIndentation` into removing some more
     * characters when possible. However, that could
     * result in the initial line to be stripped more
     * than it should be.
     */

    trimmedLines[0] = rest;

    offset[line] = (offset[line] || 0) + bullet.length;
    line++;

    index = 0;
    length = lines.length;

    while (++index < length) {
        offset[line] = (offset[line] || 0) + lines[index].length - trimmedLines[index].length;

        line++;
    }

    return trimmedLines.join(NEW_LINE);
}

/*
 * A map of two functions which can create list items.
 */

var LIST_ITEM_MAP = objectCreate();

LIST_ITEM_MAP['true'] = renderPedanticListItem;
LIST_ITEM_MAP['false'] = renderNormalListItem;

/**
 * Create a list-item token.
 *
 * @example
 *   renderListItem('- _foo_', now());
 *
 * @param {Object} value - List-item.
 * @param {Object} position - List-item location.
 * @return {Object} - `listItem` node.
 */
function renderListItem(value, position) {
    var self = this;
    var offsets = self.offset;
    var checked = null;
    var node;
    var task;
    var offset;

    value = LIST_ITEM_MAP[self.options.pedantic].apply(self, arguments);

    if (self.options.gfm) {
        task = value.match(EXPRESSION_TASK_ITEM);

        if (task) {
            checked = task[1].toLowerCase() === 'x';

            offset = task[0].length;
            offsets[position.line] += offset;
            value = value.slice(offset);
        }
    }

    node = {
        'type': LIST_ITEM,
        'loose': EXPRESSION_LOOSE_LIST_ITEM.test(value) || value.charAt(value.length - 1) === NEW_LINE
    };

    if (self.options.gfm) {
        node.checked = checked;
    }

    node.children = self.tokenizeBlock(value, position);

    return node;
}

/**
 * Create a footnote-definition token.
 *
 * @example
 *   renderFootnoteDefinition('1', '_foo_', now());
 *
 * @param {string} identifier - Unique reference.
 * @param {string} value - Contents
 * @param {Object} position - Definition location.
 * @return {Object} - `footnoteDefinition` node.
 */
function renderFootnoteDefinition(identifier, value, position) {
    var self = this;
    var exitBlockquote = self.enterBlockquote();
    var token;

    token = {
        'type': FOOTNOTE_DEFINITION,
        'identifier': identifier,
        'children': self.tokenizeBlock(value, position)
    };

    exitBlockquote();

    return token;
}

/**
 * Create a heading token.
 *
 * @example
 *   renderHeading('_foo_', 1, now());
 *
 * @param {string} value - Content.
 * @param {number} depth - Heading depth.
 * @param {Object} position - Location of inline content.
 * @return {Object} - `heading` node
 */
function renderHeading(value, depth, position) {
    return {
        'type': HEADING,
        'depth': depth,
        'children': this.tokenizeInline(value, position)
    };
}

/**
 * Create a blockquote token.
 *
 * @example
 *   renderBlockquote('_foo_', now());
 *
 * @param {string} value - Content.
 * @param {Object} position - Location of blockquote.
 * @return {Object} - `blockquote` node.
 */
function renderBlockquote(value, position) {
    var self = this;
    var line = position.line;
    var offset = self.offset;
    var exitBlockquote = self.enterBlockquote();
    var token;

    value = value.replace(EXPRESSION_BLOCK_QUOTE, function ($0) {
        offset[line] = (offset[line] || 0) + $0.length;
        line++;

        return EMPTY;
    });

    token = {
        'type': BLOCKQUOTE,
        'children': this.tokenizeBlock(value, position)
    };

    exitBlockquote();

    return token;
}

/**
 * Create a void token.
 *
 * @example
 *   renderVoid('horizontalRule');
 *
 * @param {string} type - Node type.
 * @return {Object} - Node of type `type`.
 */
function renderVoid(type) {
    return {
        'type': type
    };
}

/**
 * Create a parent.
 *
 * @example
 *   renderParent('paragraph', '_foo_');
 *
 * @param {string} type - Node type.
 * @param {Array.<Object>} children - Child nodes.
 * @return {Object} - Node of type `type`.
 */
function renderParent(type, children) {
    return {
        'type': type,
        'children': children
    };
}

/**
 * Create a raw token.
 *
 * @example
 *   renderRaw('inlineCode', 'foo()');
 *
 * @param {string} type - Node type.
 * @param {string} value - Contents.
 * @return {Object} - Node of type `type`.
 */
function renderRaw(type, value) {
    return {
        'type': type,
        'value': value
    };
}

/**
 * Create a link token.
 *
 * @example
 *   renderLink(true, 'example.com', 'example', 'Example Domain', now(), eat);
 *   renderLink(false, 'fav.ico', 'example', 'Example Domain', now(), eat);
 *
 * @param {boolean} isLink - Whether linking to a document
 *   or an image.
 * @param {string} href - URI reference.
 * @param {string} text - Content.
 * @param {string?} title - Title.
 * @param {Object} position - Location of link.
 * @param {function(string)} eat
 * @return {Object} - `link` or `image` node.
 */
function renderLink(isLink, href, text, title, position, eat) {
    var self = this;
    var exitLink = self.enterLink();
    var token;

    token = {
        'type': isLink ? LINK : IMAGE,
        'title': title ? decode(self.descape(title), eat) : null
    };

    href = decode(href, eat);

    if (isLink) {
        token.href = href;
        token.children = self.tokenizeInline(text, position);
    } else {
        token.src = href;
        token.alt = text ? decode(self.descape(text), eat) : null;
    }

    exitLink();

    return token;
}

/**
 * Create a footnote token.
 *
 * @example
 *   renderFootnote('_foo_', now());
 *
 * @param {string} value - Contents.
 * @param {Object} position - Location of footnote.
 * @return {Object} - `footnote` node.
 */
function renderFootnote(value, position) {
    return this.renderInline(FOOTNOTE, value, position);
}

/**
 * Add a token with inline content.
 *
 * @example
 *   renderInline('strong', '_foo_', now());
 *
 * @param {string} type - Node type.
 * @param {string} value - Contents.
 * @param {Object} position - Location of node.
 * @return {Object} - Node of type `type`.
 */
function renderInline(type, value, position) {
    return this.renderParent(type, this.tokenizeInline(value, position));
}

/**
 * Add a token with block content.
 *
 * @example
 *   renderBlock('blockquote', 'Foo.', now());
 *
 * @param {string} type - Node type.
 * @param {string} value - Contents.
 * @param {Object} position - Location of node.
 * @return {Object} - Node of type `type`.
 */
function renderBlock(type, value, position) {
    return this.renderParent(type, this.tokenizeBlock(value, position));
}

/**
 * Tokenise an escape sequence.
 *
 * @example
 *   tokenizeEscape(eat, '\\a', 'a');
 *
 * @param {function(string)} eat
 * @param {string} $0 - Whole escape.
 * @param {string} $1 - Escaped character.
 * @return {Node} - `escape` node.
 */
function tokenizeEscape(eat, $0, $1) {
    return eat($0)(this.renderRaw(ESCAPE, $1));
}

/**
 * Tokenise a URL in carets.
 *
 * @example
 *   tokenizeAutoLink(eat, '<http://foo.bar>', 'http://foo.bar', '');
 *
 * @property {boolean} notInLink
 * @param {function(string)} eat
 * @param {string} $0 - Whole link.
 * @param {string} $1 - URL.
 * @param {string?} [$2] - Protocol or at.
 * @return {Node} - `link` node.
 */
function tokenizeAutoLink(eat, $0, $1, $2) {
    var self = this;
    var href = $1;
    var text = $1;
    var now = eat.now();
    var offset = 1;
    var tokenize;
    var node;

    if ($2 === AT_SIGN) {
        if (text.substr(0, MAILTO_PROTOCOL.length).toLowerCase() !== MAILTO_PROTOCOL) {
            href = MAILTO_PROTOCOL + text;
        } else {
            text = text.substr(MAILTO_PROTOCOL.length);
            offset += MAILTO_PROTOCOL.length;
        }
    }

    now.column += offset;

    /*
     * Temporarily remove support for escapes in autolinks.
     */

    tokenize = self.inlineTokenizers.escape;
    self.inlineTokenizers.escape = null;

    node = eat($0)(self.renderLink(true, href, text, null, now, eat));

    self.inlineTokenizers.escape = tokenize;

    return node;
}

tokenizeAutoLink.notInLink = true;

/**
 * Tokenise a URL in text.
 *
 * @example
 *   tokenizeURL(eat, 'http://foo.bar');
 *
 * @property {boolean} notInLink
 * @param {function(string)} eat
 * @param {string} $0 - Whole link.
 * @return {Node} - `link` node.
 */
function tokenizeURL(eat, $0) {
    var now = eat.now();

    return eat($0)(this.renderLink(true, $0, $0, null, now, eat));
}

tokenizeURL.notInLink = true;

/**
 * Tokenise an HTML tag.
 *
 * @example
 *   tokenizeTag(eat, '<span foo="bar">');
 *
 * @param {function(string)} eat
 * @param {string} $0 - Content.
 * @return {Node} - `html` node.
 */
function tokenizeTag(eat, $0) {
    var self = this;

    if (!self.inLink && EXPRESSION_HTML_LINK_OPEN.test($0)) {
        self.inLink = true;
    } else if (self.inLink && EXPRESSION_HTML_LINK_CLOSE.test($0)) {
        self.inLink = false;
    }

    return eat($0)(self.renderRaw(HTML, $0));
}

/**
 * Tokenise a link.
 *
 * @example
 *   tokenizeLink(
 *     eat, '![foo](fav.ico "Favicon")', '![', 'foo', null,
 *     'fav.ico', 'Foo Domain'
 *   );
 *
 * @param {function(string)} eat
 * @param {string} $0 - Whole link.
 * @param {string} $1 - Prefix.
 * @param {string} $2 - Text.
 * @param {string?} $3 - URL wrapped in angle braces.
 * @param {string?} $4 - Literal URL.
 * @param {string?} $5 - Title wrapped in single or double
 *   quotes.
 * @param {string?} [$6] - Title wrapped in double quotes.
 * @param {string?} [$7] - Title wrapped in parentheses.
 * @return {Node?} - `link` node, `image` node, or `null`.
 */
function tokenizeLink(eat, $0, $1, $2, $3, $4, $5, $6, $7) {
    var isLink = $1 === BRACKET_OPEN;
    var href = $4 || $3 || '';
    var title = $7 || $6 || $5;
    var now;

    if (!isLink || !this.inLink) {
        now = eat.now();

        now.column += $1.length;

        return eat($0)(this.renderLink(isLink, this.descape(href), $2, title, now, eat));
    }

    return null;
}

/**
 * Tokenise a reference link, image, or footnote;
 * shortcut reference link, or footnote.
 *
 * @example
 *   tokenizeReference(eat, '[foo]', '[', 'foo');
 *   tokenizeReference(eat, '[foo][]', '[', 'foo', '');
 *   tokenizeReference(eat, '[foo][bar]', '[', 'foo', 'bar');
 *
 * @property {boolean} notInLink
 * @param {function(string)} eat
 * @param {string} $0 - Whole link.
 * @param {string} $1 - Prefix.
 * @param {string} $2 - identifier.
 * @param {string} $3 - Content.
 * @return {Node} - `linkReference`, `imageReference`, or
 *   `footnoteReference`.
 */
function tokenizeReference(eat, $0, $1, $2, $3) {
    var self = this;
    var text = $2;
    var identifier = $3 || $2;
    var type = $1 === BRACKET_OPEN ? 'link' : 'image';
    var isFootnote = self.options.footnotes && identifier.charAt(0) === CARET;
    var now = eat.now();
    var referenceType;
    var node;
    var exitLink;

    if ($3 === undefined) {
        referenceType = 'shortcut';
    } else if ($3 === '') {
        referenceType = 'collapsed';
    } else {
        referenceType = 'full';
    }

    if (referenceType !== 'shortcut') {
        isFootnote = false;
    }

    if (isFootnote) {
        identifier = identifier.substr(1);
    }

    if (isFootnote) {
        if (identifier.indexOf(SPACE) !== -1) {
            return eat($0)(self.renderFootnote(identifier, eat.now()));
        } else {
            type = 'footnote';
        }
    }

    now.column += $1.length;

    node = {
        'type': type + 'Reference',
        'identifier': normalize(identifier)
    };

    if (type === 'link' || type === 'image') {
        node.referenceType = referenceType;
    }

    if (type === 'link') {
        exitLink = self.enterLink();
        node.children = self.tokenizeInline(text, now);
        exitLink();
    } else if (type === 'image') {
        node.alt = decode(self.descape(text), eat);
    }

    return eat($0)(node);
}

tokenizeReference.notInLink = true;

/**
 * Tokenise strong emphasis.
 *
 * @example
 *   tokenizeStrong(eat, '**foo**', '**', 'foo');
 *   tokenizeStrong(eat, '__foo__', null, null, '__', 'foo');
 *
 * @param {function(string)} eat
 * @param {string} $0 - Whole emphasis.
 * @param {string?} $1 - Marker.
 * @param {string?} $2 - Content.
 * @param {string?} [$3] - Marker.
 * @param {string?} [$4] - Content.
 * @return {Node?} - `strong` node, when not empty.
 */
function tokenizeStrong(eat, $0, $1, $2, $3, $4) {
    var now = eat.now();
    var value = $2 || $4;

    if (trim(value) === EMPTY) {
        return null;
    }

    now.column += 2;

    return eat($0)(this.renderInline(STRONG, value, now));
}

/**
 * Tokenise slight emphasis.
 *
 * @example
 *   tokenizeEmphasis(eat, '*foo*', '*', 'foo');
 *   tokenizeEmphasis(eat, '_foo_', null, null, '_', 'foo');
 *
 * @param {function(string)} eat
 * @param {string} $0 - Whole emphasis.
 * @param {string?} $1 - Marker.
 * @param {string?} $2 - Content.
 * @param {string?} [$3] - Marker.
 * @param {string?} [$4] - Content.
 * @return {Node?} - `emphasis` node, when not empty.
 */
function tokenizeEmphasis(eat, $0, $1, $2, $3, $4) {
    var now = eat.now();
    var marker = $1 || $3;
    var value = $2 || $4;

    if (trim(value) === EMPTY || value.charAt(0) === marker || value.charAt(value.length - 1) === marker) {
        return null;
    }

    now.column += 1;

    return eat($0)(this.renderInline(EMPHASIS, value, now));
}

/**
 * Tokenise a deletion.
 *
 * @example
 *   tokenizeDeletion(eat, '~~foo~~', '~~', 'foo');
 *
 * @param {function(string)} eat
 * @param {string} $0 - Whole deletion.
 * @param {string} $1 - Content.
 * @return {Node} - `delete` node.
 */
function tokenizeDeletion(eat, $0, $1) {
    var now = eat.now();

    now.column += 2;

    return eat($0)(this.renderInline(DELETE, $1, now));
}

/**
 * Tokenise inline code.
 *
 * @example
 *   tokenizeInlineCode(eat, '`foo()`', '`', 'foo()');
 *
 * @param {function(string)} eat
 * @param {string} $0 - Whole code.
 * @param {string} $1 - Initial markers.
 * @param {string} $2 - Content.
 * @return {Node} - `inlineCode` node.
 */
function tokenizeInlineCode(eat, $0, $1, $2) {
    return eat($0)(this.renderRaw(INLINE_CODE, trim($2 || '')));
}

/**
 * Tokenise a break.
 *
 * @example
 *   tokenizeBreak(eat, '  \n');
 *
 * @param {function(string)} eat
 * @param {string} $0
 * @return {Node} - `break` node.
 */
function tokenizeBreak(eat, $0) {
    return eat($0)(this.renderVoid(BREAK));
}

/**
 * Construct a new parser.
 *
 * @example
 *   var parser = new Parser();
 *
 * @constructor
 * @class {Parser}
 * @param {Object?} [options] - Passed to
 *   `Parser#setOptions()`.
 */
function Parser(options) {
    var self = this;
    var rules = copy({}, self.expressions.rules);

    self.inLink = false;
    self.atTop = true;
    self.atStart = true;
    self.inBlockquote = false;

    self.rules = rules;
    self.descape = descapeFactory(rules, 'escape');

    self.options = clone(self.options);

    self.setOptions(options);
}

/**
 * Set options.  Does not overwrite previously set
 * options.
 *
 * @example
 *   var parser = new Parser();
 *   parser.setOptions({gfm: true});
 *
 * @this {Parser}
 * @throws {Error} - When an option is invalid.
 * @param {Object?} [options] - Parse settings.
 * @return {Parser} - `self`.
 */
Parser.prototype.setOptions = function (options) {
    var self = this;
    var expressions = self.expressions;
    var rules = self.rules;
    var current = self.options;
    var key;

    if (options === null || options === undefined) {
        options = {};
    } else if (typeof options === 'object') {
        options = clone(options);
    } else {
        raise(options, 'options');
    }

    self.options = options;

    for (key in defaultOptions) {
        validate.boolean(options, key, current[key]);

        if (options[key]) {
            copy(rules, expressions[key]);
        }
    }

    if (options.gfm && options.breaks) {
        copy(rules, expressions.breaksGFM);
    }

    if (options.gfm && options.commonmark) {
        copy(rules, expressions.commonmarkGFM);
    }

    if (options.commonmark) {
        self.enterBlockquote = noopToggler();
    }

    return self;
};

/*
 * Expose `defaults`.
 */

Parser.prototype.options = defaultOptions;

/*
 * Expose `expressions`.
 */

Parser.prototype.expressions = defaultExpressions;

/**
 * Parse `value` into an AST.
 *
 * @example
 *   var parser = new Parser();
 *   parser.parse(new File('_Foo_.'));
 *
 * @this {Parser}
 * @param {Object} file
 * @return {Object} - `root` node.
 */
Parser.prototype.parse = function (file) {
    var self = this;
    var value = clean(String(file));
    var token;

    self.file = file;

    /*
     * Add an `offset` matrix, used to keep track of
     * syntax and white space indentation per line.
     */

    self.offset = {};

    token = self.renderBlock(ROOT, value);

    token.position = {
        'start': {
            'line': 1,
            'column': 1
        }
    };

    token.position.end = self.eof || token.position.start;

    return token;
};

/*
 * Enter and exit helpers.
 */

Parser.prototype.enterLink = stateToggler('inLink', false);
Parser.prototype.exitTop = stateToggler('atTop', true);
Parser.prototype.exitStart = stateToggler('atStart', true);
Parser.prototype.enterBlockquote = stateToggler('inBlockquote', false);

/*
 * Expose helpers
 */

Parser.prototype.renderRaw = renderRaw;
Parser.prototype.renderVoid = renderVoid;
Parser.prototype.renderParent = renderParent;
Parser.prototype.renderInline = renderInline;
Parser.prototype.renderBlock = renderBlock;

Parser.prototype.renderLink = renderLink;
Parser.prototype.renderCodeBlock = renderCodeBlock;
Parser.prototype.renderBlockquote = renderBlockquote;
Parser.prototype.renderList = renderList;
Parser.prototype.renderListItem = renderListItem;
Parser.prototype.renderFootnoteDefinition = renderFootnoteDefinition;
Parser.prototype.renderHeading = renderHeading;
Parser.prototype.renderFootnote = renderFootnote;

/**
 * Construct a tokenizer.  This creates both
 * `tokenizeInline` and `tokenizeBlock`.
 *
 * @example
 *   Parser.prototype.tokenizeInline = tokenizeFactory('inline');
 *
 * @param {string} type - Name of parser, used to find
 *   its expressions (`%sMethods`) and tokenizers
 *   (`%Tokenizers`).
 * @return {function(string, Object?): Array.<Object>}
 */
function tokenizeFactory(type) {
    /**
     * Tokenizer for a bound `type`
     *
     * @example
     *   parser = new Parser();
     *   parser.tokenizeInline('_foo_');
     *
     * @param {string} value - Content.
     * @param {Object?} [location] - Offset at which `value`
     *   starts.
     * @return {Array.<Object>} - Nodes.
     */
    function tokenize(value, location) {
        var self = this;
        var offset = self.offset;
        var tokens = [];
        var rules = self.rules;
        var methods = self[type + 'Methods'];
        var tokenizers = self[type + 'Tokenizers'];
        var line = location ? location.line : 1;
        var column = location ? location.column : 1;
        var add;
        var eat;
        var index;
        var length;
        var method;
        var name;
        var match;
        var matched;
        var valueLength;

        /*
         * Trim white space only lines.
         */

        if (!value) {
            return tokens;
        }

        /**
         * Update line and column based on `value`.
         *
         * @example
         *   updatePosition('foo');
         *
         * @param {string} subvalue
         */
        function updatePosition(subvalue) {
            var lines = subvalue.match(/\n/g);
            var lastIndex = subvalue.lastIndexOf(NEW_LINE);

            if (lines) {
                line += lines.length;
            }

            if (lastIndex === -1) {
                column = column + subvalue.length;
            } else {
                column = subvalue.length - lastIndex;
            }

            if (line in offset) {
                if (lines) {
                    column += offset[line];
                } else if (column <= offset[line]) {
                    column = offset[line] + 1;
                }
            }
        }

        /**
         * Get the current position.
         *
         * @example
         *   position = now(); // {line: 1, column: 1}
         *
         * @return {Object}
         */
        function now() {
            return {
                'line': line,
                'column': column
            };
        }

        /**
         * Store position information for a node.
         *
         * @example
         *   start = now();
         *   updatePosition('foo');
         *   location = new Position(start);
         *   // {start: {line: 1, column: 1}, end: {line: 1, column: 3}}
         *
         * @param {Object} start
         */
        function Position(start) {
            this.start = start;
            this.end = now();
        }

        /**
         * Mark position and patch `node.position`.
         *
         * @example
         *   var update = position();
         *   updatePosition('foo');
         *   update({});
         *   // {
         *   //   position: {
         *   //     start: {line: 1, column: 1}
         *   //     end: {line: 1, column: 3}
         *   //   }
         *   // }
         *
         * @returns {function(Node): Node}
         */
        function position() {
            var start = now();

            /**
             * Add the position to a node.
             *
             * @example
             *   update({type: 'text', value: 'foo'});
             *
             * @param {Node} node - Node to attach position
             *   on.
             * @return {Node} - `node`.
             */
            function update(node) {
                start = node.position ? node.position.start : start;

                node.position = new Position(start);

                return node;
            }

            return update;
        }

        /**
         * Add `token` to `parent`s children or to `tokens`.
         * Performs merges where possible.
         *
         * @example
         *   add({});
         *
         *   add({}, {children: []});
         *
         * @param {Object} token - Node to add.
         * @param {Object} [parent] - Parent to insert into.
         * @return {Object} - Added or merged into token.
         */
        add = function (token, parent) {
            var prev;
            var children;

            if (!parent) {
                children = tokens;
            } else {
                children = parent.children;
            }

            prev = children[children.length - 1];

            if (type === INLINE && token.type === TEXT) {
                token.value = decode(token.value, eat);
            }

            if (prev && token.type === prev.type && token.type in MERGEABLE_NODES) {
                token = MERGEABLE_NODES[token.type].call(self, prev, token);
            }

            if (token !== prev) {
                children.push(token);
            }

            if (self.atStart && tokens.length) {
                self.exitStart();
            }

            return token;
        };

        /**
         * Remove `subvalue` from `value`.
         * Expects `subvalue` to be at the start from
         * `value`, and applies no validation.
         *
         * @example
         *   eat('foo')({type: 'text', value: 'foo'});
         *
         * @param {string} subvalue - Removed from `value`,
         *   and passed to `updatePosition`.
         * @return {Function} - Wrapper around `add`, which
         *   also adds `position` to node.
         */
        eat = function (subvalue) {
            var pos = position();

            /* istanbul ignore if */
            if (value.substring(0, subvalue.length) !== subvalue) {
                eat.file.fail('Incorrectly eaten value: please report this ' + 'warning on http://git.io/vUYWz', now());
            }

            value = value.substring(subvalue.length);

            updatePosition(subvalue);

            /**
             * Add the given arguments, add `position` to
             * the returned node, and return the node.
             *
             * @return {Node}
             */
            function apply() {
                return pos(add.apply(null, arguments));
            }

            return apply;
        };

        /*
         * Expose `now` on `eat`.
         */

        eat.now = now;

        /*
         * Expose `file` on `eat`.
         */

        eat.file = self.file;

        /*
         * Sync initial offset.
         */

        updatePosition(EMPTY);

        /*
         * Iterate over `value`, and iterate over all
         * block-expressions.  When one matches, invoke
         * its companion function.  If no expression
         * matches, something failed (should not happen)
         * and an exception is thrown.
         */

        while (value) {
            index = -1;
            length = methods.length;
            matched = false;

            while (++index < length) {
                name = methods[index];

                method = tokenizers[name];

                match = rules[name] && method && (!method.onlyAtStart || self.atStart) && (!method.onlyAtTop || self.atTop) && (!method.notInBlockquote || !self.inBlockquote) && (!method.notInLink || !self.inLink) && rules[name].exec(value);

                if (match) {
                    valueLength = value.length;

                    method.apply(self, [eat].concat(match));

                    matched = valueLength !== value.length;

                    if (matched) {
                        break;
                    }
                }
            }

            /* istanbul ignore if */
            if (!matched) {
                self.file.fail('Infinite loop', eat.now());

                /*
                 * Errors are not thrown on `File#fail`
                 * when `quiet: true`.
                 */

                break;
            }
        }

        self.eof = now();

        return tokens;
    }

    return tokenize;
}

/*
 * Expose tokenizers for block-level nodes.
 */

Parser.prototype.blockTokenizers = {
    'yamlFrontMatter': tokenizeYAMLFrontMatter,
    'newline': tokenizeNewline,
    'code': tokenizeCode,
    'fences': tokenizeFences,
    'heading': tokenizeHeading,
    'lineHeading': tokenizeLineHeading,
    'horizontalRule': tokenizeHorizontalRule,
    'blockquote': tokenizeBlockquote,
    'list': tokenizeList,
    'html': tokenizeHtml,
    'definition': tokenizeDefinition,
    'footnoteDefinition': tokenizeFootnoteDefinition,
    'looseTable': tokenizeTable,
    'table': tokenizeTable,
    'paragraph': tokenizeParagraph
};

/*
 * Expose order in which to parse block-level nodes.
 */

Parser.prototype.blockMethods = ['yamlFrontMatter', 'newline', 'code', 'fences', 'blockquote', 'heading', 'horizontalRule', 'list', 'lineHeading', 'html', 'definition', 'footnoteDefinition', 'looseTable', 'table', 'paragraph', 'blockText'];

/**
 * Block tokenizer.
 *
 * @example
 *   var parser = new Parser();
 *   parser.tokenizeBlock('> foo.');
 *
 * @param {string} value - Content.
 * @return {Array.<Object>} - Nodes.
 */

Parser.prototype.tokenizeBlock = tokenizeFactory(BLOCK);

/*
 * Expose tokenizers for inline-level nodes.
 */

Parser.prototype.inlineTokenizers = {
    'escape': tokenizeEscape,
    'autoLink': tokenizeAutoLink,
    'url': tokenizeURL,
    'tag': tokenizeTag,
    'link': tokenizeLink,
    'reference': tokenizeReference,
    'shortcutReference': tokenizeReference,
    'strong': tokenizeStrong,
    'emphasis': tokenizeEmphasis,
    'deletion': tokenizeDeletion,
    'inlineCode': tokenizeInlineCode,
    'break': tokenizeBreak,
    'inlineText': tokenizeText
};

/*
 * Expose order in which to parse inline-level nodes.
 */

Parser.prototype.inlineMethods = ['escape', 'autoLink', 'url', 'tag', 'link', 'reference', 'shortcutReference', 'strong', 'emphasis', 'deletion', 'inlineCode', 'break', 'inlineText'];

/**
 * Inline tokenizer.
 *
 * @example
 *   var parser = new Parser();
 *   parser.tokenizeInline('_foo_');
 *
 * @param {string} value - Content.
 * @return {Array.<Object>} - Nodes.
 */

Parser.prototype.tokenizeInline = tokenizeFactory(INLINE);

/**
 * Transform a markdown document into an AST.
 *
 * @example
 *   parse(new File('> foo.'), {gfm: true});
 *
 * @this {Object?} - When this function is places on an
 *   object which also houses a `Parser` property, that
 *   class is used.
 * @param {File} file - Virtual file.
 * @param {Object?} [options] - Settings for the parser.
 * @return {Object} - Abstract syntax tree.
 */
function parse(file, options) {
    var CustomParser = this.Parser || Parser;

    return new CustomParser(options).parse(file);
}

/*
 * Expose `Parser` on `parse`.
 */

parse.Parser = Parser;

/*
 * Expose `parse` on `module.exports`.
 */

module.exports = parse;
}, {"he":14,"repeat-string":15,"./utilities.js":11,"./expressions.js":16,"./defaults.js":17}],
14: [function(require, module, exports) {
/*! http://mths.be/he v0.5.0 by @mathias | MIT license */
;(function(root) {

	// Detect free variables `exports`.
	var freeExports = typeof exports == 'object' && exports;

	// Detect free variable `module`.
	var freeModule = typeof module == 'object' && module &&
		module.exports == freeExports && module;

	// Detect free variable `global`, from Node.js or Browserified code,
	// and use it as `root`.
	var freeGlobal = typeof global == 'object' && global;
	if (freeGlobal.global === freeGlobal || freeGlobal.window === freeGlobal) {
		root = freeGlobal;
	}

	/*--------------------------------------------------------------------------*/

	// All astral symbols.
	var regexAstralSymbols = /[\uD800-\uDBFF][\uDC00-\uDFFF]/g;
	// All ASCII symbols (not just printable ASCII) except those listed in the
	// first column of the overrides table.
	// http://whatwg.org/html/tokenization.html#table-charref-overrides
	var regexAsciiWhitelist = /[\x01-\x7F]/g;
	// All BMP symbols that are not ASCII newlines, printable ASCII symbols, or
	// code points listed in the first column of the overrides table on
	// http://whatwg.org/html/tokenization.html#table-charref-overrides.
	var regexBmpWhitelist = /[\x01-\t\x0B\f\x0E-\x1F\x7F\x81\x8D\x8F\x90\x9D\xA0-\uFFFF]/g;

	var regexEncodeNonAscii = /<\u20D2|=\u20E5|>\u20D2|\u205F\u200A|\u219D\u0338|\u2202\u0338|\u2220\u20D2|\u2229\uFE00|\u222A\uFE00|\u223C\u20D2|\u223D\u0331|\u223E\u0333|\u2242\u0338|\u224B\u0338|\u224D\u20D2|\u224E\u0338|\u224F\u0338|\u2250\u0338|\u2261\u20E5|\u2264\u20D2|\u2265\u20D2|\u2266\u0338|\u2267\u0338|\u2268\uFE00|\u2269\uFE00|\u226A\u0338|\u226A\u20D2|\u226B\u0338|\u226B\u20D2|\u227F\u0338|\u2282\u20D2|\u2283\u20D2|\u228A\uFE00|\u228B\uFE00|\u228F\u0338|\u2290\u0338|\u2293\uFE00|\u2294\uFE00|\u22B4\u20D2|\u22B5\u20D2|\u22D8\u0338|\u22D9\u0338|\u22DA\uFE00|\u22DB\uFE00|\u22F5\u0338|\u22F9\u0338|\u2933\u0338|\u29CF\u0338|\u29D0\u0338|\u2A6D\u0338|\u2A70\u0338|\u2A7D\u0338|\u2A7E\u0338|\u2AA1\u0338|\u2AA2\u0338|\u2AAC\uFE00|\u2AAD\uFE00|\u2AAF\u0338|\u2AB0\u0338|\u2AC5\u0338|\u2AC6\u0338|\u2ACB\uFE00|\u2ACC\uFE00|\u2AFD\u20E5|[\xA0-\u0113\u0116-\u0122\u0124-\u012B\u012E-\u014D\u0150-\u017E\u0192\u01B5\u01F5\u0237\u02C6\u02C7\u02D8-\u02DD\u0311\u0391-\u03A1\u03A3-\u03A9\u03B1-\u03C9\u03D1\u03D2\u03D5\u03D6\u03DC\u03DD\u03F0\u03F1\u03F5\u03F6\u0401-\u040C\u040E-\u044F\u0451-\u045C\u045E\u045F\u2002-\u2005\u2007-\u2010\u2013-\u2016\u2018-\u201A\u201C-\u201E\u2020-\u2022\u2025\u2026\u2030-\u2035\u2039\u203A\u203E\u2041\u2043\u2044\u204F\u2057\u205F-\u2063\u20AC\u20DB\u20DC\u2102\u2105\u210A-\u2113\u2115-\u211E\u2122\u2124\u2127-\u2129\u212C\u212D\u212F-\u2131\u2133-\u2138\u2145-\u2148\u2153-\u215E\u2190-\u219B\u219D-\u21A7\u21A9-\u21AE\u21B0-\u21B3\u21B5-\u21B7\u21BA-\u21DB\u21DD\u21E4\u21E5\u21F5\u21FD-\u2205\u2207-\u2209\u220B\u220C\u220F-\u2214\u2216-\u2218\u221A\u221D-\u2238\u223A-\u2257\u2259\u225A\u225C\u225F-\u2262\u2264-\u228B\u228D-\u229B\u229D-\u22A5\u22A7-\u22B0\u22B2-\u22BB\u22BD-\u22DB\u22DE-\u22E3\u22E6-\u22F7\u22F9-\u22FE\u2305\u2306\u2308-\u2310\u2312\u2313\u2315\u2316\u231C-\u231F\u2322\u2323\u232D\u232E\u2336\u233D\u233F\u237C\u23B0\u23B1\u23B4-\u23B6\u23DC-\u23DF\u23E2\u23E7\u2423\u24C8\u2500\u2502\u250C\u2510\u2514\u2518\u251C\u2524\u252C\u2534\u253C\u2550-\u256C\u2580\u2584\u2588\u2591-\u2593\u25A1\u25AA\u25AB\u25AD\u25AE\u25B1\u25B3-\u25B5\u25B8\u25B9\u25BD-\u25BF\u25C2\u25C3\u25CA\u25CB\u25EC\u25EF\u25F8-\u25FC\u2605\u2606\u260E\u2640\u2642\u2660\u2663\u2665\u2666\u266A\u266D-\u266F\u2713\u2717\u2720\u2736\u2758\u2772\u2773\u27C8\u27C9\u27E6-\u27ED\u27F5-\u27FA\u27FC\u27FF\u2902-\u2905\u290C-\u2913\u2916\u2919-\u2920\u2923-\u292A\u2933\u2935-\u2939\u293C\u293D\u2945\u2948-\u294B\u294E-\u2976\u2978\u2979\u297B-\u297F\u2985\u2986\u298B-\u2996\u299A\u299C\u299D\u29A4-\u29B7\u29B9\u29BB\u29BC\u29BE-\u29C5\u29C9\u29CD-\u29D0\u29DC-\u29DE\u29E3-\u29E5\u29EB\u29F4\u29F6\u2A00-\u2A02\u2A04\u2A06\u2A0C\u2A0D\u2A10-\u2A17\u2A22-\u2A27\u2A29\u2A2A\u2A2D-\u2A31\u2A33-\u2A3C\u2A3F\u2A40\u2A42-\u2A4D\u2A50\u2A53-\u2A58\u2A5A-\u2A5D\u2A5F\u2A66\u2A6A\u2A6D-\u2A75\u2A77-\u2A9A\u2A9D-\u2AA2\u2AA4-\u2AB0\u2AB3-\u2AC8\u2ACB\u2ACC\u2ACF-\u2ADB\u2AE4\u2AE6-\u2AE9\u2AEB-\u2AF3\u2AFD\uFB00-\uFB04]|\uD835[\uDC9C\uDC9E\uDC9F\uDCA2\uDCA5\uDCA6\uDCA9-\uDCAC\uDCAE-\uDCB9\uDCBB\uDCBD-\uDCC3\uDCC5-\uDCCF\uDD04\uDD05\uDD07-\uDD0A\uDD0D-\uDD14\uDD16-\uDD1C\uDD1E-\uDD39\uDD3B-\uDD3E\uDD40-\uDD44\uDD46\uDD4A-\uDD50\uDD52-\uDD6B]/g;
	var encodeMap = {'\xC1':'Aacute','\xE1':'aacute','\u0102':'Abreve','\u0103':'abreve','\u223E':'ac','\u223F':'acd','\u223E\u0333':'acE','\xC2':'Acirc','\xE2':'acirc','\xB4':'acute','\u0410':'Acy','\u0430':'acy','\xC6':'AElig','\xE6':'aelig','\u2061':'af','\uD835\uDD04':'Afr','\uD835\uDD1E':'afr','\xC0':'Agrave','\xE0':'agrave','\u2135':'aleph','\u0391':'Alpha','\u03B1':'alpha','\u0100':'Amacr','\u0101':'amacr','\u2A3F':'amalg','&':'amp','\u2A55':'andand','\u2A53':'And','\u2227':'and','\u2A5C':'andd','\u2A58':'andslope','\u2A5A':'andv','\u2220':'ang','\u29A4':'ange','\u29A8':'angmsdaa','\u29A9':'angmsdab','\u29AA':'angmsdac','\u29AB':'angmsdad','\u29AC':'angmsdae','\u29AD':'angmsdaf','\u29AE':'angmsdag','\u29AF':'angmsdah','\u2221':'angmsd','\u221F':'angrt','\u22BE':'angrtvb','\u299D':'angrtvbd','\u2222':'angsph','\xC5':'angst','\u237C':'angzarr','\u0104':'Aogon','\u0105':'aogon','\uD835\uDD38':'Aopf','\uD835\uDD52':'aopf','\u2A6F':'apacir','\u2248':'ap','\u2A70':'apE','\u224A':'ape','\u224B':'apid','\'':'apos','\xE5':'aring','\uD835\uDC9C':'Ascr','\uD835\uDCB6':'ascr','\u2254':'colone','*':'ast','\u224D':'CupCap','\xC3':'Atilde','\xE3':'atilde','\xC4':'Auml','\xE4':'auml','\u2233':'awconint','\u2A11':'awint','\u224C':'bcong','\u03F6':'bepsi','\u2035':'bprime','\u223D':'bsim','\u22CD':'bsime','\u2216':'setmn','\u2AE7':'Barv','\u22BD':'barvee','\u2305':'barwed','\u2306':'Barwed','\u23B5':'bbrk','\u23B6':'bbrktbrk','\u0411':'Bcy','\u0431':'bcy','\u201E':'bdquo','\u2235':'becaus','\u29B0':'bemptyv','\u212C':'Bscr','\u0392':'Beta','\u03B2':'beta','\u2136':'beth','\u226C':'twixt','\uD835\uDD05':'Bfr','\uD835\uDD1F':'bfr','\u22C2':'xcap','\u25EF':'xcirc','\u22C3':'xcup','\u2A00':'xodot','\u2A01':'xoplus','\u2A02':'xotime','\u2A06':'xsqcup','\u2605':'starf','\u25BD':'xdtri','\u25B3':'xutri','\u2A04':'xuplus','\u22C1':'Vee','\u22C0':'Wedge','\u290D':'rbarr','\u29EB':'lozf','\u25AA':'squf','\u25B4':'utrif','\u25BE':'dtrif','\u25C2':'ltrif','\u25B8':'rtrif','\u2423':'blank','\u2592':'blk12','\u2591':'blk14','\u2593':'blk34','\u2588':'block','=\u20E5':'bne','\u2261\u20E5':'bnequiv','\u2AED':'bNot','\u2310':'bnot','\uD835\uDD39':'Bopf','\uD835\uDD53':'bopf','\u22A5':'bot','\u22C8':'bowtie','\u29C9':'boxbox','\u2510':'boxdl','\u2555':'boxdL','\u2556':'boxDl','\u2557':'boxDL','\u250C':'boxdr','\u2552':'boxdR','\u2553':'boxDr','\u2554':'boxDR','\u2500':'boxh','\u2550':'boxH','\u252C':'boxhd','\u2564':'boxHd','\u2565':'boxhD','\u2566':'boxHD','\u2534':'boxhu','\u2567':'boxHu','\u2568':'boxhU','\u2569':'boxHU','\u229F':'minusb','\u229E':'plusb','\u22A0':'timesb','\u2518':'boxul','\u255B':'boxuL','\u255C':'boxUl','\u255D':'boxUL','\u2514':'boxur','\u2558':'boxuR','\u2559':'boxUr','\u255A':'boxUR','\u2502':'boxv','\u2551':'boxV','\u253C':'boxvh','\u256A':'boxvH','\u256B':'boxVh','\u256C':'boxVH','\u2524':'boxvl','\u2561':'boxvL','\u2562':'boxVl','\u2563':'boxVL','\u251C':'boxvr','\u255E':'boxvR','\u255F':'boxVr','\u2560':'boxVR','\u02D8':'breve','\xA6':'brvbar','\uD835\uDCB7':'bscr','\u204F':'bsemi','\u29C5':'bsolb','\\':'bsol','\u27C8':'bsolhsub','\u2022':'bull','\u224E':'bump','\u2AAE':'bumpE','\u224F':'bumpe','\u0106':'Cacute','\u0107':'cacute','\u2A44':'capand','\u2A49':'capbrcup','\u2A4B':'capcap','\u2229':'cap','\u22D2':'Cap','\u2A47':'capcup','\u2A40':'capdot','\u2145':'DD','\u2229\uFE00':'caps','\u2041':'caret','\u02C7':'caron','\u212D':'Cfr','\u2A4D':'ccaps','\u010C':'Ccaron','\u010D':'ccaron','\xC7':'Ccedil','\xE7':'ccedil','\u0108':'Ccirc','\u0109':'ccirc','\u2230':'Cconint','\u2A4C':'ccups','\u2A50':'ccupssm','\u010A':'Cdot','\u010B':'cdot','\xB8':'cedil','\u29B2':'cemptyv','\xA2':'cent','\xB7':'middot','\uD835\uDD20':'cfr','\u0427':'CHcy','\u0447':'chcy','\u2713':'check','\u03A7':'Chi','\u03C7':'chi','\u02C6':'circ','\u2257':'cire','\u21BA':'olarr','\u21BB':'orarr','\u229B':'oast','\u229A':'ocir','\u229D':'odash','\u2299':'odot','\xAE':'reg','\u24C8':'oS','\u2296':'ominus','\u2295':'oplus','\u2297':'otimes','\u25CB':'cir','\u29C3':'cirE','\u2A10':'cirfnint','\u2AEF':'cirmid','\u29C2':'cirscir','\u2232':'cwconint','\u201D':'rdquo','\u2019':'rsquo','\u2663':'clubs',':':'colon','\u2237':'Colon','\u2A74':'Colone',',':'comma','@':'commat','\u2201':'comp','\u2218':'compfn','\u2102':'Copf','\u2245':'cong','\u2A6D':'congdot','\u2261':'equiv','\u222E':'oint','\u222F':'Conint','\uD835\uDD54':'copf','\u2210':'coprod','\xA9':'copy','\u2117':'copysr','\u21B5':'crarr','\u2717':'cross','\u2A2F':'Cross','\uD835\uDC9E':'Cscr','\uD835\uDCB8':'cscr','\u2ACF':'csub','\u2AD1':'csube','\u2AD0':'csup','\u2AD2':'csupe','\u22EF':'ctdot','\u2938':'cudarrl','\u2935':'cudarrr','\u22DE':'cuepr','\u22DF':'cuesc','\u21B6':'cularr','\u293D':'cularrp','\u2A48':'cupbrcap','\u2A46':'cupcap','\u222A':'cup','\u22D3':'Cup','\u2A4A':'cupcup','\u228D':'cupdot','\u2A45':'cupor','\u222A\uFE00':'cups','\u21B7':'curarr','\u293C':'curarrm','\u22CE':'cuvee','\u22CF':'cuwed','\xA4':'curren','\u2231':'cwint','\u232D':'cylcty','\u2020':'dagger','\u2021':'Dagger','\u2138':'daleth','\u2193':'darr','\u21A1':'Darr','\u21D3':'dArr','\u2010':'dash','\u2AE4':'Dashv','\u22A3':'dashv','\u290F':'rBarr','\u02DD':'dblac','\u010E':'Dcaron','\u010F':'dcaron','\u0414':'Dcy','\u0434':'dcy','\u21CA':'ddarr','\u2146':'dd','\u2911':'DDotrahd','\u2A77':'eDDot','\xB0':'deg','\u2207':'Del','\u0394':'Delta','\u03B4':'delta','\u29B1':'demptyv','\u297F':'dfisht','\uD835\uDD07':'Dfr','\uD835\uDD21':'dfr','\u2965':'dHar','\u21C3':'dharl','\u21C2':'dharr','\u02D9':'dot','`':'grave','\u02DC':'tilde','\u22C4':'diam','\u2666':'diams','\xA8':'die','\u03DD':'gammad','\u22F2':'disin','\xF7':'div','\u22C7':'divonx','\u0402':'DJcy','\u0452':'djcy','\u231E':'dlcorn','\u230D':'dlcrop','$':'dollar','\uD835\uDD3B':'Dopf','\uD835\uDD55':'dopf','\u20DC':'DotDot','\u2250':'doteq','\u2251':'eDot','\u2238':'minusd','\u2214':'plusdo','\u22A1':'sdotb','\u21D0':'lArr','\u21D4':'iff','\u27F8':'xlArr','\u27FA':'xhArr','\u27F9':'xrArr','\u21D2':'rArr','\u22A8':'vDash','\u21D1':'uArr','\u21D5':'vArr','\u2225':'par','\u2913':'DownArrowBar','\u21F5':'duarr','\u0311':'DownBreve','\u2950':'DownLeftRightVector','\u295E':'DownLeftTeeVector','\u2956':'DownLeftVectorBar','\u21BD':'lhard','\u295F':'DownRightTeeVector','\u2957':'DownRightVectorBar','\u21C1':'rhard','\u21A7':'mapstodown','\u22A4':'top','\u2910':'RBarr','\u231F':'drcorn','\u230C':'drcrop','\uD835\uDC9F':'Dscr','\uD835\uDCB9':'dscr','\u0405':'DScy','\u0455':'dscy','\u29F6':'dsol','\u0110':'Dstrok','\u0111':'dstrok','\u22F1':'dtdot','\u25BF':'dtri','\u296F':'duhar','\u29A6':'dwangle','\u040F':'DZcy','\u045F':'dzcy','\u27FF':'dzigrarr','\xC9':'Eacute','\xE9':'eacute','\u2A6E':'easter','\u011A':'Ecaron','\u011B':'ecaron','\xCA':'Ecirc','\xEA':'ecirc','\u2256':'ecir','\u2255':'ecolon','\u042D':'Ecy','\u044D':'ecy','\u0116':'Edot','\u0117':'edot','\u2147':'ee','\u2252':'efDot','\uD835\uDD08':'Efr','\uD835\uDD22':'efr','\u2A9A':'eg','\xC8':'Egrave','\xE8':'egrave','\u2A96':'egs','\u2A98':'egsdot','\u2A99':'el','\u2208':'in','\u23E7':'elinters','\u2113':'ell','\u2A95':'els','\u2A97':'elsdot','\u0112':'Emacr','\u0113':'emacr','\u2205':'empty','\u25FB':'EmptySmallSquare','\u25AB':'EmptyVerySmallSquare','\u2004':'emsp13','\u2005':'emsp14','\u2003':'emsp','\u014A':'ENG','\u014B':'eng','\u2002':'ensp','\u0118':'Eogon','\u0119':'eogon','\uD835\uDD3C':'Eopf','\uD835\uDD56':'eopf','\u22D5':'epar','\u29E3':'eparsl','\u2A71':'eplus','\u03B5':'epsi','\u0395':'Epsilon','\u03F5':'epsiv','\u2242':'esim','\u2A75':'Equal','=':'equals','\u225F':'equest','\u21CC':'rlhar','\u2A78':'equivDD','\u29E5':'eqvparsl','\u2971':'erarr','\u2253':'erDot','\u212F':'escr','\u2130':'Escr','\u2A73':'Esim','\u0397':'Eta','\u03B7':'eta','\xD0':'ETH','\xF0':'eth','\xCB':'Euml','\xEB':'euml','\u20AC':'euro','!':'excl','\u2203':'exist','\u0424':'Fcy','\u0444':'fcy','\u2640':'female','\uFB03':'ffilig','\uFB00':'fflig','\uFB04':'ffllig','\uD835\uDD09':'Ffr','\uD835\uDD23':'ffr','\uFB01':'filig','\u25FC':'FilledSmallSquare','fj':'fjlig','\u266D':'flat','\uFB02':'fllig','\u25B1':'fltns','\u0192':'fnof','\uD835\uDD3D':'Fopf','\uD835\uDD57':'fopf','\u2200':'forall','\u22D4':'fork','\u2AD9':'forkv','\u2131':'Fscr','\u2A0D':'fpartint','\xBD':'half','\u2153':'frac13','\xBC':'frac14','\u2155':'frac15','\u2159':'frac16','\u215B':'frac18','\u2154':'frac23','\u2156':'frac25','\xBE':'frac34','\u2157':'frac35','\u215C':'frac38','\u2158':'frac45','\u215A':'frac56','\u215D':'frac58','\u215E':'frac78','\u2044':'frasl','\u2322':'frown','\uD835\uDCBB':'fscr','\u01F5':'gacute','\u0393':'Gamma','\u03B3':'gamma','\u03DC':'Gammad','\u2A86':'gap','\u011E':'Gbreve','\u011F':'gbreve','\u0122':'Gcedil','\u011C':'Gcirc','\u011D':'gcirc','\u0413':'Gcy','\u0433':'gcy','\u0120':'Gdot','\u0121':'gdot','\u2265':'ge','\u2267':'gE','\u2A8C':'gEl','\u22DB':'gel','\u2A7E':'ges','\u2AA9':'gescc','\u2A80':'gesdot','\u2A82':'gesdoto','\u2A84':'gesdotol','\u22DB\uFE00':'gesl','\u2A94':'gesles','\uD835\uDD0A':'Gfr','\uD835\uDD24':'gfr','\u226B':'gg','\u22D9':'Gg','\u2137':'gimel','\u0403':'GJcy','\u0453':'gjcy','\u2AA5':'gla','\u2277':'gl','\u2A92':'glE','\u2AA4':'glj','\u2A8A':'gnap','\u2A88':'gne','\u2269':'gnE','\u22E7':'gnsim','\uD835\uDD3E':'Gopf','\uD835\uDD58':'gopf','\u2AA2':'GreaterGreater','\u2273':'gsim','\uD835\uDCA2':'Gscr','\u210A':'gscr','\u2A8E':'gsime','\u2A90':'gsiml','\u2AA7':'gtcc','\u2A7A':'gtcir','>':'gt','\u22D7':'gtdot','\u2995':'gtlPar','\u2A7C':'gtquest','\u2978':'gtrarr','\u2269\uFE00':'gvnE','\u200A':'hairsp','\u210B':'Hscr','\u042A':'HARDcy','\u044A':'hardcy','\u2948':'harrcir','\u2194':'harr','\u21AD':'harrw','^':'Hat','\u210F':'hbar','\u0124':'Hcirc','\u0125':'hcirc','\u2665':'hearts','\u2026':'mldr','\u22B9':'hercon','\uD835\uDD25':'hfr','\u210C':'Hfr','\u2925':'searhk','\u2926':'swarhk','\u21FF':'hoarr','\u223B':'homtht','\u21A9':'larrhk','\u21AA':'rarrhk','\uD835\uDD59':'hopf','\u210D':'Hopf','\u2015':'horbar','\uD835\uDCBD':'hscr','\u0126':'Hstrok','\u0127':'hstrok','\u2043':'hybull','\xCD':'Iacute','\xED':'iacute','\u2063':'ic','\xCE':'Icirc','\xEE':'icirc','\u0418':'Icy','\u0438':'icy','\u0130':'Idot','\u0415':'IEcy','\u0435':'iecy','\xA1':'iexcl','\uD835\uDD26':'ifr','\u2111':'Im','\xCC':'Igrave','\xEC':'igrave','\u2148':'ii','\u2A0C':'qint','\u222D':'tint','\u29DC':'iinfin','\u2129':'iiota','\u0132':'IJlig','\u0133':'ijlig','\u012A':'Imacr','\u012B':'imacr','\u2110':'Iscr','\u0131':'imath','\u22B7':'imof','\u01B5':'imped','\u2105':'incare','\u221E':'infin','\u29DD':'infintie','\u22BA':'intcal','\u222B':'int','\u222C':'Int','\u2124':'Zopf','\u2A17':'intlarhk','\u2A3C':'iprod','\u2062':'it','\u0401':'IOcy','\u0451':'iocy','\u012E':'Iogon','\u012F':'iogon','\uD835\uDD40':'Iopf','\uD835\uDD5A':'iopf','\u0399':'Iota','\u03B9':'iota','\xBF':'iquest','\uD835\uDCBE':'iscr','\u22F5':'isindot','\u22F9':'isinE','\u22F4':'isins','\u22F3':'isinsv','\u0128':'Itilde','\u0129':'itilde','\u0406':'Iukcy','\u0456':'iukcy','\xCF':'Iuml','\xEF':'iuml','\u0134':'Jcirc','\u0135':'jcirc','\u0419':'Jcy','\u0439':'jcy','\uD835\uDD0D':'Jfr','\uD835\uDD27':'jfr','\u0237':'jmath','\uD835\uDD41':'Jopf','\uD835\uDD5B':'jopf','\uD835\uDCA5':'Jscr','\uD835\uDCBF':'jscr','\u0408':'Jsercy','\u0458':'jsercy','\u0404':'Jukcy','\u0454':'jukcy','\u039A':'Kappa','\u03BA':'kappa','\u03F0':'kappav','\u0136':'Kcedil','\u0137':'kcedil','\u041A':'Kcy','\u043A':'kcy','\uD835\uDD0E':'Kfr','\uD835\uDD28':'kfr','\u0138':'kgreen','\u0425':'KHcy','\u0445':'khcy','\u040C':'KJcy','\u045C':'kjcy','\uD835\uDD42':'Kopf','\uD835\uDD5C':'kopf','\uD835\uDCA6':'Kscr','\uD835\uDCC0':'kscr','\u21DA':'lAarr','\u0139':'Lacute','\u013A':'lacute','\u29B4':'laemptyv','\u2112':'Lscr','\u039B':'Lambda','\u03BB':'lambda','\u27E8':'lang','\u27EA':'Lang','\u2991':'langd','\u2A85':'lap','\xAB':'laquo','\u21E4':'larrb','\u291F':'larrbfs','\u2190':'larr','\u219E':'Larr','\u291D':'larrfs','\u21AB':'larrlp','\u2939':'larrpl','\u2973':'larrsim','\u21A2':'larrtl','\u2919':'latail','\u291B':'lAtail','\u2AAB':'lat','\u2AAD':'late','\u2AAD\uFE00':'lates','\u290C':'lbarr','\u290E':'lBarr','\u2772':'lbbrk','{':'lcub','[':'lsqb','\u298B':'lbrke','\u298F':'lbrksld','\u298D':'lbrkslu','\u013D':'Lcaron','\u013E':'lcaron','\u013B':'Lcedil','\u013C':'lcedil','\u2308':'lceil','\u041B':'Lcy','\u043B':'lcy','\u2936':'ldca','\u201C':'ldquo','\u2967':'ldrdhar','\u294B':'ldrushar','\u21B2':'ldsh','\u2264':'le','\u2266':'lE','\u21C6':'lrarr','\u27E6':'lobrk','\u2961':'LeftDownTeeVector','\u2959':'LeftDownVectorBar','\u230A':'lfloor','\u21BC':'lharu','\u21C7':'llarr','\u21CB':'lrhar','\u294E':'LeftRightVector','\u21A4':'mapstoleft','\u295A':'LeftTeeVector','\u22CB':'lthree','\u29CF':'LeftTriangleBar','\u22B2':'vltri','\u22B4':'ltrie','\u2951':'LeftUpDownVector','\u2960':'LeftUpTeeVector','\u2958':'LeftUpVectorBar','\u21BF':'uharl','\u2952':'LeftVectorBar','\u2A8B':'lEg','\u22DA':'leg','\u2A7D':'les','\u2AA8':'lescc','\u2A7F':'lesdot','\u2A81':'lesdoto','\u2A83':'lesdotor','\u22DA\uFE00':'lesg','\u2A93':'lesges','\u22D6':'ltdot','\u2276':'lg','\u2AA1':'LessLess','\u2272':'lsim','\u297C':'lfisht','\uD835\uDD0F':'Lfr','\uD835\uDD29':'lfr','\u2A91':'lgE','\u2962':'lHar','\u296A':'lharul','\u2584':'lhblk','\u0409':'LJcy','\u0459':'ljcy','\u226A':'ll','\u22D8':'Ll','\u296B':'llhard','\u25FA':'lltri','\u013F':'Lmidot','\u0140':'lmidot','\u23B0':'lmoust','\u2A89':'lnap','\u2A87':'lne','\u2268':'lnE','\u22E6':'lnsim','\u27EC':'loang','\u21FD':'loarr','\u27F5':'xlarr','\u27F7':'xharr','\u27FC':'xmap','\u27F6':'xrarr','\u21AC':'rarrlp','\u2985':'lopar','\uD835\uDD43':'Lopf','\uD835\uDD5D':'lopf','\u2A2D':'loplus','\u2A34':'lotimes','\u2217':'lowast','_':'lowbar','\u2199':'swarr','\u2198':'searr','\u25CA':'loz','(':'lpar','\u2993':'lparlt','\u296D':'lrhard','\u200E':'lrm','\u22BF':'lrtri','\u2039':'lsaquo','\uD835\uDCC1':'lscr','\u21B0':'lsh','\u2A8D':'lsime','\u2A8F':'lsimg','\u2018':'lsquo','\u201A':'sbquo','\u0141':'Lstrok','\u0142':'lstrok','\u2AA6':'ltcc','\u2A79':'ltcir','<':'lt','\u22C9':'ltimes','\u2976':'ltlarr','\u2A7B':'ltquest','\u25C3':'ltri','\u2996':'ltrPar','\u294A':'lurdshar','\u2966':'luruhar','\u2268\uFE00':'lvnE','\xAF':'macr','\u2642':'male','\u2720':'malt','\u2905':'Map','\u21A6':'map','\u21A5':'mapstoup','\u25AE':'marker','\u2A29':'mcomma','\u041C':'Mcy','\u043C':'mcy','\u2014':'mdash','\u223A':'mDDot','\u205F':'MediumSpace','\u2133':'Mscr','\uD835\uDD10':'Mfr','\uD835\uDD2A':'mfr','\u2127':'mho','\xB5':'micro','\u2AF0':'midcir','\u2223':'mid','\u2212':'minus','\u2A2A':'minusdu','\u2213':'mp','\u2ADB':'mlcp','\u22A7':'models','\uD835\uDD44':'Mopf','\uD835\uDD5E':'mopf','\uD835\uDCC2':'mscr','\u039C':'Mu','\u03BC':'mu','\u22B8':'mumap','\u0143':'Nacute','\u0144':'nacute','\u2220\u20D2':'nang','\u2249':'nap','\u2A70\u0338':'napE','\u224B\u0338':'napid','\u0149':'napos','\u266E':'natur','\u2115':'Nopf','\xA0':'nbsp','\u224E\u0338':'nbump','\u224F\u0338':'nbumpe','\u2A43':'ncap','\u0147':'Ncaron','\u0148':'ncaron','\u0145':'Ncedil','\u0146':'ncedil','\u2247':'ncong','\u2A6D\u0338':'ncongdot','\u2A42':'ncup','\u041D':'Ncy','\u043D':'ncy','\u2013':'ndash','\u2924':'nearhk','\u2197':'nearr','\u21D7':'neArr','\u2260':'ne','\u2250\u0338':'nedot','\u200B':'ZeroWidthSpace','\u2262':'nequiv','\u2928':'toea','\u2242\u0338':'nesim','\n':'NewLine','\u2204':'nexist','\uD835\uDD11':'Nfr','\uD835\uDD2B':'nfr','\u2267\u0338':'ngE','\u2271':'nge','\u2A7E\u0338':'nges','\u22D9\u0338':'nGg','\u2275':'ngsim','\u226B\u20D2':'nGt','\u226F':'ngt','\u226B\u0338':'nGtv','\u21AE':'nharr','\u21CE':'nhArr','\u2AF2':'nhpar','\u220B':'ni','\u22FC':'nis','\u22FA':'nisd','\u040A':'NJcy','\u045A':'njcy','\u219A':'nlarr','\u21CD':'nlArr','\u2025':'nldr','\u2266\u0338':'nlE','\u2270':'nle','\u2A7D\u0338':'nles','\u226E':'nlt','\u22D8\u0338':'nLl','\u2274':'nlsim','\u226A\u20D2':'nLt','\u22EA':'nltri','\u22EC':'nltrie','\u226A\u0338':'nLtv','\u2224':'nmid','\u2060':'NoBreak','\uD835\uDD5F':'nopf','\u2AEC':'Not','\xAC':'not','\u226D':'NotCupCap','\u2226':'npar','\u2209':'notin','\u2279':'ntgl','\u22F5\u0338':'notindot','\u22F9\u0338':'notinE','\u22F7':'notinvb','\u22F6':'notinvc','\u29CF\u0338':'NotLeftTriangleBar','\u2278':'ntlg','\u2AA2\u0338':'NotNestedGreaterGreater','\u2AA1\u0338':'NotNestedLessLess','\u220C':'notni','\u22FE':'notnivb','\u22FD':'notnivc','\u2280':'npr','\u2AAF\u0338':'npre','\u22E0':'nprcue','\u29D0\u0338':'NotRightTriangleBar','\u22EB':'nrtri','\u22ED':'nrtrie','\u228F\u0338':'NotSquareSubset','\u22E2':'nsqsube','\u2290\u0338':'NotSquareSuperset','\u22E3':'nsqsupe','\u2282\u20D2':'vnsub','\u2288':'nsube','\u2281':'nsc','\u2AB0\u0338':'nsce','\u22E1':'nsccue','\u227F\u0338':'NotSucceedsTilde','\u2283\u20D2':'vnsup','\u2289':'nsupe','\u2241':'nsim','\u2244':'nsime','\u2AFD\u20E5':'nparsl','\u2202\u0338':'npart','\u2A14':'npolint','\u2933\u0338':'nrarrc','\u219B':'nrarr','\u21CF':'nrArr','\u219D\u0338':'nrarrw','\uD835\uDCA9':'Nscr','\uD835\uDCC3':'nscr','\u2284':'nsub','\u2AC5\u0338':'nsubE','\u2285':'nsup','\u2AC6\u0338':'nsupE','\xD1':'Ntilde','\xF1':'ntilde','\u039D':'Nu','\u03BD':'nu','#':'num','\u2116':'numero','\u2007':'numsp','\u224D\u20D2':'nvap','\u22AC':'nvdash','\u22AD':'nvDash','\u22AE':'nVdash','\u22AF':'nVDash','\u2265\u20D2':'nvge','>\u20D2':'nvgt','\u2904':'nvHarr','\u29DE':'nvinfin','\u2902':'nvlArr','\u2264\u20D2':'nvle','<\u20D2':'nvlt','\u22B4\u20D2':'nvltrie','\u2903':'nvrArr','\u22B5\u20D2':'nvrtrie','\u223C\u20D2':'nvsim','\u2923':'nwarhk','\u2196':'nwarr','\u21D6':'nwArr','\u2927':'nwnear','\xD3':'Oacute','\xF3':'oacute','\xD4':'Ocirc','\xF4':'ocirc','\u041E':'Ocy','\u043E':'ocy','\u0150':'Odblac','\u0151':'odblac','\u2A38':'odiv','\u29BC':'odsold','\u0152':'OElig','\u0153':'oelig','\u29BF':'ofcir','\uD835\uDD12':'Ofr','\uD835\uDD2C':'ofr','\u02DB':'ogon','\xD2':'Ograve','\xF2':'ograve','\u29C1':'ogt','\u29B5':'ohbar','\u03A9':'ohm','\u29BE':'olcir','\u29BB':'olcross','\u203E':'oline','\u29C0':'olt','\u014C':'Omacr','\u014D':'omacr','\u03C9':'omega','\u039F':'Omicron','\u03BF':'omicron','\u29B6':'omid','\uD835\uDD46':'Oopf','\uD835\uDD60':'oopf','\u29B7':'opar','\u29B9':'operp','\u2A54':'Or','\u2228':'or','\u2A5D':'ord','\u2134':'oscr','\xAA':'ordf','\xBA':'ordm','\u22B6':'origof','\u2A56':'oror','\u2A57':'orslope','\u2A5B':'orv','\uD835\uDCAA':'Oscr','\xD8':'Oslash','\xF8':'oslash','\u2298':'osol','\xD5':'Otilde','\xF5':'otilde','\u2A36':'otimesas','\u2A37':'Otimes','\xD6':'Ouml','\xF6':'ouml','\u233D':'ovbar','\u23DE':'OverBrace','\u23B4':'tbrk','\u23DC':'OverParenthesis','\xB6':'para','\u2AF3':'parsim','\u2AFD':'parsl','\u2202':'part','\u041F':'Pcy','\u043F':'pcy','%':'percnt','.':'period','\u2030':'permil','\u2031':'pertenk','\uD835\uDD13':'Pfr','\uD835\uDD2D':'pfr','\u03A6':'Phi','\u03C6':'phi','\u03D5':'phiv','\u260E':'phone','\u03A0':'Pi','\u03C0':'pi','\u03D6':'piv','\u210E':'planckh','\u2A23':'plusacir','\u2A22':'pluscir','+':'plus','\u2A25':'plusdu','\u2A72':'pluse','\xB1':'pm','\u2A26':'plussim','\u2A27':'plustwo','\u2A15':'pointint','\uD835\uDD61':'popf','\u2119':'Popf','\xA3':'pound','\u2AB7':'prap','\u2ABB':'Pr','\u227A':'pr','\u227C':'prcue','\u2AAF':'pre','\u227E':'prsim','\u2AB9':'prnap','\u2AB5':'prnE','\u22E8':'prnsim','\u2AB3':'prE','\u2032':'prime','\u2033':'Prime','\u220F':'prod','\u232E':'profalar','\u2312':'profline','\u2313':'profsurf','\u221D':'prop','\u22B0':'prurel','\uD835\uDCAB':'Pscr','\uD835\uDCC5':'pscr','\u03A8':'Psi','\u03C8':'psi','\u2008':'puncsp','\uD835\uDD14':'Qfr','\uD835\uDD2E':'qfr','\uD835\uDD62':'qopf','\u211A':'Qopf','\u2057':'qprime','\uD835\uDCAC':'Qscr','\uD835\uDCC6':'qscr','\u2A16':'quatint','?':'quest','"':'quot','\u21DB':'rAarr','\u223D\u0331':'race','\u0154':'Racute','\u0155':'racute','\u221A':'Sqrt','\u29B3':'raemptyv','\u27E9':'rang','\u27EB':'Rang','\u2992':'rangd','\u29A5':'range','\xBB':'raquo','\u2975':'rarrap','\u21E5':'rarrb','\u2920':'rarrbfs','\u2933':'rarrc','\u2192':'rarr','\u21A0':'Rarr','\u291E':'rarrfs','\u2945':'rarrpl','\u2974':'rarrsim','\u2916':'Rarrtl','\u21A3':'rarrtl','\u219D':'rarrw','\u291A':'ratail','\u291C':'rAtail','\u2236':'ratio','\u2773':'rbbrk','}':'rcub',']':'rsqb','\u298C':'rbrke','\u298E':'rbrksld','\u2990':'rbrkslu','\u0158':'Rcaron','\u0159':'rcaron','\u0156':'Rcedil','\u0157':'rcedil','\u2309':'rceil','\u0420':'Rcy','\u0440':'rcy','\u2937':'rdca','\u2969':'rdldhar','\u21B3':'rdsh','\u211C':'Re','\u211B':'Rscr','\u211D':'Ropf','\u25AD':'rect','\u297D':'rfisht','\u230B':'rfloor','\uD835\uDD2F':'rfr','\u2964':'rHar','\u21C0':'rharu','\u296C':'rharul','\u03A1':'Rho','\u03C1':'rho','\u03F1':'rhov','\u21C4':'rlarr','\u27E7':'robrk','\u295D':'RightDownTeeVector','\u2955':'RightDownVectorBar','\u21C9':'rrarr','\u22A2':'vdash','\u295B':'RightTeeVector','\u22CC':'rthree','\u29D0':'RightTriangleBar','\u22B3':'vrtri','\u22B5':'rtrie','\u294F':'RightUpDownVector','\u295C':'RightUpTeeVector','\u2954':'RightUpVectorBar','\u21BE':'uharr','\u2953':'RightVectorBar','\u02DA':'ring','\u200F':'rlm','\u23B1':'rmoust','\u2AEE':'rnmid','\u27ED':'roang','\u21FE':'roarr','\u2986':'ropar','\uD835\uDD63':'ropf','\u2A2E':'roplus','\u2A35':'rotimes','\u2970':'RoundImplies',')':'rpar','\u2994':'rpargt','\u2A12':'rppolint','\u203A':'rsaquo','\uD835\uDCC7':'rscr','\u21B1':'rsh','\u22CA':'rtimes','\u25B9':'rtri','\u29CE':'rtriltri','\u29F4':'RuleDelayed','\u2968':'ruluhar','\u211E':'rx','\u015A':'Sacute','\u015B':'sacute','\u2AB8':'scap','\u0160':'Scaron','\u0161':'scaron','\u2ABC':'Sc','\u227B':'sc','\u227D':'sccue','\u2AB0':'sce','\u2AB4':'scE','\u015E':'Scedil','\u015F':'scedil','\u015C':'Scirc','\u015D':'scirc','\u2ABA':'scnap','\u2AB6':'scnE','\u22E9':'scnsim','\u2A13':'scpolint','\u227F':'scsim','\u0421':'Scy','\u0441':'scy','\u22C5':'sdot','\u2A66':'sdote','\u21D8':'seArr','\xA7':'sect',';':'semi','\u2929':'tosa','\u2736':'sext','\uD835\uDD16':'Sfr','\uD835\uDD30':'sfr','\u266F':'sharp','\u0429':'SHCHcy','\u0449':'shchcy','\u0428':'SHcy','\u0448':'shcy','\u2191':'uarr','\xAD':'shy','\u03A3':'Sigma','\u03C3':'sigma','\u03C2':'sigmaf','\u223C':'sim','\u2A6A':'simdot','\u2243':'sime','\u2A9E':'simg','\u2AA0':'simgE','\u2A9D':'siml','\u2A9F':'simlE','\u2246':'simne','\u2A24':'simplus','\u2972':'simrarr','\u2A33':'smashp','\u29E4':'smeparsl','\u2323':'smile','\u2AAA':'smt','\u2AAC':'smte','\u2AAC\uFE00':'smtes','\u042C':'SOFTcy','\u044C':'softcy','\u233F':'solbar','\u29C4':'solb','/':'sol','\uD835\uDD4A':'Sopf','\uD835\uDD64':'sopf','\u2660':'spades','\u2293':'sqcap','\u2293\uFE00':'sqcaps','\u2294':'sqcup','\u2294\uFE00':'sqcups','\u228F':'sqsub','\u2291':'sqsube','\u2290':'sqsup','\u2292':'sqsupe','\u25A1':'squ','\uD835\uDCAE':'Sscr','\uD835\uDCC8':'sscr','\u22C6':'Star','\u2606':'star','\u2282':'sub','\u22D0':'Sub','\u2ABD':'subdot','\u2AC5':'subE','\u2286':'sube','\u2AC3':'subedot','\u2AC1':'submult','\u2ACB':'subnE','\u228A':'subne','\u2ABF':'subplus','\u2979':'subrarr','\u2AC7':'subsim','\u2AD5':'subsub','\u2AD3':'subsup','\u2211':'sum','\u266A':'sung','\xB9':'sup1','\xB2':'sup2','\xB3':'sup3','\u2283':'sup','\u22D1':'Sup','\u2ABE':'supdot','\u2AD8':'supdsub','\u2AC6':'supE','\u2287':'supe','\u2AC4':'supedot','\u27C9':'suphsol','\u2AD7':'suphsub','\u297B':'suplarr','\u2AC2':'supmult','\u2ACC':'supnE','\u228B':'supne','\u2AC0':'supplus','\u2AC8':'supsim','\u2AD4':'supsub','\u2AD6':'supsup','\u21D9':'swArr','\u292A':'swnwar','\xDF':'szlig','\t':'Tab','\u2316':'target','\u03A4':'Tau','\u03C4':'tau','\u0164':'Tcaron','\u0165':'tcaron','\u0162':'Tcedil','\u0163':'tcedil','\u0422':'Tcy','\u0442':'tcy','\u20DB':'tdot','\u2315':'telrec','\uD835\uDD17':'Tfr','\uD835\uDD31':'tfr','\u2234':'there4','\u0398':'Theta','\u03B8':'theta','\u03D1':'thetav','\u205F\u200A':'ThickSpace','\u2009':'thinsp','\xDE':'THORN','\xFE':'thorn','\u2A31':'timesbar','\xD7':'times','\u2A30':'timesd','\u2336':'topbot','\u2AF1':'topcir','\uD835\uDD4B':'Topf','\uD835\uDD65':'topf','\u2ADA':'topfork','\u2034':'tprime','\u2122':'trade','\u25B5':'utri','\u225C':'trie','\u25EC':'tridot','\u2A3A':'triminus','\u2A39':'triplus','\u29CD':'trisb','\u2A3B':'tritime','\u23E2':'trpezium','\uD835\uDCAF':'Tscr','\uD835\uDCC9':'tscr','\u0426':'TScy','\u0446':'tscy','\u040B':'TSHcy','\u045B':'tshcy','\u0166':'Tstrok','\u0167':'tstrok','\xDA':'Uacute','\xFA':'uacute','\u219F':'Uarr','\u2949':'Uarrocir','\u040E':'Ubrcy','\u045E':'ubrcy','\u016C':'Ubreve','\u016D':'ubreve','\xDB':'Ucirc','\xFB':'ucirc','\u0423':'Ucy','\u0443':'ucy','\u21C5':'udarr','\u0170':'Udblac','\u0171':'udblac','\u296E':'udhar','\u297E':'ufisht','\uD835\uDD18':'Ufr','\uD835\uDD32':'ufr','\xD9':'Ugrave','\xF9':'ugrave','\u2963':'uHar','\u2580':'uhblk','\u231C':'ulcorn','\u230F':'ulcrop','\u25F8':'ultri','\u016A':'Umacr','\u016B':'umacr','\u23DF':'UnderBrace','\u23DD':'UnderParenthesis','\u228E':'uplus','\u0172':'Uogon','\u0173':'uogon','\uD835\uDD4C':'Uopf','\uD835\uDD66':'uopf','\u2912':'UpArrowBar','\u2195':'varr','\u03C5':'upsi','\u03D2':'Upsi','\u03A5':'Upsilon','\u21C8':'uuarr','\u231D':'urcorn','\u230E':'urcrop','\u016E':'Uring','\u016F':'uring','\u25F9':'urtri','\uD835\uDCB0':'Uscr','\uD835\uDCCA':'uscr','\u22F0':'utdot','\u0168':'Utilde','\u0169':'utilde','\xDC':'Uuml','\xFC':'uuml','\u29A7':'uwangle','\u299C':'vangrt','\u228A\uFE00':'vsubne','\u2ACB\uFE00':'vsubnE','\u228B\uFE00':'vsupne','\u2ACC\uFE00':'vsupnE','\u2AE8':'vBar','\u2AEB':'Vbar','\u2AE9':'vBarv','\u0412':'Vcy','\u0432':'vcy','\u22A9':'Vdash','\u22AB':'VDash','\u2AE6':'Vdashl','\u22BB':'veebar','\u225A':'veeeq','\u22EE':'vellip','|':'vert','\u2016':'Vert','\u2758':'VerticalSeparator','\u2240':'wr','\uD835\uDD19':'Vfr','\uD835\uDD33':'vfr','\uD835\uDD4D':'Vopf','\uD835\uDD67':'vopf','\uD835\uDCB1':'Vscr','\uD835\uDCCB':'vscr','\u22AA':'Vvdash','\u299A':'vzigzag','\u0174':'Wcirc','\u0175':'wcirc','\u2A5F':'wedbar','\u2259':'wedgeq','\u2118':'wp','\uD835\uDD1A':'Wfr','\uD835\uDD34':'wfr','\uD835\uDD4E':'Wopf','\uD835\uDD68':'wopf','\uD835\uDCB2':'Wscr','\uD835\uDCCC':'wscr','\uD835\uDD1B':'Xfr','\uD835\uDD35':'xfr','\u039E':'Xi','\u03BE':'xi','\u22FB':'xnis','\uD835\uDD4F':'Xopf','\uD835\uDD69':'xopf','\uD835\uDCB3':'Xscr','\uD835\uDCCD':'xscr','\xDD':'Yacute','\xFD':'yacute','\u042F':'YAcy','\u044F':'yacy','\u0176':'Ycirc','\u0177':'ycirc','\u042B':'Ycy','\u044B':'ycy','\xA5':'yen','\uD835\uDD1C':'Yfr','\uD835\uDD36':'yfr','\u0407':'YIcy','\u0457':'yicy','\uD835\uDD50':'Yopf','\uD835\uDD6A':'yopf','\uD835\uDCB4':'Yscr','\uD835\uDCCE':'yscr','\u042E':'YUcy','\u044E':'yucy','\xFF':'yuml','\u0178':'Yuml','\u0179':'Zacute','\u017A':'zacute','\u017D':'Zcaron','\u017E':'zcaron','\u0417':'Zcy','\u0437':'zcy','\u017B':'Zdot','\u017C':'zdot','\u2128':'Zfr','\u0396':'Zeta','\u03B6':'zeta','\uD835\uDD37':'zfr','\u0416':'ZHcy','\u0436':'zhcy','\u21DD':'zigrarr','\uD835\uDD6B':'zopf','\uD835\uDCB5':'Zscr','\uD835\uDCCF':'zscr','\u200D':'zwj','\u200C':'zwnj'};

	var regexEscape = /["&'<>`]/g;
	var escapeMap = {
		'"': '&quot;',
		'&': '&amp;',
		'\'': '&#x27;',
		'<': '&lt;',
		// See https://mathiasbynens.be/notes/ambiguous-ampersands: in HTML, the
		// following is not strictly necessary unless it’s part of a tag or an
		// unquoted attribute value. We’re only escaping it to support those
		// situations, and for XML support.
		'>': '&gt;',
		// In Internet Explorer ≤ 8, the backtick character can be used
		// to break out of (un)quoted attribute values or HTML comments.
		// See http://html5sec.org/#102, http://html5sec.org/#108, and
		// http://html5sec.org/#133.
		'`': '&#x60;'
	};

	var regexInvalidEntity = /&#(?:[xX][^a-fA-F0-9]|[^0-9xX])/;
	var regexInvalidRawCodePoint = /[\0-\x08\x0B\x0E-\x1F\x7F-\x9F\uFDD0-\uFDEF\uFFFE\uFFFF]|[\uD83F\uD87F\uD8BF\uD8FF\uD93F\uD97F\uD9BF\uD9FF\uDA3F\uDA7F\uDABF\uDAFF\uDB3F\uDB7F\uDBBF\uDBFF][\uDFFE\uDFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/;
	var regexDecode = /&#([0-9]+)(;?)|&#[xX]([a-fA-F0-9]+)(;?)|&([0-9a-zA-Z]+);|&(Aacute|iacute|Uacute|plusmn|otilde|Otilde|Agrave|agrave|yacute|Yacute|oslash|Oslash|Atilde|atilde|brvbar|Ccedil|ccedil|ograve|curren|divide|Eacute|eacute|Ograve|oacute|Egrave|egrave|ugrave|frac12|frac14|frac34|Ugrave|Oacute|Iacute|ntilde|Ntilde|uacute|middot|Igrave|igrave|iquest|aacute|laquo|THORN|micro|iexcl|icirc|Icirc|Acirc|ucirc|ecirc|Ocirc|ocirc|Ecirc|Ucirc|aring|Aring|aelig|AElig|acute|pound|raquo|acirc|times|thorn|szlig|cedil|COPY|Auml|ordf|ordm|uuml|macr|Uuml|auml|Ouml|ouml|para|nbsp|Euml|quot|QUOT|euml|yuml|cent|sect|copy|sup1|sup2|sup3|Iuml|iuml|shy|eth|reg|not|yen|amp|AMP|REG|uml|ETH|deg|gt|GT|LT|lt)([=a-zA-Z0-9])?/g;
	var decodeMap = {'Aacute':'\xC1','aacute':'\xE1','Abreve':'\u0102','abreve':'\u0103','ac':'\u223E','acd':'\u223F','acE':'\u223E\u0333','Acirc':'\xC2','acirc':'\xE2','acute':'\xB4','Acy':'\u0410','acy':'\u0430','AElig':'\xC6','aelig':'\xE6','af':'\u2061','Afr':'\uD835\uDD04','afr':'\uD835\uDD1E','Agrave':'\xC0','agrave':'\xE0','alefsym':'\u2135','aleph':'\u2135','Alpha':'\u0391','alpha':'\u03B1','Amacr':'\u0100','amacr':'\u0101','amalg':'\u2A3F','amp':'&','AMP':'&','andand':'\u2A55','And':'\u2A53','and':'\u2227','andd':'\u2A5C','andslope':'\u2A58','andv':'\u2A5A','ang':'\u2220','ange':'\u29A4','angle':'\u2220','angmsdaa':'\u29A8','angmsdab':'\u29A9','angmsdac':'\u29AA','angmsdad':'\u29AB','angmsdae':'\u29AC','angmsdaf':'\u29AD','angmsdag':'\u29AE','angmsdah':'\u29AF','angmsd':'\u2221','angrt':'\u221F','angrtvb':'\u22BE','angrtvbd':'\u299D','angsph':'\u2222','angst':'\xC5','angzarr':'\u237C','Aogon':'\u0104','aogon':'\u0105','Aopf':'\uD835\uDD38','aopf':'\uD835\uDD52','apacir':'\u2A6F','ap':'\u2248','apE':'\u2A70','ape':'\u224A','apid':'\u224B','apos':'\'','ApplyFunction':'\u2061','approx':'\u2248','approxeq':'\u224A','Aring':'\xC5','aring':'\xE5','Ascr':'\uD835\uDC9C','ascr':'\uD835\uDCB6','Assign':'\u2254','ast':'*','asymp':'\u2248','asympeq':'\u224D','Atilde':'\xC3','atilde':'\xE3','Auml':'\xC4','auml':'\xE4','awconint':'\u2233','awint':'\u2A11','backcong':'\u224C','backepsilon':'\u03F6','backprime':'\u2035','backsim':'\u223D','backsimeq':'\u22CD','Backslash':'\u2216','Barv':'\u2AE7','barvee':'\u22BD','barwed':'\u2305','Barwed':'\u2306','barwedge':'\u2305','bbrk':'\u23B5','bbrktbrk':'\u23B6','bcong':'\u224C','Bcy':'\u0411','bcy':'\u0431','bdquo':'\u201E','becaus':'\u2235','because':'\u2235','Because':'\u2235','bemptyv':'\u29B0','bepsi':'\u03F6','bernou':'\u212C','Bernoullis':'\u212C','Beta':'\u0392','beta':'\u03B2','beth':'\u2136','between':'\u226C','Bfr':'\uD835\uDD05','bfr':'\uD835\uDD1F','bigcap':'\u22C2','bigcirc':'\u25EF','bigcup':'\u22C3','bigodot':'\u2A00','bigoplus':'\u2A01','bigotimes':'\u2A02','bigsqcup':'\u2A06','bigstar':'\u2605','bigtriangledown':'\u25BD','bigtriangleup':'\u25B3','biguplus':'\u2A04','bigvee':'\u22C1','bigwedge':'\u22C0','bkarow':'\u290D','blacklozenge':'\u29EB','blacksquare':'\u25AA','blacktriangle':'\u25B4','blacktriangledown':'\u25BE','blacktriangleleft':'\u25C2','blacktriangleright':'\u25B8','blank':'\u2423','blk12':'\u2592','blk14':'\u2591','blk34':'\u2593','block':'\u2588','bne':'=\u20E5','bnequiv':'\u2261\u20E5','bNot':'\u2AED','bnot':'\u2310','Bopf':'\uD835\uDD39','bopf':'\uD835\uDD53','bot':'\u22A5','bottom':'\u22A5','bowtie':'\u22C8','boxbox':'\u29C9','boxdl':'\u2510','boxdL':'\u2555','boxDl':'\u2556','boxDL':'\u2557','boxdr':'\u250C','boxdR':'\u2552','boxDr':'\u2553','boxDR':'\u2554','boxh':'\u2500','boxH':'\u2550','boxhd':'\u252C','boxHd':'\u2564','boxhD':'\u2565','boxHD':'\u2566','boxhu':'\u2534','boxHu':'\u2567','boxhU':'\u2568','boxHU':'\u2569','boxminus':'\u229F','boxplus':'\u229E','boxtimes':'\u22A0','boxul':'\u2518','boxuL':'\u255B','boxUl':'\u255C','boxUL':'\u255D','boxur':'\u2514','boxuR':'\u2558','boxUr':'\u2559','boxUR':'\u255A','boxv':'\u2502','boxV':'\u2551','boxvh':'\u253C','boxvH':'\u256A','boxVh':'\u256B','boxVH':'\u256C','boxvl':'\u2524','boxvL':'\u2561','boxVl':'\u2562','boxVL':'\u2563','boxvr':'\u251C','boxvR':'\u255E','boxVr':'\u255F','boxVR':'\u2560','bprime':'\u2035','breve':'\u02D8','Breve':'\u02D8','brvbar':'\xA6','bscr':'\uD835\uDCB7','Bscr':'\u212C','bsemi':'\u204F','bsim':'\u223D','bsime':'\u22CD','bsolb':'\u29C5','bsol':'\\','bsolhsub':'\u27C8','bull':'\u2022','bullet':'\u2022','bump':'\u224E','bumpE':'\u2AAE','bumpe':'\u224F','Bumpeq':'\u224E','bumpeq':'\u224F','Cacute':'\u0106','cacute':'\u0107','capand':'\u2A44','capbrcup':'\u2A49','capcap':'\u2A4B','cap':'\u2229','Cap':'\u22D2','capcup':'\u2A47','capdot':'\u2A40','CapitalDifferentialD':'\u2145','caps':'\u2229\uFE00','caret':'\u2041','caron':'\u02C7','Cayleys':'\u212D','ccaps':'\u2A4D','Ccaron':'\u010C','ccaron':'\u010D','Ccedil':'\xC7','ccedil':'\xE7','Ccirc':'\u0108','ccirc':'\u0109','Cconint':'\u2230','ccups':'\u2A4C','ccupssm':'\u2A50','Cdot':'\u010A','cdot':'\u010B','cedil':'\xB8','Cedilla':'\xB8','cemptyv':'\u29B2','cent':'\xA2','centerdot':'\xB7','CenterDot':'\xB7','cfr':'\uD835\uDD20','Cfr':'\u212D','CHcy':'\u0427','chcy':'\u0447','check':'\u2713','checkmark':'\u2713','Chi':'\u03A7','chi':'\u03C7','circ':'\u02C6','circeq':'\u2257','circlearrowleft':'\u21BA','circlearrowright':'\u21BB','circledast':'\u229B','circledcirc':'\u229A','circleddash':'\u229D','CircleDot':'\u2299','circledR':'\xAE','circledS':'\u24C8','CircleMinus':'\u2296','CirclePlus':'\u2295','CircleTimes':'\u2297','cir':'\u25CB','cirE':'\u29C3','cire':'\u2257','cirfnint':'\u2A10','cirmid':'\u2AEF','cirscir':'\u29C2','ClockwiseContourIntegral':'\u2232','CloseCurlyDoubleQuote':'\u201D','CloseCurlyQuote':'\u2019','clubs':'\u2663','clubsuit':'\u2663','colon':':','Colon':'\u2237','Colone':'\u2A74','colone':'\u2254','coloneq':'\u2254','comma':',','commat':'@','comp':'\u2201','compfn':'\u2218','complement':'\u2201','complexes':'\u2102','cong':'\u2245','congdot':'\u2A6D','Congruent':'\u2261','conint':'\u222E','Conint':'\u222F','ContourIntegral':'\u222E','copf':'\uD835\uDD54','Copf':'\u2102','coprod':'\u2210','Coproduct':'\u2210','copy':'\xA9','COPY':'\xA9','copysr':'\u2117','CounterClockwiseContourIntegral':'\u2233','crarr':'\u21B5','cross':'\u2717','Cross':'\u2A2F','Cscr':'\uD835\uDC9E','cscr':'\uD835\uDCB8','csub':'\u2ACF','csube':'\u2AD1','csup':'\u2AD0','csupe':'\u2AD2','ctdot':'\u22EF','cudarrl':'\u2938','cudarrr':'\u2935','cuepr':'\u22DE','cuesc':'\u22DF','cularr':'\u21B6','cularrp':'\u293D','cupbrcap':'\u2A48','cupcap':'\u2A46','CupCap':'\u224D','cup':'\u222A','Cup':'\u22D3','cupcup':'\u2A4A','cupdot':'\u228D','cupor':'\u2A45','cups':'\u222A\uFE00','curarr':'\u21B7','curarrm':'\u293C','curlyeqprec':'\u22DE','curlyeqsucc':'\u22DF','curlyvee':'\u22CE','curlywedge':'\u22CF','curren':'\xA4','curvearrowleft':'\u21B6','curvearrowright':'\u21B7','cuvee':'\u22CE','cuwed':'\u22CF','cwconint':'\u2232','cwint':'\u2231','cylcty':'\u232D','dagger':'\u2020','Dagger':'\u2021','daleth':'\u2138','darr':'\u2193','Darr':'\u21A1','dArr':'\u21D3','dash':'\u2010','Dashv':'\u2AE4','dashv':'\u22A3','dbkarow':'\u290F','dblac':'\u02DD','Dcaron':'\u010E','dcaron':'\u010F','Dcy':'\u0414','dcy':'\u0434','ddagger':'\u2021','ddarr':'\u21CA','DD':'\u2145','dd':'\u2146','DDotrahd':'\u2911','ddotseq':'\u2A77','deg':'\xB0','Del':'\u2207','Delta':'\u0394','delta':'\u03B4','demptyv':'\u29B1','dfisht':'\u297F','Dfr':'\uD835\uDD07','dfr':'\uD835\uDD21','dHar':'\u2965','dharl':'\u21C3','dharr':'\u21C2','DiacriticalAcute':'\xB4','DiacriticalDot':'\u02D9','DiacriticalDoubleAcute':'\u02DD','DiacriticalGrave':'`','DiacriticalTilde':'\u02DC','diam':'\u22C4','diamond':'\u22C4','Diamond':'\u22C4','diamondsuit':'\u2666','diams':'\u2666','die':'\xA8','DifferentialD':'\u2146','digamma':'\u03DD','disin':'\u22F2','div':'\xF7','divide':'\xF7','divideontimes':'\u22C7','divonx':'\u22C7','DJcy':'\u0402','djcy':'\u0452','dlcorn':'\u231E','dlcrop':'\u230D','dollar':'$','Dopf':'\uD835\uDD3B','dopf':'\uD835\uDD55','Dot':'\xA8','dot':'\u02D9','DotDot':'\u20DC','doteq':'\u2250','doteqdot':'\u2251','DotEqual':'\u2250','dotminus':'\u2238','dotplus':'\u2214','dotsquare':'\u22A1','doublebarwedge':'\u2306','DoubleContourIntegral':'\u222F','DoubleDot':'\xA8','DoubleDownArrow':'\u21D3','DoubleLeftArrow':'\u21D0','DoubleLeftRightArrow':'\u21D4','DoubleLeftTee':'\u2AE4','DoubleLongLeftArrow':'\u27F8','DoubleLongLeftRightArrow':'\u27FA','DoubleLongRightArrow':'\u27F9','DoubleRightArrow':'\u21D2','DoubleRightTee':'\u22A8','DoubleUpArrow':'\u21D1','DoubleUpDownArrow':'\u21D5','DoubleVerticalBar':'\u2225','DownArrowBar':'\u2913','downarrow':'\u2193','DownArrow':'\u2193','Downarrow':'\u21D3','DownArrowUpArrow':'\u21F5','DownBreve':'\u0311','downdownarrows':'\u21CA','downharpoonleft':'\u21C3','downharpoonright':'\u21C2','DownLeftRightVector':'\u2950','DownLeftTeeVector':'\u295E','DownLeftVectorBar':'\u2956','DownLeftVector':'\u21BD','DownRightTeeVector':'\u295F','DownRightVectorBar':'\u2957','DownRightVector':'\u21C1','DownTeeArrow':'\u21A7','DownTee':'\u22A4','drbkarow':'\u2910','drcorn':'\u231F','drcrop':'\u230C','Dscr':'\uD835\uDC9F','dscr':'\uD835\uDCB9','DScy':'\u0405','dscy':'\u0455','dsol':'\u29F6','Dstrok':'\u0110','dstrok':'\u0111','dtdot':'\u22F1','dtri':'\u25BF','dtrif':'\u25BE','duarr':'\u21F5','duhar':'\u296F','dwangle':'\u29A6','DZcy':'\u040F','dzcy':'\u045F','dzigrarr':'\u27FF','Eacute':'\xC9','eacute':'\xE9','easter':'\u2A6E','Ecaron':'\u011A','ecaron':'\u011B','Ecirc':'\xCA','ecirc':'\xEA','ecir':'\u2256','ecolon':'\u2255','Ecy':'\u042D','ecy':'\u044D','eDDot':'\u2A77','Edot':'\u0116','edot':'\u0117','eDot':'\u2251','ee':'\u2147','efDot':'\u2252','Efr':'\uD835\uDD08','efr':'\uD835\uDD22','eg':'\u2A9A','Egrave':'\xC8','egrave':'\xE8','egs':'\u2A96','egsdot':'\u2A98','el':'\u2A99','Element':'\u2208','elinters':'\u23E7','ell':'\u2113','els':'\u2A95','elsdot':'\u2A97','Emacr':'\u0112','emacr':'\u0113','empty':'\u2205','emptyset':'\u2205','EmptySmallSquare':'\u25FB','emptyv':'\u2205','EmptyVerySmallSquare':'\u25AB','emsp13':'\u2004','emsp14':'\u2005','emsp':'\u2003','ENG':'\u014A','eng':'\u014B','ensp':'\u2002','Eogon':'\u0118','eogon':'\u0119','Eopf':'\uD835\uDD3C','eopf':'\uD835\uDD56','epar':'\u22D5','eparsl':'\u29E3','eplus':'\u2A71','epsi':'\u03B5','Epsilon':'\u0395','epsilon':'\u03B5','epsiv':'\u03F5','eqcirc':'\u2256','eqcolon':'\u2255','eqsim':'\u2242','eqslantgtr':'\u2A96','eqslantless':'\u2A95','Equal':'\u2A75','equals':'=','EqualTilde':'\u2242','equest':'\u225F','Equilibrium':'\u21CC','equiv':'\u2261','equivDD':'\u2A78','eqvparsl':'\u29E5','erarr':'\u2971','erDot':'\u2253','escr':'\u212F','Escr':'\u2130','esdot':'\u2250','Esim':'\u2A73','esim':'\u2242','Eta':'\u0397','eta':'\u03B7','ETH':'\xD0','eth':'\xF0','Euml':'\xCB','euml':'\xEB','euro':'\u20AC','excl':'!','exist':'\u2203','Exists':'\u2203','expectation':'\u2130','exponentiale':'\u2147','ExponentialE':'\u2147','fallingdotseq':'\u2252','Fcy':'\u0424','fcy':'\u0444','female':'\u2640','ffilig':'\uFB03','fflig':'\uFB00','ffllig':'\uFB04','Ffr':'\uD835\uDD09','ffr':'\uD835\uDD23','filig':'\uFB01','FilledSmallSquare':'\u25FC','FilledVerySmallSquare':'\u25AA','fjlig':'fj','flat':'\u266D','fllig':'\uFB02','fltns':'\u25B1','fnof':'\u0192','Fopf':'\uD835\uDD3D','fopf':'\uD835\uDD57','forall':'\u2200','ForAll':'\u2200','fork':'\u22D4','forkv':'\u2AD9','Fouriertrf':'\u2131','fpartint':'\u2A0D','frac12':'\xBD','frac13':'\u2153','frac14':'\xBC','frac15':'\u2155','frac16':'\u2159','frac18':'\u215B','frac23':'\u2154','frac25':'\u2156','frac34':'\xBE','frac35':'\u2157','frac38':'\u215C','frac45':'\u2158','frac56':'\u215A','frac58':'\u215D','frac78':'\u215E','frasl':'\u2044','frown':'\u2322','fscr':'\uD835\uDCBB','Fscr':'\u2131','gacute':'\u01F5','Gamma':'\u0393','gamma':'\u03B3','Gammad':'\u03DC','gammad':'\u03DD','gap':'\u2A86','Gbreve':'\u011E','gbreve':'\u011F','Gcedil':'\u0122','Gcirc':'\u011C','gcirc':'\u011D','Gcy':'\u0413','gcy':'\u0433','Gdot':'\u0120','gdot':'\u0121','ge':'\u2265','gE':'\u2267','gEl':'\u2A8C','gel':'\u22DB','geq':'\u2265','geqq':'\u2267','geqslant':'\u2A7E','gescc':'\u2AA9','ges':'\u2A7E','gesdot':'\u2A80','gesdoto':'\u2A82','gesdotol':'\u2A84','gesl':'\u22DB\uFE00','gesles':'\u2A94','Gfr':'\uD835\uDD0A','gfr':'\uD835\uDD24','gg':'\u226B','Gg':'\u22D9','ggg':'\u22D9','gimel':'\u2137','GJcy':'\u0403','gjcy':'\u0453','gla':'\u2AA5','gl':'\u2277','glE':'\u2A92','glj':'\u2AA4','gnap':'\u2A8A','gnapprox':'\u2A8A','gne':'\u2A88','gnE':'\u2269','gneq':'\u2A88','gneqq':'\u2269','gnsim':'\u22E7','Gopf':'\uD835\uDD3E','gopf':'\uD835\uDD58','grave':'`','GreaterEqual':'\u2265','GreaterEqualLess':'\u22DB','GreaterFullEqual':'\u2267','GreaterGreater':'\u2AA2','GreaterLess':'\u2277','GreaterSlantEqual':'\u2A7E','GreaterTilde':'\u2273','Gscr':'\uD835\uDCA2','gscr':'\u210A','gsim':'\u2273','gsime':'\u2A8E','gsiml':'\u2A90','gtcc':'\u2AA7','gtcir':'\u2A7A','gt':'>','GT':'>','Gt':'\u226B','gtdot':'\u22D7','gtlPar':'\u2995','gtquest':'\u2A7C','gtrapprox':'\u2A86','gtrarr':'\u2978','gtrdot':'\u22D7','gtreqless':'\u22DB','gtreqqless':'\u2A8C','gtrless':'\u2277','gtrsim':'\u2273','gvertneqq':'\u2269\uFE00','gvnE':'\u2269\uFE00','Hacek':'\u02C7','hairsp':'\u200A','half':'\xBD','hamilt':'\u210B','HARDcy':'\u042A','hardcy':'\u044A','harrcir':'\u2948','harr':'\u2194','hArr':'\u21D4','harrw':'\u21AD','Hat':'^','hbar':'\u210F','Hcirc':'\u0124','hcirc':'\u0125','hearts':'\u2665','heartsuit':'\u2665','hellip':'\u2026','hercon':'\u22B9','hfr':'\uD835\uDD25','Hfr':'\u210C','HilbertSpace':'\u210B','hksearow':'\u2925','hkswarow':'\u2926','hoarr':'\u21FF','homtht':'\u223B','hookleftarrow':'\u21A9','hookrightarrow':'\u21AA','hopf':'\uD835\uDD59','Hopf':'\u210D','horbar':'\u2015','HorizontalLine':'\u2500','hscr':'\uD835\uDCBD','Hscr':'\u210B','hslash':'\u210F','Hstrok':'\u0126','hstrok':'\u0127','HumpDownHump':'\u224E','HumpEqual':'\u224F','hybull':'\u2043','hyphen':'\u2010','Iacute':'\xCD','iacute':'\xED','ic':'\u2063','Icirc':'\xCE','icirc':'\xEE','Icy':'\u0418','icy':'\u0438','Idot':'\u0130','IEcy':'\u0415','iecy':'\u0435','iexcl':'\xA1','iff':'\u21D4','ifr':'\uD835\uDD26','Ifr':'\u2111','Igrave':'\xCC','igrave':'\xEC','ii':'\u2148','iiiint':'\u2A0C','iiint':'\u222D','iinfin':'\u29DC','iiota':'\u2129','IJlig':'\u0132','ijlig':'\u0133','Imacr':'\u012A','imacr':'\u012B','image':'\u2111','ImaginaryI':'\u2148','imagline':'\u2110','imagpart':'\u2111','imath':'\u0131','Im':'\u2111','imof':'\u22B7','imped':'\u01B5','Implies':'\u21D2','incare':'\u2105','in':'\u2208','infin':'\u221E','infintie':'\u29DD','inodot':'\u0131','intcal':'\u22BA','int':'\u222B','Int':'\u222C','integers':'\u2124','Integral':'\u222B','intercal':'\u22BA','Intersection':'\u22C2','intlarhk':'\u2A17','intprod':'\u2A3C','InvisibleComma':'\u2063','InvisibleTimes':'\u2062','IOcy':'\u0401','iocy':'\u0451','Iogon':'\u012E','iogon':'\u012F','Iopf':'\uD835\uDD40','iopf':'\uD835\uDD5A','Iota':'\u0399','iota':'\u03B9','iprod':'\u2A3C','iquest':'\xBF','iscr':'\uD835\uDCBE','Iscr':'\u2110','isin':'\u2208','isindot':'\u22F5','isinE':'\u22F9','isins':'\u22F4','isinsv':'\u22F3','isinv':'\u2208','it':'\u2062','Itilde':'\u0128','itilde':'\u0129','Iukcy':'\u0406','iukcy':'\u0456','Iuml':'\xCF','iuml':'\xEF','Jcirc':'\u0134','jcirc':'\u0135','Jcy':'\u0419','jcy':'\u0439','Jfr':'\uD835\uDD0D','jfr':'\uD835\uDD27','jmath':'\u0237','Jopf':'\uD835\uDD41','jopf':'\uD835\uDD5B','Jscr':'\uD835\uDCA5','jscr':'\uD835\uDCBF','Jsercy':'\u0408','jsercy':'\u0458','Jukcy':'\u0404','jukcy':'\u0454','Kappa':'\u039A','kappa':'\u03BA','kappav':'\u03F0','Kcedil':'\u0136','kcedil':'\u0137','Kcy':'\u041A','kcy':'\u043A','Kfr':'\uD835\uDD0E','kfr':'\uD835\uDD28','kgreen':'\u0138','KHcy':'\u0425','khcy':'\u0445','KJcy':'\u040C','kjcy':'\u045C','Kopf':'\uD835\uDD42','kopf':'\uD835\uDD5C','Kscr':'\uD835\uDCA6','kscr':'\uD835\uDCC0','lAarr':'\u21DA','Lacute':'\u0139','lacute':'\u013A','laemptyv':'\u29B4','lagran':'\u2112','Lambda':'\u039B','lambda':'\u03BB','lang':'\u27E8','Lang':'\u27EA','langd':'\u2991','langle':'\u27E8','lap':'\u2A85','Laplacetrf':'\u2112','laquo':'\xAB','larrb':'\u21E4','larrbfs':'\u291F','larr':'\u2190','Larr':'\u219E','lArr':'\u21D0','larrfs':'\u291D','larrhk':'\u21A9','larrlp':'\u21AB','larrpl':'\u2939','larrsim':'\u2973','larrtl':'\u21A2','latail':'\u2919','lAtail':'\u291B','lat':'\u2AAB','late':'\u2AAD','lates':'\u2AAD\uFE00','lbarr':'\u290C','lBarr':'\u290E','lbbrk':'\u2772','lbrace':'{','lbrack':'[','lbrke':'\u298B','lbrksld':'\u298F','lbrkslu':'\u298D','Lcaron':'\u013D','lcaron':'\u013E','Lcedil':'\u013B','lcedil':'\u013C','lceil':'\u2308','lcub':'{','Lcy':'\u041B','lcy':'\u043B','ldca':'\u2936','ldquo':'\u201C','ldquor':'\u201E','ldrdhar':'\u2967','ldrushar':'\u294B','ldsh':'\u21B2','le':'\u2264','lE':'\u2266','LeftAngleBracket':'\u27E8','LeftArrowBar':'\u21E4','leftarrow':'\u2190','LeftArrow':'\u2190','Leftarrow':'\u21D0','LeftArrowRightArrow':'\u21C6','leftarrowtail':'\u21A2','LeftCeiling':'\u2308','LeftDoubleBracket':'\u27E6','LeftDownTeeVector':'\u2961','LeftDownVectorBar':'\u2959','LeftDownVector':'\u21C3','LeftFloor':'\u230A','leftharpoondown':'\u21BD','leftharpoonup':'\u21BC','leftleftarrows':'\u21C7','leftrightarrow':'\u2194','LeftRightArrow':'\u2194','Leftrightarrow':'\u21D4','leftrightarrows':'\u21C6','leftrightharpoons':'\u21CB','leftrightsquigarrow':'\u21AD','LeftRightVector':'\u294E','LeftTeeArrow':'\u21A4','LeftTee':'\u22A3','LeftTeeVector':'\u295A','leftthreetimes':'\u22CB','LeftTriangleBar':'\u29CF','LeftTriangle':'\u22B2','LeftTriangleEqual':'\u22B4','LeftUpDownVector':'\u2951','LeftUpTeeVector':'\u2960','LeftUpVectorBar':'\u2958','LeftUpVector':'\u21BF','LeftVectorBar':'\u2952','LeftVector':'\u21BC','lEg':'\u2A8B','leg':'\u22DA','leq':'\u2264','leqq':'\u2266','leqslant':'\u2A7D','lescc':'\u2AA8','les':'\u2A7D','lesdot':'\u2A7F','lesdoto':'\u2A81','lesdotor':'\u2A83','lesg':'\u22DA\uFE00','lesges':'\u2A93','lessapprox':'\u2A85','lessdot':'\u22D6','lesseqgtr':'\u22DA','lesseqqgtr':'\u2A8B','LessEqualGreater':'\u22DA','LessFullEqual':'\u2266','LessGreater':'\u2276','lessgtr':'\u2276','LessLess':'\u2AA1','lesssim':'\u2272','LessSlantEqual':'\u2A7D','LessTilde':'\u2272','lfisht':'\u297C','lfloor':'\u230A','Lfr':'\uD835\uDD0F','lfr':'\uD835\uDD29','lg':'\u2276','lgE':'\u2A91','lHar':'\u2962','lhard':'\u21BD','lharu':'\u21BC','lharul':'\u296A','lhblk':'\u2584','LJcy':'\u0409','ljcy':'\u0459','llarr':'\u21C7','ll':'\u226A','Ll':'\u22D8','llcorner':'\u231E','Lleftarrow':'\u21DA','llhard':'\u296B','lltri':'\u25FA','Lmidot':'\u013F','lmidot':'\u0140','lmoustache':'\u23B0','lmoust':'\u23B0','lnap':'\u2A89','lnapprox':'\u2A89','lne':'\u2A87','lnE':'\u2268','lneq':'\u2A87','lneqq':'\u2268','lnsim':'\u22E6','loang':'\u27EC','loarr':'\u21FD','lobrk':'\u27E6','longleftarrow':'\u27F5','LongLeftArrow':'\u27F5','Longleftarrow':'\u27F8','longleftrightarrow':'\u27F7','LongLeftRightArrow':'\u27F7','Longleftrightarrow':'\u27FA','longmapsto':'\u27FC','longrightarrow':'\u27F6','LongRightArrow':'\u27F6','Longrightarrow':'\u27F9','looparrowleft':'\u21AB','looparrowright':'\u21AC','lopar':'\u2985','Lopf':'\uD835\uDD43','lopf':'\uD835\uDD5D','loplus':'\u2A2D','lotimes':'\u2A34','lowast':'\u2217','lowbar':'_','LowerLeftArrow':'\u2199','LowerRightArrow':'\u2198','loz':'\u25CA','lozenge':'\u25CA','lozf':'\u29EB','lpar':'(','lparlt':'\u2993','lrarr':'\u21C6','lrcorner':'\u231F','lrhar':'\u21CB','lrhard':'\u296D','lrm':'\u200E','lrtri':'\u22BF','lsaquo':'\u2039','lscr':'\uD835\uDCC1','Lscr':'\u2112','lsh':'\u21B0','Lsh':'\u21B0','lsim':'\u2272','lsime':'\u2A8D','lsimg':'\u2A8F','lsqb':'[','lsquo':'\u2018','lsquor':'\u201A','Lstrok':'\u0141','lstrok':'\u0142','ltcc':'\u2AA6','ltcir':'\u2A79','lt':'<','LT':'<','Lt':'\u226A','ltdot':'\u22D6','lthree':'\u22CB','ltimes':'\u22C9','ltlarr':'\u2976','ltquest':'\u2A7B','ltri':'\u25C3','ltrie':'\u22B4','ltrif':'\u25C2','ltrPar':'\u2996','lurdshar':'\u294A','luruhar':'\u2966','lvertneqq':'\u2268\uFE00','lvnE':'\u2268\uFE00','macr':'\xAF','male':'\u2642','malt':'\u2720','maltese':'\u2720','Map':'\u2905','map':'\u21A6','mapsto':'\u21A6','mapstodown':'\u21A7','mapstoleft':'\u21A4','mapstoup':'\u21A5','marker':'\u25AE','mcomma':'\u2A29','Mcy':'\u041C','mcy':'\u043C','mdash':'\u2014','mDDot':'\u223A','measuredangle':'\u2221','MediumSpace':'\u205F','Mellintrf':'\u2133','Mfr':'\uD835\uDD10','mfr':'\uD835\uDD2A','mho':'\u2127','micro':'\xB5','midast':'*','midcir':'\u2AF0','mid':'\u2223','middot':'\xB7','minusb':'\u229F','minus':'\u2212','minusd':'\u2238','minusdu':'\u2A2A','MinusPlus':'\u2213','mlcp':'\u2ADB','mldr':'\u2026','mnplus':'\u2213','models':'\u22A7','Mopf':'\uD835\uDD44','mopf':'\uD835\uDD5E','mp':'\u2213','mscr':'\uD835\uDCC2','Mscr':'\u2133','mstpos':'\u223E','Mu':'\u039C','mu':'\u03BC','multimap':'\u22B8','mumap':'\u22B8','nabla':'\u2207','Nacute':'\u0143','nacute':'\u0144','nang':'\u2220\u20D2','nap':'\u2249','napE':'\u2A70\u0338','napid':'\u224B\u0338','napos':'\u0149','napprox':'\u2249','natural':'\u266E','naturals':'\u2115','natur':'\u266E','nbsp':'\xA0','nbump':'\u224E\u0338','nbumpe':'\u224F\u0338','ncap':'\u2A43','Ncaron':'\u0147','ncaron':'\u0148','Ncedil':'\u0145','ncedil':'\u0146','ncong':'\u2247','ncongdot':'\u2A6D\u0338','ncup':'\u2A42','Ncy':'\u041D','ncy':'\u043D','ndash':'\u2013','nearhk':'\u2924','nearr':'\u2197','neArr':'\u21D7','nearrow':'\u2197','ne':'\u2260','nedot':'\u2250\u0338','NegativeMediumSpace':'\u200B','NegativeThickSpace':'\u200B','NegativeThinSpace':'\u200B','NegativeVeryThinSpace':'\u200B','nequiv':'\u2262','nesear':'\u2928','nesim':'\u2242\u0338','NestedGreaterGreater':'\u226B','NestedLessLess':'\u226A','NewLine':'\n','nexist':'\u2204','nexists':'\u2204','Nfr':'\uD835\uDD11','nfr':'\uD835\uDD2B','ngE':'\u2267\u0338','nge':'\u2271','ngeq':'\u2271','ngeqq':'\u2267\u0338','ngeqslant':'\u2A7E\u0338','nges':'\u2A7E\u0338','nGg':'\u22D9\u0338','ngsim':'\u2275','nGt':'\u226B\u20D2','ngt':'\u226F','ngtr':'\u226F','nGtv':'\u226B\u0338','nharr':'\u21AE','nhArr':'\u21CE','nhpar':'\u2AF2','ni':'\u220B','nis':'\u22FC','nisd':'\u22FA','niv':'\u220B','NJcy':'\u040A','njcy':'\u045A','nlarr':'\u219A','nlArr':'\u21CD','nldr':'\u2025','nlE':'\u2266\u0338','nle':'\u2270','nleftarrow':'\u219A','nLeftarrow':'\u21CD','nleftrightarrow':'\u21AE','nLeftrightarrow':'\u21CE','nleq':'\u2270','nleqq':'\u2266\u0338','nleqslant':'\u2A7D\u0338','nles':'\u2A7D\u0338','nless':'\u226E','nLl':'\u22D8\u0338','nlsim':'\u2274','nLt':'\u226A\u20D2','nlt':'\u226E','nltri':'\u22EA','nltrie':'\u22EC','nLtv':'\u226A\u0338','nmid':'\u2224','NoBreak':'\u2060','NonBreakingSpace':'\xA0','nopf':'\uD835\uDD5F','Nopf':'\u2115','Not':'\u2AEC','not':'\xAC','NotCongruent':'\u2262','NotCupCap':'\u226D','NotDoubleVerticalBar':'\u2226','NotElement':'\u2209','NotEqual':'\u2260','NotEqualTilde':'\u2242\u0338','NotExists':'\u2204','NotGreater':'\u226F','NotGreaterEqual':'\u2271','NotGreaterFullEqual':'\u2267\u0338','NotGreaterGreater':'\u226B\u0338','NotGreaterLess':'\u2279','NotGreaterSlantEqual':'\u2A7E\u0338','NotGreaterTilde':'\u2275','NotHumpDownHump':'\u224E\u0338','NotHumpEqual':'\u224F\u0338','notin':'\u2209','notindot':'\u22F5\u0338','notinE':'\u22F9\u0338','notinva':'\u2209','notinvb':'\u22F7','notinvc':'\u22F6','NotLeftTriangleBar':'\u29CF\u0338','NotLeftTriangle':'\u22EA','NotLeftTriangleEqual':'\u22EC','NotLess':'\u226E','NotLessEqual':'\u2270','NotLessGreater':'\u2278','NotLessLess':'\u226A\u0338','NotLessSlantEqual':'\u2A7D\u0338','NotLessTilde':'\u2274','NotNestedGreaterGreater':'\u2AA2\u0338','NotNestedLessLess':'\u2AA1\u0338','notni':'\u220C','notniva':'\u220C','notnivb':'\u22FE','notnivc':'\u22FD','NotPrecedes':'\u2280','NotPrecedesEqual':'\u2AAF\u0338','NotPrecedesSlantEqual':'\u22E0','NotReverseElement':'\u220C','NotRightTriangleBar':'\u29D0\u0338','NotRightTriangle':'\u22EB','NotRightTriangleEqual':'\u22ED','NotSquareSubset':'\u228F\u0338','NotSquareSubsetEqual':'\u22E2','NotSquareSuperset':'\u2290\u0338','NotSquareSupersetEqual':'\u22E3','NotSubset':'\u2282\u20D2','NotSubsetEqual':'\u2288','NotSucceeds':'\u2281','NotSucceedsEqual':'\u2AB0\u0338','NotSucceedsSlantEqual':'\u22E1','NotSucceedsTilde':'\u227F\u0338','NotSuperset':'\u2283\u20D2','NotSupersetEqual':'\u2289','NotTilde':'\u2241','NotTildeEqual':'\u2244','NotTildeFullEqual':'\u2247','NotTildeTilde':'\u2249','NotVerticalBar':'\u2224','nparallel':'\u2226','npar':'\u2226','nparsl':'\u2AFD\u20E5','npart':'\u2202\u0338','npolint':'\u2A14','npr':'\u2280','nprcue':'\u22E0','nprec':'\u2280','npreceq':'\u2AAF\u0338','npre':'\u2AAF\u0338','nrarrc':'\u2933\u0338','nrarr':'\u219B','nrArr':'\u21CF','nrarrw':'\u219D\u0338','nrightarrow':'\u219B','nRightarrow':'\u21CF','nrtri':'\u22EB','nrtrie':'\u22ED','nsc':'\u2281','nsccue':'\u22E1','nsce':'\u2AB0\u0338','Nscr':'\uD835\uDCA9','nscr':'\uD835\uDCC3','nshortmid':'\u2224','nshortparallel':'\u2226','nsim':'\u2241','nsime':'\u2244','nsimeq':'\u2244','nsmid':'\u2224','nspar':'\u2226','nsqsube':'\u22E2','nsqsupe':'\u22E3','nsub':'\u2284','nsubE':'\u2AC5\u0338','nsube':'\u2288','nsubset':'\u2282\u20D2','nsubseteq':'\u2288','nsubseteqq':'\u2AC5\u0338','nsucc':'\u2281','nsucceq':'\u2AB0\u0338','nsup':'\u2285','nsupE':'\u2AC6\u0338','nsupe':'\u2289','nsupset':'\u2283\u20D2','nsupseteq':'\u2289','nsupseteqq':'\u2AC6\u0338','ntgl':'\u2279','Ntilde':'\xD1','ntilde':'\xF1','ntlg':'\u2278','ntriangleleft':'\u22EA','ntrianglelefteq':'\u22EC','ntriangleright':'\u22EB','ntrianglerighteq':'\u22ED','Nu':'\u039D','nu':'\u03BD','num':'#','numero':'\u2116','numsp':'\u2007','nvap':'\u224D\u20D2','nvdash':'\u22AC','nvDash':'\u22AD','nVdash':'\u22AE','nVDash':'\u22AF','nvge':'\u2265\u20D2','nvgt':'>\u20D2','nvHarr':'\u2904','nvinfin':'\u29DE','nvlArr':'\u2902','nvle':'\u2264\u20D2','nvlt':'<\u20D2','nvltrie':'\u22B4\u20D2','nvrArr':'\u2903','nvrtrie':'\u22B5\u20D2','nvsim':'\u223C\u20D2','nwarhk':'\u2923','nwarr':'\u2196','nwArr':'\u21D6','nwarrow':'\u2196','nwnear':'\u2927','Oacute':'\xD3','oacute':'\xF3','oast':'\u229B','Ocirc':'\xD4','ocirc':'\xF4','ocir':'\u229A','Ocy':'\u041E','ocy':'\u043E','odash':'\u229D','Odblac':'\u0150','odblac':'\u0151','odiv':'\u2A38','odot':'\u2299','odsold':'\u29BC','OElig':'\u0152','oelig':'\u0153','ofcir':'\u29BF','Ofr':'\uD835\uDD12','ofr':'\uD835\uDD2C','ogon':'\u02DB','Ograve':'\xD2','ograve':'\xF2','ogt':'\u29C1','ohbar':'\u29B5','ohm':'\u03A9','oint':'\u222E','olarr':'\u21BA','olcir':'\u29BE','olcross':'\u29BB','oline':'\u203E','olt':'\u29C0','Omacr':'\u014C','omacr':'\u014D','Omega':'\u03A9','omega':'\u03C9','Omicron':'\u039F','omicron':'\u03BF','omid':'\u29B6','ominus':'\u2296','Oopf':'\uD835\uDD46','oopf':'\uD835\uDD60','opar':'\u29B7','OpenCurlyDoubleQuote':'\u201C','OpenCurlyQuote':'\u2018','operp':'\u29B9','oplus':'\u2295','orarr':'\u21BB','Or':'\u2A54','or':'\u2228','ord':'\u2A5D','order':'\u2134','orderof':'\u2134','ordf':'\xAA','ordm':'\xBA','origof':'\u22B6','oror':'\u2A56','orslope':'\u2A57','orv':'\u2A5B','oS':'\u24C8','Oscr':'\uD835\uDCAA','oscr':'\u2134','Oslash':'\xD8','oslash':'\xF8','osol':'\u2298','Otilde':'\xD5','otilde':'\xF5','otimesas':'\u2A36','Otimes':'\u2A37','otimes':'\u2297','Ouml':'\xD6','ouml':'\xF6','ovbar':'\u233D','OverBar':'\u203E','OverBrace':'\u23DE','OverBracket':'\u23B4','OverParenthesis':'\u23DC','para':'\xB6','parallel':'\u2225','par':'\u2225','parsim':'\u2AF3','parsl':'\u2AFD','part':'\u2202','PartialD':'\u2202','Pcy':'\u041F','pcy':'\u043F','percnt':'%','period':'.','permil':'\u2030','perp':'\u22A5','pertenk':'\u2031','Pfr':'\uD835\uDD13','pfr':'\uD835\uDD2D','Phi':'\u03A6','phi':'\u03C6','phiv':'\u03D5','phmmat':'\u2133','phone':'\u260E','Pi':'\u03A0','pi':'\u03C0','pitchfork':'\u22D4','piv':'\u03D6','planck':'\u210F','planckh':'\u210E','plankv':'\u210F','plusacir':'\u2A23','plusb':'\u229E','pluscir':'\u2A22','plus':'+','plusdo':'\u2214','plusdu':'\u2A25','pluse':'\u2A72','PlusMinus':'\xB1','plusmn':'\xB1','plussim':'\u2A26','plustwo':'\u2A27','pm':'\xB1','Poincareplane':'\u210C','pointint':'\u2A15','popf':'\uD835\uDD61','Popf':'\u2119','pound':'\xA3','prap':'\u2AB7','Pr':'\u2ABB','pr':'\u227A','prcue':'\u227C','precapprox':'\u2AB7','prec':'\u227A','preccurlyeq':'\u227C','Precedes':'\u227A','PrecedesEqual':'\u2AAF','PrecedesSlantEqual':'\u227C','PrecedesTilde':'\u227E','preceq':'\u2AAF','precnapprox':'\u2AB9','precneqq':'\u2AB5','precnsim':'\u22E8','pre':'\u2AAF','prE':'\u2AB3','precsim':'\u227E','prime':'\u2032','Prime':'\u2033','primes':'\u2119','prnap':'\u2AB9','prnE':'\u2AB5','prnsim':'\u22E8','prod':'\u220F','Product':'\u220F','profalar':'\u232E','profline':'\u2312','profsurf':'\u2313','prop':'\u221D','Proportional':'\u221D','Proportion':'\u2237','propto':'\u221D','prsim':'\u227E','prurel':'\u22B0','Pscr':'\uD835\uDCAB','pscr':'\uD835\uDCC5','Psi':'\u03A8','psi':'\u03C8','puncsp':'\u2008','Qfr':'\uD835\uDD14','qfr':'\uD835\uDD2E','qint':'\u2A0C','qopf':'\uD835\uDD62','Qopf':'\u211A','qprime':'\u2057','Qscr':'\uD835\uDCAC','qscr':'\uD835\uDCC6','quaternions':'\u210D','quatint':'\u2A16','quest':'?','questeq':'\u225F','quot':'"','QUOT':'"','rAarr':'\u21DB','race':'\u223D\u0331','Racute':'\u0154','racute':'\u0155','radic':'\u221A','raemptyv':'\u29B3','rang':'\u27E9','Rang':'\u27EB','rangd':'\u2992','range':'\u29A5','rangle':'\u27E9','raquo':'\xBB','rarrap':'\u2975','rarrb':'\u21E5','rarrbfs':'\u2920','rarrc':'\u2933','rarr':'\u2192','Rarr':'\u21A0','rArr':'\u21D2','rarrfs':'\u291E','rarrhk':'\u21AA','rarrlp':'\u21AC','rarrpl':'\u2945','rarrsim':'\u2974','Rarrtl':'\u2916','rarrtl':'\u21A3','rarrw':'\u219D','ratail':'\u291A','rAtail':'\u291C','ratio':'\u2236','rationals':'\u211A','rbarr':'\u290D','rBarr':'\u290F','RBarr':'\u2910','rbbrk':'\u2773','rbrace':'}','rbrack':']','rbrke':'\u298C','rbrksld':'\u298E','rbrkslu':'\u2990','Rcaron':'\u0158','rcaron':'\u0159','Rcedil':'\u0156','rcedil':'\u0157','rceil':'\u2309','rcub':'}','Rcy':'\u0420','rcy':'\u0440','rdca':'\u2937','rdldhar':'\u2969','rdquo':'\u201D','rdquor':'\u201D','rdsh':'\u21B3','real':'\u211C','realine':'\u211B','realpart':'\u211C','reals':'\u211D','Re':'\u211C','rect':'\u25AD','reg':'\xAE','REG':'\xAE','ReverseElement':'\u220B','ReverseEquilibrium':'\u21CB','ReverseUpEquilibrium':'\u296F','rfisht':'\u297D','rfloor':'\u230B','rfr':'\uD835\uDD2F','Rfr':'\u211C','rHar':'\u2964','rhard':'\u21C1','rharu':'\u21C0','rharul':'\u296C','Rho':'\u03A1','rho':'\u03C1','rhov':'\u03F1','RightAngleBracket':'\u27E9','RightArrowBar':'\u21E5','rightarrow':'\u2192','RightArrow':'\u2192','Rightarrow':'\u21D2','RightArrowLeftArrow':'\u21C4','rightarrowtail':'\u21A3','RightCeiling':'\u2309','RightDoubleBracket':'\u27E7','RightDownTeeVector':'\u295D','RightDownVectorBar':'\u2955','RightDownVector':'\u21C2','RightFloor':'\u230B','rightharpoondown':'\u21C1','rightharpoonup':'\u21C0','rightleftarrows':'\u21C4','rightleftharpoons':'\u21CC','rightrightarrows':'\u21C9','rightsquigarrow':'\u219D','RightTeeArrow':'\u21A6','RightTee':'\u22A2','RightTeeVector':'\u295B','rightthreetimes':'\u22CC','RightTriangleBar':'\u29D0','RightTriangle':'\u22B3','RightTriangleEqual':'\u22B5','RightUpDownVector':'\u294F','RightUpTeeVector':'\u295C','RightUpVectorBar':'\u2954','RightUpVector':'\u21BE','RightVectorBar':'\u2953','RightVector':'\u21C0','ring':'\u02DA','risingdotseq':'\u2253','rlarr':'\u21C4','rlhar':'\u21CC','rlm':'\u200F','rmoustache':'\u23B1','rmoust':'\u23B1','rnmid':'\u2AEE','roang':'\u27ED','roarr':'\u21FE','robrk':'\u27E7','ropar':'\u2986','ropf':'\uD835\uDD63','Ropf':'\u211D','roplus':'\u2A2E','rotimes':'\u2A35','RoundImplies':'\u2970','rpar':')','rpargt':'\u2994','rppolint':'\u2A12','rrarr':'\u21C9','Rrightarrow':'\u21DB','rsaquo':'\u203A','rscr':'\uD835\uDCC7','Rscr':'\u211B','rsh':'\u21B1','Rsh':'\u21B1','rsqb':']','rsquo':'\u2019','rsquor':'\u2019','rthree':'\u22CC','rtimes':'\u22CA','rtri':'\u25B9','rtrie':'\u22B5','rtrif':'\u25B8','rtriltri':'\u29CE','RuleDelayed':'\u29F4','ruluhar':'\u2968','rx':'\u211E','Sacute':'\u015A','sacute':'\u015B','sbquo':'\u201A','scap':'\u2AB8','Scaron':'\u0160','scaron':'\u0161','Sc':'\u2ABC','sc':'\u227B','sccue':'\u227D','sce':'\u2AB0','scE':'\u2AB4','Scedil':'\u015E','scedil':'\u015F','Scirc':'\u015C','scirc':'\u015D','scnap':'\u2ABA','scnE':'\u2AB6','scnsim':'\u22E9','scpolint':'\u2A13','scsim':'\u227F','Scy':'\u0421','scy':'\u0441','sdotb':'\u22A1','sdot':'\u22C5','sdote':'\u2A66','searhk':'\u2925','searr':'\u2198','seArr':'\u21D8','searrow':'\u2198','sect':'\xA7','semi':';','seswar':'\u2929','setminus':'\u2216','setmn':'\u2216','sext':'\u2736','Sfr':'\uD835\uDD16','sfr':'\uD835\uDD30','sfrown':'\u2322','sharp':'\u266F','SHCHcy':'\u0429','shchcy':'\u0449','SHcy':'\u0428','shcy':'\u0448','ShortDownArrow':'\u2193','ShortLeftArrow':'\u2190','shortmid':'\u2223','shortparallel':'\u2225','ShortRightArrow':'\u2192','ShortUpArrow':'\u2191','shy':'\xAD','Sigma':'\u03A3','sigma':'\u03C3','sigmaf':'\u03C2','sigmav':'\u03C2','sim':'\u223C','simdot':'\u2A6A','sime':'\u2243','simeq':'\u2243','simg':'\u2A9E','simgE':'\u2AA0','siml':'\u2A9D','simlE':'\u2A9F','simne':'\u2246','simplus':'\u2A24','simrarr':'\u2972','slarr':'\u2190','SmallCircle':'\u2218','smallsetminus':'\u2216','smashp':'\u2A33','smeparsl':'\u29E4','smid':'\u2223','smile':'\u2323','smt':'\u2AAA','smte':'\u2AAC','smtes':'\u2AAC\uFE00','SOFTcy':'\u042C','softcy':'\u044C','solbar':'\u233F','solb':'\u29C4','sol':'/','Sopf':'\uD835\uDD4A','sopf':'\uD835\uDD64','spades':'\u2660','spadesuit':'\u2660','spar':'\u2225','sqcap':'\u2293','sqcaps':'\u2293\uFE00','sqcup':'\u2294','sqcups':'\u2294\uFE00','Sqrt':'\u221A','sqsub':'\u228F','sqsube':'\u2291','sqsubset':'\u228F','sqsubseteq':'\u2291','sqsup':'\u2290','sqsupe':'\u2292','sqsupset':'\u2290','sqsupseteq':'\u2292','square':'\u25A1','Square':'\u25A1','SquareIntersection':'\u2293','SquareSubset':'\u228F','SquareSubsetEqual':'\u2291','SquareSuperset':'\u2290','SquareSupersetEqual':'\u2292','SquareUnion':'\u2294','squarf':'\u25AA','squ':'\u25A1','squf':'\u25AA','srarr':'\u2192','Sscr':'\uD835\uDCAE','sscr':'\uD835\uDCC8','ssetmn':'\u2216','ssmile':'\u2323','sstarf':'\u22C6','Star':'\u22C6','star':'\u2606','starf':'\u2605','straightepsilon':'\u03F5','straightphi':'\u03D5','strns':'\xAF','sub':'\u2282','Sub':'\u22D0','subdot':'\u2ABD','subE':'\u2AC5','sube':'\u2286','subedot':'\u2AC3','submult':'\u2AC1','subnE':'\u2ACB','subne':'\u228A','subplus':'\u2ABF','subrarr':'\u2979','subset':'\u2282','Subset':'\u22D0','subseteq':'\u2286','subseteqq':'\u2AC5','SubsetEqual':'\u2286','subsetneq':'\u228A','subsetneqq':'\u2ACB','subsim':'\u2AC7','subsub':'\u2AD5','subsup':'\u2AD3','succapprox':'\u2AB8','succ':'\u227B','succcurlyeq':'\u227D','Succeeds':'\u227B','SucceedsEqual':'\u2AB0','SucceedsSlantEqual':'\u227D','SucceedsTilde':'\u227F','succeq':'\u2AB0','succnapprox':'\u2ABA','succneqq':'\u2AB6','succnsim':'\u22E9','succsim':'\u227F','SuchThat':'\u220B','sum':'\u2211','Sum':'\u2211','sung':'\u266A','sup1':'\xB9','sup2':'\xB2','sup3':'\xB3','sup':'\u2283','Sup':'\u22D1','supdot':'\u2ABE','supdsub':'\u2AD8','supE':'\u2AC6','supe':'\u2287','supedot':'\u2AC4','Superset':'\u2283','SupersetEqual':'\u2287','suphsol':'\u27C9','suphsub':'\u2AD7','suplarr':'\u297B','supmult':'\u2AC2','supnE':'\u2ACC','supne':'\u228B','supplus':'\u2AC0','supset':'\u2283','Supset':'\u22D1','supseteq':'\u2287','supseteqq':'\u2AC6','supsetneq':'\u228B','supsetneqq':'\u2ACC','supsim':'\u2AC8','supsub':'\u2AD4','supsup':'\u2AD6','swarhk':'\u2926','swarr':'\u2199','swArr':'\u21D9','swarrow':'\u2199','swnwar':'\u292A','szlig':'\xDF','Tab':'\t','target':'\u2316','Tau':'\u03A4','tau':'\u03C4','tbrk':'\u23B4','Tcaron':'\u0164','tcaron':'\u0165','Tcedil':'\u0162','tcedil':'\u0163','Tcy':'\u0422','tcy':'\u0442','tdot':'\u20DB','telrec':'\u2315','Tfr':'\uD835\uDD17','tfr':'\uD835\uDD31','there4':'\u2234','therefore':'\u2234','Therefore':'\u2234','Theta':'\u0398','theta':'\u03B8','thetasym':'\u03D1','thetav':'\u03D1','thickapprox':'\u2248','thicksim':'\u223C','ThickSpace':'\u205F\u200A','ThinSpace':'\u2009','thinsp':'\u2009','thkap':'\u2248','thksim':'\u223C','THORN':'\xDE','thorn':'\xFE','tilde':'\u02DC','Tilde':'\u223C','TildeEqual':'\u2243','TildeFullEqual':'\u2245','TildeTilde':'\u2248','timesbar':'\u2A31','timesb':'\u22A0','times':'\xD7','timesd':'\u2A30','tint':'\u222D','toea':'\u2928','topbot':'\u2336','topcir':'\u2AF1','top':'\u22A4','Topf':'\uD835\uDD4B','topf':'\uD835\uDD65','topfork':'\u2ADA','tosa':'\u2929','tprime':'\u2034','trade':'\u2122','TRADE':'\u2122','triangle':'\u25B5','triangledown':'\u25BF','triangleleft':'\u25C3','trianglelefteq':'\u22B4','triangleq':'\u225C','triangleright':'\u25B9','trianglerighteq':'\u22B5','tridot':'\u25EC','trie':'\u225C','triminus':'\u2A3A','TripleDot':'\u20DB','triplus':'\u2A39','trisb':'\u29CD','tritime':'\u2A3B','trpezium':'\u23E2','Tscr':'\uD835\uDCAF','tscr':'\uD835\uDCC9','TScy':'\u0426','tscy':'\u0446','TSHcy':'\u040B','tshcy':'\u045B','Tstrok':'\u0166','tstrok':'\u0167','twixt':'\u226C','twoheadleftarrow':'\u219E','twoheadrightarrow':'\u21A0','Uacute':'\xDA','uacute':'\xFA','uarr':'\u2191','Uarr':'\u219F','uArr':'\u21D1','Uarrocir':'\u2949','Ubrcy':'\u040E','ubrcy':'\u045E','Ubreve':'\u016C','ubreve':'\u016D','Ucirc':'\xDB','ucirc':'\xFB','Ucy':'\u0423','ucy':'\u0443','udarr':'\u21C5','Udblac':'\u0170','udblac':'\u0171','udhar':'\u296E','ufisht':'\u297E','Ufr':'\uD835\uDD18','ufr':'\uD835\uDD32','Ugrave':'\xD9','ugrave':'\xF9','uHar':'\u2963','uharl':'\u21BF','uharr':'\u21BE','uhblk':'\u2580','ulcorn':'\u231C','ulcorner':'\u231C','ulcrop':'\u230F','ultri':'\u25F8','Umacr':'\u016A','umacr':'\u016B','uml':'\xA8','UnderBar':'_','UnderBrace':'\u23DF','UnderBracket':'\u23B5','UnderParenthesis':'\u23DD','Union':'\u22C3','UnionPlus':'\u228E','Uogon':'\u0172','uogon':'\u0173','Uopf':'\uD835\uDD4C','uopf':'\uD835\uDD66','UpArrowBar':'\u2912','uparrow':'\u2191','UpArrow':'\u2191','Uparrow':'\u21D1','UpArrowDownArrow':'\u21C5','updownarrow':'\u2195','UpDownArrow':'\u2195','Updownarrow':'\u21D5','UpEquilibrium':'\u296E','upharpoonleft':'\u21BF','upharpoonright':'\u21BE','uplus':'\u228E','UpperLeftArrow':'\u2196','UpperRightArrow':'\u2197','upsi':'\u03C5','Upsi':'\u03D2','upsih':'\u03D2','Upsilon':'\u03A5','upsilon':'\u03C5','UpTeeArrow':'\u21A5','UpTee':'\u22A5','upuparrows':'\u21C8','urcorn':'\u231D','urcorner':'\u231D','urcrop':'\u230E','Uring':'\u016E','uring':'\u016F','urtri':'\u25F9','Uscr':'\uD835\uDCB0','uscr':'\uD835\uDCCA','utdot':'\u22F0','Utilde':'\u0168','utilde':'\u0169','utri':'\u25B5','utrif':'\u25B4','uuarr':'\u21C8','Uuml':'\xDC','uuml':'\xFC','uwangle':'\u29A7','vangrt':'\u299C','varepsilon':'\u03F5','varkappa':'\u03F0','varnothing':'\u2205','varphi':'\u03D5','varpi':'\u03D6','varpropto':'\u221D','varr':'\u2195','vArr':'\u21D5','varrho':'\u03F1','varsigma':'\u03C2','varsubsetneq':'\u228A\uFE00','varsubsetneqq':'\u2ACB\uFE00','varsupsetneq':'\u228B\uFE00','varsupsetneqq':'\u2ACC\uFE00','vartheta':'\u03D1','vartriangleleft':'\u22B2','vartriangleright':'\u22B3','vBar':'\u2AE8','Vbar':'\u2AEB','vBarv':'\u2AE9','Vcy':'\u0412','vcy':'\u0432','vdash':'\u22A2','vDash':'\u22A8','Vdash':'\u22A9','VDash':'\u22AB','Vdashl':'\u2AE6','veebar':'\u22BB','vee':'\u2228','Vee':'\u22C1','veeeq':'\u225A','vellip':'\u22EE','verbar':'|','Verbar':'\u2016','vert':'|','Vert':'\u2016','VerticalBar':'\u2223','VerticalLine':'|','VerticalSeparator':'\u2758','VerticalTilde':'\u2240','VeryThinSpace':'\u200A','Vfr':'\uD835\uDD19','vfr':'\uD835\uDD33','vltri':'\u22B2','vnsub':'\u2282\u20D2','vnsup':'\u2283\u20D2','Vopf':'\uD835\uDD4D','vopf':'\uD835\uDD67','vprop':'\u221D','vrtri':'\u22B3','Vscr':'\uD835\uDCB1','vscr':'\uD835\uDCCB','vsubnE':'\u2ACB\uFE00','vsubne':'\u228A\uFE00','vsupnE':'\u2ACC\uFE00','vsupne':'\u228B\uFE00','Vvdash':'\u22AA','vzigzag':'\u299A','Wcirc':'\u0174','wcirc':'\u0175','wedbar':'\u2A5F','wedge':'\u2227','Wedge':'\u22C0','wedgeq':'\u2259','weierp':'\u2118','Wfr':'\uD835\uDD1A','wfr':'\uD835\uDD34','Wopf':'\uD835\uDD4E','wopf':'\uD835\uDD68','wp':'\u2118','wr':'\u2240','wreath':'\u2240','Wscr':'\uD835\uDCB2','wscr':'\uD835\uDCCC','xcap':'\u22C2','xcirc':'\u25EF','xcup':'\u22C3','xdtri':'\u25BD','Xfr':'\uD835\uDD1B','xfr':'\uD835\uDD35','xharr':'\u27F7','xhArr':'\u27FA','Xi':'\u039E','xi':'\u03BE','xlarr':'\u27F5','xlArr':'\u27F8','xmap':'\u27FC','xnis':'\u22FB','xodot':'\u2A00','Xopf':'\uD835\uDD4F','xopf':'\uD835\uDD69','xoplus':'\u2A01','xotime':'\u2A02','xrarr':'\u27F6','xrArr':'\u27F9','Xscr':'\uD835\uDCB3','xscr':'\uD835\uDCCD','xsqcup':'\u2A06','xuplus':'\u2A04','xutri':'\u25B3','xvee':'\u22C1','xwedge':'\u22C0','Yacute':'\xDD','yacute':'\xFD','YAcy':'\u042F','yacy':'\u044F','Ycirc':'\u0176','ycirc':'\u0177','Ycy':'\u042B','ycy':'\u044B','yen':'\xA5','Yfr':'\uD835\uDD1C','yfr':'\uD835\uDD36','YIcy':'\u0407','yicy':'\u0457','Yopf':'\uD835\uDD50','yopf':'\uD835\uDD6A','Yscr':'\uD835\uDCB4','yscr':'\uD835\uDCCE','YUcy':'\u042E','yucy':'\u044E','yuml':'\xFF','Yuml':'\u0178','Zacute':'\u0179','zacute':'\u017A','Zcaron':'\u017D','zcaron':'\u017E','Zcy':'\u0417','zcy':'\u0437','Zdot':'\u017B','zdot':'\u017C','zeetrf':'\u2128','ZeroWidthSpace':'\u200B','Zeta':'\u0396','zeta':'\u03B6','zfr':'\uD835\uDD37','Zfr':'\u2128','ZHcy':'\u0416','zhcy':'\u0436','zigrarr':'\u21DD','zopf':'\uD835\uDD6B','Zopf':'\u2124','Zscr':'\uD835\uDCB5','zscr':'\uD835\uDCCF','zwj':'\u200D','zwnj':'\u200C'};
	var decodeMapLegacy = {'Aacute':'\xC1','aacute':'\xE1','Acirc':'\xC2','acirc':'\xE2','acute':'\xB4','AElig':'\xC6','aelig':'\xE6','Agrave':'\xC0','agrave':'\xE0','amp':'&','AMP':'&','Aring':'\xC5','aring':'\xE5','Atilde':'\xC3','atilde':'\xE3','Auml':'\xC4','auml':'\xE4','brvbar':'\xA6','Ccedil':'\xC7','ccedil':'\xE7','cedil':'\xB8','cent':'\xA2','copy':'\xA9','COPY':'\xA9','curren':'\xA4','deg':'\xB0','divide':'\xF7','Eacute':'\xC9','eacute':'\xE9','Ecirc':'\xCA','ecirc':'\xEA','Egrave':'\xC8','egrave':'\xE8','ETH':'\xD0','eth':'\xF0','Euml':'\xCB','euml':'\xEB','frac12':'\xBD','frac14':'\xBC','frac34':'\xBE','gt':'>','GT':'>','Iacute':'\xCD','iacute':'\xED','Icirc':'\xCE','icirc':'\xEE','iexcl':'\xA1','Igrave':'\xCC','igrave':'\xEC','iquest':'\xBF','Iuml':'\xCF','iuml':'\xEF','laquo':'\xAB','lt':'<','LT':'<','macr':'\xAF','micro':'\xB5','middot':'\xB7','nbsp':'\xA0','not':'\xAC','Ntilde':'\xD1','ntilde':'\xF1','Oacute':'\xD3','oacute':'\xF3','Ocirc':'\xD4','ocirc':'\xF4','Ograve':'\xD2','ograve':'\xF2','ordf':'\xAA','ordm':'\xBA','Oslash':'\xD8','oslash':'\xF8','Otilde':'\xD5','otilde':'\xF5','Ouml':'\xD6','ouml':'\xF6','para':'\xB6','plusmn':'\xB1','pound':'\xA3','quot':'"','QUOT':'"','raquo':'\xBB','reg':'\xAE','REG':'\xAE','sect':'\xA7','shy':'\xAD','sup1':'\xB9','sup2':'\xB2','sup3':'\xB3','szlig':'\xDF','THORN':'\xDE','thorn':'\xFE','times':'\xD7','Uacute':'\xDA','uacute':'\xFA','Ucirc':'\xDB','ucirc':'\xFB','Ugrave':'\xD9','ugrave':'\xF9','uml':'\xA8','Uuml':'\xDC','uuml':'\xFC','Yacute':'\xDD','yacute':'\xFD','yen':'\xA5','yuml':'\xFF'};
	var decodeMapNumeric = {'0':'\uFFFD','128':'\u20AC','130':'\u201A','131':'\u0192','132':'\u201E','133':'\u2026','134':'\u2020','135':'\u2021','136':'\u02C6','137':'\u2030','138':'\u0160','139':'\u2039','140':'\u0152','142':'\u017D','145':'\u2018','146':'\u2019','147':'\u201C','148':'\u201D','149':'\u2022','150':'\u2013','151':'\u2014','152':'\u02DC','153':'\u2122','154':'\u0161','155':'\u203A','156':'\u0153','158':'\u017E','159':'\u0178'};
	var invalidReferenceCodePoints = [1,2,3,4,5,6,7,8,11,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,64976,64977,64978,64979,64980,64981,64982,64983,64984,64985,64986,64987,64988,64989,64990,64991,64992,64993,64994,64995,64996,64997,64998,64999,65000,65001,65002,65003,65004,65005,65006,65007,65534,65535,131070,131071,196606,196607,262142,262143,327678,327679,393214,393215,458750,458751,524286,524287,589822,589823,655358,655359,720894,720895,786430,786431,851966,851967,917502,917503,983038,983039,1048574,1048575,1114110,1114111];

	/*--------------------------------------------------------------------------*/

	var stringFromCharCode = String.fromCharCode;

	var object = {};
	var hasOwnProperty = object.hasOwnProperty;
	var has = function(object, propertyName) {
		return hasOwnProperty.call(object, propertyName);
	};

	var contains = function(array, value) {
		var index = -1;
		var length = array.length;
		while (++index < length) {
			if (array[index] == value) {
				return true;
			}
		}
		return false;
	};

	var merge = function(options, defaults) {
		if (!options) {
			return defaults;
		}
		var result = {};
		var key;
		for (key in defaults) {
			// A `hasOwnProperty` check is not needed here, since only recognized
			// option names are used anyway. Any others are ignored.
			result[key] = has(options, key) ? options[key] : defaults[key];
		}
		return result;
	};

	// Modified version of `ucs2encode`; see http://mths.be/punycode.
	var codePointToSymbol = function(codePoint, strict) {
		var output = '';
		if ((codePoint >= 0xD800 && codePoint <= 0xDFFF) || codePoint > 0x10FFFF) {
			// See issue #4:
			// “Otherwise, if the number is in the range 0xD800 to 0xDFFF or is
			// greater than 0x10FFFF, then this is a parse error. Return a U+FFFD
			// REPLACEMENT CHARACTER.”
			if (strict) {
				parseError('character reference outside the permissible Unicode range');
			}
			return '\uFFFD';
		}
		if (has(decodeMapNumeric, codePoint)) {
			if (strict) {
				parseError('disallowed character reference');
			}
			return decodeMapNumeric[codePoint];
		}
		if (strict && contains(invalidReferenceCodePoints, codePoint)) {
			parseError('disallowed character reference');
		}
		if (codePoint > 0xFFFF) {
			codePoint -= 0x10000;
			output += stringFromCharCode(codePoint >>> 10 & 0x3FF | 0xD800);
			codePoint = 0xDC00 | codePoint & 0x3FF;
		}
		output += stringFromCharCode(codePoint);
		return output;
	};

	var hexEscape = function(symbol) {
		return '&#x' + symbol.charCodeAt(0).toString(16).toUpperCase() + ';';
	};

	var parseError = function(message) {
		throw Error('Parse error: ' + message);
	};

	/*--------------------------------------------------------------------------*/

	var encode = function(string, options) {
		options = merge(options, encode.options);
		var strict = options.strict;
		if (strict && regexInvalidRawCodePoint.test(string)) {
			parseError('forbidden code point');
		}
		var encodeEverything = options.encodeEverything;
		var useNamedReferences = options.useNamedReferences;
		var allowUnsafeSymbols = options.allowUnsafeSymbols;
		if (encodeEverything) {
			// Encode ASCII symbols.
			string = string.replace(regexAsciiWhitelist, function(symbol) {
				// Use named references if requested & possible.
				if (useNamedReferences && has(encodeMap, symbol)) {
					return '&' + encodeMap[symbol] + ';';
				}
				return hexEscape(symbol);
			});
			// Shorten a few escapes that represent two symbols, of which at least one
			// is within the ASCII range.
			if (useNamedReferences) {
				string = string
					.replace(/&gt;\u20D2/g, '&nvgt;')
					.replace(/&lt;\u20D2/g, '&nvlt;')
					.replace(/&#x66;&#x6A;/g, '&fjlig;');
			}
			// Encode non-ASCII symbols.
			if (useNamedReferences) {
				// Encode non-ASCII symbols that can be replaced with a named reference.
				string = string.replace(regexEncodeNonAscii, function(string) {
					// Note: there is no need to check `has(encodeMap, string)` here.
					return '&' + encodeMap[string] + ';';
				});
			}
			// Note: any remaining non-ASCII symbols are handled outside of the `if`.
		} else if (useNamedReferences) {
			// Apply named character references.
			// Encode `<>"'&` using named character references.
			if (!allowUnsafeSymbols) {
				string = string.replace(regexEscape, function(string) {
					return '&' + encodeMap[string] + ';'; // no need to check `has()` here
				});
			}
			// Shorten escapes that represent two symbols, of which at least one is
			// `<>"'&`.
			string = string
				.replace(/&gt;\u20D2/g, '&nvgt;')
				.replace(/&lt;\u20D2/g, '&nvlt;');
			// Encode non-ASCII symbols that can be replaced with a named reference.
			string = string.replace(regexEncodeNonAscii, function(string) {
				// Note: there is no need to check `has(encodeMap, string)` here.
				return '&' + encodeMap[string] + ';';
			});
		} else if (!allowUnsafeSymbols) {
			// Encode `<>"'&` using hexadecimal escapes, now that they’re not handled
			// using named character references.
			string = string.replace(regexEscape, hexEscape);
		}
		return string
			// Encode astral symbols.
			.replace(regexAstralSymbols, function($0) {
				// https://mathiasbynens.be/notes/javascript-encoding#surrogate-formulae
				var high = $0.charCodeAt(0);
				var low = $0.charCodeAt(1);
				var codePoint = (high - 0xD800) * 0x400 + low - 0xDC00 + 0x10000;
				return '&#x' + codePoint.toString(16).toUpperCase() + ';';
			})
			// Encode any remaining BMP symbols that are not printable ASCII symbols
			// using a hexadecimal escape.
			.replace(regexBmpWhitelist, hexEscape);
	};
	// Expose default options (so they can be overridden globally).
	encode.options = {
		'allowUnsafeSymbols': false,
		'encodeEverything': false,
		'strict': false,
		'useNamedReferences': false
	};

	var decode = function(html, options) {
		options = merge(options, decode.options);
		var strict = options.strict;
		if (strict && regexInvalidEntity.test(html)) {
			parseError('malformed character reference');
		}
		return html.replace(regexDecode, function($0, $1, $2, $3, $4, $5, $6, $7) {
			var codePoint;
			var semicolon;
			var hexDigits;
			var reference;
			var next;
			if ($1) {
				// Decode decimal escapes, e.g. `&#119558;`.
				codePoint = $1;
				semicolon = $2;
				if (strict && !semicolon) {
					parseError('character reference was not terminated by a semicolon');
				}
				return codePointToSymbol(codePoint, strict);
			}
			if ($3) {
				// Decode hexadecimal escapes, e.g. `&#x1D306;`.
				hexDigits = $3;
				semicolon = $4;
				if (strict && !semicolon) {
					parseError('character reference was not terminated by a semicolon');
				}
				codePoint = parseInt(hexDigits, 16);
				return codePointToSymbol(codePoint, strict);
			}
			if ($5) {
				// Decode named character references with trailing `;`, e.g. `&copy;`.
				reference = $5;
				if (has(decodeMap, reference)) {
					return decodeMap[reference];
				} else {
					// Ambiguous ampersand; see http://mths.be/notes/ambiguous-ampersands.
					if (strict) {
						parseError(
							'named character reference was not terminated by a semicolon'
						);
					}
					return $0;
				}
			}
			// If we’re still here, it’s a legacy reference for sure. No need for an
			// extra `if` check.
			// Decode named character references without trailing `;`, e.g. `&amp`
			// This is only a parse error if it gets converted to `&`, or if it is
			// followed by `=` in an attribute context.
			reference = $6;
			next = $7;
			if (next && options.isAttributeValue) {
				if (strict && next == '=') {
					parseError('`&` did not start a character reference');
				}
				return $0;
			} else {
				if (strict) {
					parseError(
						'named character reference was not terminated by a semicolon'
					);
				}
				// Note: there is no need to check `has(decodeMapLegacy, reference)`.
				return decodeMapLegacy[reference] + (next || '');
			}
		});
	};
	// Expose default options (so they can be overridden globally).
	decode.options = {
		'isAttributeValue': false,
		'strict': false
	};

	var escape = function(string) {
		return string.replace(regexEscape, function($0) {
			// Note: there is no need to check `has(escapeMap, $0)` here.
			return escapeMap[$0];
		});
	};

	/*--------------------------------------------------------------------------*/

	var he = {
		'version': '0.5.0',
		'encode': encode,
		'decode': decode,
		'escape': escape,
		'unescape': decode
	};

	// Some AMD build optimizers, like r.js, check for specific condition patterns
	// like the following:
	if (
		typeof define == 'function' &&
		typeof define.amd == 'object' &&
		define.amd
	) {
		define(function() {
			return he;
		});
	}	else if (freeExports && !freeExports.nodeType) {
		if (freeModule) { // in Node.js or RingoJS v0.8.0+
			freeModule.exports = he;
		} else { // in Narwhal or RingoJS v0.7.0-
			for (var key in he) {
				has(he, key) && (freeExports[key] = he[key]);
			}
		}
	} else { // in Rhino or a web browser
		root.he = he;
	}

}(this));

}, {}],
15: [function(require, module, exports) {
/*!
 * repeat-string <https://github.com/jonschlinkert/repeat-string>
 *
 * Copyright (c) 2014-2015, Jon Schlinkert.
 * Licensed under the MIT License.
 */

'use strict';

/**
 * Expose `repeat`
 */

module.exports = repeat;

/**
 * Repeat the given `string` the specified `number`
 * of times.
 *
 * **Example:**
 *
 * ```js
 * var repeat = require('repeat-string');
 * repeat('A', 5);
 * //=> AAAAA
 * ```
 *
 * @param {String} `string` The string to repeat
 * @param {Number} `number` The number of times to repeat the string
 * @return {String} Repeated string
 * @api public
 */

function repeat(str, num) {
  if (typeof str !== 'string') {
    throw new TypeError('repeat-string expects a string.');
  }

  if (num === 1) return str;
  if (num === 2) return str + str;

  var max = str.length * num;
  if (cache !== str || typeof cache === 'undefined') {
    cache = str;
    res = '';
  }

  while (max > res.length && num > 0) {
    if (num & 1) {
      res += str;
    }

    num >>= 1;
    if (!num) break;
    str += str;
  }

  return res.substr(0, max);
}

/**
 * Results cache
 */

var res = '';
var cache;

}, {}],
11: [function(require, module, exports) {
/**
 * @author Titus Wormer
 * @copyright 2015 Titus Wormer. All rights reserved.
 * @module Utilities
 * @fileoverview Collection of tiny helpers useful for
 *   both parsing and compiling markdown.
 */

'use strict';

/*
 * Methods.
 */

var has = Object.prototype.hasOwnProperty;

/*
 * Expressions.
 */

var WHITE_SPACE_FINAL = /\s+$/;
var NEW_LINES_FINAL = /\n+$/;
var WHITE_SPACE_INITIAL = /^\s+/;
var EXPRESSION_LINE_BREAKS = /\r\n|\r/g;
var EXPRESSION_SYMBOL_FOR_NEW_LINE = /\u2424/g;
var WHITE_SPACE_COLLAPSABLE = /[ \t\n]+/g;
var EXPRESSION_BOM = /^\ufeff/;

/**
 * Shallow copy `context` into `target`.
 *
 * @example
 *   var target = {};
 *   copy(target, {foo: 'bar'}); // target
 *
 * @param {Object} target - Object to copy into.
 * @param {Object} context - Object to copy from.
 * @return {Object} - `target`.
 */
function copy(target, context) {
    var key;

    for (key in context) {
        if (has.call(context, key)) {
            target[key] = context[key];
        }
    }

    return target;
}

/**
 * Shallow clone `context`.
 *
 * @example
 *   clone({foo: 'bar'}) // {foo: 'bar'}
 *   clone(['foo', 'bar']) // ['foo', 'bar']
 *
 * @return {Object|Array} context - Object to clone.
 * @return {Object|Array} - Shallow clone of `context`.
 */
function clone(context) {
    if ('concat' in context) {
        return context.concat();
    }

    return copy({}, context);
}

/**
 * Throw an exception with in its `message` `value`
 * and `name`.
 *
 * @param {*} value - Invalid value.
 * @param {string} name - Setting name.
 */
function raise(value, name) {
    throw new Error('Invalid value `' + value + '` ' + 'for setting `' + name + '`');
}

/**
 * Validate a value to be boolean. Defaults to `def`.
 * Raises an exception with `context[name]` when not
 * a boolean.
 *
 * @example
 *   validateBoolean({foo: null}, 'foo', true) // true
 *   validateBoolean({foo: false}, 'foo', true) // false
 *   validateBoolean({foo: 'bar'}, 'foo', true) // Throws
 *
 * @throws {Error} - When a setting is neither omitted nor
 *   a boolean.
 * @param {Object} context - Settings.
 * @param {string} name - Setting name.
 * @param {boolean} def - Default value.
 */
function validateBoolean(context, name, def) {
    var value = context[name];

    if (value === null || value === undefined) {
        value = def;
    }

    if (typeof value !== 'boolean') {
        raise(value, 'options.' + name);
    }

    context[name] = value;
}

/**
 * Validate a value to be boolean. Defaults to `def`.
 * Raises an exception with `context[name]` when not
 * a boolean.
 *
 * @example
 *   validateNumber({foo: null}, 'foo', 1) // 1
 *   validateNumber({foo: 2}, 'foo', 1) // 2
 *   validateNumber({foo: 'bar'}, 'foo', 1) // Throws
 *
 * @throws {Error} - When a setting is neither omitted nor
 *   a number.
 * @param {Object} context - Settings.
 * @param {string} name - Setting name.
 * @param {number} def - Default value.
 */
function validateNumber(context, name, def) {
    var value = context[name];

    if (value === null || value === undefined) {
        value = def;
    }

    if (typeof value !== 'number' || value !== value) {
        raise(value, 'options.' + name);
    }

    context[name] = value;
}

/**
 * Validate a value to be in `map`. Defaults to `def`.
 * Raises an exception with `context[name]` when not
 * not in `map`.
 *
 * @example
 *   var map = {bar: true, baz: true};
 *   validateString({foo: null}, 'foo', 'bar', map) // 'bar'
 *   validateString({foo: 'baz'}, 'foo', 'bar', map) // 'baz'
 *   validateString({foo: true}, 'foo', 'bar', map) // Throws
 *
 * @throws {Error} - When a setting is neither omitted nor
 *   in `map`.
 * @param {Object} context - Settings.
 * @param {string} name - Setting name.
 * @param {string} def - Default value.
 * @param {Object} map - Enum.
 */
function validateString(context, name, def, map) {
    var value = context[name];

    if (value === null || value === undefined) {
        value = def;
    }

    if (!(value in map)) {
        raise(value, 'options.' + name);
    }

    context[name] = value;
}

/**
 * Remove final white space from `value`.
 *
 * @example
 *   trimRight('foo '); // 'foo'
 *
 * @param {string} value - Content to trim.
 * @return {string} - Trimmed content.
 */
function trimRight(value) {
    return String(value).replace(WHITE_SPACE_FINAL, '');
}

/**
 * Remove final new line characters from `value`.
 *
 * @example
 *   trimRightLines('foo\n\n'); // 'foo'
 *
 * @param {string} value - Content to trim.
 * @return {string} - Trimmed content.
 */
function trimRightLines(value) {
    return String(value).replace(NEW_LINES_FINAL, '');
}

/**
 * Remove initial white space from `value`.
 *
 * @example
 *   trimLeft(' foo'); // 'foo'
 *
 * @param {string} value - Content to trim.
 * @return {string} - Trimmed content.
 */
function trimLeft(value) {
    return String(value).replace(WHITE_SPACE_INITIAL, '');
}

/**
 * Remove initial and final white space from `value`.
 *
 * @example
 *   trim(' foo '); // 'foo'
 *
 * @param {string} value - Content to trim.
 * @return {string} - Trimmed content.
 */
function trim(value) {
    return trimLeft(trimRight(value));
}

/**
 * Collapse white space.
 *
 * @example
 *   collapse('foo\t bar'); // 'foo bar'
 *
 * @param {string} value - Content to collapse.
 * @return {string} - Collapsed content.
 */
function collapse(value) {
    return String(value).replace(WHITE_SPACE_COLLAPSABLE, ' ');
}

/**
 * Clean a string in preperation of parsing.
 *
 * @example
 *   clean('\ufefffoo'); // 'foo'
 *   clean('foo\r\nbar'); // 'foo\nbar'
 *   clean('foo\u2424bar'); // 'foo\nbar'
 *
 * @param {string} value - Content to clean.
 * @return {string} - Cleaned content.
 */
function clean(value) {
    return String(value).replace(EXPRESSION_BOM, '').replace(EXPRESSION_LINE_BREAKS, '\n').replace(EXPRESSION_SYMBOL_FOR_NEW_LINE, '\n');
}

/**
 * Normalize an identifier.  Collapses multiple white space
 * characters into a single space, and removes casing.
 *
 * @example
 *   normalizeIdentifier('FOO\t bar'); // 'foo bar'
 *
 * @param {string} value - Content to normalize.
 * @return {string} - Normalized content.
 */
function normalizeIdentifier(value) {
    return collapse(value).toLowerCase();
}

/**
 * Count how many characters `character` occur in `value`.
 *
 * @example
 *   countCharacter('foo(bar(baz)', '(') // 2
 *   countCharacter('foo(bar(baz)', ')') // 1
 *
 * @param {string} value - Content to search in.
 * @param {string} character - Character to search for.
 * @return {number} - Count.
 */
function countCharacter(value, character) {
    var index = -1;
    var length = value.length;
    var count = 0;

    while (++index < length) {
        if (value.charAt(index) === character) {
            count++;
        }
    }

    return count;
}

/**
 * Create an empty object.
 *
 * @example
 *   objectObject(); // Same as `{}`.
 *
 * @return {Object}
 */
function objectObject() {
    return {};
}

/*
 * Break coverage.
 */

objectObject();

/**
 * Create an object without prototype.
 *
 * @example
 *   objectNull(); // New object without prototype.
 *
 * @return {Object}
 */
function objectNull() {
    return Object.create(null);
}

/*
 * Expose `validate`.
 */

exports.validate = {
    'boolean': validateBoolean,
    'string': validateString,
    'number': validateNumber
};

/*
 * Expose.
 */

exports.trim = trim;
exports.trimLeft = trimLeft;
exports.trimRight = trimRight;
exports.trimRightLines = trimRightLines;
exports.collapse = collapse;
exports.normalizeIdentifier = normalizeIdentifier;
exports.clean = clean;
exports.raise = raise;
exports.copy = copy;
exports.clone = clone;
exports.countCharacter = countCharacter;

/* istanbul ignore else */
if ('create' in Object) {
    exports.create = objectNull;
} else {
    exports.create = objectObject;
}
}, {}],
16: [function(require, module, exports) {
/* This file is generated by `script/build-expressions.js` */
'use strict';

module.exports = {
  'rules': {
    'newline': /^\n([ \t]*\n)*/,
    'code': /^((?: {4}|\t)[^\n]*\n?([ \t]*\n)*)+/,
    'horizontalRule': /^[ \t]*([-*_])( *\1){2,} *(?=\n|$)/,
    'heading': /^([ \t]*)(#{1,6})(?:([ \t]+)([^\n]+?))??(?:[ \t]+#+)?[ \t]*(?=\n|$)/,
    'lineHeading': /^(\ {0,3})([^\n]+?)[ \t]*\n\ {0,3}(=|-){1,}[ \t]*(?=\n|$)/,
    'definition': /^[ \t]*\[((?:[^\\](?:\\|\\(?:\\{2})+)\]|[^\]])+)\]:[ \t\n]*(<[^>\[\]]+>|[^\s\[\]]+)(?:[ \t\n]+['"(]((?:[^\n]|\n(?!\n))*?)['")])?[ \t]*(?=\n|$)/,
    'bullet': /(?:[*+-]|\d+\.)/,
    'indent': /^([ \t]*)((?:[*+-]|\d+\.))( {1,4}(?! )| |\t)/,
    'item': /([ \t]*)((?:[*+-]|\d+\.))( {1,4}(?! )| |\t)[^\n]*(?:\n(?!\1(?:[*+-]|\d+\.)[ \t])[^\n]*)*/gm,
    'list': /^([ \t]*)((?:[*+-]|\d+\.))[ \t][\s\S]+?(?:(?=\n+\1?(?:[-*_][ \t]*){3,}(?:\n|$))|(?=\n+[ \t]*\[((?:[^\\](?:\\|\\(?:\\{2})+)\]|[^\]])+)\]:[ \t\n]*(<[^>\[\]]+>|[^\s\[\]]+)(?:[ \t\n]+['"(]((?:[^\n]|\n(?!\n))*?)['")])?[ \t]*(?=\n|$))|\n{2,}(?![ \t])(?!\1(?:[*+-]|\d+\.)[ \t])|$)/,
    'blockquote': /^(?=[ \t]*>)(?:(?:(?:[ \t]*>[^\n]*\n)*(?:[ \t]*>[^\n]+(?=\n|$))|(?![ \t]*>)(?![ \t]*\[((?:[^\\](?:\\|\\(?:\\{2})+)\]|[^\]])+)\]:[ \t\n]*(<[^>\[\]]+>|[^\s\[\]]+)(?:[ \t\n]+['"(]((?:[^\n]|\n(?!\n))*?)['")])?[ \t]*(?=\n|$))[^\n]+)(?:\n|$))*(?:[ \t]*>[ \t]*(?:\n[ \t]*>[ \t]*)*)?/,
    'html': /^[ \t]*(?:<!--[\s\S]*?-->[ \t]*(?:\n|\s*$)|<((?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\b)(?!mailto:)\w+(?!:\/|[^\w\s@]*@)\b)[\s\S]+?<\/\1>[ \t]*(?:\n{2,}|\s*$)|<(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\b)(?!mailto:)\w+(?!:\/|[^\w\s@]*@)\b(?:"[^"]*"|'[^']*'|[^'">])*?>[ \t]*(?:\n{2,}|\s*$))/i,
    'paragraph': /^(?:(?:[^\n]+\n?(?![ \t]*([-*_])( *\1){2,} *(?=\n|$)|([ \t]*)(#{1,6})(?:([ \t]+)([^\n]+?))??(?:[ \t]+#+)?[ \t]*(?=\n|$)|(\ {0,3})([^\n]+?)[ \t]*\n\ {0,3}(=|-){1,}[ \t]*(?=\n|$)|[ \t]*\[((?:[^\\](?:\\|\\(?:\\{2})+)\]|[^\]])+)\]:[ \t\n]*(<[^>\[\]]+>|[^\s\[\]]+)(?:[ \t\n]+['"(]((?:[^\n]|\n(?!\n))*?)['")])?[ \t]*(?=\n|$)|(?=[ \t]*>)(?:(?:(?:[ \t]*>[^\n]*\n)*(?:[ \t]*>[^\n]+(?=\n|$))|(?![ \t]*>)(?![ \t]*\[((?:[^\\](?:\\|\\(?:\\{2})+)\]|[^\]])+)\]:[ \t\n]*(<[^>\[\]]+>|[^\s\[\]]+)(?:[ \t\n]+['"(]((?:[^\n]|\n(?!\n))*?)['")])?[ \t]*(?=\n|$))[^\n]+)(?:\n|$))*(?:[ \t]*>[ \t]*(?:\n[ \t]*>[ \t]*)*)?|<(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\b)(?!mailto:)\w+(?!:\/|[^\w\s@]*@)\b))+)/,
    'escape': /^\\([\\`*{}\[\]()#+\-.!_>])/,
    'autoLink': /^<([^ >]+(@|:\/)[^ >]+)>/,
    'tag': /^<!--[\s\S]*?-->|^<\/?\w+(?:"[^"]*"|'[^']*'|[^'">])*?>/,
    'strong': /^(_)_([\s\S]+?)__(?!_)|^(\*)\*([\s\S]+?)\*\*(?!\*)/,
    'emphasis': /^\b(_)((?:__|[\s\S])+?)_\b|^(\*)((?:\*\*|[\s\S])+?)\*(?!\*)/,
    'inlineCode': /^(`+)((?!`)[\s\S]*?(?:`\s+|[^`]))?(\1)(?!`)/,
    'break': /^ {2,}\n(?!\s*$)/,
    'inlineText': /^[\s\S]+?(?=[\\<!\[_*`]| {2,}\n|$)/,
    'link': /^(!?\[)((?:\[[^\]]*\]|[^\[\]]|\](?=[^\[]*\]))*)\]\(\s*(?:(?!<)((?:\((?:\\[\s\S]|[^\)])*?\)|\\[\s\S]|[\s\S])*?)|<([\s\S]*?)>)(?:\s+['"]([\s\S]*?)['"])?\s*\)/,
    'shortcutReference': /^(!?\[)((?:\\[\s\S]|[^\[\]])+?)\]/,
    'reference': /^(!?\[)((?:\[[^\]]*\]|[^\[\]]|\](?=[^\[]*\]))*)\]\s*\[((?:\\[\s\S]|[^\[\]])*)\]/
  },
  'gfm': {
    'fences': /^( *)(([`~])\3{2,})[ \t]*([^\n`~]+)?[ \t]*(?:\n([\s\S]*?))??(?:\n\ {0,3}\2\3*[ \t]*(?=\n|$)|$)/,
    'paragraph': /^(?:(?:[^\n]+\n?(?![ \t]*([-*_])( *\1){2,} *(?=\n|$)|( *)(([`~])\5{2,})[ \t]*([^\n`~]+)?[ \t]*(?:\n([\s\S]*?))??(?:\n\ {0,3}\4\5*[ \t]*(?=\n|$)|$)|([ \t]*)((?:[*+-]|\d+\.))[ \t][\s\S]+?(?:(?=\n+\8?(?:[-*_][ \t]*){3,}(?:\n|$))|(?=\n+[ \t]*\[((?:[^\\](?:\\|\\(?:\\{2})+)\]|[^\]])+)\]:[ \t\n]*(<[^>\[\]]+>|[^\s\[\]]+)(?:[ \t\n]+['"(]((?:[^\n]|\n(?!\n))*?)['")])?[ \t]*(?=\n|$))|\n{2,}(?![ \t])(?!\8(?:[*+-]|\d+\.)[ \t])|$)|([ \t]*)(#{1,6})(?:([ \t]+)([^\n]+?))??(?:[ \t]+#+)?[ \t]*(?=\n|$)|(\ {0,3})([^\n]+?)[ \t]*\n\ {0,3}(=|-){1,}[ \t]*(?=\n|$)|[ \t]*\[((?:[^\\](?:\\|\\(?:\\{2})+)\]|[^\]])+)\]:[ \t\n]*(<[^>\[\]]+>|[^\s\[\]]+)(?:[ \t\n]+['"(]((?:[^\n]|\n(?!\n))*?)['")])?[ \t]*(?=\n|$)|(?=[ \t]*>)(?:(?:(?:[ \t]*>[^\n]*\n)*(?:[ \t]*>[^\n]+(?=\n|$))|(?![ \t]*>)(?![ \t]*\[((?:[^\\](?:\\|\\(?:\\{2})+)\]|[^\]])+)\]:[ \t\n]*(<[^>\[\]]+>|[^\s\[\]]+)(?:[ \t\n]+['"(]((?:[^\n]|\n(?!\n))*?)['")])?[ \t]*(?=\n|$))[^\n]+)(?:\n|$))*(?:[ \t]*>[ \t]*(?:\n[ \t]*>[ \t]*)*)?|<(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\b)(?!mailto:)\w+(?!:\/|[^\w\s@]*@)\b))+)/,
    'table': /^( *\|(.+))\n( *\|( *[-:]+[-| :]*)\n)((?: *\|.*(?:\n|$))*)/,
    'looseTable': /^( *(\S.*\|.*))\n( *([-:]+ *\|[-| :]*)\n)((?:.*\|.*(?:\n|$))*)/,
    'escape': /^\\([\\`*{}\[\]()#+\-.!_>~|])/,
    'url': /^https?:\/\/[^\s<]+[^<.,:;"')\]\s]/,
    'deletion': /^~~(?=\S)([\s\S]*?\S)~~/,
    'inlineText': /^[\s\S]+?(?=[\\<!\[_*`~]|https?:\/\/| {2,}\n|$)/
  },
  'footnotes': {
    'footnoteDefinition': /^( *\[\^([^\]]+)\]: *)([^\n]+(\n+ +[^\n]+)*)/
  },
  'yaml': {
    'yamlFrontMatter': /^-{3}\n([\s\S]+?\n)?-{3}/
  },
  'pedantic': {
    'heading': /^([ \t]*)(#{1,6})([ \t]*)([^\n]*?)[ \t]*#*[ \t]*(?=\n|$)/,
    'strong': /^(_)_(?=\S)([\s\S]*?\S)__(?!_)|^(\*)\*(?=\S)([\s\S]*?\S)\*\*(?!\*)/,
    'emphasis': /^(_)(?=\S)([\s\S]*?\S)_(?!_)|^(\*)(?=\S)([\s\S]*?\S)\*(?!\*)/
  },
  'commonmark': {
    'list': /^([ \t]*)((?:[*+-]|\d+[\.\)]))[ \t][\s\S]+?(?:(?=\n+\1?(?:[-*_][ \t]*){3,}(?:\n|$))|(?=\n+[ \t]*\[((?:[^\\](?:\\|\\(?:\\{2})+)\]|[^\]])+)\]:[ \t\n]*(<[^>\[\]]+>|[^\s\[\]]+)(?:[ \t\n]+['"(]((?:[^\n]|\n(?!\n))*?)['")])?[ \t]*(?=\n|$))|\n{2,}(?![ \t])(?!\1(?:[*+-]|\d+[\.\)])[ \t])|$)/,
    'item': /([ \t]*)((?:[*+-]|\d+[\.\)]))( {1,4}(?! )| |\t)[^\n]*(?:\n(?!\1(?:[*+-]|\d+[\.\)])[ \t])[^\n]*)*/gm,
    'bullet': /(?:[*+-]|\d+[\.\)])/,
    'indent': /^([ \t]*)((?:[*+-]|\d+[\.\)]))( {1,4}(?! )| |\t)/,
    'link': /^(!?\[)((?:(?:\[(?:\[(?:\\[\s\S]|[^\[\]])*?\]|\\[\s\S]|[^\[\]])*?\])|\\[\s\S]|[^\[\]])*?)\]\(\s*(?:(?!<)((?:\((?:\\[\s\S]|[^\(\)\s])*?\)|\\[\s\S]|[^\(\)\s])*?)|<([^\n]*?)>)(?:\s+(?:\'((?:\\[\s\S]|[^\'])*?)\'|"((?:\\[\s\S]|[^"])*?)"|\(((?:\\[\s\S]|[^\)])*?)\)))?\s*\)/,
    'reference': /^(!?\[)((?:(?:\[(?:\[(?:\\[\s\S]|[^\[\]])*?\]|\\[\s\S]|[^\[\]])*?\])|\\[\s\S]|[^\[\]])*?)\]\s*\[((?:\\[\s\S]|[^\[\]])*)\]/,
    'paragraph': /^(?:(?:[^\n]+\n?(?!\ {0,3}([-*_])( *\1){2,} *(?=\n|$)|(\ {0,3})(#{1,6})(?:([ \t]+)([^\n]+?))??(?:[ \t]+#+)?\ {0,3}(?=\n|$)|(?=\ {0,3}>)(?:(?:(?:\ {0,3}>[^\n]*\n)*(?:\ {0,3}>[^\n]+(?=\n|$))|(?!\ {0,3}>)(?!\ {0,3}\[((?:[^\\](?:\\|\\(?:\\{2})+)\]|[^\]])+)\]:[ \t\n]*(<[^>\[\]]+>|[^\s\[\]]+)(?:[ \t\n]+['"(]((?:[^\n]|\n(?!\n))*?)['")])?\ {0,3}(?=\n|$))[^\n]+)(?:\n|$))*(?:\ {0,3}>\ {0,3}(?:\n\ {0,3}>\ {0,3})*)?|<(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\b)(?!mailto:)\w+(?!:\/|[^\w\s@]*@)\b))+)/,
    'blockquote': /^(?=[ \t]*>)(?:(?:(?:[ \t]*>[^\n]*\n)*(?:[ \t]*>[^\n]+(?=\n|$))|(?![ \t]*>)(?![ \t]*([-*_])( *\1){2,} *(?=\n|$)|([ \t]*)((?:[*+-]|\d+\.))[ \t][\s\S]+?(?:(?=\n+\3?(?:[-*_][ \t]*){3,}(?:\n|$))|(?=\n+[ \t]*\[((?:[^\\](?:\\|\\(?:\\{2})+)\]|[^\]])+)\]:[ \t\n]*(<[^>\[\]]+>|[^\s\[\]]+)(?:[ \t\n]+['"(]((?:[^\n]|\n(?!\n))*?)['")])?[ \t]*(?=\n|$))|\n{2,}(?![ \t])(?!\3(?:[*+-]|\d+\.)[ \t])|$)|( *)(([`~])\10{2,})[ \t]*([^\n`~]+)?[ \t]*(?:\n([\s\S]*?))??(?:\n\ {0,3}\9\10*[ \t]*(?=\n|$)|$)|((?: {4}|\t)[^\n]*\n?([ \t]*\n)*)+|[ \t]*\[((?:[^\\](?:\\|\\(?:\\{2})+)\]|[^\]])+)\]:[ \t\n]*(<[^>\[\]]+>|[^\s\[\]]+)(?:[ \t\n]+['"(]((?:[^\n]|\n(?!\n))*?)['")])?[ \t]*(?=\n|$))[^\n]+)(?:\n|$))*(?:[ \t]*>[ \t]*(?:\n[ \t]*>[ \t]*)*)?/,
    'escape': /^\\(\n|[\\`*{}\[\]()#+\-.!_>"$%&',\/:;<=?@^~|])/
  },
  'commonmarkGFM': {
    'paragraph': /^(?:(?:[^\n]+\n?(?!\ {0,3}([-*_])( *\1){2,} *(?=\n|$)|( *)(([`~])\5{2,})\ {0,3}([^\n`~]+)?\ {0,3}(?:\n([\s\S]*?))??(?:\n\ {0,3}\4\5*\ {0,3}(?=\n|$)|$)|(\ {0,3})((?:[*+-]|\d+\.))[ \t][\s\S]+?(?:(?=\n+\8?(?:[-*_]\ {0,3}){3,}(?:\n|$))|(?=\n+\ {0,3}\[((?:[^\\](?:\\|\\(?:\\{2})+)\]|[^\]])+)\]:[ \t\n]*(<[^>\[\]]+>|[^\s\[\]]+)(?:[ \t\n]+['"(]((?:[^\n]|\n(?!\n))*?)['")])?\ {0,3}(?=\n|$))|\n{2,}(?![ \t])(?!\8(?:[*+-]|\d+\.)[ \t])|$)|(\ {0,3})(#{1,6})(?:([ \t]+)([^\n]+?))??(?:[ \t]+#+)?\ {0,3}(?=\n|$)|(?=\ {0,3}>)(?:(?:(?:\ {0,3}>[^\n]*\n)*(?:\ {0,3}>[^\n]+(?=\n|$))|(?!\ {0,3}>)(?!\ {0,3}\[((?:[^\\](?:\\|\\(?:\\{2})+)\]|[^\]])+)\]:[ \t\n]*(<[^>\[\]]+>|[^\s\[\]]+)(?:[ \t\n]+['"(]((?:[^\n]|\n(?!\n))*?)['")])?\ {0,3}(?=\n|$))[^\n]+)(?:\n|$))*(?:\ {0,3}>\ {0,3}(?:\n\ {0,3}>\ {0,3})*)?|<(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\b)(?!mailto:)\w+(?!:\/|[^\w\s@]*@)\b))+)/
  },
  'breaks': {
    'break': /^ *\n(?!\s*$)/,
    'inlineText': /^[\s\S]+?(?=[\\<!\[_*`]| *\n|$)/
  },
  'breaksGFM': {
    'inlineText': /^[\s\S]+?(?=[\\<!\[_*`~]|https?:\/\/| *\n|$)/
  }
};
}, {}],
17: [function(require, module, exports) {
/**
 * @author Titus Wormer
 * @copyright 2015 Titus Wormer. All rights reserved.
 * @module Defaults
 * @fileoverview Default values for parse and
 *  stringification settings.
 */

'use strict';

/*
 * Note that `stringify.entities` is a string.
 */

module.exports = {
    'parse': {
        'gfm': true,
        'yaml': true,
        'commonmark': false,
        'footnotes': false,
        'pedantic': false,
        'breaks': false
    },
    'stringify': {
        'entities': 'false',
        'setext': false,
        'closeAtx': false,
        'looseTable': false,
        'spacedTable': true,
        'incrementListMarker': true,
        'fences': false,
        'fence': '`',
        'bullet': '-',
        'rule': '*',
        'ruleSpaces': true,
        'ruleRepetition': 3,
        'strong': '*',
        'emphasis': '_'
    }
};
}, {}],
9: [function(require, module, exports) {
/**
 * @author Titus Wormer
 * @copyright 2015 Titus Wormer. All rights reserved.
 * @module Stringify
 * @fileoverview Compile a an abstract syntax tree into
 *   a markdown document.
 */

'use strict';

/*
 * Dependencies.
 */

var he = require('he');
var table = require('markdown-table');
var repeat = require('repeat-string');
var utilities = require('./utilities.js');
var defaultOptions = require('./defaults.js').stringify;

/*
 * Methods.
 */

var clone = utilities.clone;
var raise = utilities.raise;
var validate = utilities.validate;
var count = utilities.countCharacter;
var objectCreate = utilities.create;

/*
 * Constants.
 */

var HALF = 2;
var INDENT = 4;
var MINIMUM_CODE_FENCE_LENGTH = 3;
var YAML_FENCE_LENGTH = 3;
var MINIMUM_RULE_LENGTH = 3;
var MAILTO = 'mailto:';

/*
 * Expressions.
 */

var EXPRESSIONS_WHITE_SPACE = /\s/;

/*
 * Expression for a protocol.
 *
 * @see http://en.wikipedia.org/wiki/URI_scheme#Generic_syntax
 */

var PROTOCOL = /^[a-z][a-z+.-]+:\/?/i;

/*
 * Characters.
 */

var ANGLE_BRACKET_CLOSE = '>';
var ANGLE_BRACKET_OPEN = '<';
var ASTERISK = '*';
var CARET = '^';
var COLON = ':';
var DASH = '-';
var DOT = '.';
var EMPTY = '';
var EQUALS = '=';
var EXCLAMATION_MARK = '!';
var HASH = '#';
var LINE = '\n';
var PARENTHESIS_OPEN = '(';
var PARENTHESIS_CLOSE = ')';
var PIPE = '|';
var PLUS = '+';
var QUOTE_DOUBLE = '"';
var QUOTE_SINGLE = '\'';
var SPACE = ' ';
var SQUARE_BRACKET_OPEN = '[';
var SQUARE_BRACKET_CLOSE = ']';
var TICK = '`';
var TILDE = '~';
var UNDERSCORE = '_';

/*
 * Character combinations.
 */

var BREAK = LINE + LINE;
var GAP = BREAK + LINE;
var DOUBLE_TILDE = TILDE + TILDE;

/*
 * Allowed entity options.
 */

var ENTITY_OPTIONS = objectCreate();

ENTITY_OPTIONS['true'] = true;
ENTITY_OPTIONS['false'] = true;
ENTITY_OPTIONS.numbers = true;

/*
 * Allowed list-bullet characters.
 */

var LIST_BULLETS = objectCreate();

LIST_BULLETS[ASTERISK] = true;
LIST_BULLETS[DASH] = true;
LIST_BULLETS[PLUS] = true;

/*
 * Allowed horizontal-rule bullet characters.
 */

var HORIZONTAL_RULE_BULLETS = objectCreate();

HORIZONTAL_RULE_BULLETS[ASTERISK] = true;
HORIZONTAL_RULE_BULLETS[DASH] = true;
HORIZONTAL_RULE_BULLETS[UNDERSCORE] = true;

/*
 * Allowed emphasis characters.
 */

var EMPHASIS_MARKERS = objectCreate();

EMPHASIS_MARKERS[UNDERSCORE] = true;
EMPHASIS_MARKERS[ASTERISK] = true;

/*
 * Allowed fence markers.
 */

var FENCE_MARKERS = objectCreate();

FENCE_MARKERS[TICK] = true;
FENCE_MARKERS[TILDE] = true;

/*
 * Which method to use based on `list.ordered`.
 */

var ORDERED_MAP = objectCreate();

ORDERED_MAP['true'] = 'visitOrderedItems';
ORDERED_MAP['false'] = 'visitUnorderedItems';

/*
 * Which checkbox to use.
 */

var CHECKBOX_MAP = objectCreate();

CHECKBOX_MAP['null'] = EMPTY;
CHECKBOX_MAP.undefined = EMPTY;
CHECKBOX_MAP['true'] = SQUARE_BRACKET_OPEN + 'x' + SQUARE_BRACKET_CLOSE + SPACE;
CHECKBOX_MAP['false'] = SQUARE_BRACKET_OPEN + SPACE + SQUARE_BRACKET_CLOSE + SPACE;

/**
 * Encode noop.
 * Simply returns the given value.
 *
 * @example
 *   var encode = encodeNoop();
 *   encode('AT&T') // 'AT&T'
 *
 * @param {string} value - Content.
 * @return {string} - Content, without any modifications.
 */
function encodeNoop(value) {
    return value;
}

/**
 * Factory to encode HTML entities.
 * Creates a no-operation function when `type` is
 * `'false'`, a function which encodes using named
 * references when `type` is `'true'`, and a function
 * which encodes using numbered references when `type` is
 * `'numbers'`.
 *
 * By default this should not throw errors, but he does
 * throw an error when in `strict` mode:
 *
 *     he.encode.options.strict = true;
 *     encodeFactory('true')('\x01') // throws
 *
 * These are thrown on the currently compiled `File`.
 *
 * @example
 *   var file = new File();
 *
 *   var encode = encodeFactory('false', file);
 *   encode('AT&T') // 'AT&T'
 *
 *   encode = encodeFactory('true', file);
 *   encode('AT&T') // 'AT&amp;T'
 *
 *   encode = encodeFactory('numbers', file);
 *   encode('AT&T') // 'ATT&#x26;T'
 *
 * @param {string} type - Either `'true'`, `'false'`, or
 *   `numbers`.
 * @param {File} file - Currently compiled virtual file.
 * @return {function(string): string} - Function which
 *   takes a value and returns its encoded version.
 */
function encodeFactory(type, file) {
    var options = {};

    if (type === 'false') {
        return encodeNoop;
    }

    if (type === 'true') {
        options.useNamedReferences = true;
    }

    /**
     * Encode HTML entities using `he` using bound options.
     *
     * @see https://github.com/mathiasbynens/he#strict
     *
     * @example
     *   // When `type` is `'true'`.
     *   encode('AT&T'); // 'AT&amp;T'
     *
     *   // When `type` is `'numbers'`.
     *   encode('AT&T'); // 'ATT&#x26;T'
     *
     * @param {string} value - Content.
     * @param {Object} node - Node which is compiled.
     * @return {string} - Encoded content.
     * @throws {Error} - When `file.quiet` is not `true`.
     *   However, by default `he` does not throw on
     *   parse errors, but when
     *   `he.encode.options.strict: true`, they occur on
     *   invalid HTML.
     */
    function encode(value, node) {
        try {
            return he.encode(value, options);
        } catch (exception) {
            file.fail(exception, node.position);
        }
    }

    return encode;
}

/**
 * Checks if `url` needs to be enclosed by angle brackets.
 *
 * @example
 *   encloseURI('foo bar') // '<foo bar>'
 *   encloseURI('foo(bar(baz)') // '<foo(bar(baz)>'
 *   encloseURI('') // '<>'
 *   encloseURI('example.com') // 'example.com'
 *   encloseURI('example.com', true) // '<example.com>'
 *
 * @param {string} uri
 * @param {boolean?} [always] - Force enclosing.
 * @return {boolean} - Properly enclosed `uri`.
 */
function encloseURI(uri, always) {
    if (always || !uri.length || EXPRESSIONS_WHITE_SPACE.test(uri) || count(uri, PARENTHESIS_OPEN) !== count(uri, PARENTHESIS_CLOSE)) {
        return ANGLE_BRACKET_OPEN + uri + ANGLE_BRACKET_CLOSE;
    }

    return uri;
}

/**
 * There is currently no way to support nested delimiters
 * across Markdown.pl, CommonMark, and GitHub (RedCarpet).
 * The following supports Markdown.pl, and GitHub.
 * CommonMark is not supported when mixing double- and
 * single quotes inside a title.
 *
 * @see https://github.com/vmg/redcarpet/issues/473
 * @see https://github.com/jgm/CommonMark/issues/308
 *
 * @example
 *   encloseTitle('foo') // '"foo"'
 *   encloseTitle('foo \'bar\' baz') // '"foo \'bar\' baz"'
 *   encloseTitle('foo "bar" baz') // '\'foo "bar" baz\''
 *   encloseTitle('foo "bar" \'baz\'') // '"foo "bar" \'baz\'"'
 *
 * @param {string} title - Content.
 * @return {string} - Properly enclosed title.
 */
function encloseTitle(title) {
    var delimiter = QUOTE_DOUBLE;

    if (title.indexOf(delimiter) !== -1) {
        delimiter = QUOTE_SINGLE;
    }

    return delimiter + title + delimiter;
}

/**
 * Get the count of the longest repeating streak
 * of `character` in `value`.
 *
 * @example
 *   getLongestRepetition('` foo `` bar `', '`') // 2
 *
 * @param {string} value - Content.
 * @param {string} character - Single character to look
 *   for.
 * @return {number} - Number of characters at the place
 *   where `character` occurs in its longest streak in
 *   `value`.
 */
function getLongestRepetition(value, character) {
    var highestCount = 0;
    var index = -1;
    var length = value.length;
    var currentCount = 0;
    var currentCharacter;

    while (++index < length) {
        currentCharacter = value.charAt(index);

        if (currentCharacter === character) {
            currentCount++;

            if (currentCount > highestCount) {
                highestCount = currentCount;
            }
        } else {
            currentCount = 0;
        }
    }

    return highestCount;
}

/**
 * Pad `value` with `level * INDENT` spaces.  Respects
 * lines.
 *
 * @example
 *   pad('foo', 1) // '    foo'
 *
 * @param {string} value - Content.
 * @param {number} level - Indentation level.
 * @return {string} - Padded `value`.
 */
function pad(value, level) {
    var index;
    var padding;

    value = value.split(LINE);

    index = value.length;
    padding = repeat(SPACE, level * INDENT);

    while (index--) {
        if (value[index].length !== 0) {
            value[index] = padding + value[index];
        }
    }

    return value.join(LINE);
}

/**
 * Construct a new compiler.
 *
 * @example
 *   var compiler = new Compiler(new File('> foo.'));
 *
 * @constructor
 * @class {Compiler}
 * @param {File} file - Virtual file.
 * @param {Object?} [options] - Passed to
 *   `Compiler#setOptions()`.
 */
function Compiler(file, options) {
    var self = this;

    self.file = file;

    self.options = clone(self.options);

    self.setOptions(options);
}

/*
 * Cache prototype.
 */

var compilerPrototype = Compiler.prototype;

/*
 * Expose defaults.
 */

compilerPrototype.options = defaultOptions;

/*
 * Map of applicable enum's.
 */

var maps = {
    'entities': ENTITY_OPTIONS,
    'bullet': LIST_BULLETS,
    'rule': HORIZONTAL_RULE_BULLETS,
    'emphasis': EMPHASIS_MARKERS,
    'strong': EMPHASIS_MARKERS,
    'fence': FENCE_MARKERS
};

/**
 * Set options.  Does not overwrite previously set
 * options.
 *
 * @example
 *   var compiler = new Compiler();
 *   compiler.setOptions({bullet: '*'});
 *
 * @this {Compiler}
 * @throws {Error} - When an option is invalid.
 * @param {Object?} [options] - Stringify settings.
 * @return {Compiler} - `self`.
 */
compilerPrototype.setOptions = function (options) {
    var self = this;
    var current = self.options;
    var ruleRepetition;
    var key;

    if (options === null || options === undefined) {
        options = {};
    } else if (typeof options === 'object') {
        options = clone(options);
    } else {
        raise(options, 'options');
    }

    for (key in defaultOptions) {
        validate[typeof current[key]](options, key, current[key], maps[key]);
    }

    ruleRepetition = options.ruleRepetition;

    if (ruleRepetition && ruleRepetition < MINIMUM_RULE_LENGTH) {
        raise(ruleRepetition, 'options.ruleRepetition');
    }

    self.encode = encodeFactory(String(options.entities), self.file);

    self.options = options;

    return self;
};

/**
 * Visit a token.
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.visit({
 *     type: 'strong',
 *     children: [{
 *       type: 'text',
 *       value: 'Foo'
 *     }]
 *   });
 *   // '**Foo**'
 *
 * @param {Object} token - Node.
 * @param {Object?} [parent] - `token`s parent node.
 * @return {string} - Compiled `token`.
 */
compilerPrototype.visit = function (token, parent) {
    var self = this;

    if (typeof self[token.type] !== 'function') {
        self.file.fail('Missing compiler for node of type `' + token.type + '`: ' + token, token);
    }

    return self[token.type](token, parent);
};

/**
 * Visit all tokens.
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.all({
 *     type: 'strong',
 *     children: [{
 *       type: 'text',
 *       value: 'Foo'
 *     },
 *     {
 *       type: 'text',
 *       value: 'Bar'
 *     }]
 *   });
 *   // ['Foo', 'Bar']
 *
 * @param {Object} parent - Parent node of children.
 * @return {Array.<string>} - List of compiled children.
 */
compilerPrototype.all = function (parent) {
    var self = this;
    var tokens = parent.children;
    var values = [];
    var index = -1;
    var length = tokens.length;

    while (++index < length) {
        values[index] = self.visit(tokens[index], parent);
    }

    return values;
};

/**
 * Visit ordered list items.
 *
 * Starts the list with
 * `token.start` and increments each following list item
 * bullet by one:
 *
 *     2. foo
 *     3. bar
 *
 * In `incrementListMarker: false` mode, does not increment
 * each marker ans stays on `token.start`:
 *
 *     1. foo
 *     1. bar
 *
 * Adds an extra line after an item if it has
 * `loose: true`.
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.visitOrderedItems({
 *     type: 'list',
 *     ordered: true,
 *     children: [{
 *       type: 'listItem',
 *       children: [{
 *         type: 'text',
 *         value: 'bar'
 *       }]
 *     }]
 *   });
 *   // '1.  bar'
 *
 * @param {Object} token - `list` node with
 *   `ordered: true`.
 * @return {string} - Markdown list.
 */
compilerPrototype.visitOrderedItems = function (token) {
    var self = this;
    var increment = self.options.incrementListMarker;
    var values = [];
    var tokens = token.children;
    var index = -1;
    var length = tokens.length;
    var start = token.start;
    var bullet;
    var indent;
    var spacing;
    var value;

    while (++index < length) {
        bullet = (increment ? start + index : start) + DOT + SPACE;

        indent = Math.ceil(bullet.length / INDENT) * INDENT;
        spacing = repeat(SPACE, indent - bullet.length);

        value = bullet + spacing + self.listItem(tokens[index], token, indent);

        if (tokens[index].loose && index !== length - 1) {
            value += LINE;
        }

        values[index] = value;
    }

    return values.join(LINE);
};

/**
 * Visit unordered list items.
 *
 * Uses `options.bullet` as each item's bullet.
 *
 * Adds an extra line after an item if it has
 * `loose: true`.
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.visitUnorderedItems({
 *     type: 'list',
 *     ordered: false,
 *     children: [{
 *       type: 'listItem',
 *       children: [{
 *         type: 'text',
 *         value: 'bar'
 *       }]
 *     }]
 *   });
 *   // '-   bar'
 *
 * @param {Object} token - `list` node with
 *   `ordered: false`.
 * @return {string} - Markdown list.
 */
compilerPrototype.visitUnorderedItems = function (token) {
    var self = this;
    var values = [];
    var tokens = token.children;
    var index = -1;
    var length = tokens.length;
    var bullet;
    var spacing;
    var value;

    /*
     * Unordered bullets are always one character, so
     * the following can be hard coded.
     */

    bullet = self.options.bullet + SPACE;
    spacing = repeat(SPACE, HALF);

    while (++index < length) {
        value = bullet + spacing + self.listItem(tokens[index], token, INDENT);

        if (tokens[index].loose && index !== length - 1) {
            value += LINE;
        }

        values[index] = value;
    }

    return values.join(LINE);
};

/**
 * Stringify a block node with block children (e.g., `root`
 * or `blockquote`).
 *
 * Knows about code following a list, or adjacent lists
 * with similar bullets, and places an extra newline
 * between them.
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.block({
 *     type: 'root',
 *     children: [{
 *       type: 'paragraph',
 *       children: [{
 *         type: 'text',
 *         value: 'bar'
 *       }]
 *     }]
 *   });
 *   // 'bar'
 *
 * @param {Object} token - `root` node.
 * @return {string} - Markdown block content.
 */
compilerPrototype.block = function (token) {
    var self = this;
    var values = [];
    var tokens = token.children;
    var index = -1;
    var length = tokens.length;
    var child;
    var prev;

    while (++index < length) {
        child = tokens[index];

        if (prev) {
            /*
             * Duplicate tokens, such as a list
             * directly following another list,
             * often need multiple new lines.
             *
             * Additionally, code blocks following a list
             * might easily be mistaken for a paragraph
             * in the list itself.
             */

            if (child.type === prev.type && prev.type === 'list') {
                values.push(prev.ordered === child.ordered ? GAP : BREAK);
            } else if (prev.type === 'list' && child.type === 'code' && !child.lang) {
                values.push(GAP);
            } else {
                values.push(BREAK);
            }
        }

        values.push(self.visit(child, token));

        prev = child;
    }

    return values.join(EMPTY);
};

/**
 * Stringify a root.
 *
 * Adds a final newline to ensure valid POSIX files.
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.root({
 *     type: 'root',
 *     children: [{
 *       type: 'paragraph',
 *       children: [{
 *         type: 'text',
 *         value: 'bar'
 *       }]
 *     }]
 *   });
 *   // 'bar'
 *
 * @param {Object} token - `root` node.
 * @return {string} - Markdown document.
 */
compilerPrototype.root = function (token) {
    return this.block(token) + LINE;
};

/**
 * Stringify a heading.
 *
 * In `setext: true` mode and when `depth` is smaller than
 * three, creates a setext header:
 *
 *     Foo
 *     ===
 *
 * Otherwise, an ATX header is generated:
 *
 *     ### Foo
 *
 * In `closeAtx: true` mode, the header is closed with
 * hashes:
 *
 *     ### Foo ###
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.heading({
 *     type: 'heading',
 *     depth: 2,
 *     children: [{
 *       type: 'strong',
 *       children: [{
 *         type: 'text',
 *         value: 'bar'
 *       }]
 *     }]
 *   });
 *   // '## **bar**'
 *
 * @param {Object} token - `heading` node.
 * @return {string} - Markdown heading.
 */
compilerPrototype.heading = function (token) {
    var self = this;
    var setext = self.options.setext;
    var closeAtx = self.options.closeAtx;
    var depth = token.depth;
    var content = self.all(token).join(EMPTY);
    var prefix;

    if (setext && depth < 3) {
        return content + LINE + repeat(depth === 1 ? EQUALS : DASH, content.length);
    }

    prefix = repeat(HASH, token.depth);
    content = prefix + SPACE + content;

    if (closeAtx) {
        content += SPACE + prefix;
    }

    return content;
};

/**
 * Stringify text.
 *
 * Supports named entities in `settings.encode: true` mode:
 *
 *     AT&amp;T
 *
 * Supports numbered entities in `settings.encode: numbers`
 * mode:
 *
 *     AT&#x26;T
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.text({
 *     type: 'text',
 *     value: 'foo'
 *   });
 *   // 'foo'
 *
 * @param {Object} token - `text` node.
 * @return {string} - Raw markdown text.
 */
compilerPrototype.text = function (token) {
    return this.encode(token.value, token);
};

/**
 * Stringify escaped text.
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.escape({
 *     type: 'escape',
 *     value: '\n'
 *   });
 *   // '\\\n'
 *
 * @param {Object} token - `escape` node.
 * @return {string} - Markdown escape.
 */
compilerPrototype.escape = function (token) {
    return '\\' + token.value;
};

/**
 * Stringify a paragraph.
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.paragraph({
 *     type: 'paragraph',
 *     children: [{
 *       type: 'strong',
 *       children: [{
 *         type: 'text',
 *         value: 'bar'
 *       }]
 *     }]
 *   });
 *   // '**bar**'
 *
 * @param {Object} token - `paragraph` node.
 * @return {string} - Markdown paragraph.
 */
compilerPrototype.paragraph = function (token) {
    return this.all(token).join(EMPTY);
};

/**
 * Stringify a block quote.
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.paragraph({
 *     type: 'blockquote',
 *     children: [{
 *       type: 'paragraph',
 *       children: [{
 *         type: 'strong',
 *         children: [{
 *           type: 'text',
 *           value: 'bar'
 *         }]
 *       }]
 *     }]
 *   });
 *   // '> **bar**'
 *
 * @param {Object} token - `blockquote` node.
 * @return {string} - Markdown block quote.
 */
compilerPrototype.blockquote = function (token) {
    var indent = ANGLE_BRACKET_CLOSE + SPACE;

    return indent + this.block(token).split(LINE).join(LINE + indent);
};

/**
 * Stringify a list. See `Compiler#visitOrderedList()` and
 * `Compiler#visitUnorderedList()` for internal working.
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.visitUnorderedItems({
 *     type: 'list',
 *     ordered: false,
 *     children: [{
 *       type: 'listItem',
 *       children: [{
 *         type: 'text',
 *         value: 'bar'
 *       }]
 *     }]
 *   });
 *   // '-   bar'
 *
 * @param {Object} token - `list` node.
 * @return {string} - Markdown list.
 */
compilerPrototype.list = function (token) {
    return this[ORDERED_MAP[token.ordered]](token);
};

/**
 * Stringify a list item.
 *
 * Prefixes the content with a checked checkbox when
 * `checked: true`:
 *
 *     [x] foo
 *
 * Prefixes the content with an unchecked checkbox when
 * `checked: false`:
 *
 *     [ ] foo
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.listItem({
 *     type: 'listItem',
 *     checked: true,
 *     children: [{
 *       type: 'text',
 *       value: 'bar'
 *     }]
 *   }, null, null, 4);
 *   '[x] bar'
 *
 * @param {Object} token - `listItem` node.
 * @param {Object} parent - Parent of `token`.
 * @param {number} padding - Indentation to use on
 *   subsequent lines.
 * @return {string} - Markdown list item (without bullet).
 */
compilerPrototype.listItem = function (token, parent, padding) {
    var self = this;
    var tokens = token.children;
    var values = [];
    var index = -1;
    var length = tokens.length;
    var value;

    while (++index < length) {
        values[index] = self.visit(tokens[index], token);
    }

    value = CHECKBOX_MAP[token.checked] + values.join(token.loose ? BREAK : LINE);

    value = pad(value, padding / INDENT);

    return value.slice(padding);
};

/**
 * Stringify inline code.
 *
 * Knows about internal ticks (`\``), and ensures one more
 * tick is used to enclose the inline code:
 *
 *     ```foo ``bar`` baz```
 *
 * Even knows about inital and final ticks:
 *
 *     `` `foo ``
 *     `` foo` ``
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.inlineCode({
 *     type: 'inlineCode',
 *     value: 'foo(); `bar`; baz()'
 *   });
 *   // '``foo(); `bar`; baz()``'
 *
 * @param {Object} token - `inlineCode` node.
 * @return {string} - Markdown inline code.
 */
compilerPrototype.inlineCode = function (token) {
    var value = token.value;
    var ticks = repeat(TICK, getLongestRepetition(value, TICK) + 1);
    var start = ticks;
    var end = ticks;

    if (value.charAt(0) === TICK) {
        start += SPACE;
    }

    if (value.charAt(value.length - 1) === TICK) {
        end = SPACE + end;
    }

    return start + token.value + end;
};

/**
 * Stringify YAML front matter.
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.yaml({
 *     type: 'yaml',
 *     value: 'foo: bar'
 *   });
 *   // '---\nfoo: bar\n---'
 *
 * @param {Object} token - `yaml` node.
 * @return {string} - Markdown YAML document.
 */
compilerPrototype.yaml = function (token) {
    var delimiter = repeat(DASH, YAML_FENCE_LENGTH);
    var value = token.value ? LINE + token.value : EMPTY;

    return delimiter + value + LINE + delimiter;
};

/**
 * Stringify a code block.
 *
 * Creates indented code when:
 *
 * - No language tag exists;
 * - Not in `fences: true` mode;
 * - A non-empty value exists.
 *
 * Otherwise, GFM fenced code is created:
 *
 *     ```js
 *     foo();
 *     ```
 *
 * When in ``fence: `~` `` mode, uses tildes as fences:
 *
 *     ~~~js
 *     foo();
 *     ~~~
 *
 * Knows about internal fences (Note: GitHub/Kramdown does
 * not support this):
 *
 *     ````javascript
 *     ```markdown
 *     foo
 *     ```
 *     ````
 *
 * Supports named entities in the language flag with
 * `settings.encode` mode.
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.code({
 *     type: 'code',
 *     lang: 'js',
 *     value: 'fooo();'
 *   });
 *   // '```js\nfooo();\n```'
 *
 * @param {Object} token - `code` node.
 * @return {string} - Markdown code block.
 */
compilerPrototype.code = function (token) {
    var value = token.value;
    var marker = this.options.fence;
    var language = this.encode(token.lang || EMPTY, token);
    var fence;

    /*
     * Probably pedantic.
     */

    if (!language && !this.options.fences && value) {
        return pad(value, 1);
    }

    fence = getLongestRepetition(value, marker) + 1;

    fence = repeat(marker, Math.max(fence, MINIMUM_CODE_FENCE_LENGTH));

    return fence + language + LINE + value + LINE + fence;
};

/**
 * Stringify HTML.
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.html({
 *     type: 'html',
 *     value: '<div>bar</div>'
 *   });
 *   // '<div>bar</div>'
 *
 * @param {Object} token - `html` node.
 * @return {string} - Markdown HTML.
 */
compilerPrototype.html = function (token) {
    return token.value;
};

/**
 * Stringify a horizontal rule.
 *
 * The character used is configurable by `rule`: (`'_'`)
 *
 *     ___
 *
 * The number of repititions is defined through
 * `ruleRepetition`: (`6`)
 *
 *     ******
 *
 * Whether spaces delimit each character, is configured
 * through `ruleSpaces`: (`true`)
 *
 *     * * *
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.horizontalRule({
 *     type: 'horizontalRule'
 *   });
 *   // '***'
 *
 * @return {string} - Markdown rule.
 */
compilerPrototype.horizontalRule = function () {
    var options = this.options;
    var rule = repeat(options.rule, options.ruleRepetition);

    if (options.ruleSpaces) {
        rule = rule.split(EMPTY).join(SPACE);
    }

    return rule;
};

/**
 * Stringify a strong.
 *
 * The marker used is configurable by `strong`, which
 * defaults to an asterisk (`'*'`) but also accepts an
 * underscore (`'_'`):
 *
 *     _foo_
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.strong({
 *     type: 'strong',
 *     children: [{
 *       type: 'text',
 *       value: 'Foo'
 *     }]
 *   });
 *   // '**Foo**'
 *
 * @param {Object} token - `strong` node.
 * @return {string} - Markdown strong-emphasised text.
 */
compilerPrototype.strong = function (token) {
    var marker = this.options.strong;

    marker = marker + marker;

    return marker + this.all(token).join(EMPTY) + marker;
};

/**
 * Stringify an emphasis.
 *
 * The marker used is configurable by `emphasis`, which
 * defaults to an underscore (`'_'`) but also accepts an
 * asterisk (`'*'`):
 *
 *     *foo*
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.emphasis({
 *     type: 'emphasis',
 *     children: [{
 *       type: 'text',
 *       value: 'Foo'
 *     }]
 *   });
 *   // '_Foo_'
 *
 * @param {Object} token - `emphasis` node.
 * @return {string} - Markdown emphasised text.
 */
compilerPrototype.emphasis = function (token) {
    var marker = this.options.emphasis;

    return marker + this.all(token).join(EMPTY) + marker;
};

/**
 * Stringify a hard break.
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.break({
 *     type: 'break'
 *   });
 *   // '  \n'
 *
 * @return {string} - Hard markdown break.
 */
compilerPrototype['break'] = function () {
    return SPACE + SPACE + LINE;
};

/**
 * Stringify a delete.
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.delete({
 *     type: 'delete',
 *     children: [{
 *       type: 'text',
 *       value: 'Foo'
 *     }]
 *   });
 *   // '~~Foo~~'
 *
 * @param {Object} token - `delete` node.
 * @return {string} - Markdown strike-through.
 */
compilerPrototype['delete'] = function (token) {
    return DOUBLE_TILDE + this.all(token).join(EMPTY) + DOUBLE_TILDE;
};

/**
 * Stringify a link.
 *
 * When no title exists, the compiled `children` equal
 * `href`, and `href` starts with a protocol, an auto
 * link is created:
 *
 *     <http://example.com>
 *
 * Otherwise, is smart about enclosing `href` (see
 * `encloseURI()`) and `title` (see `encloseTitle()`).
 *
 *    [foo](<foo at bar dot com> 'An "example" e-mail')
 *
 * Supports named entities in the `href` and `title` when
 * in `settings.encode` mode.
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.link({
 *     type: 'link',
 *     href: 'http://example.com',
 *     title: 'Example Domain',
 *     children: [{
 *       type: 'text',
 *       value: 'Foo'
 *     }]
 *   });
 *   // '[Foo](http://example.com "Example Domain")'
 *
 * @param {Object} token - `link` node.
 * @return {string} - Markdown link.
 */
compilerPrototype.link = function (token) {
    var self = this;
    var url = self.encode(token.href, token);
    var value = self.all(token).join(EMPTY);

    if (token.title === null && PROTOCOL.test(url) && (url === value || url === MAILTO + value)) {
        return encloseURI(url, true);
    }

    url = encloseURI(url);

    if (token.title) {
        url += SPACE + encloseTitle(self.encode(token.title, token));
    }

    value = SQUARE_BRACKET_OPEN + value + SQUARE_BRACKET_CLOSE;

    value += PARENTHESIS_OPEN + url + PARENTHESIS_CLOSE;

    return value;
};

/**
 * Stringify a link label.
 *
 * Because link references are easily, mistakingly,
 * created (for example, `[foo]`), reference nodes have
 * an extra property depicting how it looked in the
 * original document, so stringification can cause minimal
 * changes.
 *
 * @example
 *   label({
 *     type: 'referenceImage',
 *     referenceType: 'full',
 *     identifier: 'foo'
 *   });
 *   // '[foo]'
 *
 *   label({
 *     type: 'referenceImage',
 *     referenceType: 'collapsed',
 *     identifier: 'foo'
 *   });
 *   // '[]'
 *
 *   label({
 *     type: 'referenceImage',
 *     referenceType: 'shortcut',
 *     identifier: 'foo'
 *   });
 *   // ''
 *
 * @param {Object} token - `linkReference` or
 *   `imageReference` node.
 * @return {string} - Markdown label reference.
 */
function label(token) {
    var value = EMPTY;
    var type = token.referenceType;

    if (type === 'full') {
        value = token.identifier;
    }

    if (type !== 'shortcut') {
        value = SQUARE_BRACKET_OPEN + value + SQUARE_BRACKET_CLOSE;
    }

    return value;
}

/**
 * Stringify a link reference.
 *
 * See `label()` on how reference labels are created.
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.linkReference({
 *     type: 'linkReference',
 *     referenceType: 'collapsed',
 *     identifier: 'foo',
 *     children: [{
 *       type: 'text',
 *       value: 'Foo'
 *     }]
 *   });
 *   // '[Foo][]'
 *
 * @param {Object} token - `linkReference` node.
 * @return {string} - Markdown link reference.
 */
compilerPrototype.linkReference = function (token) {
    return SQUARE_BRACKET_OPEN + this.all(token).join(EMPTY) + SQUARE_BRACKET_CLOSE + label(token);
};

/**
 * Stringify an image reference.
 *
 * See `label()` on how reference labels are created.
 *
 * Supports named entities in the `alt` when
 * in `settings.encode` mode.
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.imageReference({
 *     type: 'imageReference',
 *     referenceType: 'full',
 *     identifier: 'foo',
 *     alt: 'Foo'
 *   });
 *   // '![Foo][foo]'
 *
 * @param {Object} token - `imageReference` node.
 * @return {string} - Markdown image reference.
 */
compilerPrototype.imageReference = function (token) {
    var alt = this.encode(token.alt, token);

    return EXCLAMATION_MARK + SQUARE_BRACKET_OPEN + alt + SQUARE_BRACKET_CLOSE + label(token);
};

/**
 * Stringify a footnote reference.
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.footnoteReference({
 *     type: 'footnoteReference',
 *     identifier: 'foo'
 *   });
 *   // '[^foo]'
 *
 * @param {Object} token - `footnoteReference` node.
 * @return {string} - Markdown footnote reference.
 */
compilerPrototype.footnoteReference = function (token) {
    return SQUARE_BRACKET_OPEN + CARET + token.identifier + SQUARE_BRACKET_CLOSE;
};

/**
 * Stringify an link- or image definition.
 *
 * Is smart about enclosing `href` (see `encloseURI()`) and
 * `title` (see `encloseTitle()`).
 *
 *    [foo]: <foo at bar dot com> 'An "example" e-mail'
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.definition({
 *     type: 'definition',
 *     link: 'http://example.com',
 *     title: 'Example Domain',
 *     identifier: 'foo'
 *   });
 *   // '[foo]: http://example.com "Example Domain"'
 *
 * @param {Object} token - `definition` node.
 * @return {string} - Markdown link- or image definition.
 */
compilerPrototype.definition = function (token) {
    var value = SQUARE_BRACKET_OPEN + token.identifier + SQUARE_BRACKET_CLOSE;
    var url = encloseURI(token.link);

    if (token.title) {
        url += SPACE + encloseTitle(token.title);
    }

    return value + COLON + SPACE + url;
};

/**
 * Stringify an image.
 *
 * Is smart about enclosing `href` (see `encloseURI()`) and
 * `title` (see `encloseTitle()`).
 *
 *    ![foo](</fav icon.png> 'My "favourite" icon')
 *
 * Supports named entities in `src`, `alt`, and `title`
 * when in `settings.encode` mode.
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.image({
 *     type: 'image',
 *     href: 'http://example.png/favicon.png',
 *     title: 'Example Icon',
 *     alt: 'Foo'
 *   });
 *   // '![Foo](http://example.png/favicon.png "Example Icon")'
 *
 * @param {Object} token - `image` node.
 * @return {string} - Markdown image.
 */
compilerPrototype.image = function (token) {
    var encode = this.encode;
    var url = encloseURI(encode(token.src, token));
    var value;

    if (token.title) {
        url += SPACE + encloseTitle(encode(token.title, token));
    }

    value = EXCLAMATION_MARK + SQUARE_BRACKET_OPEN + encode(token.alt || EMPTY, token) + SQUARE_BRACKET_CLOSE;

    value += PARENTHESIS_OPEN + url + PARENTHESIS_CLOSE;

    return value;
};

/**
 * Stringify a footnote.
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.footnote({
 *     type: 'footnote',
 *     children: [{
 *       type: 'text',
 *       value: 'Foo'
 *     }]
 *   });
 *   // '[^Foo]'
 *
 * @param {Object} token - `footnote` node.
 * @return {string} - Markdown footnote.
 */
compilerPrototype.footnote = function (token) {
    return SQUARE_BRACKET_OPEN + CARET + this.all(token).join(EMPTY) + SQUARE_BRACKET_CLOSE;
};

/**
 * Stringify a footnote definition.
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.footnoteDefinition({
 *     type: 'footnoteDefinition',
 *     identifier: 'foo',
 *     children: [{
 *       type: 'paragraph',
 *       children: [{
 *         type: 'text',
 *         value: 'bar'
 *       }]
 *     }]
 *   });
 *   // '[^foo]: bar'
 *
 * @param {Object} token - `footnoteDefinition` node.
 * @return {string} - Markdown footnote definition.
 */
compilerPrototype.footnoteDefinition = function (token) {
    var id = token.identifier.toLowerCase();

    return SQUARE_BRACKET_OPEN + CARET + id + SQUARE_BRACKET_CLOSE + COLON + SPACE + this.all(token).join(BREAK + repeat(SPACE, INDENT));
};

/**
 * Stringify table.
 *
 * Creates a fenced table by default, but not in
 * `looseTable: true` mode:
 *
 *     Foo | Bar
 *     :-: | ---
 *     Baz | Qux
 *
 * NOTE: Be careful with `looseTable: true` mode, as a
 * loose table inside an indented code block on GitHub
 * renders as an actual table!
 *
 * Creates a spaces table by default, but not in
 * `spacedTable: false`:
 *
 *     |Foo|Bar|
 *     |:-:|---|
 *     |Baz|Qux|
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.table({
 *     type: 'table',
 *     align: ['center', null],
 *     children: [
 *       {
 *         type: 'tableHeader',
 *         children: [
 *           {
 *             type: 'tableCell'
 *             children: [{
 *               type: 'text'
 *               value: 'Foo'
 *             }]
 *           },
 *           {
 *             type: 'tableCell'
 *             children: [{
 *               type: 'text'
 *               value: 'Bar'
 *             }]
 *           }
 *         ]
 *       },
 *       {
 *         type: 'tableRow',
 *         children: [
 *           {
 *             type: 'tableCell'
 *             children: [{
 *               type: 'text'
 *               value: 'Baz'
 *             }]
 *           },
 *           {
 *             type: 'tableCell'
 *             children: [{
 *               type: 'text'
 *               value: 'Qux'
 *             }]
 *           }
 *         ]
 *       }
 *     ]
 *   });
 *   // '| Foo | Bar |\n| :-: | --- |\n| Baz | Qux |'
 *
 * @param {Object} token - `table` node.
 * @return {string} - Markdown table.
 */
compilerPrototype.table = function (token) {
    var self = this;
    var loose = self.options.looseTable;
    var spaced = self.options.spacedTable;
    var rows = token.children;
    var index = rows.length;
    var result = [];
    var start;

    while (index--) {
        result[index] = self.all(rows[index]);
    }

    start = loose ? EMPTY : spaced ? PIPE + SPACE : PIPE;

    return table(result, {
        'align': token.align,
        'start': start,
        'end': start.split(EMPTY).reverse().join(EMPTY),
        'delimiter': spaced ? SPACE + PIPE + SPACE : PIPE
    });
};

/**
 * Stringify a table cell.
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.tableCell({
 *     type: 'tableCell',
 *     children: [{
 *       type: 'text'
 *       value: 'Qux'
 *     }]
 *   });
 *   // 'Qux'
 *
 * @param {Object} token - `tableCell` node.
 * @return {string} - Markdown table cell.
 */
compilerPrototype.tableCell = function (token) {
    return this.all(token).join(EMPTY);
};

/**
 * Stringify an abstract syntax tree.
 *
 * @example
 *   stringify({
 *     type: 'strong',
 *     children: [{
 *       type: 'text',
 *       value: 'Foo'
 *     }]
 *   }, new File());
 *   // '**Foo**'
 *
 * @param {Object} ast - A node, most commonly, `root`.
 * @param {File} file - Virtual file.
 * @param {Object?} [options] - Passed to
 *   `Compiler#setOptions()`.
 * @return {string} - Markdown document.
 */
function stringify(ast, file, options) {
    var CustomCompiler = this.Compiler || Compiler;

    return new CustomCompiler(file, options).visit(ast);
}

/*
 * Expose `Compiler` on `stringify`.
 */

stringify.Compiler = Compiler;

/*
 * Expose `stringify` on `module.exports`.
 */

module.exports = stringify;
}, {"he":14,"markdown-table":18,"repeat-string":15,"./utilities.js":11,"./defaults.js":17}],
18: [function(require, module, exports) {
'use strict';

/*
 * Useful expressions.
 */

var EXPRESSION_DOT = /\./;
var EXPRESSION_LAST_DOT = /\.[^.]*$/;

/*
 * Allowed alignment values.
 */

var LEFT = 'l';
var RIGHT = 'r';
var CENTER = 'c';
var DOT = '.';
var NULL = '';

var ALLIGNMENT = [LEFT, RIGHT, CENTER, DOT, NULL];

/*
 * Characters.
 */

var COLON = ':';
var DASH = '-';
var PIPE = '|';
var SPACE = ' ';
var NEW_LINE = '\n';

/**
 * Get the length of `value`.
 *
 * @param {string} value
 * @return {number}
 */
function lengthNoop(value) {
    return String(value).length;
}

/**
 * Get a string consisting of `length` `character`s.
 *
 * @param {number} length
 * @param {string} [character=' ']
 * @return {string}
 */
function pad(length, character) {
    return Array(length + 1).join(character || SPACE);
}

/**
 * Get the position of the last dot in `value`.
 *
 * @param {string} value
 * @return {number}
 */
function dotindex(value) {
    var match = EXPRESSION_LAST_DOT.exec(value);

    return match ? match.index + 1 : value.length;
}

/**
 * Create a table from a matrix of strings.
 *
 * @param {Array.<Array.<string>>} table
 * @param {Object?} options
 * @param {boolean?} [options.rule=true]
 * @param {string?} [options.delimiter=" | "]
 * @param {string?} [options.start="| "]
 * @param {string?} [options.end=" |"]
 * @param {Array.<string>?} options.align
 * @param {function(string)?} options.stringLength
 * @return {string} Pretty table
 */
function markdownTable(table, options) {
    var settings = options || {};
    var delimiter = settings.delimiter;
    var start = settings.start;
    var end = settings.end;
    var alignment = settings.align;
    var calculateStringLength = settings.stringLength || lengthNoop;
    var cellCount = 0;
    var rowIndex = -1;
    var rowLength = table.length;
    var sizes = [];
    var align;
    var rule;
    var rows;
    var row;
    var cells;
    var index;
    var position;
    var size;
    var value;
    var spacing;
    var before;
    var after;

    alignment = alignment ? alignment.concat() : [];

    if (delimiter === null || delimiter === undefined) {
        delimiter = SPACE + PIPE + SPACE;
    }

    if (start === null || start === undefined) {
        start = PIPE + SPACE;
    }

    if (end === null || end === undefined) {
        end = SPACE + PIPE;
    }

    while (++rowIndex < rowLength) {
        row = table[rowIndex];

        index = -1;

        if (row.length > cellCount) {
            cellCount = row.length;
        }

        while (++index < cellCount) {
            position = row[index] ? dotindex(row[index]) : null;

            if (!sizes[index]) {
                sizes[index] = 3;
            }

            if (position > sizes[index]) {
                sizes[index] = position;
            }
        }
    }

    if (typeof alignment === 'string') {
        alignment = pad(cellCount, alignment).split('');
    }

    /*
     * Make sure only valid alignments are used.
     */

    index = -1;

    while (++index < cellCount) {
        align = alignment[index];

        if (typeof align === 'string') {
            align = align.charAt(0).toLowerCase();
        }

        if (ALLIGNMENT.indexOf(align) === -1) {
            align = NULL;
        }

        alignment[index] = align;
    }

    rowIndex = -1;
    rows = [];

    while (++rowIndex < rowLength) {
        row = table[rowIndex];

        index = -1;
        cells = [];

        while (++index < cellCount) {
            value = row[index];

            if (value === null || value === undefined) {
                value = '';
            } else {
                value = String(value);
            }

            if (alignment[index] !== DOT) {
                cells[index] = value;
            } else {
                position = dotindex(value);

                size = sizes[index] +
                    (EXPRESSION_DOT.test(value) ? 0 : 1) -
                    (calculateStringLength(value) - position);

                cells[index] = value + pad(size - 1);
            }
        }

        rows[rowIndex] = cells;
    }

    sizes = [];
    rowIndex = -1;

    while (++rowIndex < rowLength) {
        cells = rows[rowIndex];

        index = -1;

        while (++index < cellCount) {
            value = cells[index];

            if (!sizes[index]) {
                sizes[index] = 3;
            }

            size = calculateStringLength(value);

            if (size > sizes[index]) {
                sizes[index] = size;
            }
        }
    }

    rowIndex = -1;

    while (++rowIndex < rowLength) {
        cells = rows[rowIndex];

        index = -1;

        while (++index < cellCount) {
            value = cells[index];

            position = sizes[index] - (calculateStringLength(value) || 0);
            spacing = pad(position);

            if (alignment[index] === RIGHT || alignment[index] === DOT) {
                value = spacing + value;
            } else if (alignment[index] !== CENTER) {
                value = value + spacing;
            } else {
                position = position / 2;

                if (position % 1 === 0) {
                    before = position;
                    after = position;
                } else {
                    before = position + 0.5;
                    after = position - 0.5;
                }

                value = pad(before) + value + pad(after);
            }

            cells[index] = value;
        }

        rows[rowIndex] = cells.join(delimiter);
    }

    if (settings.rule !== false) {
        index = -1;
        rule = [];

        while (++index < cellCount) {
            align = alignment[index];

            /*
             * When `align` is left, don't add colons.
             */

            value = align === RIGHT || align === NULL ? DASH : COLON;
            value += pad(sizes[index] - 2, DASH);
            value += align !== LEFT && align !== NULL ? COLON : DASH;

            rule[index] = value;
        }

        rows.splice(1, 0, rule.join(delimiter));
    }

    return start + rows.join(end + NEW_LINE + start) + end;
}

/*
 * Expose `markdownTable`.
 */

module.exports = markdownTable;

}, {}],
10: [function(require, module, exports) {
/**
 * @author Titus Wormer
 * @copyright 2015 Titus Wormer. All rights reserved.
 * @module File
 * @fileoverview Virtual file format to attach additional
 *   information related to the processed input.  Similar
 *   to`wearefractal/vinyl`.  Additionally, File can be
 *   passed directly to an ESLint formatter to visualise
 *   warnings and errors relating to a file.
 */

'use strict';

/**
 * ESLint's formatter API expects `filePath` to be a
 * string.  This hack supports invocation as well as
 * implicit coercion.
 *
 * @example
 *   var file = new File();
 *   filePath = filePathFactory(file);
 *
 * @param {File} file
 * @return {Function}
 */
function filePathFactory(file) {
    /**
     * Get the location of `file`.
     *
     * Returns empty string when without `filename`.
     *
     * @example
     *   var file = new File({
     *     'directory': '~'
     *     'filename': 'example'
     *     'extension': 'markdown'
     *   });
     *
     *   String(file.filePath); // ~/example.markdown
     *   file.filePath() // ~/example.markdown
     *
     * @property {Function} toString - Itself.
     * @return {string}
     */
    function filePath() {
        var directory;

        if (file.filename) {
            directory = file.directory;

            if (directory.charAt(directory.length - 1) === '/') {
                directory = directory.slice(0, -1);
            }

            if (directory === '.') {
                directory = '';
            }

            return (directory ? directory + '/' : '') + file.filename + (file.extension ? '.' + file.extension : '');
        }

        return '';
    }

    filePath.toString = filePath;

    return filePath;
}

/**
 * Construct a new file.
 *
 * @example
 *   var file = new File({
 *     'directory': '~'
 *     'filename': 'example'
 *     'extension': 'markdown',
 *     'contents': 'Foo *bar* baz',
 *   });
 *
 *   file === File(file) // true
 *   file === new File(file) // true
 *   File('foo') instanceof File // true
 *
 * @constructor
 * @class {File}
 * @param {Object|File|string} [options] - either an
 *   options object, or the value of `contents` (both
 *   optional).  When a `file` is passed in, it's
 *   immediately returned.
 */
function File(options) {
    var self = this;

    if (!(self instanceof File)) {
        return new File(options);
    }

    if (options instanceof File) {
        return options;
    }

    if (!options) {
        options = {};
    } else if (typeof options === 'string') {
        options = {
            'contents': options
        };
    }

    self.filename = options.filename || null;
    self.contents = options.contents || '';

    self.directory = options.directory === undefined ? '' : options.directory;

    self.extension = options.extension === undefined ? 'md' : options.extension;

    self.messages = [];

    /*
     * Make sure eslint’s formatters stringify `filePath`
     * properly.
     */

    self.filePath = filePathFactory(self);
}

/**
 * Stringify a position.
 *
 * @example
 *   stringify({'line': 1, 'column': 3}) // '1:3'
 *   stringify({'line': 1}) // '1:1'
 *   stringify({'column': 3}) // '1:3'
 *   stringify() // '1:1'
 *
 * @param {Object?} [position] - Single position, like
 *   those available at `node.position.start`.
 * @return {string}
 */
function stringify(position) {
    if (!position) {
        position = {};
    }

    return (position.line || 1) + ':' + (position.column || 1);
}

/**
 * Warn.
 *
 * Creates an exception (see `File#exception()`),
 * sets `fatal: false`, and adds it to the file's
 * `messages` list.
 *
 * @example
 *   var file = new File();
 *   file.warn('Something went wrong');
 *
 * @this {File}
 * @param {string|Error} reason - Reason for warning.
 * @param {Node|Location|Position} [position] - Location
 *   of warning in file.
 * @return {Error}
 */
function warn(reason, position) {
    var err = this.exception(reason, position);

    err.fatal = false;

    this.messages.push(err);

    return err;
}

/**
 * Fail.
 *
 * Creates an exception (see `File#exception()`),
 * sets `fatal: true`, adds it to the file's
 * `messages` list.  If `quiet` is not true,
 * throws the error.
 *
 * @example
 *   var file = new File();
 *   file.fail('Something went wrong'); // throws
 *
 * @this {File}
 * @throws {Error} - When not `quiet: true`.
 * @param {string|Error} reason - Reason for failure.
 * @param {Node|Location|Position} [position] - Location
 *   of failure in file.
 * @return {Error} - Unless thrown, of course.
 */
function fail(reason, position) {
    var err = this.exception(reason, position);

    err.fatal = true;

    this.messages.push(err);

    if (!this.quiet) {
        throw err;
    }

    return err;
}

/**
 * Create a pretty exception with `reason` at `position`.
 * When an error is passed in as `reason`, copies the
 * stack.  This does not add a message to `messages`.
 *
 * @example
 *   var file = new File();
 *   var err = file.exception('Something went wrong');
 *
 * @this {File}
 * @param {string|Error} reason - Reason for message.
 * @param {Node|Location|Position} [position] - Location
 *   of message in file.
 * @return {Error} - An object including file information,
 *   line and column indices.
 */
function exception(reason, position) {
    var file = this.filePath();
    var message = reason.message || reason;
    var location;
    var err;

    /*
     * Node / location / position.
     */

    if (position && position.position) {
        position = position.position;
    }

    if (position && position.start) {
        location = stringify(position.start) + '-' + stringify(position.end);
        position = position.start;
    } else {
        location = stringify(position);
    }

    err = new Error(message);

    err.name = (file ? file + ':' : '') + location;
    err.file = file;
    err.reason = message;
    err.line = position ? position.line : null;
    err.column = position ? position.column : null;

    if (reason.stack) {
        err.stack = reason.stack;
    }

    return err;
}

/**
 * Check if `file` has a fatal message.
 *
 * @example
 *   var file = new File();
 *   file.quiet = true;
 *   file.hasFailed; // false
 *
 *   file.fail('Something went wrong');
 *   file.hasFailed; // true
 *
 * @this {File}
 * @return {boolean}
 */
function hasFailed() {
    var messages = this.messages;
    var index = -1;
    var length = messages.length;

    while (++index < length) {
        if (messages[index].fatal) {
            return true;
        }
    }

    return false;
}

/**
 * Create a string representation of `file`.
 *
 * @example
 *   var file = new File('Foo');
 *   String(file); // 'Foo'
 *
 * @this {File}
 * @return {string} - value at the `contents` property
 *   in context.
 */
function toString() {
    return this.contents;
}

/*
 * Methods.
 */

File.prototype.exception = exception;
File.prototype.toString = toString;
File.prototype.warn = warn;
File.prototype.fail = fail;
File.prototype.hasFailed = hasFailed;

/*
 * Expose.
 */

module.exports = File;
}, {}],
3: [function(require, module, exports) {

/**
 * Module dependencies.
 */

'use strict';

var now = require('date-now');

/**
 * Returns a function, that, as long as it continues to be invoked, will not
 * be triggered. The function will be called after it stops being called for
 * N milliseconds. If `immediate` is passed, trigger the function on the
 * leading edge, instead of the trailing.
 *
 * @source underscore.js
 * @see http://unscriptable.com/2009/03/20/debouncing-javascript-methods/
 * @param {Function} function to wrap
 * @param {Number} timeout in ms (`100`)
 * @param {Boolean} whether to execute at the beginning (`false`)
 * @api public
 */

module.exports = function debounce(func, wait, immediate) {
  var timeout, args, context, timestamp, result;
  if (null == wait) wait = 100;

  function later() {
    var last = now() - timestamp;

    if (last < wait && last > 0) {
      timeout = setTimeout(later, wait - last);
    } else {
      timeout = null;
      if (!immediate) {
        result = func.apply(context, args);
        if (!timeout) context = args = null;
      }
    }
  };

  return function debounced() {
    context = this;
    args = arguments;
    timestamp = now();
    var callNow = immediate && !timeout;
    if (!timeout) timeout = setTimeout(later, wait);
    if (callNow) {
      result = func.apply(context, args);
      context = args = null;
    }

    return result;
  };
};
}, {"date-now":19}],
19: [function(require, module, exports) {
"use strict";

module.exports = Date.now || now;

function now() {
    return new Date().getTime();
}
}, {}],
4: [function(require, module, exports) {
// Source: http://jsfiddle.net/vWx8V/
// http://stackoverflow.com/questions/5603195/full-list-of-javascript-keycodes

/**
 * Conenience method returns corresponding value for given keyName or keyCode.
 *
 * @param {Mixed} keyCode {Number} or keyName {String}
 * @return {Mixed}
 * @api public
 */

'use strict';

exports = module.exports = function (searchInput) {
  // Keyboard Events
  if (searchInput && 'object' === typeof searchInput) {
    var hasKeyCode = searchInput.which || searchInput.keyCode || searchInput.charCode;
    if (hasKeyCode) searchInput = hasKeyCode;
  }

  // Numbers
  if ('number' === typeof searchInput) return names[searchInput];

  // Everything else (cast to string)
  var search = String(searchInput);

  // check codes
  var foundNamedKey = codes[search.toLowerCase()];
  if (foundNamedKey) return foundNamedKey;

  // check aliases
  var foundNamedKey = aliases[search.toLowerCase()];
  if (foundNamedKey) return foundNamedKey;

  // weird character?
  if (search.length === 1) return search.charCodeAt(0);

  return undefined;
};

/**
 * Get by name
 *
 *   exports.code['enter'] // => 13
 */

var codes = exports.code = exports.codes = {
  'backspace': 8,
  'tab': 9,
  'enter': 13,
  'shift': 16,
  'ctrl': 17,
  'alt': 18,
  'pause/break': 19,
  'caps lock': 20,
  'esc': 27,
  'space': 32,
  'page up': 33,
  'page down': 34,
  'end': 35,
  'home': 36,
  'left': 37,
  'up': 38,
  'right': 39,
  'down': 40,
  'insert': 45,
  'delete': 46,
  'command': 91,
  'right click': 93,
  'numpad *': 106,
  'numpad +': 107,
  'numpad -': 109,
  'numpad .': 110,
  'numpad /': 111,
  'num lock': 144,
  'scroll lock': 145,
  'my computer': 182,
  'my calculator': 183,
  ';': 186,
  '=': 187,
  ',': 188,
  '-': 189,
  '.': 190,
  '/': 191,
  '`': 192,
  '[': 219,
  '\\': 220,
  ']': 221,
  '\'': 222 };

// Helper aliases

var aliases = exports.aliases = {
  'windows': 91,
  '⇧': 16,
  '⌥': 18,
  '⌃': 17,
  '⌘': 91,
  'ctl': 17,
  'control': 17,
  'option': 18,
  'pause': 19,
  'break': 19,
  'caps': 20,
  'return': 13,
  'escape': 27,
  'spc': 32,
  'pgup': 33,
  'pgdn': 33,
  'ins': 45,
  'del': 46,
  'cmd': 91
};

/*!
 * Programatically add the following
 */

// lower case chars
for (i = 97; i < 123; i++) codes[String.fromCharCode(i)] = i - 32;

// numbers
for (var i = 48; i < 58; i++) codes[i - 48] = i;

// function keys
for (i = 1; i < 13; i++) codes['f' + i] = i + 111;

// numpad keys
for (i = 0; i < 10; i++) codes['numpad ' + i] = i + 96;

/**
 * Get by code
 *
 *   exports.name[13] // => 'Enter'
 */

var names = exports.names = exports.title = {}; // title for backward compat

// Create reverse mapping
for (i in codes) names[codes[i]] = i;

// Add aliases
for (var alias in aliases) {
  codes[alias] = aliases[alias];
}
}, {}],
5: [function(require, module, exports) {

/**
 * Module dependencies.
 */

'use strict';

var encode = encodeURIComponent;
var decode = decodeURIComponent;
var trim = require('trim');
var type = require('type');

var pattern = /(\w+)\[(\d+)\]/;

/**
 * Parse the given query `str`.
 *
 * @param {String} str
 * @return {Object}
 * @api public
 */

exports.parse = function (str) {
  if ('string' != typeof str) return {};

  str = trim(str);
  if ('' == str) return {};
  if ('?' == str.charAt(0)) str = str.slice(1);

  var obj = {};
  var pairs = str.split('&');
  for (var i = 0; i < pairs.length; i++) {
    var parts = pairs[i].split('=');
    var key = decode(parts[0]);
    var m;

    if (m = pattern.exec(key)) {
      obj[m[1]] = obj[m[1]] || [];
      obj[m[1]][m[2]] = decode(parts[1]);
      continue;
    }

    obj[parts[0]] = null == parts[1] ? '' : decode(parts[1]);
  }

  return obj;
};

/**
 * Stringify the given `obj`.
 *
 * @param {Object} obj
 * @return {String}
 * @api public
 */

exports.stringify = function (obj) {
  if (!obj) return '';
  var pairs = [];

  for (var key in obj) {
    var value = obj[key];

    if ('array' == type(value)) {
      for (var i = 0; i < value.length; ++i) {
        pairs.push(encode(key + '[' + i + ']') + '=' + encode(value[i]));
      }
      continue;
    }

    pairs.push(encode(key) + '=' + encode(obj[key]));
  }

  return pairs.join('&');
};
}, {"trim":20,"type":21}],
20: [function(require, module, exports) {
'use strict';

exports = module.exports = trim;

function trim(str) {
  if (str.trim) return str.trim();
  return str.replace(/^\s*|\s*$/g, '');
}

exports.left = function (str) {
  if (str.trimLeft) return str.trimLeft();
  return str.replace(/^\s*/, '');
};

exports.right = function (str) {
  if (str.trimRight) return str.trimRight();
  return str.replace(/\s*$/, '');
};
}, {}],
21: [function(require, module, exports) {
/**
 * toString ref.
 */

'use strict';

var toString = Object.prototype.toString;

/**
 * Return the type of `val`.
 *
 * @param {Mixed} val
 * @return {String}
 * @api public
 */

module.exports = function (val) {
  switch (toString.call(val)) {
    case '[object Date]':
      return 'date';
    case '[object RegExp]':
      return 'regexp';
    case '[object Arguments]':
      return 'arguments';
    case '[object Array]':
      return 'array';
    case '[object Error]':
      return 'error';
  }

  if (val === null) return 'null';
  if (val === undefined) return 'undefined';
  if (val !== val) return 'nan';
  if (val && val.nodeType === 1) return 'element';

  val = val.valueOf ? val.valueOf() : Object.prototype.valueOf.apply(val);

  return typeof val;
};
}, {}],
6: [function(require, module, exports) {
'use strict';

module.exports = require('./dist/quill');
}, {"./dist/quill":22}],
22: [function(require, module, exports) {
"use strict";(function(f){if(typeof exports === "object" && typeof module !== "undefined"){module.exports = f();}else if(typeof define === "function" && define.amd){define([], f);}else {var g;if(typeof window !== "undefined"){g = window;}else if(typeof global !== "undefined"){g = global;}else if(typeof self !== "undefined"){g = self;}else {g = this;}g.Quill = f();}})(function(){var define, module, exports;return (function e(t, n, r){function s(o, u){if(!n[o]){if(!t[o]){var a=typeof require == "function" && require;if(!u && a)return a(o, !0);if(i)return i(o, !0);var f=new Error("Cannot find module '" + o + "'");throw (f.code = "MODULE_NOT_FOUND", f);}var l=n[o] = {exports:{}};t[o][0].call(l.exports, function(e){var n=t[o][1][e];return s(n?n:e);}, l, l.exports, e, t, n, r);}return n[o].exports;}var i=typeof require == "function" && require;for(var o=0; o < r.length; o++) s(r[o]);return s;})({1:[function(_dereq_, module, exports){(function(global){;(function(){var undefined;var VERSION="3.5.0";var BIND_FLAG=1, BIND_KEY_FLAG=2, CURRY_BOUND_FLAG=4, CURRY_FLAG=8, CURRY_RIGHT_FLAG=16, PARTIAL_FLAG=32, PARTIAL_RIGHT_FLAG=64, REARG_FLAG=128, ARY_FLAG=256;var HOT_COUNT=150, HOT_SPAN=16;var FUNC_ERROR_TEXT="Expected a function";var PLACEHOLDER="__lodash_placeholder__";var argsTag="[object Arguments]", arrayTag="[object Array]", boolTag="[object Boolean]", dateTag="[object Date]", errorTag="[object Error]", funcTag="[object Function]", mapTag="[object Map]", numberTag="[object Number]", objectTag="[object Object]", regexpTag="[object RegExp]", setTag="[object Set]", stringTag="[object String]", weakMapTag="[object WeakMap]";var arrayBufferTag="[object ArrayBuffer]", float32Tag="[object Float32Array]", float64Tag="[object Float64Array]", int8Tag="[object Int8Array]", int16Tag="[object Int16Array]", int32Tag="[object Int32Array]", uint8Tag="[object Uint8Array]", uint8ClampedTag="[object Uint8ClampedArray]", uint16Tag="[object Uint16Array]", uint32Tag="[object Uint32Array]";var reFlags=/\w*$/;var reFuncName=/^\s*function[ \n\r\t]+\w/;var reHostCtor=/^\[object .+?Constructor\]$/;var reRegExpChars=/[.*+?^${}()|[\]\/\\]/g, reHasRegExpChars=RegExp(reRegExpChars.source);var reThis=/\bthis\b/;var typedArrayTags={};typedArrayTags[float32Tag] = typedArrayTags[float64Tag] = typedArrayTags[int8Tag] = typedArrayTags[int16Tag] = typedArrayTags[int32Tag] = typedArrayTags[uint8Tag] = typedArrayTags[uint8ClampedTag] = typedArrayTags[uint16Tag] = typedArrayTags[uint32Tag] = true;typedArrayTags[argsTag] = typedArrayTags[arrayTag] = typedArrayTags[arrayBufferTag] = typedArrayTags[boolTag] = typedArrayTags[dateTag] = typedArrayTags[errorTag] = typedArrayTags[funcTag] = typedArrayTags[mapTag] = typedArrayTags[numberTag] = typedArrayTags[objectTag] = typedArrayTags[regexpTag] = typedArrayTags[setTag] = typedArrayTags[stringTag] = typedArrayTags[weakMapTag] = false;var cloneableTags={};cloneableTags[argsTag] = cloneableTags[arrayTag] = cloneableTags[arrayBufferTag] = cloneableTags[boolTag] = cloneableTags[dateTag] = cloneableTags[float32Tag] = cloneableTags[float64Tag] = cloneableTags[int8Tag] = cloneableTags[int16Tag] = cloneableTags[int32Tag] = cloneableTags[numberTag] = cloneableTags[objectTag] = cloneableTags[regexpTag] = cloneableTags[stringTag] = cloneableTags[uint8Tag] = cloneableTags[uint8ClampedTag] = cloneableTags[uint16Tag] = cloneableTags[uint32Tag] = true;cloneableTags[errorTag] = cloneableTags[funcTag] = cloneableTags[mapTag] = cloneableTags[setTag] = cloneableTags[weakMapTag] = false;var objectTypes={"function":true, "object":true};var freeExports=objectTypes[typeof exports] && exports && !exports.nodeType && exports;var freeModule=objectTypes[typeof module] && module && !module.nodeType && module;var freeGlobal=freeExports && freeModule && typeof global == "object" && global;var freeWindow=objectTypes[typeof window] && window;var moduleExports=freeModule && freeModule.exports === freeExports && freeExports;var root=freeGlobal || freeWindow !== (this && this.window) && freeWindow || this;function baseIndexOf(array, value, fromIndex){if(value !== value){return indexOfNaN(array, fromIndex);}var index=fromIndex - 1, length=array.length;while(++index < length) {if(array[index] === value){return index;}}return -1;}function baseIsFunction(value){return typeof value == "function" || false;}function baseToString(value){if(typeof value == "string"){return value;}return value == null?"":value + "";}function indexOfNaN(array, fromIndex, fromRight){var length=array.length, index=fromIndex + (fromRight?0:-1);while(fromRight?index--:++index < length) {var other=array[index];if(other !== other){return index;}}return -1;}function isObjectLike(value){return value && typeof value == "object" || false;}function replaceHolders(array, placeholder){var index=-1, length=array.length, resIndex=-1, result=[];while(++index < length) {if(array[index] === placeholder){array[index] = PLACEHOLDER;result[++resIndex] = index;}}return result;}var objectProto=Object.prototype;var document=(document = root.window) && document.document;var fnToString=Function.prototype.toString;var hasOwnProperty=objectProto.hasOwnProperty;var idCounter=0;var objToString=objectProto.toString;var reNative=RegExp("^" + escapeRegExp(objToString).replace(/toString|(function).*?(?=\\\()| for .+?(?=\\\])/g, "$1.*?") + "$");var ArrayBuffer=isNative(ArrayBuffer = root.ArrayBuffer) && ArrayBuffer, bufferSlice=isNative(bufferSlice = ArrayBuffer && new ArrayBuffer(0).slice) && bufferSlice, floor=Math.floor, getPrototypeOf=isNative(getPrototypeOf = Object.getPrototypeOf) && getPrototypeOf, propertyIsEnumerable=objectProto.propertyIsEnumerable, Set=isNative(Set = root.Set) && Set, Uint8Array=isNative(Uint8Array = root.Uint8Array) && Uint8Array, WeakMap=isNative(WeakMap = root.WeakMap) && WeakMap;var Float64Array=(function(){try{var func=isNative(func = root.Float64Array) && func, result=new func(new ArrayBuffer(10), 0, 1) && func;}catch(e) {}return result;})();var nativeIsArray=isNative(nativeIsArray = Array.isArray) && nativeIsArray, nativeCreate=isNative(nativeCreate = Object.create) && nativeCreate, nativeKeys=isNative(nativeKeys = Object.keys) && nativeKeys, nativeMax=Math.max, nativeMin=Math.min, nativeNow=isNative(nativeNow = Date.now) && nativeNow;var MAX_ARRAY_LENGTH=Math.pow(2, 32) - 1, MAX_ARRAY_INDEX=MAX_ARRAY_LENGTH - 1, HALF_MAX_ARRAY_LENGTH=MAX_ARRAY_LENGTH >>> 1;var FLOAT64_BYTES_PER_ELEMENT=Float64Array?Float64Array.BYTES_PER_ELEMENT:0;var MAX_SAFE_INTEGER=Math.pow(2, 53) - 1;var metaMap=WeakMap && new WeakMap();function lodash(){}var support=lodash.support = {};(function(x){support.funcDecomp = !isNative(root.WinRTError) && reThis.test(function(){return this;});support.funcNames = typeof Function.name == "string";try{support.dom = document.createDocumentFragment().nodeType === 11;}catch(e) {support.dom = false;}try{support.nonEnumArgs = !propertyIsEnumerable.call(arguments, 1);}catch(e) {support.nonEnumArgs = true;}})(0, 0);function SetCache(values){var length=values?values.length:0;this.data = {"hash":nativeCreate(null), "set":new Set()};while(length--) {this.push(values[length]);}}function cacheIndexOf(cache, value){var data=cache.data, result=typeof value == "string" || isObject(value)?data.set.has(value):data.hash[value];return result?0:-1;}function cachePush(value){var data=this.data;if(typeof value == "string" || isObject(value)){data.set.add(value);}else {data.hash[value] = true;}}function arrayCopy(source, array){var index=-1, length=source.length;array || (array = Array(length));while(++index < length) {array[index] = source[index];}return array;}function arrayEach(array, iteratee){var index=-1, length=array.length;while(++index < length) {if(iteratee(array[index], index, array) === false){break;}}return array;}function arrayEvery(array, predicate){var index=-1, length=array.length;while(++index < length) {if(!predicate(array[index], index, array)){return false;}}return true;}function arrayMap(array, iteratee){var index=-1, length=array.length, result=Array(length);while(++index < length) {result[index] = iteratee(array[index], index, array);}return result;}function arrayReduce(array, iteratee, accumulator, initFromArray){var index=-1, length=array.length;if(initFromArray && length){accumulator = array[++index];}while(++index < length) {accumulator = iteratee(accumulator, array[index], index, array);}return accumulator;}function assignDefaults(objectValue, sourceValue){return typeof objectValue == "undefined"?sourceValue:objectValue;}function baseAssign(object, source, customizer){var props=keys(source);if(!customizer){return baseCopy(source, object, props);}var index=-1, length=props.length;while(++index < length) {var key=props[index], value=object[key], result=customizer(value, source[key], key, object, source);if((result === result?result !== value:value === value) || typeof value == "undefined" && !(key in object)){object[key] = result;}}return object;}function baseCopy(source, object, props){if(!props){props = object;object = {};}var index=-1, length=props.length;while(++index < length) {var key=props[index];object[key] = source[key];}return object;}function baseCallback(func, thisArg, argCount){var type=typeof func;if(type == "function"){return typeof thisArg != "undefined" && isBindable(func)?bindCallback(func, thisArg, argCount):func;}if(func == null){return identity;}if(type == "object"){return baseMatches(func);}return typeof thisArg == "undefined"?baseProperty(func + ""):baseMatchesProperty(func + "", thisArg);}function baseClone(value, isDeep, customizer, key, object, stackA, stackB){var result;if(customizer){result = object?customizer(value, key, object):customizer(value);}if(typeof result != "undefined"){return result;}if(!isObject(value)){return value;}var isArr=isArray(value);if(isArr){result = initCloneArray(value);if(!isDeep){return arrayCopy(value, result);}}else {var tag=objToString.call(value), isFunc=tag == funcTag;if(tag == objectTag || tag == argsTag || isFunc && !object){result = initCloneObject(isFunc?{}:value);if(!isDeep){return baseCopy(value, result, keys(value));}}else {return cloneableTags[tag]?initCloneByTag(value, tag, isDeep):object?value:{};}}stackA || (stackA = []);stackB || (stackB = []);var length=stackA.length;while(length--) {if(stackA[length] == value){return stackB[length];}}stackA.push(value);stackB.push(result);(isArr?arrayEach:baseForOwn)(value, function(subValue, key){result[key] = baseClone(subValue, isDeep, customizer, key, value, stackA, stackB);});return result;}var baseCreate=(function(){function Object(){}return function(prototype){if(isObject(prototype)){Object.prototype = prototype;var result=new Object();Object.prototype = null;}return result || root.Object();};})();function baseDelay(func, wait, args, fromIndex){if(typeof func != "function"){throw new TypeError(FUNC_ERROR_TEXT);}return setTimeout(function(){func.apply(undefined, baseSlice(args, fromIndex));}, wait);}function baseDifference(array, values){var length=array?array.length:0, result=[];if(!length){return result;}var index=-1, indexOf=getIndexOf(), isCommon=indexOf == baseIndexOf, cache=isCommon && values.length >= 200?createCache(values):null, valuesLength=values.length;if(cache){indexOf = cacheIndexOf;isCommon = false;values = cache;}outer: while(++index < length) {var value=array[index];if(isCommon && value === value){var valuesIndex=valuesLength;while(valuesIndex--) {if(values[valuesIndex] === value){continue outer;}}result.push(value);}else if(indexOf(values, value, 0) < 0){result.push(value);}}return result;}function baseEach(collection, iteratee){var length=collection?collection.length:0;if(!isLength(length)){return baseForOwn(collection, iteratee);}var index=-1, iterable=toObject(collection);while(++index < length) {if(iteratee(iterable[index], index, iterable) === false){break;}}return collection;}function baseEvery(collection, predicate){var result=true;baseEach(collection, function(value, index, collection){result = !!predicate(value, index, collection);return result;});return result;}function baseFind(collection, predicate, eachFunc, retKey){var result;eachFunc(collection, function(value, key, collection){if(predicate(value, key, collection)){result = retKey?key:value;return false;}});return result;}function baseFlatten(array, isDeep, isStrict, fromIndex){var index=fromIndex - 1, length=array.length, resIndex=-1, result=[];while(++index < length) {var value=array[index];if(isObjectLike(value) && isLength(value.length) && (isArray(value) || isArguments(value))){if(isDeep){value = baseFlatten(value, isDeep, isStrict, 0);}var valIndex=-1, valLength=value.length;result.length += valLength;while(++valIndex < valLength) {result[++resIndex] = value[valIndex];}}else if(!isStrict){result[++resIndex] = value;}}return result;}function baseFor(object, iteratee, keysFunc){var index=-1, iterable=toObject(object), props=keysFunc(object), length=props.length;while(++index < length) {var key=props[index];if(iteratee(iterable[key], key, iterable) === false){break;}}return object;}function baseForIn(object, iteratee){return baseFor(object, iteratee, keysIn);}function baseForOwn(object, iteratee){return baseFor(object, iteratee, keys);}function baseInvoke(collection, methodName, args){var index=-1, isFunc=typeof methodName == "function", length=collection?collection.length:0, result=isLength(length)?Array(length):[];baseEach(collection, function(value){var func=isFunc?methodName:value != null && value[methodName];result[++index] = func?func.apply(value, args):undefined;});return result;}function baseIsEqual(value, other, customizer, isWhere, stackA, stackB){if(value === other){return value !== 0 || 1 / value == 1 / other;}var valType=typeof value, othType=typeof other;if(valType != "function" && valType != "object" && othType != "function" && othType != "object" || value == null || other == null){return value !== value && other !== other;}return baseIsEqualDeep(value, other, baseIsEqual, customizer, isWhere, stackA, stackB);}function baseIsEqualDeep(object, other, equalFunc, customizer, isWhere, stackA, stackB){var objIsArr=isArray(object), othIsArr=isArray(other), objTag=arrayTag, othTag=arrayTag;if(!objIsArr){objTag = objToString.call(object);if(objTag == argsTag){objTag = objectTag;}else if(objTag != objectTag){objIsArr = isTypedArray(object);}}if(!othIsArr){othTag = objToString.call(other);if(othTag == argsTag){othTag = objectTag;}else if(othTag != objectTag){othIsArr = isTypedArray(other);}}var objIsObj=objTag == objectTag, othIsObj=othTag == objectTag, isSameTag=objTag == othTag;if(isSameTag && !(objIsArr || objIsObj)){return equalByTag(object, other, objTag);}var valWrapped=objIsObj && hasOwnProperty.call(object, "__wrapped__"), othWrapped=othIsObj && hasOwnProperty.call(other, "__wrapped__");if(valWrapped || othWrapped){return equalFunc(valWrapped?object.value():object, othWrapped?other.value():other, customizer, isWhere, stackA, stackB);}if(!isSameTag){return false;}stackA || (stackA = []);stackB || (stackB = []);var length=stackA.length;while(length--) {if(stackA[length] == object){return stackB[length] == other;}}stackA.push(object);stackB.push(other);var result=(objIsArr?equalArrays:equalObjects)(object, other, equalFunc, customizer, isWhere, stackA, stackB);stackA.pop();stackB.pop();return result;}function baseIsMatch(object, props, values, strictCompareFlags, customizer){var length=props.length;if(object == null){return !length;}var index=-1, noCustomizer=!customizer;while(++index < length) {if(noCustomizer && strictCompareFlags[index]?values[index] !== object[props[index]]:!hasOwnProperty.call(object, props[index])){return false;}}index = -1;while(++index < length) {var key=props[index];if(noCustomizer && strictCompareFlags[index]){var result=hasOwnProperty.call(object, key);}else {var objValue=object[key], srcValue=values[index];result = customizer?customizer(objValue, srcValue, key):undefined;if(typeof result == "undefined"){result = baseIsEqual(srcValue, objValue, customizer, true);}}if(!result){return false;}}return true;}function baseMap(collection, iteratee){var result=[];baseEach(collection, function(value, key, collection){result.push(iteratee(value, key, collection));});return result;}function baseMatches(source){var props=keys(source), length=props.length;if(length == 1){var key=props[0], value=source[key];if(isStrictComparable(value)){return function(object){return object != null && object[key] === value && hasOwnProperty.call(object, key);};}}var values=Array(length), strictCompareFlags=Array(length);while(length--) {value = source[props[length]];values[length] = value;strictCompareFlags[length] = isStrictComparable(value);}return function(object){return baseIsMatch(object, props, values, strictCompareFlags);};}function baseMatchesProperty(key, value){if(isStrictComparable(value)){return function(object){return object != null && object[key] === value;};}return function(object){return object != null && baseIsEqual(value, object[key], null, true);};}function baseProperty(key){return function(object){return object == null?undefined:object[key];};}function baseReduce(collection, iteratee, accumulator, initFromCollection, eachFunc){eachFunc(collection, function(value, index, collection){accumulator = initFromCollection?(initFromCollection = false, value):iteratee(accumulator, value, index, collection);});return accumulator;}var baseSetData=!metaMap?identity:function(func, data){metaMap.set(func, data);return func;};function baseSlice(array, start, end){var index=-1, length=array.length;start = start == null?0:+start || 0;if(start < 0){start = -start > length?0:length + start;}end = typeof end == "undefined" || end > length?length:+end || 0;if(end < 0){end += length;}length = start > end?0:end - start >>> 0;start >>>= 0;var result=Array(length);while(++index < length) {result[index] = array[index + start];}return result;}function baseValues(object, props){var index=-1, length=props.length, result=Array(length);while(++index < length) {result[index] = object[props[index]];}return result;}function binaryIndex(array, value, retHighest){var low=0, high=array?array.length:low;if(typeof value == "number" && value === value && high <= HALF_MAX_ARRAY_LENGTH){while(low < high) {var mid=low + high >>> 1, computed=array[mid];if(retHighest?computed <= value:computed < value){low = mid + 1;}else {high = mid;}}return high;}return binaryIndexBy(array, value, identity, retHighest);}function binaryIndexBy(array, value, iteratee, retHighest){value = iteratee(value);var low=0, high=array?array.length:0, valIsNaN=value !== value, valIsUndef=typeof value == "undefined";while(low < high) {var mid=floor((low + high) / 2), computed=iteratee(array[mid]), isReflexive=computed === computed;if(valIsNaN){var setLow=isReflexive || retHighest;}else if(valIsUndef){setLow = isReflexive && (retHighest || typeof computed != "undefined");}else {setLow = retHighest?computed <= value:computed < value;}if(setLow){low = mid + 1;}else {high = mid;}}return nativeMin(high, MAX_ARRAY_INDEX);}function bindCallback(func, thisArg, argCount){if(typeof func != "function"){return identity;}if(typeof thisArg == "undefined"){return func;}switch(argCount){case 1:return function(value){return func.call(thisArg, value);};case 3:return function(value, index, collection){return func.call(thisArg, value, index, collection);};case 4:return function(accumulator, value, index, collection){return func.call(thisArg, accumulator, value, index, collection);};case 5:return function(value, other, key, object, source){return func.call(thisArg, value, other, key, object, source);};}return function(){return func.apply(thisArg, arguments);};}function bufferClone(buffer){return bufferSlice.call(buffer, 0);}if(!bufferSlice){bufferClone = !(ArrayBuffer && Uint8Array)?constant(null):function(buffer){var byteLength=buffer.byteLength, floatLength=Float64Array?floor(byteLength / FLOAT64_BYTES_PER_ELEMENT):0, offset=floatLength * FLOAT64_BYTES_PER_ELEMENT, result=new ArrayBuffer(byteLength);if(floatLength){var view=new Float64Array(result, 0, floatLength);view.set(new Float64Array(buffer, 0, floatLength));}if(byteLength != offset){view = new Uint8Array(result, offset);view.set(new Uint8Array(buffer, offset));}return result;};}function composeArgs(args, partials, holders){var holdersLength=holders.length, argsIndex=-1, argsLength=nativeMax(args.length - holdersLength, 0), leftIndex=-1, leftLength=partials.length, result=Array(argsLength + leftLength);while(++leftIndex < leftLength) {result[leftIndex] = partials[leftIndex];}while(++argsIndex < holdersLength) {result[holders[argsIndex]] = args[argsIndex];}while(argsLength--) {result[leftIndex++] = args[argsIndex++];}return result;}function composeArgsRight(args, partials, holders){var holdersIndex=-1, holdersLength=holders.length, argsIndex=-1, argsLength=nativeMax(args.length - holdersLength, 0), rightIndex=-1, rightLength=partials.length, result=Array(argsLength + rightLength);while(++argsIndex < argsLength) {result[argsIndex] = args[argsIndex];}var pad=argsIndex;while(++rightIndex < rightLength) {result[pad + rightIndex] = partials[rightIndex];}while(++holdersIndex < holdersLength) {result[pad + holders[holdersIndex]] = args[argsIndex++];}return result;}function createAssigner(assigner){return function(){var args=arguments, length=args.length, object=args[0];if(length < 2 || object == null){return object;}var customizer=args[length - 2], thisArg=args[length - 1], guard=args[3];if(length > 3 && typeof customizer == "function"){customizer = bindCallback(customizer, thisArg, 5);length -= 2;}else {customizer = length > 2 && typeof thisArg == "function"?thisArg:null;length -= customizer?1:0;}if(guard && isIterateeCall(args[1], args[2], guard)){customizer = length == 3?null:customizer;length = 2;}var index=0;while(++index < length) {var source=args[index];if(source){assigner(object, source, customizer);}}return object;};}function createBindWrapper(func, thisArg){var Ctor=createCtorWrapper(func);function wrapper(){var fn=this && this !== root && this instanceof wrapper?Ctor:func;return fn.apply(thisArg, arguments);}return wrapper;}var createCache=!(nativeCreate && Set)?constant(null):function(values){return new SetCache(values);};function createCtorWrapper(Ctor){return function(){var thisBinding=baseCreate(Ctor.prototype), result=Ctor.apply(thisBinding, arguments);return isObject(result)?result:thisBinding;};}function createHybridWrapper(func, bitmask, thisArg, partials, holders, partialsRight, holdersRight, argPos, ary, arity){var isAry=bitmask & ARY_FLAG, isBind=bitmask & BIND_FLAG, isBindKey=bitmask & BIND_KEY_FLAG, isCurry=bitmask & CURRY_FLAG, isCurryBound=bitmask & CURRY_BOUND_FLAG, isCurryRight=bitmask & CURRY_RIGHT_FLAG;var Ctor=!isBindKey && createCtorWrapper(func), key=func;function wrapper(){var length=arguments.length, index=length, args=Array(length);while(index--) {args[index] = arguments[index];}if(partials){args = composeArgs(args, partials, holders);}if(partialsRight){args = composeArgsRight(args, partialsRight, holdersRight);}if(isCurry || isCurryRight){var placeholder=wrapper.placeholder, argsHolders=replaceHolders(args, placeholder);length -= argsHolders.length;if(length < arity){var newArgPos=argPos?arrayCopy(argPos):null, newArity=nativeMax(arity - length, 0), newsHolders=isCurry?argsHolders:null, newHoldersRight=isCurry?null:argsHolders, newPartials=isCurry?args:null, newPartialsRight=isCurry?null:args;bitmask |= isCurry?PARTIAL_FLAG:PARTIAL_RIGHT_FLAG;bitmask &= ~(isCurry?PARTIAL_RIGHT_FLAG:PARTIAL_FLAG);if(!isCurryBound){bitmask &= ~(BIND_FLAG | BIND_KEY_FLAG);}var result=createHybridWrapper(func, bitmask, thisArg, newPartials, newsHolders, newPartialsRight, newHoldersRight, newArgPos, ary, newArity);result.placeholder = placeholder;return result;}}var thisBinding=isBind?thisArg:this;if(isBindKey){func = thisBinding[key];}if(argPos){args = reorder(args, argPos);}if(isAry && ary < args.length){args.length = ary;}var fn=this && this !== root && this instanceof wrapper?Ctor || createCtorWrapper(func):func;return fn.apply(thisBinding, args);}return wrapper;}function createPartialWrapper(func, bitmask, thisArg, partials){var isBind=bitmask & BIND_FLAG, Ctor=createCtorWrapper(func);function wrapper(){var argsIndex=-1, argsLength=arguments.length, leftIndex=-1, leftLength=partials.length, args=Array(argsLength + leftLength);while(++leftIndex < leftLength) {args[leftIndex] = partials[leftIndex];}while(argsLength--) {args[leftIndex++] = arguments[++argsIndex];}var fn=this && this !== root && this instanceof wrapper?Ctor:func;return fn.apply(isBind?thisArg:this, args);}return wrapper;}function createWrapper(func, bitmask, thisArg, partials, holders, argPos, ary, arity){var isBindKey=bitmask & BIND_KEY_FLAG;if(!isBindKey && typeof func != "function"){throw new TypeError(FUNC_ERROR_TEXT);}var length=partials?partials.length:0;if(!length){bitmask &= ~(PARTIAL_FLAG | PARTIAL_RIGHT_FLAG);partials = holders = null;}length -= holders?holders.length:0;if(bitmask & PARTIAL_RIGHT_FLAG){var partialsRight=partials, holdersRight=holders;partials = holders = null;}var data=!isBindKey && getData(func), newData=[func, bitmask, thisArg, partials, holders, partialsRight, holdersRight, argPos, ary, arity];if(data && data !== true){mergeData(newData, data);bitmask = newData[1];arity = newData[9];}newData[9] = arity == null?isBindKey?0:func.length:nativeMax(arity - length, 0) || 0;if(bitmask == BIND_FLAG){var result=createBindWrapper(newData[0], newData[2]);}else if((bitmask == PARTIAL_FLAG || bitmask == (BIND_FLAG | PARTIAL_FLAG)) && !newData[4].length){result = createPartialWrapper.apply(undefined, newData);}else {result = createHybridWrapper.apply(undefined, newData);}var setter=data?baseSetData:setData;return setter(result, newData);}function equalArrays(array, other, equalFunc, customizer, isWhere, stackA, stackB){var index=-1, arrLength=array.length, othLength=other.length, result=true;if(arrLength != othLength && !(isWhere && othLength > arrLength)){return false;}while(result && ++index < arrLength) {var arrValue=array[index], othValue=other[index];result = undefined;if(customizer){result = isWhere?customizer(othValue, arrValue, index):customizer(arrValue, othValue, index);}if(typeof result == "undefined"){if(isWhere){var othIndex=othLength;while(othIndex--) {othValue = other[othIndex];result = arrValue && arrValue === othValue || equalFunc(arrValue, othValue, customizer, isWhere, stackA, stackB);if(result){break;}}}else {result = arrValue && arrValue === othValue || equalFunc(arrValue, othValue, customizer, isWhere, stackA, stackB);}}}return !!result;}function equalByTag(object, other, tag){switch(tag){case boolTag:case dateTag:return +object == +other;case errorTag:return object.name == other.name && object.message == other.message;case numberTag:return object != +object?other != +other:object == 0?1 / object == 1 / other:object == +other;case regexpTag:case stringTag:return object == other + "";}return false;}function equalObjects(object, other, equalFunc, customizer, isWhere, stackA, stackB){var objProps=keys(object), objLength=objProps.length, othProps=keys(other), othLength=othProps.length;if(objLength != othLength && !isWhere){return false;}var hasCtor, index=-1;while(++index < objLength) {var key=objProps[index], result=hasOwnProperty.call(other, key);if(result){var objValue=object[key], othValue=other[key];result = undefined;if(customizer){result = isWhere?customizer(othValue, objValue, key):customizer(objValue, othValue, key);}if(typeof result == "undefined"){result = objValue && objValue === othValue || equalFunc(objValue, othValue, customizer, isWhere, stackA, stackB);}}if(!result){return false;}hasCtor || (hasCtor = key == "constructor");}if(!hasCtor){var objCtor=object.constructor, othCtor=other.constructor;if(objCtor != othCtor && ("constructor" in object && "constructor" in other) && !(typeof objCtor == "function" && objCtor instanceof objCtor && typeof othCtor == "function" && othCtor instanceof othCtor)){return false;}}return true;}function getCallback(func, thisArg, argCount){var result=lodash.callback || callback;result = result === callback?baseCallback:result;return argCount?result(func, thisArg, argCount):result;}var getData=!metaMap?noop:function(func){return metaMap.get(func);};function getIndexOf(collection, target, fromIndex){var result=lodash.indexOf || indexOf;result = result === indexOf?baseIndexOf:result;return collection?result(collection, target, fromIndex):result;}function initCloneArray(array){var length=array.length, result=new array.constructor(length);if(length && typeof array[0] == "string" && hasOwnProperty.call(array, "index")){result.index = array.index;result.input = array.input;}return result;}function initCloneObject(object){var Ctor=object.constructor;if(!(typeof Ctor == "function" && Ctor instanceof Ctor)){Ctor = Object;}return new Ctor();}function initCloneByTag(object, tag, isDeep){var Ctor=object.constructor;switch(tag){case arrayBufferTag:return bufferClone(object);case boolTag:case dateTag:return new Ctor(+object);case float32Tag:case float64Tag:case int8Tag:case int16Tag:case int32Tag:case uint8Tag:case uint8ClampedTag:case uint16Tag:case uint32Tag:var buffer=object.buffer;return new Ctor(isDeep?bufferClone(buffer):buffer, object.byteOffset, object.length);case numberTag:case stringTag:return new Ctor(object);case regexpTag:var result=new Ctor(object.source, reFlags.exec(object));result.lastIndex = object.lastIndex;}return result;}function isBindable(func){var support=lodash.support, result=!(support.funcNames?func.name:support.funcDecomp);if(!result){var source=fnToString.call(func);if(!support.funcNames){result = !reFuncName.test(source);}if(!result){result = reThis.test(source) || isNative(func);baseSetData(func, result);}}return result;}function isIndex(value, length){value = +value;length = length == null?MAX_SAFE_INTEGER:length;return value > -1 && value % 1 == 0 && value < length;}function isIterateeCall(value, index, object){if(!isObject(object)){return false;}var type=typeof index;if(type == "number"){var length=object.length, prereq=isLength(length) && isIndex(index, length);}else {prereq = type == "string" && index in object;}if(prereq){var other=object[index];return value === value?value === other:other !== other;}return false;}function isLength(value){return typeof value == "number" && value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER;}function isStrictComparable(value){return value === value && (value === 0?1 / value > 0:!isObject(value));}function mergeData(data, source){var bitmask=data[1], srcBitmask=source[1], newBitmask=bitmask | srcBitmask;var arityFlags=ARY_FLAG | REARG_FLAG, bindFlags=BIND_FLAG | BIND_KEY_FLAG, comboFlags=arityFlags | bindFlags | CURRY_BOUND_FLAG | CURRY_RIGHT_FLAG;var isAry=bitmask & ARY_FLAG && !(srcBitmask & ARY_FLAG), isRearg=bitmask & REARG_FLAG && !(srcBitmask & REARG_FLAG), argPos=(isRearg?data:source)[7], ary=(isAry?data:source)[8];var isCommon=!(bitmask >= REARG_FLAG && srcBitmask > bindFlags) && !(bitmask > bindFlags && srcBitmask >= REARG_FLAG);var isCombo=newBitmask >= arityFlags && newBitmask <= comboFlags && (bitmask < REARG_FLAG || (isRearg || isAry) && argPos.length <= ary);if(!(isCommon || isCombo)){return data;}if(srcBitmask & BIND_FLAG){data[2] = source[2];newBitmask |= bitmask & BIND_FLAG?0:CURRY_BOUND_FLAG;}var value=source[3];if(value){var partials=data[3];data[3] = partials?composeArgs(partials, value, source[4]):arrayCopy(value);data[4] = partials?replaceHolders(data[3], PLACEHOLDER):arrayCopy(source[4]);}value = source[5];if(value){partials = data[5];data[5] = partials?composeArgsRight(partials, value, source[6]):arrayCopy(value);data[6] = partials?replaceHolders(data[5], PLACEHOLDER):arrayCopy(source[6]);}value = source[7];if(value){data[7] = arrayCopy(value);}if(srcBitmask & ARY_FLAG){data[8] = data[8] == null?source[8]:nativeMin(data[8], source[8]);}if(data[9] == null){data[9] = source[9];}data[0] = source[0];data[1] = newBitmask;return data;}function pickByArray(object, props){object = toObject(object);var index=-1, length=props.length, result={};while(++index < length) {var key=props[index];if(key in object){result[key] = object[key];}}return result;}function pickByCallback(object, predicate){var result={};baseForIn(object, function(value, key, object){if(predicate(value, key, object)){result[key] = value;}});return result;}function reorder(array, indexes){var arrLength=array.length, length=nativeMin(indexes.length, arrLength), oldArray=arrayCopy(array);while(length--) {var index=indexes[length];array[length] = isIndex(index, arrLength)?oldArray[index]:undefined;}return array;}var setData=(function(){var count=0, lastCalled=0;return function(key, value){var stamp=now(), remaining=HOT_SPAN - (stamp - lastCalled);lastCalled = stamp;if(remaining > 0){if(++count >= HOT_COUNT){return key;}}else {count = 0;}return baseSetData(key, value);};})();function shimIsPlainObject(value){var Ctor, support=lodash.support;if(!(isObjectLike(value) && objToString.call(value) == objectTag) || !hasOwnProperty.call(value, "constructor") && (Ctor = value.constructor, typeof Ctor == "function" && !(Ctor instanceof Ctor))){return false;}var result;baseForIn(value, function(subValue, key){result = key;});return typeof result == "undefined" || hasOwnProperty.call(value, result);}function shimKeys(object){var props=keysIn(object), propsLength=props.length, length=propsLength && object.length, support=lodash.support;var allowIndexes=length && isLength(length) && (isArray(object) || support.nonEnumArgs && isArguments(object));var index=-1, result=[];while(++index < propsLength) {var key=props[index];if(allowIndexes && isIndex(key, length) || hasOwnProperty.call(object, key)){result.push(key);}}return result;}function toObject(value){return isObject(value)?value:Object(value);}function difference(){var args=arguments, index=-1, length=args.length;while(++index < length) {var value=args[index];if(isArray(value) || isArguments(value)){break;}}return baseDifference(value, baseFlatten(args, false, true, ++index));}function findIndex(array, predicate, thisArg){var index=-1, length=array?array.length:0;predicate = getCallback(predicate, thisArg, 3);while(++index < length) {if(predicate(array[index], index, array)){return index;}}return -1;}function indexOf(array, value, fromIndex){var length=array?array.length:0;if(!length){return -1;}if(typeof fromIndex == "number"){fromIndex = fromIndex < 0?nativeMax(length + fromIndex, 0):fromIndex;}else if(fromIndex){var index=binaryIndex(array, value), other=array[index];if(value === value?value === other:other !== other){return index;}return -1;}return baseIndexOf(array, value, fromIndex || 0);}function intersection(){var args=[], argsIndex=-1, argsLength=arguments.length, caches=[], indexOf=getIndexOf(), isCommon=indexOf == baseIndexOf;while(++argsIndex < argsLength) {var value=arguments[argsIndex];if(isArray(value) || isArguments(value)){args.push(value);caches.push(isCommon && value.length >= 120?createCache(argsIndex && value):null);}}argsLength = args.length;var array=args[0], index=-1, length=array?array.length:0, result=[], seen=caches[0];outer: while(++index < length) {value = array[index];if((seen?cacheIndexOf(seen, value):indexOf(result, value, 0)) < 0){argsIndex = argsLength;while(--argsIndex) {var cache=caches[argsIndex];if((cache?cacheIndexOf(cache, value):indexOf(args[argsIndex], value, 0)) < 0){continue outer;}}if(seen){seen.push(value);}result.push(value);}}return result;}function last(array){var length=array?array.length:0;return length?array[length - 1]:undefined;}function every(collection, predicate, thisArg){var func=isArray(collection)?arrayEvery:baseEvery;if(typeof predicate != "function" || typeof thisArg != "undefined"){predicate = getCallback(predicate, thisArg, 3);}return func(collection, predicate);}function find(collection, predicate, thisArg){if(isArray(collection)){var index=findIndex(collection, predicate, thisArg);return index > -1?collection[index]:undefined;}predicate = getCallback(predicate, thisArg, 3);return baseFind(collection, predicate, baseEach);}function forEach(collection, iteratee, thisArg){return typeof iteratee == "function" && typeof thisArg == "undefined" && isArray(collection)?arrayEach(collection, iteratee):baseEach(collection, bindCallback(iteratee, thisArg, 3));}function invoke(collection, methodName){return baseInvoke(collection, methodName, baseSlice(arguments, 2));}function map(collection, iteratee, thisArg){var func=isArray(collection)?arrayMap:baseMap;iteratee = getCallback(iteratee, thisArg, 3);return func(collection, iteratee);}function reduce(collection, iteratee, accumulator, thisArg){var func=isArray(collection)?arrayReduce:baseReduce;return func(collection, getCallback(iteratee, thisArg, 4), accumulator, arguments.length < 3, baseEach);}var now=nativeNow || function(){return new Date().getTime();};function bind(func, thisArg){var bitmask=BIND_FLAG;if(arguments.length > 2){var partials=baseSlice(arguments, 2), holders=replaceHolders(partials, bind.placeholder);bitmask |= PARTIAL_FLAG;}return createWrapper(func, bitmask, thisArg, partials, holders);}function defer(func){return baseDelay(func, 1, arguments, 1);}function partial(func){var partials=baseSlice(arguments, 1), holders=replaceHolders(partials, partial.placeholder);return createWrapper(func, PARTIAL_FLAG, null, partials, holders);}function clone(value, isDeep, customizer, thisArg){if(isDeep && typeof isDeep != "boolean" && isIterateeCall(value, isDeep, customizer)){isDeep = false;}else if(typeof isDeep == "function"){thisArg = customizer;customizer = isDeep;isDeep = false;}customizer = typeof customizer == "function" && bindCallback(customizer, thisArg, 1);return baseClone(value, isDeep, customizer);}function isArguments(value){var length=isObjectLike(value)?value.length:undefined;return isLength(length) && objToString.call(value) == argsTag || false;}var isArray=nativeIsArray || function(value){return isObjectLike(value) && isLength(value.length) && objToString.call(value) == arrayTag || false;};function isElement(value){return value && value.nodeType === 1 && isObjectLike(value) && objToString.call(value).indexOf("Element") > -1 || false;}if(!support.dom){isElement = function(value){return value && value.nodeType === 1 && isObjectLike(value) && !isPlainObject(value) || false;};}function isEqual(value, other, customizer, thisArg){customizer = typeof customizer == "function" && bindCallback(customizer, thisArg, 3);if(!customizer && isStrictComparable(value) && isStrictComparable(other)){return value === other;}var result=customizer?customizer(value, other):undefined;return typeof result == "undefined"?baseIsEqual(value, other, customizer):!!result;}var isFunction=!(baseIsFunction(/x/) || Uint8Array && !baseIsFunction(Uint8Array))?baseIsFunction:function(value){return objToString.call(value) == funcTag;};function isObject(value){var type=typeof value;return type == "function" || value && type == "object" || false;}function isNative(value){if(value == null){return false;}if(objToString.call(value) == funcTag){return reNative.test(fnToString.call(value));}return isObjectLike(value) && reHostCtor.test(value) || false;}function isNumber(value){return typeof value == "number" || isObjectLike(value) && objToString.call(value) == numberTag || false;}var isPlainObject=!getPrototypeOf?shimIsPlainObject:function(value){if(!(value && objToString.call(value) == objectTag)){return false;}var valueOf=value.valueOf, objProto=isNative(valueOf) && (objProto = getPrototypeOf(valueOf)) && getPrototypeOf(objProto);return objProto?value == objProto || getPrototypeOf(value) == objProto:shimIsPlainObject(value);};function isString(value){return typeof value == "string" || isObjectLike(value) && objToString.call(value) == stringTag || false;}function isTypedArray(value){return isObjectLike(value) && isLength(value.length) && typedArrayTags[objToString.call(value)] || false;}var assign=createAssigner(baseAssign);function defaults(object){if(object == null){return object;}var args=arrayCopy(arguments);args.push(assignDefaults);return assign.apply(undefined, args);}var keys=!nativeKeys?shimKeys:function(object){if(object){var Ctor=object.constructor, length=object.length;}if(typeof Ctor == "function" && Ctor.prototype === object || typeof object != "function" && (length && isLength(length))){return shimKeys(object);}return isObject(object)?nativeKeys(object):[];};function keysIn(object){if(object == null){return [];}if(!isObject(object)){object = Object(object);}var length=object.length;length = length && isLength(length) && (isArray(object) || support.nonEnumArgs && isArguments(object)) && length || 0;var Ctor=object.constructor, index=-1, isProto=typeof Ctor == "function" && Ctor.prototype === object, result=Array(length), skipIndexes=length > 0;while(++index < length) {result[index] = index + "";}for(var key in object) {if(!(skipIndexes && isIndex(key, length)) && !(key == "constructor" && (isProto || !hasOwnProperty.call(object, key)))){result.push(key);}}return result;}function omit(object, predicate, thisArg){if(object == null){return {};}if(typeof predicate != "function"){var props=arrayMap(baseFlatten(arguments, false, false, 1), String);return pickByArray(object, baseDifference(keysIn(object), props));}predicate = bindCallback(predicate, thisArg, 3);return pickByCallback(object, function(value, key, object){return !predicate(value, key, object);});}function values(object){return baseValues(object, keys(object));}function escapeRegExp(string){string = baseToString(string);return string && reHasRegExpChars.test(string)?string.replace(reRegExpChars, "\\$&"):string;}function callback(func, thisArg, guard){if(guard && isIterateeCall(func, thisArg, guard)){thisArg = null;}return isObjectLike(func)?matches(func):baseCallback(func, thisArg);}function constant(value){return function(){return value;};}function identity(value){return value;}function matches(source){return baseMatches(baseClone(source, true));}function noop(){}function uniqueId(prefix){var id=++idCounter;return baseToString(prefix) + id;}SetCache.prototype.push = cachePush;lodash.assign = assign;lodash.bind = bind;lodash.callback = callback;lodash.constant = constant;lodash.defaults = defaults;lodash.defer = defer;lodash.difference = difference;lodash.forEach = forEach;lodash.intersection = intersection;lodash.invoke = invoke;lodash.keys = keys;lodash.keysIn = keysIn;lodash.map = map;lodash.matches = matches;lodash.omit = omit;lodash.partial = partial;lodash.values = values;lodash.collect = map;lodash.each = forEach;lodash.extend = assign;lodash.iteratee = callback;lodash.clone = clone;lodash.escapeRegExp = escapeRegExp;lodash.every = every;lodash.find = find;lodash.findIndex = findIndex;lodash.identity = identity;lodash.indexOf = indexOf;lodash.isArguments = isArguments;lodash.isArray = isArray;lodash.isElement = isElement;lodash.isEqual = isEqual;lodash.isFunction = isFunction;lodash.isNative = isNative;lodash.isNumber = isNumber;lodash.isObject = isObject;lodash.isPlainObject = isPlainObject;lodash.isString = isString;lodash.isTypedArray = isTypedArray;lodash.last = last;lodash.noop = noop;lodash.now = now;lodash.reduce = reduce;lodash.uniqueId = uniqueId;lodash.all = every;lodash.detect = find;lodash.foldl = reduce;lodash.inject = reduce;lodash.VERSION = VERSION;arrayEach(["bind", "partial"], function(methodName){lodash[methodName].placeholder = lodash;});if(typeof define == "function" && typeof define.amd == "object" && define.amd){root._ = lodash;define(function(){return lodash;});}else if(freeExports && freeModule){if(moduleExports){(freeModule.exports = lodash)._ = lodash;}else {freeExports._ = lodash;}}else {root._ = lodash;}}).call(this);}).call(this, typeof global !== "undefined"?global:typeof self !== "undefined"?self:typeof window !== "undefined"?window:{});}, {}], 2:[function(_dereq_, module, exports){;!(function(undefined){var isArray=Array.isArray?Array.isArray:function _isArray(obj){return Object.prototype.toString.call(obj) === "[object Array]";};var defaultMaxListeners=10;function init(){this._events = {};if(this._conf){configure.call(this, this._conf);}}function configure(conf){if(conf){this._conf = conf;conf.delimiter && (this.delimiter = conf.delimiter);conf.maxListeners && (this._events.maxListeners = conf.maxListeners);conf.wildcard && (this.wildcard = conf.wildcard);conf.newListener && (this.newListener = conf.newListener);if(this.wildcard){this.listenerTree = {};}}}function EventEmitter(conf){this._events = {};this.newListener = false;configure.call(this, conf);}function searchListenerTree(handlers, type, tree, i){if(!tree){return [];}var listeners=[], leaf, len, branch, xTree, xxTree, isolatedBranch, endReached, typeLength=type.length, currentType=type[i], nextType=type[i + 1];if(i === typeLength && tree._listeners){if(typeof tree._listeners === "function"){handlers && handlers.push(tree._listeners);return [tree];}else {for(leaf = 0, len = tree._listeners.length; leaf < len; leaf++) {handlers && handlers.push(tree._listeners[leaf]);}return [tree];}}if(currentType === "*" || currentType === "**" || tree[currentType]){if(currentType === "*"){for(branch in tree) {if(branch !== "_listeners" && tree.hasOwnProperty(branch)){listeners = listeners.concat(searchListenerTree(handlers, type, tree[branch], i + 1));}}return listeners;}else if(currentType === "**"){endReached = i + 1 === typeLength || i + 2 === typeLength && nextType === "*";if(endReached && tree._listeners){listeners = listeners.concat(searchListenerTree(handlers, type, tree, typeLength));}for(branch in tree) {if(branch !== "_listeners" && tree.hasOwnProperty(branch)){if(branch === "*" || branch === "**"){if(tree[branch]._listeners && !endReached){listeners = listeners.concat(searchListenerTree(handlers, type, tree[branch], typeLength));}listeners = listeners.concat(searchListenerTree(handlers, type, tree[branch], i));}else if(branch === nextType){listeners = listeners.concat(searchListenerTree(handlers, type, tree[branch], i + 2));}else {listeners = listeners.concat(searchListenerTree(handlers, type, tree[branch], i));}}}return listeners;}listeners = listeners.concat(searchListenerTree(handlers, type, tree[currentType], i + 1));}xTree = tree["*"];if(xTree){searchListenerTree(handlers, type, xTree, i + 1);}xxTree = tree["**"];if(xxTree){if(i < typeLength){if(xxTree._listeners){searchListenerTree(handlers, type, xxTree, typeLength);}for(branch in xxTree) {if(branch !== "_listeners" && xxTree.hasOwnProperty(branch)){if(branch === nextType){searchListenerTree(handlers, type, xxTree[branch], i + 2);}else if(branch === currentType){searchListenerTree(handlers, type, xxTree[branch], i + 1);}else {isolatedBranch = {};isolatedBranch[branch] = xxTree[branch];searchListenerTree(handlers, type, {"**":isolatedBranch}, i + 1);}}}}else if(xxTree._listeners){searchListenerTree(handlers, type, xxTree, typeLength);}else if(xxTree["*"] && xxTree["*"]._listeners){searchListenerTree(handlers, type, xxTree["*"], typeLength);}}return listeners;}function growListenerTree(type, listener){type = typeof type === "string"?type.split(this.delimiter):type.slice();for(var i=0, len=type.length; i + 1 < len; i++) {if(type[i] === "**" && type[i + 1] === "**"){return;}}var tree=this.listenerTree;var name=type.shift();while(name) {if(!tree[name]){tree[name] = {};}tree = tree[name];if(type.length === 0){if(!tree._listeners){tree._listeners = listener;}else if(typeof tree._listeners === "function"){tree._listeners = [tree._listeners, listener];}else if(isArray(tree._listeners)){tree._listeners.push(listener);if(!tree._listeners.warned){var m=defaultMaxListeners;if(typeof this._events.maxListeners !== "undefined"){m = this._events.maxListeners;}if(m > 0 && tree._listeners.length > m){tree._listeners.warned = true;console.error("(node) warning: possible EventEmitter memory " + "leak detected. %d listeners added. " + "Use emitter.setMaxListeners() to increase limit.", tree._listeners.length);console.trace();}}}return true;}name = type.shift();}return true;}EventEmitter.prototype.delimiter = ".";EventEmitter.prototype.setMaxListeners = function(n){this._events || init.call(this);this._events.maxListeners = n;if(!this._conf)this._conf = {};this._conf.maxListeners = n;};EventEmitter.prototype.event = "";EventEmitter.prototype.once = function(event, fn){this.many(event, 1, fn);return this;};EventEmitter.prototype.many = function(event, ttl, fn){var self=this;if(typeof fn !== "function"){throw new Error("many only accepts instances of Function");}function listener(){if(--ttl === 0){self.off(event, listener);}fn.apply(this, arguments);}listener._origin = fn;this.on(event, listener);return self;};EventEmitter.prototype.emit = function(){this._events || init.call(this);var type=arguments[0];if(type === "newListener" && !this.newListener){if(!this._events.newListener){return false;}}if(this._all){var l=arguments.length;var args=new Array(l - 1);for(var i=1; i < l; i++) args[i - 1] = arguments[i];for(i = 0, l = this._all.length; i < l; i++) {this.event = type;this._all[i].apply(this, args);}}if(type === "error"){if(!this._all && !this._events.error && !(this.wildcard && this.listenerTree.error)){if(arguments[1] instanceof Error){throw arguments[1];}else {throw new Error("Uncaught, unspecified 'error' event.");}return false;}}var handler;if(this.wildcard){handler = [];var ns=typeof type === "string"?type.split(this.delimiter):type.slice();searchListenerTree.call(this, handler, ns, this.listenerTree, 0);}else {handler = this._events[type];}if(typeof handler === "function"){this.event = type;if(arguments.length === 1){handler.call(this);}else if(arguments.length > 1)switch(arguments.length){case 2:handler.call(this, arguments[1]);break;case 3:handler.call(this, arguments[1], arguments[2]);break;default:var l=arguments.length;var args=new Array(l - 1);for(var i=1; i < l; i++) args[i - 1] = arguments[i];handler.apply(this, args);}return true;}else if(handler){var l=arguments.length;var args=new Array(l - 1);for(var i=1; i < l; i++) args[i - 1] = arguments[i];var listeners=handler.slice();for(var i=0, l=listeners.length; i < l; i++) {this.event = type;listeners[i].apply(this, args);}return listeners.length > 0 || !!this._all;}else {return !!this._all;}};EventEmitter.prototype.on = function(type, listener){if(typeof type === "function"){this.onAny(type);return this;}if(typeof listener !== "function"){throw new Error("on only accepts instances of Function");}this._events || init.call(this);this.emit("newListener", type, listener);if(this.wildcard){growListenerTree.call(this, type, listener);return this;}if(!this._events[type]){this._events[type] = listener;}else if(typeof this._events[type] === "function"){this._events[type] = [this._events[type], listener];}else if(isArray(this._events[type])){this._events[type].push(listener);if(!this._events[type].warned){var m=defaultMaxListeners;if(typeof this._events.maxListeners !== "undefined"){m = this._events.maxListeners;}if(m > 0 && this._events[type].length > m){this._events[type].warned = true;console.error("(node) warning: possible EventEmitter memory " + "leak detected. %d listeners added. " + "Use emitter.setMaxListeners() to increase limit.", this._events[type].length);console.trace();}}}return this;};EventEmitter.prototype.onAny = function(fn){if(typeof fn !== "function"){throw new Error("onAny only accepts instances of Function");}if(!this._all){this._all = [];}this._all.push(fn);return this;};EventEmitter.prototype.addListener = EventEmitter.prototype.on;EventEmitter.prototype.off = function(type, listener){if(typeof listener !== "function"){throw new Error("removeListener only takes instances of Function");}var handlers, leafs=[];if(this.wildcard){var ns=typeof type === "string"?type.split(this.delimiter):type.slice();leafs = searchListenerTree.call(this, null, ns, this.listenerTree, 0);}else {if(!this._events[type])return this;handlers = this._events[type];leafs.push({_listeners:handlers});}for(var iLeaf=0; iLeaf < leafs.length; iLeaf++) {var leaf=leafs[iLeaf];handlers = leaf._listeners;if(isArray(handlers)){var position=-1;for(var i=0, length=handlers.length; i < length; i++) {if(handlers[i] === listener || handlers[i].listener && handlers[i].listener === listener || handlers[i]._origin && handlers[i]._origin === listener){position = i;break;}}if(position < 0){continue;}if(this.wildcard){leaf._listeners.splice(position, 1);}else {this._events[type].splice(position, 1);}if(handlers.length === 0){if(this.wildcard){delete leaf._listeners;}else {delete this._events[type];}}return this;}else if(handlers === listener || handlers.listener && handlers.listener === listener || handlers._origin && handlers._origin === listener){if(this.wildcard){delete leaf._listeners;}else {delete this._events[type];}}}return this;};EventEmitter.prototype.offAny = function(fn){var i=0, l=0, fns;if(fn && this._all && this._all.length > 0){fns = this._all;for(i = 0, l = fns.length; i < l; i++) {if(fn === fns[i]){fns.splice(i, 1);return this;}}}else {this._all = [];}return this;};EventEmitter.prototype.removeListener = EventEmitter.prototype.off;EventEmitter.prototype.removeAllListeners = function(type){if(arguments.length === 0){!this._events || init.call(this);return this;}if(this.wildcard){var ns=typeof type === "string"?type.split(this.delimiter):type.slice();var leafs=searchListenerTree.call(this, null, ns, this.listenerTree, 0);for(var iLeaf=0; iLeaf < leafs.length; iLeaf++) {var leaf=leafs[iLeaf];leaf._listeners = null;}}else {if(!this._events[type])return this;this._events[type] = null;}return this;};EventEmitter.prototype.listeners = function(type){if(this.wildcard){var handlers=[];var ns=typeof type === "string"?type.split(this.delimiter):type.slice();searchListenerTree.call(this, handlers, ns, this.listenerTree, 0);return handlers;}this._events || init.call(this);if(!this._events[type])this._events[type] = [];if(!isArray(this._events[type])){this._events[type] = [this._events[type]];}return this._events[type];};EventEmitter.prototype.listenersAny = function(){if(this._all){return this._all;}else {return [];}};if(typeof define === "function" && define.amd){define(function(){return EventEmitter;});}else if(typeof exports === "object"){exports.EventEmitter2 = EventEmitter;}else {window.EventEmitter2 = EventEmitter;}})();}, {}], 3:[function(_dereq_, module, exports){var diff=_dereq_("fast-diff");var is=_dereq_("./is");var op=_dereq_("./op");var NULL_CHARACTER=String.fromCharCode(0);var Delta=function Delta(ops){if(is.array(ops)){this.ops = ops;}else if(is.object(ops) && is.array(ops.ops)){this.ops = ops.ops;}else {this.ops = [];}};Delta.prototype.insert = function(text, attributes){var newOp={};if(is.string(text)){if(text.length === 0)return this;newOp.insert = text;}else if(is.number(text)){newOp.insert = text;}if(is.object(attributes) && Object.keys(attributes).length > 0)newOp.attributes = attributes;return this.push(newOp);};Delta.prototype["delete"] = function(length){if(length <= 0)return this;return this.push({"delete":length});};Delta.prototype.retain = function(length, attributes){if(length <= 0)return this;var newOp={retain:length};if(is.object(attributes) && Object.keys(attributes).length > 0)newOp.attributes = attributes;return this.push(newOp);};Delta.prototype.push = function(newOp){var index=this.ops.length;var lastOp=this.ops[index - 1];newOp = op.clone(newOp);if(is.object(lastOp)){if(is.number(newOp["delete"]) && is.number(lastOp["delete"])){this.ops[index - 1] = {"delete":lastOp["delete"] + newOp["delete"]};return this;}if(is.number(lastOp["delete"]) && (is.string(newOp.insert) || is.number(newOp.insert))){index -= 1;lastOp = this.ops[index - 1];if(!is.object(lastOp)){this.ops.unshift(newOp);return this;}}if(is.equal(newOp.attributes, lastOp.attributes)){if(is.string(newOp.insert) && is.string(lastOp.insert)){this.ops[index - 1] = {insert:lastOp.insert + newOp.insert};if(is.object(newOp.attributes))this.ops[index - 1].attributes = newOp.attributes;return this;}else if(is.number(newOp.retain) && is.number(lastOp.retain)){this.ops[index - 1] = {retain:lastOp.retain + newOp.retain};if(is.object(newOp.attributes))this.ops[index - 1].attributes = newOp.attributes;return this;}}}this.ops.splice(index, 0, newOp);return this;};Delta.prototype.chop = function(){var lastOp=this.ops[this.ops.length - 1];if(lastOp && lastOp.retain && !lastOp.attributes){this.ops.pop();}return this;};Delta.prototype.length = function(){return this.ops.reduce(function(length, elem){return length + op.length(elem);}, 0);};Delta.prototype.slice = function(start, end){start = start || 0;if(!is.number(end))end = Infinity;var delta=new Delta();var iter=op.iterator(this.ops);var index=0;while(index < end && iter.hasNext()) {var nextOp;if(index < start){nextOp = iter.next(start - index);}else {nextOp = iter.next(end - index);delta.push(nextOp);}index += op.length(nextOp);}return delta;};Delta.prototype.compose = function(other){var thisIter=op.iterator(this.ops);var otherIter=op.iterator(other.ops);this.ops = [];while(thisIter.hasNext() || otherIter.hasNext()) {if(otherIter.peekType() === "insert"){this.push(otherIter.next());}else if(thisIter.peekType() === "delete"){this.push(thisIter.next());}else {var length=Math.min(thisIter.peekLength(), otherIter.peekLength());var thisOp=thisIter.next(length);var otherOp=otherIter.next(length);if(is.number(otherOp.retain)){var newOp={};if(is.number(thisOp.retain)){newOp.retain = length;}else {newOp.insert = thisOp.insert;}var attributes=op.attributes.compose(thisOp.attributes, otherOp.attributes, is.number(thisOp.retain));if(attributes)newOp.attributes = attributes;this.push(newOp);}else if(is.number(otherOp["delete"]) && is.number(thisOp.retain)){this.push(otherOp);}}}return this.chop();};Delta.prototype.diff = function(other){var strings=[this.ops, other.ops].map(function(ops){return ops.map(function(op){if(is.string(op.insert))return op.insert;if(is.number(op.insert))return NULL_CHARACTER;var prep=ops === other.ops?"on":"with";throw new Error("diff() called " + prep + " non-document");}).join("");});var diffResult=diff(strings[0], strings[1]);var thisIter=op.iterator(this.ops);var otherIter=op.iterator(other.ops);var delta=new Delta();diffResult.forEach(function(component){var length=component[1].length;while(length > 0) {var opLength=0;switch(component[0]){case diff.INSERT:opLength = Math.min(otherIter.peekLength(), length);delta.push(otherIter.next(opLength));break;case diff.DELETE:opLength = Math.min(length, thisIter.peekLength());thisIter.next(opLength);delta["delete"](opLength);break;case diff.EQUAL:opLength = Math.min(thisIter.peekLength(), otherIter.peekLength(), length);var thisOp=thisIter.next(opLength);var otherOp=otherIter.next(opLength);if(thisOp.insert === otherOp.insert){delta.retain(opLength, op.attributes.diff(thisOp.attributes, otherOp.attributes));}else {delta.push(otherOp)["delete"](opLength);}break;}length -= opLength;}});return delta.chop();};Delta.prototype.transform = function(other, priority){priority = !!priority;if(is.number(other)){return this.transformPosition(other, priority);}var thisIter=op.iterator(this.ops);var otherIter=op.iterator(other.ops);var delta=new Delta();while(thisIter.hasNext() || otherIter.hasNext()) {if(thisIter.peekType() === "insert" && (priority || otherIter.peekType() !== "insert")){delta.retain(op.length(thisIter.next()));}else if(otherIter.peekType() === "insert"){delta.push(otherIter.next());}else {var length=Math.min(thisIter.peekLength(), otherIter.peekLength());var thisOp=thisIter.next(length);var otherOp=otherIter.next(length);if(thisOp["delete"]){continue;}else if(otherOp["delete"]){delta.push(otherOp);}else {delta.retain(length, op.attributes.transform(thisOp.attributes, otherOp.attributes, priority));}}}return delta.chop();};Delta.prototype.transformPosition = function(index, priority){priority = !!priority;var thisIter=op.iterator(this.ops);var offset=0;while(thisIter.hasNext() && offset <= index) {var length=thisIter.peekLength();var nextType=thisIter.peekType();thisIter.next();if(nextType === "delete"){index -= Math.min(length, index - offset);continue;}else if(nextType === "insert" && (offset < index || !priority)){index += length;}offset += length;}return index;};module.exports = Delta;}, {"./is":4, "./op":5, "fast-diff":6}], 4:[function(_dereq_, module, exports){module.exports = {equal:function equal(a, b){if(a === b)return true;if(a == null && b == null)return true;if(a == null || b == null)return false;if(Object.keys(a).length != Object.keys(b).length)return false;for(var key in a) {if(a[key] !== b[key])return false;}return true;}, array:function array(value){return Array.isArray(value);}, number:function number(value){if(typeof value === "number")return true;if(typeof value === "object" && Object.prototype.toString.call(value) === "[object Number]")return true;return false;}, object:function object(value){if(!value)return false;return typeof value === "function" || typeof value === "object";}, string:function string(value){if(typeof value === "string")return true;if(typeof value === "object" && Object.prototype.toString.call(value) === "[object String]")return true;return false;}};}, {}], 5:[function(_dereq_, module, exports){var is=_dereq_("./is");var lib={attributes:{clone:function clone(attributes, keepNull){if(!is.object(attributes))return {};return Object.keys(attributes).reduce(function(memo, key){if(attributes[key] !== undefined && (attributes[key] !== null || keepNull)){memo[key] = attributes[key];}return memo;}, {});}, compose:function compose(a, b, keepNull){if(!is.object(a))a = {};if(!is.object(b))b = {};var attributes=this.clone(b, keepNull);for(var key in a) {if(a[key] !== undefined && b[key] === undefined){attributes[key] = a[key];}}return Object.keys(attributes).length > 0?attributes:undefined;}, diff:function diff(a, b){if(!is.object(a))a = {};if(!is.object(b))b = {};var attributes=Object.keys(a).concat(Object.keys(b)).reduce(function(attributes, key){if(a[key] !== b[key]){attributes[key] = b[key] === undefined?null:b[key];}return attributes;}, {});return Object.keys(attributes).length > 0?attributes:undefined;}, transform:function transform(a, b, priority){if(!is.object(a))return b;if(!is.object(b))return undefined;if(!priority)return b;var attributes=Object.keys(b).reduce(function(attributes, key){if(a[key] === undefined)attributes[key] = b[key];return attributes;}, {});return Object.keys(attributes).length > 0?attributes:undefined;}}, clone:function clone(op){var newOp=this.attributes.clone(op);if(is.object(newOp.attributes)){newOp.attributes = this.attributes.clone(newOp.attributes, true);}return newOp;}, iterator:function iterator(ops){return new Iterator(ops);}, length:function length(op){if(is.number(op["delete"])){return op["delete"];}else if(is.number(op.retain)){return op.retain;}else {return is.string(op.insert)?op.insert.length:1;}}};function Iterator(ops){this.ops = ops;this.index = 0;this.offset = 0;};Iterator.prototype.hasNext = function(){return this.peekLength() < Infinity;};Iterator.prototype.next = function(length){if(!length)length = Infinity;var nextOp=this.ops[this.index];if(nextOp){var offset=this.offset;var opLength=lib.length(nextOp);if(length >= opLength - offset){length = opLength - offset;this.index += 1;this.offset = 0;}else {this.offset += length;}if(is.number(nextOp["delete"])){return {"delete":length};}else {var retOp={};if(nextOp.attributes){retOp.attributes = nextOp.attributes;}if(is.number(nextOp.retain)){retOp.retain = length;}else if(is.string(nextOp.insert)){retOp.insert = nextOp.insert.substr(offset, length);}else {retOp.insert = nextOp.insert;}return retOp;}}else {return {retain:Infinity};}};Iterator.prototype.peekLength = function(){if(this.ops[this.index]){return lib.length(this.ops[this.index]) - this.offset;}else {return Infinity;}};Iterator.prototype.peekType = function(){if(this.ops[this.index]){if(is.number(this.ops[this.index]["delete"])){return "delete";}else if(is.number(this.ops[this.index].retain)){return "retain";}else {return "insert";}}return "retain";};module.exports = lib;}, {"./is":4}], 6:[function(_dereq_, module, exports){var DIFF_DELETE=-1;var DIFF_INSERT=1;var DIFF_EQUAL=0;function diff_main(text1, text2){if(text1 == text2){if(text1){return [[DIFF_EQUAL, text1]];}return [];}var commonlength=diff_commonPrefix(text1, text2);var commonprefix=text1.substring(0, commonlength);text1 = text1.substring(commonlength);text2 = text2.substring(commonlength);commonlength = diff_commonSuffix(text1, text2);var commonsuffix=text1.substring(text1.length - commonlength);text1 = text1.substring(0, text1.length - commonlength);text2 = text2.substring(0, text2.length - commonlength);var diffs=diff_compute_(text1, text2);if(commonprefix){diffs.unshift([DIFF_EQUAL, commonprefix]);}if(commonsuffix){diffs.push([DIFF_EQUAL, commonsuffix]);}diff_cleanupMerge(diffs);return diffs;};function diff_compute_(text1, text2){var diffs;if(!text1){return [[DIFF_INSERT, text2]];}if(!text2){return [[DIFF_DELETE, text1]];}var longtext=text1.length > text2.length?text1:text2;var shorttext=text1.length > text2.length?text2:text1;var i=longtext.indexOf(shorttext);if(i != -1){diffs = [[DIFF_INSERT, longtext.substring(0, i)], [DIFF_EQUAL, shorttext], [DIFF_INSERT, longtext.substring(i + shorttext.length)]];if(text1.length > text2.length){diffs[0][0] = diffs[2][0] = DIFF_DELETE;}return diffs;}if(shorttext.length == 1){return [[DIFF_DELETE, text1], [DIFF_INSERT, text2]];}var hm=diff_halfMatch_(text1, text2);if(hm){var text1_a=hm[0];var text1_b=hm[1];var text2_a=hm[2];var text2_b=hm[3];var mid_common=hm[4];var diffs_a=diff_main(text1_a, text2_a);var diffs_b=diff_main(text1_b, text2_b);return diffs_a.concat([[DIFF_EQUAL, mid_common]], diffs_b);}return diff_bisect_(text1, text2);};function diff_bisect_(text1, text2){var text1_length=text1.length;var text2_length=text2.length;var max_d=Math.ceil((text1_length + text2_length) / 2);var v_offset=max_d;var v_length=2 * max_d;var v1=new Array(v_length);var v2=new Array(v_length);for(var x=0; x < v_length; x++) {v1[x] = -1;v2[x] = -1;}v1[v_offset + 1] = 0;v2[v_offset + 1] = 0;var delta=text1_length - text2_length;var front=delta % 2 != 0;var k1start=0;var k1end=0;var k2start=0;var k2end=0;for(var d=0; d < max_d; d++) {for(var k1=-d + k1start; k1 <= d - k1end; k1 += 2) {var k1_offset=v_offset + k1;var x1;if(k1 == -d || k1 != d && v1[k1_offset - 1] < v1[k1_offset + 1]){x1 = v1[k1_offset + 1];}else {x1 = v1[k1_offset - 1] + 1;}var y1=x1 - k1;while(x1 < text1_length && y1 < text2_length && text1.charAt(x1) == text2.charAt(y1)) {x1++;y1++;}v1[k1_offset] = x1;if(x1 > text1_length){k1end += 2;}else if(y1 > text2_length){k1start += 2;}else if(front){var k2_offset=v_offset + delta - k1;if(k2_offset >= 0 && k2_offset < v_length && v2[k2_offset] != -1){var x2=text1_length - v2[k2_offset];if(x1 >= x2){return diff_bisectSplit_(text1, text2, x1, y1);}}}}for(var k2=-d + k2start; k2 <= d - k2end; k2 += 2) {var k2_offset=v_offset + k2;var x2;if(k2 == -d || k2 != d && v2[k2_offset - 1] < v2[k2_offset + 1]){x2 = v2[k2_offset + 1];}else {x2 = v2[k2_offset - 1] + 1;}var y2=x2 - k2;while(x2 < text1_length && y2 < text2_length && text1.charAt(text1_length - x2 - 1) == text2.charAt(text2_length - y2 - 1)) {x2++;y2++;}v2[k2_offset] = x2;if(x2 > text1_length){k2end += 2;}else if(y2 > text2_length){k2start += 2;}else if(!front){var k1_offset=v_offset + delta - k2;if(k1_offset >= 0 && k1_offset < v_length && v1[k1_offset] != -1){var x1=v1[k1_offset];var y1=v_offset + x1 - k1_offset;x2 = text1_length - x2;if(x1 >= x2){return diff_bisectSplit_(text1, text2, x1, y1);}}}}}return [[DIFF_DELETE, text1], [DIFF_INSERT, text2]];};function diff_bisectSplit_(text1, text2, x, y){var text1a=text1.substring(0, x);var text2a=text2.substring(0, y);var text1b=text1.substring(x);var text2b=text2.substring(y);var diffs=diff_main(text1a, text2a);var diffsb=diff_main(text1b, text2b);return diffs.concat(diffsb);};function diff_commonPrefix(text1, text2){if(!text1 || !text2 || text1.charAt(0) != text2.charAt(0)){return 0;}var pointermin=0;var pointermax=Math.min(text1.length, text2.length);var pointermid=pointermax;var pointerstart=0;while(pointermin < pointermid) {if(text1.substring(pointerstart, pointermid) == text2.substring(pointerstart, pointermid)){pointermin = pointermid;pointerstart = pointermin;}else {pointermax = pointermid;}pointermid = Math.floor((pointermax - pointermin) / 2 + pointermin);}return pointermid;};function diff_commonSuffix(text1, text2){if(!text1 || !text2 || text1.charAt(text1.length - 1) != text2.charAt(text2.length - 1)){return 0;}var pointermin=0;var pointermax=Math.min(text1.length, text2.length);var pointermid=pointermax;var pointerend=0;while(pointermin < pointermid) {if(text1.substring(text1.length - pointermid, text1.length - pointerend) == text2.substring(text2.length - pointermid, text2.length - pointerend)){pointermin = pointermid;pointerend = pointermin;}else {pointermax = pointermid;}pointermid = Math.floor((pointermax - pointermin) / 2 + pointermin);}return pointermid;};function diff_halfMatch_(text1, text2){var longtext=text1.length > text2.length?text1:text2;var shorttext=text1.length > text2.length?text2:text1;if(longtext.length < 4 || shorttext.length * 2 < longtext.length){return null;}function diff_halfMatchI_(longtext, shorttext, i){var seed=longtext.substring(i, i + Math.floor(longtext.length / 4));var j=-1;var best_common="";var best_longtext_a, best_longtext_b, best_shorttext_a, best_shorttext_b;while((j = shorttext.indexOf(seed, j + 1)) != -1) {var prefixLength=diff_commonPrefix(longtext.substring(i), shorttext.substring(j));var suffixLength=diff_commonSuffix(longtext.substring(0, i), shorttext.substring(0, j));if(best_common.length < suffixLength + prefixLength){best_common = shorttext.substring(j - suffixLength, j) + shorttext.substring(j, j + prefixLength);best_longtext_a = longtext.substring(0, i - suffixLength);best_longtext_b = longtext.substring(i + prefixLength);best_shorttext_a = shorttext.substring(0, j - suffixLength);best_shorttext_b = shorttext.substring(j + prefixLength);}}if(best_common.length * 2 >= longtext.length){return [best_longtext_a, best_longtext_b, best_shorttext_a, best_shorttext_b, best_common];}else {return null;}}var hm1=diff_halfMatchI_(longtext, shorttext, Math.ceil(longtext.length / 4));var hm2=diff_halfMatchI_(longtext, shorttext, Math.ceil(longtext.length / 2));var hm;if(!hm1 && !hm2){return null;}else if(!hm2){hm = hm1;}else if(!hm1){hm = hm2;}else {hm = hm1[4].length > hm2[4].length?hm1:hm2;}var text1_a, text1_b, text2_a, text2_b;if(text1.length > text2.length){text1_a = hm[0];text1_b = hm[1];text2_a = hm[2];text2_b = hm[3];}else {text2_a = hm[0];text2_b = hm[1];text1_a = hm[2];text1_b = hm[3];}var mid_common=hm[4];return [text1_a, text1_b, text2_a, text2_b, mid_common];};function diff_cleanupMerge(diffs){diffs.push([DIFF_EQUAL, ""]);var pointer=0;var count_delete=0;var count_insert=0;var text_delete="";var text_insert="";var commonlength;while(pointer < diffs.length) {switch(diffs[pointer][0]){case DIFF_INSERT:count_insert++;text_insert += diffs[pointer][1];pointer++;break;case DIFF_DELETE:count_delete++;text_delete += diffs[pointer][1];pointer++;break;case DIFF_EQUAL:if(count_delete + count_insert > 1){if(count_delete !== 0 && count_insert !== 0){commonlength = diff_commonPrefix(text_insert, text_delete);if(commonlength !== 0){if(pointer - count_delete - count_insert > 0 && diffs[pointer - count_delete - count_insert - 1][0] == DIFF_EQUAL){diffs[pointer - count_delete - count_insert - 1][1] += text_insert.substring(0, commonlength);}else {diffs.splice(0, 0, [DIFF_EQUAL, text_insert.substring(0, commonlength)]);pointer++;}text_insert = text_insert.substring(commonlength);text_delete = text_delete.substring(commonlength);}commonlength = diff_commonSuffix(text_insert, text_delete);if(commonlength !== 0){diffs[pointer][1] = text_insert.substring(text_insert.length - commonlength) + diffs[pointer][1];text_insert = text_insert.substring(0, text_insert.length - commonlength);text_delete = text_delete.substring(0, text_delete.length - commonlength);}}if(count_delete === 0){diffs.splice(pointer - count_insert, count_delete + count_insert, [DIFF_INSERT, text_insert]);}else if(count_insert === 0){diffs.splice(pointer - count_delete, count_delete + count_insert, [DIFF_DELETE, text_delete]);}else {diffs.splice(pointer - count_delete - count_insert, count_delete + count_insert, [DIFF_DELETE, text_delete], [DIFF_INSERT, text_insert]);}pointer = pointer - count_delete - count_insert + (count_delete?1:0) + (count_insert?1:0) + 1;}else if(pointer !== 0 && diffs[pointer - 1][0] == DIFF_EQUAL){diffs[pointer - 1][1] += diffs[pointer][1];diffs.splice(pointer, 1);}else {pointer++;}count_insert = 0;count_delete = 0;text_delete = "";text_insert = "";break;}}if(diffs[diffs.length - 1][1] === ""){diffs.pop();}var changes=false;pointer = 1;while(pointer < diffs.length - 1) {if(diffs[pointer - 1][0] == DIFF_EQUAL && diffs[pointer + 1][0] == DIFF_EQUAL){if(diffs[pointer][1].substring(diffs[pointer][1].length - diffs[pointer - 1][1].length) == diffs[pointer - 1][1]){diffs[pointer][1] = diffs[pointer - 1][1] + diffs[pointer][1].substring(0, diffs[pointer][1].length - diffs[pointer - 1][1].length);diffs[pointer + 1][1] = diffs[pointer - 1][1] + diffs[pointer + 1][1];diffs.splice(pointer - 1, 1);changes = true;}else if(diffs[pointer][1].substring(0, diffs[pointer + 1][1].length) == diffs[pointer + 1][1]){diffs[pointer - 1][1] += diffs[pointer + 1][1];diffs[pointer][1] = diffs[pointer][1].substring(diffs[pointer + 1][1].length) + diffs[pointer + 1][1];diffs.splice(pointer + 1, 1);changes = true;}}pointer++;}if(changes){diff_cleanupMerge(diffs);}};var diff=diff_main;diff.INSERT = DIFF_INSERT;diff.DELETE = DIFF_DELETE;diff.EQUAL = DIFF_EQUAL;module.exports = diff;}, {}], 7:[function(_dereq_, module, exports){module.exports = {"version":"0.19.12"};}, {}], 8:[function(_dereq_, module, exports){var Delta, Document, Format, Line, LinkedList, Normalizer, _, dom;_ = _dereq_("lodash");Delta = _dereq_("rich-text/lib/delta");dom = _dereq_("../lib/dom");Format = _dereq_("./format");Line = _dereq_("./line");LinkedList = _dereq_("../lib/linked-list");Normalizer = _dereq_("./normalizer");Document = (function(){function Document(root, options){this.root = root;if(options == null){options = {};}this.normalizer = new Normalizer();this.formats = {};_.each(options.formats, _.bind(this.addFormat, this));this.setHTML(this.root.innerHTML);}Document.prototype.addFormat = function(name, config){if(!_.isObject(config)){config = Format.FORMATS[name];}if(this.formats[name] != null){console.warn("Overwriting format", name, this.formats[name]);}this.formats[name] = new Format(config);return this.normalizer.addFormat(config);};Document.prototype.appendLine = function(lineNode){return this.insertLineBefore(lineNode, null);};Document.prototype.findLeafAt = function(index, inclusive){var line, offset, ref;ref = this.findLineAt(index), line = ref[0], offset = ref[1];if(line != null){return line.findLeafAt(offset, inclusive);}else {return [void 0, offset];}};Document.prototype.findLine = function(node){var line;while(node != null && dom.BLOCK_TAGS[node.tagName] == null) {node = node.parentNode;}line = node != null?dom(node).data(Line.DATA_KEY):void 0;if((line != null?line.node:void 0) === node){return line;}else {return void 0;}};Document.prototype.findLineAt = function(index){var curLine, length;if(!(this.lines.length > 0)){return [void 0, index];}length = this.toDelta().length();if(index === length){return [this.lines.last, this.lines.last.length];}if(index > length){return [void 0, index - length];}curLine = this.lines.first;while(curLine != null) {if(index < curLine.length){return [curLine, index];}index -= curLine.length;curLine = curLine.next;}return [void 0, index];};Document.prototype.getHTML = function(){return this.root.innerHTML.replace(/\>\s+\</g, ">&nbsp;<");};Document.prototype.insertLineBefore = function(newLineNode, refLine){var line;line = new Line(this, newLineNode);if(refLine != null){if(!dom(newLineNode.parentNode).isElement()){this.root.insertBefore(newLineNode, refLine.node);}this.lines.insertAfter(refLine.prev, line);}else {if(!dom(newLineNode.parentNode).isElement()){this.root.appendChild(newLineNode);}this.lines.append(line);}return line;};Document.prototype.mergeLines = function(line, lineToMerge){if(lineToMerge.length > 1){if(line.length === 1){dom(line.leaves.last.node).remove();}_.each(dom(lineToMerge.node).childNodes(), function(child){if(child.tagName !== dom.DEFAULT_BREAK_TAG){return line.node.appendChild(child);}});}this.removeLine(lineToMerge);return line.rebuild();};Document.prototype.optimizeLines = function(){return _.each(this.lines.toArray(), function(line, i){line.optimize();return true;});};Document.prototype.rebuild = function(){var lineNode, lines, results;lines = this.lines.toArray();lineNode = this.root.firstChild;if(lineNode != null && dom.LIST_TAGS[lineNode.tagName] != null){lineNode = lineNode.firstChild;}_.each(lines, (function(_this){return function(line, index){var newLine, ref;while(line.node !== lineNode) {if(line.node.parentNode === _this.root || ((ref = line.node.parentNode) != null?ref.parentNode:void 0) === _this.root){lineNode = _this.normalizer.normalizeLine(lineNode);newLine = _this.insertLineBefore(lineNode, line);lineNode = dom(lineNode).nextLineNode(_this.root);}else {return _this.removeLine(line);}}if(line.outerHTML !== lineNode.outerHTML){line.node = _this.normalizer.normalizeLine(line.node);line.rebuild();}return lineNode = dom(lineNode).nextLineNode(_this.root);};})(this));results = [];while(lineNode != null) {lineNode = this.normalizer.normalizeLine(lineNode);this.appendLine(lineNode);results.push(lineNode = dom(lineNode).nextLineNode(this.root));}return results;};Document.prototype.removeLine = function(line){if(line.node.parentNode != null){if(dom.LIST_TAGS[line.node.parentNode.tagName] && line.node.parentNode.childNodes.length === 1){dom(line.node.parentNode).remove();}else {dom(line.node).remove();}}return this.lines.remove(line);};Document.prototype.setHTML = function(html){html = Normalizer.stripComments(html);html = Normalizer.stripWhitespace(html);this.root.innerHTML = html;this.lines = new LinkedList();return this.rebuild();};Document.prototype.splitLine = function(line, offset){var lineNode1, lineNode2, newLine, ref;offset = Math.min(offset, line.length - 1);ref = dom(line.node).split(offset, true), lineNode1 = ref[0], lineNode2 = ref[1];line.node = lineNode1;line.rebuild();newLine = this.insertLineBefore(lineNode2, line.next);newLine.formats = _.clone(line.formats);newLine.resetContent();return newLine;};Document.prototype.toDelta = function(){var delta, lines;lines = this.lines.toArray();delta = new Delta();_.each(lines, function(line){return _.each(line.delta.ops, function(op){return delta.push(op);});});return delta;};return Document;})();module.exports = Document;}, {"../lib/dom":17, "../lib/linked-list":18, "./format":10, "./line":12, "./normalizer":13, "lodash":1, "rich-text/lib/delta":3}], 9:[function(_dereq_, module, exports){var Document, Editor, Line, Selection, _, dom;_ = _dereq_("lodash");dom = _dereq_("../lib/dom");Document = _dereq_("./document");Line = _dereq_("./line");Selection = _dereq_("./selection");Editor = (function(){Editor.sources = {API:"api", SILENT:"silent", USER:"user"};function Editor(root, quill, options){this.root = root;this.quill = quill;this.options = options != null?options:{};this.root.setAttribute("id", this.options.id);this.doc = new Document(this.root, this.options);this.delta = this.doc.toDelta();this.length = this.delta.length();this.selection = new Selection(this.doc, this.quill);this.timer = setInterval(_.bind(this.checkUpdate, this), this.options.pollInterval);if(!this.options.readOnly){this.enable();}}Editor.prototype.destroy = function(){return clearInterval(this.timer);};Editor.prototype.disable = function(){return this.enable(false);};Editor.prototype.enable = function(enabled){if(enabled == null){enabled = true;}return this.root.setAttribute("contenteditable", enabled);};Editor.prototype.applyDelta = function(delta, source){var localDelta;localDelta = this._update();if(localDelta){delta = localDelta.transform(delta, true);localDelta = delta.transform(localDelta, false);}if(delta.ops.length > 0){delta = this._trackDelta((function(_this){return function(){var index;index = 0;_.each(delta.ops, function(op){if(_.isString(op.insert)){_this._insertAt(index, op.insert, op.attributes);return index += op.insert.length;}else if(_.isNumber(op.insert)){_this._insertEmbed(index, op.attributes);return index += 1;}else if(_.isNumber(op["delete"])){return _this._deleteAt(index, op["delete"]);}else if(_.isNumber(op.retain)){_.each(op.attributes, function(value, name){return _this._formatAt(index, op.retain, name, value);});return index += op.retain;}});return _this.selection.shiftAfter(0, 0, _.bind(_this.doc.optimizeLines, _this.doc));};})(this));this.delta = this.doc.toDelta();this.length = this.delta.length();this.innerHTML = this.root.innerHTML;if(delta && source !== Editor.sources.SILENT){this.quill.emit(this.quill.constructor.events.TEXT_CHANGE, delta, source);}}if(localDelta && localDelta.ops.length > 0 && source !== Editor.sources.SILENT){return this.quill.emit(this.quill.constructor.events.TEXT_CHANGE, localDelta, Editor.sources.USER);}};Editor.prototype.checkUpdate = function(source){var delta;if(source == null){source = "user";}if(this.root.parentNode == null){return clearInterval(this.timer);}delta = this._update();if(delta){this.delta.compose(delta);this.length = this.delta.length();this.quill.emit(this.quill.constructor.events.TEXT_CHANGE, delta, source);}if(delta){source = Editor.sources.SILENT;}return this.selection.update(source);};Editor.prototype.focus = function(){if(this.selection.range != null){return this.selection.setRange(this.selection.range);}else {return this.root.focus();}};Editor.prototype.getBounds = function(index){var bounds, containerBounds, leaf, offset, range, ref, side;this.checkUpdate();ref = this.doc.findLeafAt(index, true), leaf = ref[0], offset = ref[1];if(leaf == null){throw new Error("Invalid index");}containerBounds = this.root.parentNode.getBoundingClientRect();side = "left";if(leaf.length === 0){bounds = leaf.node.parentNode.getBoundingClientRect();}else if(dom.VOID_TAGS[leaf.node.tagName]){bounds = leaf.node.getBoundingClientRect();if(offset === 1){side = "right";}}else {range = document.createRange();if(offset < leaf.length){range.setStart(leaf.node, offset);range.setEnd(leaf.node, offset + 1);}else {range.setStart(leaf.node, offset - 1);range.setEnd(leaf.node, offset);side = "right";}bounds = range.getBoundingClientRect();}return {height:bounds.height, left:bounds[side] - containerBounds.left, top:bounds.top - containerBounds.top};};Editor.prototype._deleteAt = function(index, length){if(length <= 0){return;}return this.selection.shiftAfter(index, -1 * length, (function(_this){return function(){var curLine, deleteLength, firstLine, mergeFirstLine, nextLine, offset, ref;ref = _this.doc.findLineAt(index), firstLine = ref[0], offset = ref[1];curLine = firstLine;mergeFirstLine = firstLine.length - offset <= length && offset > 0;while(curLine != null && length > 0) {nextLine = curLine.next;deleteLength = Math.min(curLine.length - offset, length);if(offset === 0 && length >= curLine.length){_this.doc.removeLine(curLine);}else {curLine.deleteText(offset, deleteLength);}length -= deleteLength;curLine = nextLine;offset = 0;}if(mergeFirstLine && firstLine.next){return _this.doc.mergeLines(firstLine, firstLine.next);}};})(this));};Editor.prototype._formatAt = function(index, length, name, value){return this.selection.shiftAfter(index, 0, (function(_this){return function(){var formatLength, line, offset, ref, results;ref = _this.doc.findLineAt(index), line = ref[0], offset = ref[1];results = [];while(line != null && length > 0) {formatLength = Math.min(length, line.length - offset - 1);line.formatText(offset, formatLength, name, value);length -= formatLength;if(length > 0){line.format(name, value);}length -= 1;offset = 0;results.push(line = line.next);}return results;};})(this));};Editor.prototype._insertEmbed = function(index, attributes){return this.selection.shiftAfter(index, 1, (function(_this){return function(){var line, offset, ref;ref = _this.doc.findLineAt(index), line = ref[0], offset = ref[1];return line.insertEmbed(offset, attributes);};})(this));};Editor.prototype._insertAt = function(index, text, formatting){if(formatting == null){formatting = {};}return this.selection.shiftAfter(index, text.length, (function(_this){return function(){var line, lineTexts, offset, ref;text = text.replace(/\r\n?/g, "\n");lineTexts = text.split("\n");ref = _this.doc.findLineAt(index), line = ref[0], offset = ref[1];return _.each(lineTexts, function(lineText, i){var nextLine;if(line == null || line.length <= offset){if(i < lineTexts.length - 1 || lineText.length > 0){line = _this.doc.appendLine(document.createElement(dom.DEFAULT_BLOCK_TAG));offset = 0;line.insertText(offset, lineText, formatting);line.format(formatting);nextLine = null;}}else {line.insertText(offset, lineText, formatting);if(i < lineTexts.length - 1){nextLine = _this.doc.splitLine(line, offset + lineText.length);_.each(_.defaults({}, formatting, line.formats), function(value, format){return line.format(format, formatting[format]);});offset = 0;}}return line = nextLine;});};})(this));};Editor.prototype._trackDelta = function(fn){var delta, newDelta;fn();newDelta = this.doc.toDelta();delta = this.delta.diff(newDelta);return delta;};Editor.prototype._update = function(){var delta;if(this.innerHTML === this.root.innerHTML){return false;}delta = this._trackDelta((function(_this){return function(){_this.selection.preserve(_.bind(_this.doc.rebuild, _this.doc));return _this.selection.shiftAfter(0, 0, _.bind(_this.doc.optimizeLines, _this.doc));};})(this));this.innerHTML = this.root.innerHTML;if(delta.ops.length > 0){return delta;}else {return false;}};return Editor;})();module.exports = Editor;}, {"../lib/dom":17, "./document":8, "./line":12, "./selection":14, "lodash":1}], 10:[function(_dereq_, module, exports){var Format, _, dom;_ = _dereq_("lodash");dom = _dereq_("../lib/dom");Format = (function(){Format.types = {LINE:"line", EMBED:"embed"};Format.FORMATS = {bold:{tag:"B", prepare:"bold"}, italic:{tag:"I", prepare:"italic"}, underline:{tag:"U", prepare:"underline"}, strike:{tag:"S", prepare:"strikeThrough"}, color:{style:"color", "default":"rgb(0, 0, 0)", prepare:"foreColor"}, background:{style:"backgroundColor", "default":"rgb(255, 255, 255)", prepare:"backColor"}, font:{style:"fontFamily", "default":"'Helvetica', 'Arial', sans-serif", prepare:"fontName"}, size:{style:"fontSize", "default":"13px", prepare:function prepare(value){return document.execCommand("fontSize", false, dom.convertFontSize(value));}}, link:{tag:"A", add:function add(node, value){node.setAttribute("href", value);return node;}, remove:function remove(node){node.removeAttribute("href");return node;}, value:function value(node){return node.getAttribute("href");}}, image:{type:Format.types.EMBED, tag:"IMG", attribute:"src"}, align:{type:Format.types.LINE, style:"textAlign", "default":"left"}, bullet:{type:Format.types.LINE, exclude:"list", parentTag:"UL", tag:"LI"}, list:{type:Format.types.LINE, exclude:"bullet", parentTag:"OL", tag:"LI"}};function Format(config){this.config = config;}Format.prototype.add = function(node, value){var formatNode, inline, parentNode, ref, ref1;if(!value){return this.remove(node);}if(this.value(node) === value){return node;}if(_.isString(this.config.parentTag)){parentNode = document.createElement(this.config.parentTag);dom(node).wrap(parentNode);if(node.parentNode.tagName === ((ref = node.parentNode.previousSibling) != null?ref.tagName:void 0)){dom(node.parentNode.previousSibling).merge(node.parentNode);}if(node.parentNode.tagName === ((ref1 = node.parentNode.nextSibling) != null?ref1.tagName:void 0)){dom(node.parentNode).merge(node.parentNode.nextSibling);}}if(_.isString(this.config.tag)){formatNode = document.createElement(this.config.tag);if(dom.VOID_TAGS[formatNode.tagName] != null){if(node.parentNode != null){dom(node).replace(formatNode);}node = formatNode;}else if(this.isType(Format.types.LINE)){node = dom(node).switchTag(this.config.tag);}else {dom(node).wrap(formatNode);node = formatNode;}}if(_.isString(this.config.style) || _.isString(this.config.attribute) || _.isString(this.config["class"])){if(_.isString(this.config["class"])){node = this.remove(node);}if(dom(node).isTextNode()){inline = document.createElement(dom.DEFAULT_INLINE_TAG);dom(node).wrap(inline);node = inline;}if(_.isString(this.config.style)){if(value !== this.config["default"]){node.style[this.config.style] = value;}}if(_.isString(this.config.attribute)){node.setAttribute(this.config.attribute, value);}if(_.isString(this.config["class"])){dom(node).addClass(this.config["class"] + value);}}if(_.isFunction(this.config.add)){node = this.config.add(node, value);}return node;};Format.prototype.isType = function(type){return type === this.config.type;};Format.prototype.match = function(node){var c, i, len, ref, ref1;if(!dom(node).isElement()){return false;}if(_.isString(this.config.parentTag) && ((ref = node.parentNode) != null?ref.tagName:void 0) !== this.config.parentTag){return false;}if(_.isString(this.config.tag) && node.tagName !== this.config.tag){return false;}if(_.isString(this.config.style) && (!node.style[this.config.style] || node.style[this.config.style] === this.config["default"])){return false;}if(_.isString(this.config.attribute) && !node.hasAttribute(this.config.attribute)){return false;}if(_.isString(this.config["class"])){ref1 = dom(node).classes();for(i = 0, len = ref1.length; i < len; i++) {c = ref1[i];if(c.indexOf(this.config["class"]) === 0){return true;}}return false;}return true;};Format.prototype.prepare = function(value){if(_.isString(this.config.prepare)){return document.execCommand(this.config.prepare, false, value);}else if(_.isFunction(this.config.prepare)){return this.config.prepare(value);}};Format.prototype.remove = function(node){var c, i, len, ref;if(!this.match(node)){return node;}if(_.isString(this.config.style)){node.style[this.config.style] = "";if(!node.getAttribute("style")){node.removeAttribute("style");}}if(_.isString(this.config.attribute)){node.removeAttribute(this.config.attribute);}if(_.isString(this.config["class"])){ref = dom(node).classes();for(i = 0, len = ref.length; i < len; i++) {c = ref[i];if(c.indexOf(this.config["class"]) === 0){dom(node).removeClass(c);}}}if(_.isString(this.config.tag)){if(this.isType(Format.types.LINE)){if(_.isString(this.config.parentTag)){if(node.previousSibling != null){dom(node).splitBefore(node.parentNode.parentNode);}if(node.nextSibling != null){dom(node.nextSibling).splitBefore(node.parentNode.parentNode);}}node = dom(node).switchTag(dom.DEFAULT_BLOCK_TAG);}else if(this.isType(Format.types.EMBED)){dom(node).remove();return void 0;}else {node = dom(node).switchTag(dom.DEFAULT_INLINE_TAG);}}if(_.isString(this.config.parentTag)){dom(node.parentNode).unwrap();}if(_.isFunction(this.config.remove)){node = this.config.remove(node);}if(node.tagName === dom.DEFAULT_INLINE_TAG && !node.hasAttributes()){node = dom(node).unwrap();}return node;};Format.prototype.value = function(node){var c, i, len, ref;if(!this.match(node)){return void 0;}if(this.config.value){return this.config.value(node);}if(_.isString(this.config.attribute)){return node.getAttribute(this.config.attribute) || void 0;}else if(_.isString(this.config.style)){return node.style[this.config.style] || void 0;}else if(_.isString(this.config["class"])){ref = dom(node).classes();for(i = 0, len = ref.length; i < len; i++) {c = ref[i];if(c.indexOf(this.config["class"]) === 0){return c.slice(this.config["class"].length);}}}else if(_.isString(this.config.tag)){return true;}return void 0;};return Format;})();module.exports = Format;}, {"../lib/dom":17, "lodash":1}], 11:[function(_dereq_, module, exports){var Format, Leaf, LinkedList, _, dom, extend=function extend(child, parent){for(var key in parent) {if(hasProp.call(parent, key))child[key] = parent[key];}function ctor(){this.constructor = child;}ctor.prototype = parent.prototype;child.prototype = new ctor();child.__super__ = parent.prototype;return child;}, hasProp=({}).hasOwnProperty;_ = _dereq_("lodash");dom = _dereq_("../lib/dom");Format = _dereq_("./format");LinkedList = _dereq_("../lib/linked-list");Leaf = (function(superClass){extend(Leaf, superClass);Leaf.DATA_KEY = "leaf";Leaf.isLeafNode = function(node){return dom(node).isTextNode() || node.firstChild == null;};function Leaf(node1, formats){this.node = node1;this.formats = _.clone(formats);this.text = dom(this.node).text();this.length = this.text.length;dom(this.node).data(Leaf.DATA_KEY, this);}Leaf.prototype.deleteText = function(offset, length){var textNode;if(!(length > 0)){return;}this.text = this.text.slice(0, offset) + this.text.slice(offset + length);this.length = this.text.length;if(dom.EMBED_TAGS[this.node.tagName] != null){textNode = document.createTextNode(this.text);dom(textNode).data(Leaf.DATA_KEY, this);return this.node = dom(this.node).replace(textNode);}else {return dom(this.node).text(this.text);}};Leaf.prototype.insertText = function(offset, text){var textNode;this.text = this.text.slice(0, offset) + text + this.text.slice(offset);if(dom(this.node).isTextNode()){dom(this.node).text(this.text);}else {textNode = document.createTextNode(text);dom(textNode).data(Leaf.DATA_KEY, this);if(this.node.tagName === dom.DEFAULT_BREAK_TAG){this.node = dom(this.node).replace(textNode);}else {this.node.appendChild(textNode);this.node = textNode;}}return this.length = this.text.length;};return Leaf;})(LinkedList.Node);module.exports = Leaf;}, {"../lib/dom":17, "../lib/linked-list":18, "./format":10, "lodash":1}], 12:[function(_dereq_, module, exports){var Delta, Format, Leaf, Line, LinkedList, Normalizer, _, dom, extend=function extend(child, parent){for(var key in parent) {if(hasProp.call(parent, key))child[key] = parent[key];}function ctor(){this.constructor = child;}ctor.prototype = parent.prototype;child.prototype = new ctor();child.__super__ = parent.prototype;return child;}, hasProp=({}).hasOwnProperty;_ = _dereq_("lodash");Delta = _dereq_("rich-text/lib/delta");dom = _dereq_("../lib/dom");Format = _dereq_("./format");Leaf = _dereq_("./leaf");Line = _dereq_("./line");LinkedList = _dereq_("../lib/linked-list");Normalizer = _dereq_("./normalizer");Line = (function(superClass){extend(Line, superClass);Line.DATA_KEY = "line";function Line(doc, node1){this.doc = doc;this.node = node1;this.formats = {};this.rebuild();Line.__super__.constructor.call(this, this.node);}Line.prototype.buildLeaves = function(node, formats){return _.each(dom(node).childNodes(), (function(_this){return function(node){var nodeFormats;node = _this.doc.normalizer.normalizeNode(node);nodeFormats = _.clone(formats);_.each(_this.doc.formats, function(format, name){if(!format.isType(Format.types.LINE) && format.match(node)){return nodeFormats[name] = format.value(node);}});if(Leaf.isLeafNode(node)){return _this.leaves.append(new Leaf(node, nodeFormats));}else {return _this.buildLeaves(node, nodeFormats);}};})(this));};Line.prototype.deleteText = function(offset, length){var deleteLength, leaf, ref;if(!(length > 0)){return;}ref = this.findLeafAt(offset), leaf = ref[0], offset = ref[1];while(leaf != null && length > 0) {deleteLength = Math.min(length, leaf.length - offset);leaf.deleteText(offset, deleteLength);length -= deleteLength;leaf = leaf.next;offset = 0;}return this.rebuild();};Line.prototype.findLeaf = function(leafNode){if(leafNode != null){return dom(leafNode).data(Leaf.DATA_KEY);}else {return void 0;}};Line.prototype.findLeafAt = function(offset, inclusive){var leaf;if(inclusive == null){inclusive = false;}if(offset >= this.length - 1){return [this.leaves.last, this.leaves.last.length];}leaf = this.leaves.first;while(leaf != null) {if(offset < leaf.length || offset === leaf.length && inclusive){return [leaf, offset];}offset -= leaf.length;leaf = leaf.next;}return [this.leaves.last, offset - this.leaves.last.length];};Line.prototype.format = function(name, value){var formats;if(_.isObject(name)){formats = name;}else {formats = {};formats[name] = value;}_.each(formats, (function(_this){return function(value, name){var excludeFormat, format;format = _this.doc.formats[name];if(format == null){return;}if(format.isType(Format.types.LINE)){if(format.config.exclude && _this.formats[format.config.exclude]){excludeFormat = _this.doc.formats[format.config.exclude];if(excludeFormat != null){_this.node = excludeFormat.remove(_this.node);delete _this.formats[format.config.exclude];}}_this.node = format.add(_this.node, value);}if(value){return _this.formats[name] = value;}else {return delete _this.formats[name];}};})(this));return this.resetContent();};Line.prototype.formatText = function(offset, length, name, value){var format, leaf, leafOffset, leftNode, nextLeaf, ref, ref1, ref2, rightNode, targetNode;ref = this.findLeafAt(offset), leaf = ref[0], leafOffset = ref[1];format = this.doc.formats[name];if(!(format != null && format.config.type !== Format.types.LINE)){return;}while(leaf != null && length > 0) {nextLeaf = leaf.next;if(value && leaf.formats[name] !== value || !value && leaf.formats[name] != null){targetNode = leaf.node;if(leaf.formats[name] != null){dom(targetNode).splitBefore(this.node);while(!format.match(targetNode)) {targetNode = targetNode.parentNode;}dom(targetNode).split(leaf.length);}if(leafOffset > 0){ref1 = dom(targetNode).split(leafOffset), leftNode = ref1[0], targetNode = ref1[1];}if(leaf.length > leafOffset + length){ref2 = dom(targetNode).split(length), targetNode = ref2[0], rightNode = ref2[1];}format.add(targetNode, value);}length -= leaf.length - leafOffset;leafOffset = 0;leaf = nextLeaf;}return this.rebuild();};Line.prototype._insert = function(offset, node, formats){var leaf, leafOffset, nextNode, prevNode, ref, ref1;ref = this.findLeafAt(offset), leaf = ref[0], leafOffset = ref[1];node = _.reduce(formats, (function(_this){return function(node, value, name){var format;format = _this.doc.formats[name];if(format != null){node = format.add(node, value);}return node;};})(this), node);ref1 = dom(leaf.node).split(leafOffset), prevNode = ref1[0], nextNode = ref1[1];if(nextNode){nextNode = dom(nextNode).splitBefore(this.node).get();}this.node.insertBefore(node, nextNode);return this.rebuild();};Line.prototype.insertEmbed = function(offset, attributes){var formatName, leaf, leafOffset, nextNode, node, prevNode, ref, ref1;ref = this.findLeafAt(offset), leaf = ref[0], leafOffset = ref[1];ref1 = dom(leaf.node).split(leafOffset), prevNode = ref1[0], nextNode = ref1[1];formatName = _.find(Object.keys(attributes), (function(_this){return function(name){return _this.doc.formats[name].isType(Format.types.EMBED);};})(this));node = this.doc.formats[formatName].add({}, attributes[formatName]);attributes = _.clone(attributes);delete attributes[formatName];return this._insert(offset, node, attributes);};Line.prototype.insertText = function(offset, text, formats){var leaf, leafOffset, ref;if(formats == null){formats = {};}if(!(text.length > 0)){return;}ref = this.findLeafAt(offset), leaf = ref[0], leafOffset = ref[1];if(_.isEqual(leaf.formats, formats)){leaf.insertText(leafOffset, text);return this.resetContent();}else {return this._insert(offset, document.createTextNode(text), formats);}};Line.prototype.optimize = function(){Normalizer.optimizeLine(this.node);return this.rebuild();};Line.prototype.rebuild = function(force){if(force == null){force = false;}if(!force && this.outerHTML != null && this.outerHTML === this.node.outerHTML){if(_.all(this.leaves.toArray(), (function(_this){return function(leaf){return dom(leaf.node).isAncestor(_this.node);};})(this))){return false;}}this.node = this.doc.normalizer.normalizeNode(this.node);if(dom(this.node).length() === 0 && !this.node.querySelector(dom.DEFAULT_BREAK_TAG)){this.node.appendChild(document.createElement(dom.DEFAULT_BREAK_TAG));}this.leaves = new LinkedList();this.formats = _.reduce(this.doc.formats, (function(_this){return function(formats, format, name){if(format.isType(Format.types.LINE)){if(format.match(_this.node)){formats[name] = format.value(_this.node);}else {delete formats[name];}}return formats;};})(this), this.formats);this.buildLeaves(this.node, {});this.resetContent();return true;};Line.prototype.resetContent = function(){dom(this.node).data(Line.DATA_KEY, this);this.outerHTML = this.node.outerHTML;this.length = 1;this.delta = new Delta();_.each(this.leaves.toArray(), (function(_this){return function(leaf){_this.length += leaf.length;if(dom.EMBED_TAGS[leaf.node.tagName] != null){return _this.delta.insert(1, leaf.formats);}else {return _this.delta.insert(leaf.text, leaf.formats);}};})(this));return this.delta.insert("\n", this.formats);};return Line;})(LinkedList.Node);module.exports = Line;}, {"../lib/dom":17, "../lib/linked-list":18, "./format":10, "./leaf":11, "./line":12, "./normalizer":13, "lodash":1, "rich-text/lib/delta":3}], 13:[function(_dereq_, module, exports){var Normalizer, _, camelize, dom;_ = _dereq_("lodash");dom = _dereq_("../lib/dom");camelize = function(str){str = str.replace(/(?:^|[-_])(\w)/g, function(i, c){if(c){return c.toUpperCase();}else {return "";}});return str.charAt(0).toLowerCase() + str.slice(1);};Normalizer = (function(){Normalizer.ALIASES = {"STRONG":"B", "EM":"I", "DEL":"S", "STRIKE":"S"};Normalizer.ATTRIBUTES = {"color":"color", "face":"fontFamily", "size":"fontSize"};function Normalizer(){this.whitelist = {styles:{}, tags:{}};this.whitelist.tags[dom.DEFAULT_BREAK_TAG] = true;this.whitelist.tags[dom.DEFAULT_BLOCK_TAG] = true;this.whitelist.tags[dom.DEFAULT_INLINE_TAG] = true;}Normalizer.prototype.addFormat = function(config){if(config.tag != null){this.whitelist.tags[config.tag] = true;}if(config.parentTag != null){this.whitelist.tags[config.parentTag] = true;}if(config.style != null){return this.whitelist.styles[config.style] = true;}};Normalizer.prototype.normalizeLine = function(lineNode){lineNode = Normalizer.wrapInline(lineNode);lineNode = Normalizer.handleBreaks(lineNode);lineNode = Normalizer.pullBlocks(lineNode);lineNode = this.normalizeNode(lineNode);Normalizer.unwrapText(lineNode);if(lineNode != null && dom.LIST_TAGS[lineNode.tagName] != null){lineNode = lineNode.firstChild;}return lineNode;};Normalizer.prototype.normalizeNode = function(node){if(dom(node).isTextNode()){return node;}_.each(Normalizer.ATTRIBUTES, function(style, attribute){var value;if(node.hasAttribute(attribute)){value = node.getAttribute(attribute);if(attribute === "size"){value = dom.convertFontSize(value);}node.style[style] = value;return node.removeAttribute(attribute);}});this.whitelistStyles(node);return this.whitelistTags(node);};Normalizer.prototype.whitelistStyles = function(node){var original, styles;original = dom(node).styles();styles = _.omit(original, (function(_this){return function(value, key){return _this.whitelist.styles[camelize(key)] == null;};})(this));if(Object.keys(styles).length < Object.keys(original).length){if(Object.keys(styles).length > 0){return dom(node).styles(styles, true);}else {return node.removeAttribute("style");}}};Normalizer.prototype.whitelistTags = function(node){if(!dom(node).isElement()){return node;}if(Normalizer.ALIASES[node.tagName] != null){node = dom(node).switchTag(Normalizer.ALIASES[node.tagName]);}else if(this.whitelist.tags[node.tagName] == null){if(dom.BLOCK_TAGS[node.tagName] != null){node = dom(node).switchTag(dom.DEFAULT_BLOCK_TAG);}else if(!node.hasAttributes() && node.firstChild != null){node = dom(node).unwrap();}else {node = dom(node).switchTag(dom.DEFAULT_INLINE_TAG);}}return node;};Normalizer.handleBreaks = function(lineNode){var breaks;breaks = _.map(lineNode.querySelectorAll(dom.DEFAULT_BREAK_TAG));_.each(breaks, (function(_this){return function(br){if(br.nextSibling != null && (!dom.isIE(10) || br.previousSibling != null)){return dom(br.nextSibling).splitBefore(lineNode.parentNode);}};})(this));return lineNode;};Normalizer.optimizeLine = function(lineNode){var lineNodeLength, node, nodes, results;lineNode.normalize();lineNodeLength = dom(lineNode).length();nodes = dom(lineNode).descendants();results = [];while(nodes.length > 0) {node = nodes.pop();if((node != null?node.parentNode:void 0) == null){continue;}if(dom.EMBED_TAGS[node.tagName] != null){continue;}if(node.tagName === dom.DEFAULT_BREAK_TAG){if(lineNodeLength !== 0){results.push(dom(node).remove());}else {results.push(void 0);}}else if(dom(node).length() === 0){nodes.push(node.nextSibling);results.push(dom(node).unwrap());}else if(node.previousSibling != null && node.tagName === node.previousSibling.tagName){if(_.isEqual(dom(node).attributes(), dom(node.previousSibling).attributes())){nodes.push(node.firstChild);results.push(dom(node.previousSibling).merge(node));}else {results.push(void 0);}}else {results.push(void 0);}}return results;};Normalizer.pullBlocks = function(lineNode){var curNode;curNode = lineNode.firstChild;while(curNode != null) {if(dom.BLOCK_TAGS[curNode.tagName] != null && curNode.tagName !== "LI"){dom(curNode).isolate(lineNode.parentNode);if(dom.LIST_TAGS[curNode.tagName] == null || !curNode.firstChild){dom(curNode).unwrap();Normalizer.pullBlocks(lineNode);}else {dom(curNode.parentNode).unwrap();if(lineNode.parentNode == null){lineNode = curNode;}}break;}curNode = curNode.nextSibling;}return lineNode;};Normalizer.stripComments = function(html){return html.replace(/<!--[\s\S]*?-->/g, "");};Normalizer.stripWhitespace = function(html){html = html.trim();html = html.replace(/(\r?\n|\r)+/g, " ");html = html.replace(/\>\s+\</g, "><");return html;};Normalizer.wrapInline = function(lineNode){var blockNode, nextNode;if(dom.BLOCK_TAGS[lineNode.tagName] != null){return lineNode;}blockNode = document.createElement(dom.DEFAULT_BLOCK_TAG);lineNode.parentNode.insertBefore(blockNode, lineNode);while(lineNode != null && dom.BLOCK_TAGS[lineNode.tagName] == null) {nextNode = lineNode.nextSibling;blockNode.appendChild(lineNode);lineNode = nextNode;}return blockNode;};Normalizer.unwrapText = function(lineNode){var spans;spans = _.map(lineNode.querySelectorAll(dom.DEFAULT_INLINE_TAG));return _.each(spans, function(span){if(!span.hasAttributes()){return dom(span).unwrap();}});};return Normalizer;})();module.exports = Normalizer;}, {"../lib/dom":17, "lodash":1}], 14:[function(_dereq_, module, exports){var Leaf, Normalizer, Range, Selection, _, dom;_ = _dereq_("lodash");dom = _dereq_("../lib/dom");Leaf = _dereq_("./leaf");Normalizer = _dereq_("./normalizer");Range = _dereq_("../lib/range");Selection = (function(){function Selection(doc, emitter){this.doc = doc;this.emitter = emitter;this.focus = false;this.range = new Range(0, 0);this.nullDelay = false;this.update("silent");}Selection.prototype.checkFocus = function(){return document.activeElement === this.doc.root;};Selection.prototype.getRange = function(ignoreFocus){var end, nativeRange, start;if(ignoreFocus == null){ignoreFocus = false;}if(this.checkFocus()){nativeRange = this._getNativeRange();if(nativeRange == null){return null;}start = this._positionToIndex(nativeRange.startContainer, nativeRange.startOffset);if(nativeRange.startContainer === nativeRange.endContainer && nativeRange.startOffset === nativeRange.endOffset){end = start;}else {end = this._positionToIndex(nativeRange.endContainer, nativeRange.endOffset);}return new Range(Math.min(start, end), Math.max(start, end));}else if(ignoreFocus){return this.range;}else {return null;}};Selection.prototype.preserve = function(fn){var endNode, endOffset, nativeRange, ref, ref1, ref2, ref3, startNode, startOffset;nativeRange = this._getNativeRange();if(nativeRange != null && this.checkFocus()){ref = this._encodePosition(nativeRange.startContainer, nativeRange.startOffset), startNode = ref[0], startOffset = ref[1];ref1 = this._encodePosition(nativeRange.endContainer, nativeRange.endOffset), endNode = ref1[0], endOffset = ref1[1];fn();ref2 = this._decodePosition(startNode, startOffset), startNode = ref2[0], startOffset = ref2[1];ref3 = this._decodePosition(endNode, endOffset), endNode = ref3[0], endOffset = ref3[1];return this._setNativeRange(startNode, startOffset, endNode, endOffset);}else {return fn();}};Selection.prototype.setRange = function(range, source){var endNode, endOffset, ref, ref1, ref2, startNode, startOffset;if(range != null){ref = this._indexToPosition(range.start), startNode = ref[0], startOffset = ref[1];if(range.isCollapsed()){ref1 = [startNode, startOffset], endNode = ref1[0], endOffset = ref1[1];}else {ref2 = this._indexToPosition(range.end), endNode = ref2[0], endOffset = ref2[1];}this._setNativeRange(startNode, startOffset, endNode, endOffset);}else {this._setNativeRange(null);}return this.update(source);};Selection.prototype.shiftAfter = function(index, length, fn){var range;range = this.getRange();fn();if(range != null){range.shift(index, length);return this.setRange(range, "silent");}};Selection.prototype.update = function(source){var emit, focus, range, toEmit;focus = this.checkFocus();range = this.getRange(true);emit = source !== "silent" && (!Range.compare(range, this.range) || focus !== this.focus);toEmit = focus?range:null;if(toEmit === null && source === "user" && !this.nullDelay){return this.nullDelay = true;}else {this.nullDelay = false;this.range = range;this.focus = focus;if(emit){return this.emitter.emit(this.emitter.constructor.events.SELECTION_CHANGE, toEmit, source);}}};Selection.prototype._decodePosition = function(node, offset){var childIndex;if(dom(node).isElement()){childIndex = dom(node.parentNode).childNodes().indexOf(node);offset += childIndex;node = node.parentNode;}return [node, offset];};Selection.prototype._encodePosition = function(node, offset){var text;while(true) {if(dom(node).isTextNode() || node.tagName === dom.DEFAULT_BREAK_TAG || dom.EMBED_TAGS[node.tagName] != null){return [node, offset];}else if(offset < node.childNodes.length){node = node.childNodes[offset];offset = 0;}else if(node.childNodes.length === 0){if(this.doc.normalizer.whitelist.tags[node.tagName] == null){text = document.createTextNode("");node.appendChild(text);node = text;}return [node, 0];}else {node = node.lastChild;if(dom(node).isElement()){if(node.tagName === dom.DEFAULT_BREAK_TAG || dom.EMBED_TAGS[node.tagName] != null){return [node, 1];}else {offset = node.childNodes.length;}}else {return [node, dom(node).length()];}}}};Selection.prototype._getNativeRange = function(){var range, selection;selection = document.getSelection();if((selection != null?selection.rangeCount:void 0) > 0){range = selection.getRangeAt(0);if(dom(range.startContainer).isAncestor(this.doc.root, true)){if(range.startContainer === range.endContainer || dom(range.endContainer).isAncestor(this.doc.root, true)){return range;}}}return null;};Selection.prototype._indexToPosition = function(index){var leaf, offset, ref;if(this.doc.lines.length === 0){return [this.doc.root, 0];}ref = this.doc.findLeafAt(index, true), leaf = ref[0], offset = ref[1];return this._decodePosition(leaf.node, offset);};Selection.prototype._positionToIndex = function(node, offset){var leaf, leafNode, leafOffset, line, lineOffset, ref;if(dom.isIE(10) && node.tagName === "BR" && offset === 1){offset = 0;}ref = this._encodePosition(node, offset), leafNode = ref[0], offset = ref[1];line = this.doc.findLine(leafNode);if(line == null){return 0;}leaf = line.findLeaf(leafNode);lineOffset = 0;while(line.prev != null) {line = line.prev;lineOffset += line.length;}if(leaf == null){return lineOffset;}leafOffset = 0;while(leaf.prev != null) {leaf = leaf.prev;leafOffset += leaf.length;}return lineOffset + leafOffset + offset;};Selection.prototype._setNativeRange = function(startNode, startOffset, endNode, endOffset){var nativeRange, selection;selection = document.getSelection();if(!selection){return;}if(startNode != null){if(!this.checkFocus()){this.doc.root.focus();}nativeRange = this._getNativeRange();if(nativeRange == null || startNode !== nativeRange.startContainer || startOffset !== nativeRange.startOffset || endNode !== nativeRange.endContainer || endOffset !== nativeRange.endOffset){selection.removeAllRanges();nativeRange = document.createRange();nativeRange.setStart(startNode, startOffset);nativeRange.setEnd(endNode, endOffset);return selection.addRange(nativeRange);}}else {selection.removeAllRanges();this.doc.root.blur();if(dom.isIE(11) && !dom.isIE(9)){return document.body.focus();}}};return Selection;})();module.exports = Selection;}, {"../lib/dom":17, "../lib/range":20, "./leaf":11, "./normalizer":13, "lodash":1}], 15:[function(_dereq_, module, exports){_dereq_("./modules/authorship");_dereq_("./modules/image-tooltip");_dereq_("./modules/keyboard");_dereq_("./modules/link-tooltip");_dereq_("./modules/multi-cursor");_dereq_("./modules/paste-manager");_dereq_("./modules/toolbar");_dereq_("./modules/tooltip");_dereq_("./modules/undo-manager");module.exports = _dereq_("./quill");}, {"./modules/authorship":21, "./modules/image-tooltip":22, "./modules/keyboard":23, "./modules/link-tooltip":24, "./modules/multi-cursor":25, "./modules/paste-manager":26, "./modules/toolbar":27, "./modules/tooltip":28, "./modules/undo-manager":29, "./quill":30}], 16:[function(_dereq_, module, exports){var ColorPicker, Picker, dom, extend=function extend(child, parent){for(var key in parent) {if(hasProp.call(parent, key))child[key] = parent[key];}function ctor(){this.constructor = child;}ctor.prototype = parent.prototype;child.prototype = new ctor();child.__super__ = parent.prototype;return child;}, hasProp=({}).hasOwnProperty;dom = _dereq_("./dom");Picker = _dereq_("./picker");ColorPicker = (function(superClass){extend(ColorPicker, superClass);function ColorPicker(){ColorPicker.__super__.constructor.apply(this, arguments);dom(this.container).addClass("ql-color-picker");}ColorPicker.prototype.buildItem = function(picker, option, index){var item;item = ColorPicker.__super__.buildItem.call(this, picker, option, index);item.style.backgroundColor = option.value;return item;};return ColorPicker;})(Picker);module.exports = ColorPicker;}, {"./dom":17, "./picker":19}], 17:[function(_dereq_, module, exports){var SelectWrapper, Wrapper, _, dom, lastKeyEvent, bind=function bind(fn, me){return function(){return fn.apply(me, arguments);};}, extend=function extend(child, parent){for(var key in parent) {if(hasProp.call(parent, key))child[key] = parent[key];}function ctor(){this.constructor = child;}ctor.prototype = parent.prototype;child.prototype = new ctor();child.__super__ = parent.prototype;return child;}, hasProp=({}).hasOwnProperty;_ = _dereq_("lodash");lastKeyEvent = null;Wrapper = (function(){function Wrapper(node1){this.node = node1;this.trigger = bind(this.trigger, this);}Wrapper.prototype.addClass = function(cssClass){if(this.hasClass(cssClass)){return;}if(this.node.classList != null){this.node.classList.add(cssClass);}else if(this.node.className != null){this.node.className = (this.node.className + " " + cssClass).trim();}return this;};Wrapper.prototype.attributes = function(attributes){var attr, i, j, len, ref, value;if(attributes){_.each(attributes, (function(_this){return function(value, name){return _this.node.setAttribute(name, value);};})(this));return this;}else {if(this.node.attributes == null){return {};}attributes = {};ref = this.node.attributes;for(i = j = 0, len = ref.length; j < len; i = ++j) {value = ref[i];attr = this.node.attributes[i];attributes[attr.name] = attr.value;}return attributes;}};Wrapper.prototype.child = function(offset){var child, length;child = this.node.firstChild;length = dom(child).length();while(child != null) {if(offset < length){break;}offset -= length;child = child.nextSibling;length = dom(child).length();}if(child == null){child = this.node.lastChild;offset = dom(child).length();}return [child, offset];};Wrapper.prototype.childNodes = function(){return _.map(this.node.childNodes);};Wrapper.prototype.classes = function(){return this.node.className.split(/\s+/);};Wrapper.prototype.data = function(key, value){var ref;if(value != null){if(this.node["ql-data"] == null){this.node["ql-data"] = {};}this.node["ql-data"][key] = value;return this;}else {return (ref = this.node["ql-data"]) != null?ref[key]:void 0;}};Wrapper.prototype.descendants = function(){return _.map(this.node.getElementsByTagName("*"));};Wrapper.prototype.get = function(){return this.node;};Wrapper.prototype.hasClass = function(cssClass){if(this.node.classList != null){return this.node.classList.contains(cssClass);}else if(this.node.className != null){return this.classes().indexOf(cssClass) > -1;}return false;};Wrapper.prototype.isAncestor = function(ancestor, inclusive){var node;if(inclusive == null){inclusive = false;}if(ancestor === this.node){return inclusive;}node = this.node;while(node) {if(node === ancestor){return true;}node = node.parentNode;}return false;};Wrapper.prototype.isElement = function(){var ref;return ((ref = this.node) != null?ref.nodeType:void 0) === dom.ELEMENT_NODE;};Wrapper.prototype.isTextNode = function(){var ref;return ((ref = this.node) != null?ref.nodeType:void 0) === dom.TEXT_NODE;};Wrapper.prototype.isolate = function(root){if(this.node.nextSibling != null){dom(this.node.nextSibling).splitBefore(root);}this.splitBefore(root);return this;};Wrapper.prototype.length = function(){var length;if(this.node == null){return 0;}length = this.text().length;if(this.isElement()){length += this.node.querySelectorAll(Object.keys(dom.EMBED_TAGS).join(",")).length;}return length;};Wrapper.prototype.merge = function(node){var $node;$node = dom(node);if(this.isElement()){$node.moveChildren(this.node);this.normalize();}else {this.text(this.text() + $node.text());}$node.remove();return this;};Wrapper.prototype.moveChildren = function(newParent){_.each(this.childNodes(), function(child){return newParent.appendChild(child);});return this;};Wrapper.prototype.nextLineNode = function(root){var nextNode;nextNode = this.node.nextSibling;if(nextNode == null && this.node.parentNode !== root){nextNode = this.node.parentNode.nextSibling;}if(nextNode != null && dom.LIST_TAGS[nextNode.tagName] != null){nextNode = nextNode.firstChild;}return nextNode;};Wrapper.prototype.normalize = function(){var $node, curNode, followingNode, nextNode;curNode = this.node.firstChild;while(curNode != null) {nextNode = curNode.nextSibling;$node = dom(curNode);if(nextNode != null && dom(nextNode).isTextNode()){if($node.text().length === 0){$node.remove();}else if($node.isTextNode()){followingNode = nextNode.nextSibling;$node.merge(nextNode);nextNode = followingNode;}}curNode = nextNode;}return this;};Wrapper.prototype.on = function(eventName, listener){this.node.addEventListener(eventName, (function(_this){return function(event){var arg, propagate;arg = lastKeyEvent && (eventName === "keydown" || eventName === "keyup")?lastKeyEvent:event;propagate = listener.call(_this.node, arg);if(!propagate){event.preventDefault();event.stopPropagation();}return propagate;};})(this));return this;};Wrapper.prototype.remove = function(){var ref;if((ref = this.node.parentNode) != null){ref.removeChild(this.node);}this.node = null;return null;};Wrapper.prototype.removeClass = function(cssClass){var classArray;if(!this.hasClass(cssClass)){return;}if(this.node.classList != null){this.node.classList.remove(cssClass);}else if(this.node.className != null){classArray = this.classes();classArray.splice(classArray.indexOf(cssClass), 1);this.node.className = classArray.join(" ");}if(!this.node.getAttribute("class")){this.node.removeAttribute("class");}return this;};Wrapper.prototype.replace = function(newNode){this.node.parentNode.replaceChild(newNode, this.node);this.node = newNode;return newNode;};Wrapper.prototype.splitBefore = function(root, force){var nextNode, parentClone, parentNode, refNode;if(force == null){force = false;}if(this.node === root || this.node.parentNode === root){return this;}if(this.node.previousSibling != null || force){parentNode = this.node.parentNode;parentClone = parentNode.cloneNode(false);parentNode.parentNode.insertBefore(parentClone, parentNode.nextSibling);refNode = this.node;while(refNode != null) {nextNode = refNode.nextSibling;parentClone.appendChild(refNode);refNode = nextNode;}return dom(parentClone).splitBefore(root);}else {return dom(this.node.parentNode).splitBefore(root);}};Wrapper.prototype.split = function(offset, force){var after, child, childLeft, childRight, left, nextRight, nodeLength, ref, ref1, right;if(force == null){force = false;}nodeLength = this.length();offset = Math.max(0, offset);offset = Math.min(offset, nodeLength);if(!(force || offset !== 0)){return [this.node.previousSibling, this.node, false];}if(!(force || offset !== nodeLength)){return [this.node, this.node.nextSibling, false];}if(this.node.nodeType === dom.TEXT_NODE){after = this.node.splitText(offset);return [this.node, after, true];}else {left = this.node;right = this.node.cloneNode(false);this.node.parentNode.insertBefore(right, left.nextSibling);ref = this.child(offset), child = ref[0], offset = ref[1];ref1 = dom(child).split(offset), childLeft = ref1[0], childRight = ref1[1];while(childRight !== null) {nextRight = childRight.nextSibling;right.appendChild(childRight);childRight = nextRight;}return [left, right, true];}};Wrapper.prototype.styles = function(styles, overwrite){var obj, styleString;if(overwrite == null){overwrite = false;}if(styles){if(!overwrite){styles = _.defaults(styles, this.styles());}styleString = _.map(styles, function(style, name){return name + ": " + style;}).join("; ") + ";";this.node.setAttribute("style", styleString);return this;}else {styleString = this.node.getAttribute("style") || "";obj = _.reduce(styleString.split(";"), function(styles, str){var name, ref, value;ref = str.split(":"), name = ref[0], value = ref[1];if(name && value){name = name.trim();value = value.trim();styles[name.toLowerCase()] = value;}return styles;}, {});return obj;}};Wrapper.prototype.switchTag = function(newTag){var attributes, newNode;newTag = newTag.toUpperCase();if(this.node.tagName === newTag){return this;}newNode = document.createElement(newTag);attributes = this.attributes();if(dom.VOID_TAGS[newTag] == null){this.moveChildren(newNode);}this.replace(newNode);return this.attributes(attributes).get();};Wrapper.prototype.text = function(text){if(text != null){switch(this.node.nodeType){case dom.ELEMENT_NODE:this.node.textContent = text;break;case dom.TEXT_NODE:this.node.data = text;}return this;}else {switch(this.node.nodeType){case dom.ELEMENT_NODE:if(this.node.tagName === dom.DEFAULT_BREAK_TAG){return "";}if(dom.EMBED_TAGS[this.node.tagName] != null){return dom.EMBED_TEXT;}if(this.node.textContent != null){return this.node.textContent;}return "";case dom.TEXT_NODE:return this.node.data || "";default:return "";}}};Wrapper.prototype.textNodes = function(){var textNode, textNodes, walker;walker = document.createTreeWalker(this.node, NodeFilter.SHOW_TEXT, null, false);textNodes = [];while(textNode = walker.nextNode()) {textNodes.push(textNode);}return textNodes;};Wrapper.prototype.toggleClass = function(className, state){if(state == null){state = !this.hasClass(className);}if(state){this.addClass(className);}else {this.removeClass(className);}return this;};Wrapper.prototype.trigger = function(eventName, options){var event, initFn, modifiers;if(options == null){options = {};}if(["keypress", "keydown", "keyup"].indexOf(eventName) < 0){event = document.createEvent("Event");event.initEvent(eventName, options.bubbles, options.cancelable);}else {event = document.createEvent("KeyboardEvent");lastKeyEvent = _.clone(options);if(_.isNumber(options.key)){lastKeyEvent.which = options.key;}else if(_.isString(options.key)){lastKeyEvent.which = options.key.toUpperCase().charCodeAt(0);}else {lastKeyEvent.which = 0;}if(dom.isIE(10)){modifiers = [];if(options.altKey){modifiers.push("Alt");}if(options.ctrlKey){modifiers.push("Control");}if(options.metaKey){modifiers.push("Meta");}if(options.shiftKey){modifiers.push("Shift");}event.initKeyboardEvent(eventName, options.bubbles, options.cancelable, window, 0, 0, modifiers.join(" "), null, null);}else {initFn = _.isFunction(event.initKeyboardEvent)?"initKeyboardEvent":"initKeyEvent";event[initFn](eventName, options.bubbles, options.cancelable, window, options.ctrlKey, options.altKey, options.shiftKey, options.metaKey, 0, 0);}}this.node.dispatchEvent(event);lastKeyEvent = null;return this;};Wrapper.prototype.unwrap = function(){var next, ret;ret = this.node.firstChild;next = this.node.nextSibling;_.each(this.childNodes(), (function(_this){return function(child){return _this.node.parentNode.insertBefore(child, next);};})(this));this.remove();return ret;};Wrapper.prototype.wrap = function(wrapper){var parent;if(this.node.parentNode != null){this.node.parentNode.insertBefore(wrapper, this.node);}parent = wrapper;while(parent.firstChild != null) {parent = wrapper.firstChild;}parent.appendChild(this.node);return this;};return Wrapper;})();SelectWrapper = (function(superClass){extend(SelectWrapper, superClass);function SelectWrapper(){return SelectWrapper.__super__.constructor.apply(this, arguments);}SelectWrapper.prototype["default"] = function(){return this.node.querySelector("option[selected]");};SelectWrapper.prototype.option = function(option, trigger){var child, i, j, len, ref, value;if(trigger == null){trigger = true;}value = _.isElement(option)?option.value:option;if(value){value = value.replace(/[^\w]+/g, "");ref = this.node.children;for(i = j = 0, len = ref.length; j < len; i = ++j) {child = ref[i];if(child.value.replace(/[^\w]+/g, "") === value){this.node.selectedIndex = i;break;}}}else {this.node.selectedIndex = -1;}if(trigger){this.trigger("change");}return this;};SelectWrapper.prototype.reset = function(trigger){var option;if(trigger == null){trigger = true;}option = this["default"]();if(option != null){option.selected = true;}else {this.node.selectedIndex = 0;}if(trigger){this.trigger("change");}return this;};SelectWrapper.prototype.value = function(){if(this.node.selectedIndex > -1){return this.node.options[this.node.selectedIndex].value;}else {return "";}};return SelectWrapper;})(Wrapper);dom = function(node){if((node != null?node.tagName:void 0) === "SELECT"){return new SelectWrapper(node);}else {return new Wrapper(node);}};dom = _.extend(dom, {ELEMENT_NODE:1, NOBREAK_SPACE:"&nbsp;", TEXT_NODE:3, ZERO_WIDTH_NOBREAK_SPACE:"﻿", DEFAULT_BLOCK_TAG:"DIV", DEFAULT_BREAK_TAG:"BR", DEFAULT_INLINE_TAG:"SPAN", EMBED_TEXT:"!", FONT_SIZES:{"10px":1, "13px":2, "16px":3, "18px":4, "24px":5, "32px":6, "48px":7}, KEYS:{BACKSPACE:8, TAB:9, ENTER:13, ESCAPE:27, LEFT:37, UP:38, RIGHT:39, DOWN:40, DELETE:46}, BLOCK_TAGS:{"ADDRESS":"ADDRESS", "ARTICLE":"ARTICLE", "ASIDE":"ASIDE", "AUDIO":"AUDIO", "BLOCKQUOTE":"BLOCKQUOTE", "CANVAS":"CANVAS", "DD":"DD", "DIV":"DIV", "DL":"DL", "FIGCAPTION":"FIGCAPTION", "FIGURE":"FIGURE", "FOOTER":"FOOTER", "FORM":"FORM", "H1":"H1", "H2":"H2", "H3":"H3", "H4":"H4", "H5":"H5", "H6":"H6", "HEADER":"HEADER", "HGROUP":"HGROUP", "LI":"LI", "OL":"OL", "OUTPUT":"OUTPUT", "P":"P", "PRE":"PRE", "SECTION":"SECTION", "TABLE":"TABLE", "TBODY":"TBODY", "TD":"TD", "TFOOT":"TFOOT", "TH":"TH", "THEAD":"THEAD", "TR":"TR", "UL":"UL", "VIDEO":"VIDEO"}, EMBED_TAGS:{"IMG":"IMG"}, LINE_TAGS:{"DIV":"DIV", "LI":"LI"}, LIST_TAGS:{"OL":"OL", "UL":"UL"}, VOID_TAGS:{"AREA":"AREA", "BASE":"BASE", "BR":"BR", "COL":"COL", "COMMAND":"COMMAND", "EMBED":"EMBED", "HR":"HR", "IMG":"IMG", "INPUT":"INPUT", "KEYGEN":"KEYGEN", "LINK":"LINK", "META":"META", "PARAM":"PARAM", "SOURCE":"SOURCE", "TRACK":"TRACK", "WBR":"WBR"}, convertFontSize:function convertFontSize(size){var i, s, sources, targets;if(_.isString(size) && size.indexOf("px") > -1){sources = Object.keys(dom.FONT_SIZES);targets = _.values(dom.FONT_SIZES);}else {targets = Object.keys(dom.FONT_SIZES);sources = _.values(dom.FONT_SIZES);}for(i in sources) {s = sources[i];if(parseInt(size) <= parseInt(s)){return targets[i];}}return _.last(targets);}, isIE:function isIE(maxVersion){var version;version = document.documentMode;return version && maxVersion >= version;}, isIOS:function isIOS(){return /iPhone|iPad/i.test(navigator.userAgent);}, isMac:function isMac(){return /Mac/i.test(navigator.platform);}});module.exports = dom;}, {"lodash":1}], 18:[function(_dereq_, module, exports){var LinkedList, Node;Node = (function(){function Node(data){this.data = data;this.prev = this.next = null;}return Node;})();LinkedList = (function(){LinkedList.Node = Node;function LinkedList(){this.length = 0;this.first = this.last = null;}LinkedList.prototype.append = function(node){if(this.first != null){node.next = null;this.last.next = node;}else {this.first = node;}node.prev = this.last;this.last = node;return this.length += 1;};LinkedList.prototype.insertAfter = function(refNode, newNode){newNode.prev = refNode;if(refNode != null){newNode.next = refNode.next;if(refNode.next != null){refNode.next.prev = newNode;}refNode.next = newNode;if(refNode === this.last){this.last = newNode;}}else {newNode.next = this.first;this.first.prev = newNode;this.first = newNode;}return this.length += 1;};LinkedList.prototype.remove = function(node){if(this.length > 1){if(node.prev != null){node.prev.next = node.next;}if(node.next != null){node.next.prev = node.prev;}if(node === this.first){this.first = node.next;}if(node === this.last){this.last = node.prev;}}else {this.first = this.last = null;}node.prev = node.next = null;return this.length -= 1;};LinkedList.prototype.toArray = function(){var arr, cur;arr = [];cur = this.first;while(cur != null) {arr.push(cur);cur = cur.next;}return arr;};return LinkedList;})();module.exports = LinkedList;}, {}], 19:[function(_dereq_, module, exports){var Picker, _, dom;_ = _dereq_("lodash");dom = _dereq_("./dom");Picker = (function(){Picker.TEMPLATE = "<span class=\"ql-picker-label\"></span><span class=\"ql-picker-options\"></span>";function Picker(select){this.select = select;this.container = document.createElement("span");this.buildPicker();dom(this.container).addClass("ql-picker");this.select.style.display = "none";this.select.parentNode.insertBefore(this.container, this.select);dom(document).on("click", (function(_this){return function(){_this.close();return true;};})(this));dom(this.label).on("click", (function(_this){return function(){_.defer(function(){return dom(_this.container).toggleClass("ql-expanded");});return false;};})(this));dom(this.select).on("change", (function(_this){return function(){var item, option;if(_this.select.selectedIndex > -1){item = _this.container.querySelectorAll(".ql-picker-item")[_this.select.selectedIndex];option = _this.select.options[_this.select.selectedIndex];}_this.selectItem(item, false);return dom(_this.label).toggleClass("ql-active", option !== dom(_this.select)["default"]());};})(this));}Picker.prototype.buildItem = function(picker, option, index){var item;item = document.createElement("span");item.setAttribute("data-value", option.getAttribute("value"));dom(item).addClass("ql-picker-item").text(dom(option).text()).on("click", (function(_this){return function(){_this.selectItem(item, true);return _this.close();};})(this));if(this.select.selectedIndex === index){this.selectItem(item, false);}return item;};Picker.prototype.buildPicker = function(){var picker;_.each(dom(this.select).attributes(), (function(_this){return function(value, name){return _this.container.setAttribute(name, value);};})(this));this.container.innerHTML = Picker.TEMPLATE;this.label = this.container.querySelector(".ql-picker-label");picker = this.container.querySelector(".ql-picker-options");return _.each(this.select.options, (function(_this){return function(option, i){var item;item = _this.buildItem(picker, option, i);return picker.appendChild(item);};})(this));};Picker.prototype.close = function(){return dom(this.container).removeClass("ql-expanded");};Picker.prototype.selectItem = function(item, trigger){var selected, value;selected = this.container.querySelector(".ql-selected");if(selected != null){dom(selected).removeClass("ql-selected");}if(item != null){value = item.getAttribute("data-value");dom(item).addClass("ql-selected");dom(this.label).text(dom(item).text());dom(this.select).option(value, trigger);return this.label.setAttribute("data-value", value);}else {this.label.innerHTML = "&nbsp;";return this.label.removeAttribute("data-value");}};return Picker;})();module.exports = Picker;}, {"./dom":17, "lodash":1}], 20:[function(_dereq_, module, exports){var Range, _;_ = _dereq_("lodash");Range = (function(){Range.compare = function(r1, r2){if(r1 === r2){return true;}if(!(r1 != null && r2 != null)){return false;}return r1.equals(r2);};function Range(start, end){this.start = start;this.end = end;}Range.prototype.equals = function(range){if(range == null){return false;}return this.start === range.start && this.end === range.end;};Range.prototype.shift = function(index, length){var ref;return (ref = _.map([this.start, this.end], function(pos){if(index > pos){return pos;}if(length >= 0){return pos + length;}else {return Math.max(index, pos + length);}}), this.start = ref[0], this.end = ref[1], ref);};Range.prototype.isCollapsed = function(){return this.start === this.end;};return Range;})();module.exports = Range;}, {"lodash":1}], 21:[function(_dereq_, module, exports){var Authorship, Delta, Quill, _, dom;Quill = _dereq_("../quill");_ = Quill.require("lodash");dom = Quill.require("dom");Delta = Quill.require("delta");Authorship = (function(){Authorship.DEFAULTS = {authorId:null, color:"transparent", enabled:false};function Authorship(quill, options){this.quill = quill;this.options = options;if(this.options.button != null){this.attachButton(this.options.button);}if(this.options.enabled){this.enable();}this.quill.addFormat("author", {"class":"author-"});if(this.options.authorId == null){return;}this.quill.on(this.quill.constructor.events.PRE_EVENT, (function(_this){return function(eventName, delta, origin){var authorDelta, authorFormat;if(eventName === _this.quill.constructor.events.TEXT_CHANGE && origin === "user"){authorDelta = new Delta();authorFormat = {author:_this.options.authorId};_.each(delta.ops, function(op){if(op["delete"] != null){return;}if(op.insert != null || op.retain != null && op.attributes != null){op.attributes || (op.attributes = {});op.attributes.author = _this.options.authorId;return authorDelta.retain(op.retain || op.insert.length || 1, authorFormat);}else {return authorDelta.retain(op.retain);}});return _this.quill.updateContents(authorDelta, Quill.sources.SILENT);}};})(this));this.addAuthor(this.options.authorId, this.options.color);}Authorship.prototype.addAuthor = function(id, color){var styles;styles = {};styles[".authorship .author-" + id] = {"background-color":"" + color};return this.quill.theme.addStyles(styles);};Authorship.prototype.attachButton = function(button){var $button;$button = dom(button);return $button.on("click", (function(_this){return function(){$button.toggleClass("ql-on");return _this.enable($dom.hasClass("ql-on"));};})(this));};Authorship.prototype.enable = function(enabled){if(enabled == null){enabled = true;}return dom(this.quill.root).toggleClass("authorship", enabled);};Authorship.prototype.disable = function(){return this.enable(false);};return Authorship;})();Quill.registerModule("authorship", Authorship);module.exports = Authorship;}, {"../quill":30}], 22:[function(_dereq_, module, exports){var Delta, ImageTooltip, Quill, Range, Tooltip, _, dom, extend=function extend(child, parent){for(var key in parent) {if(hasProp.call(parent, key))child[key] = parent[key];}function ctor(){this.constructor = child;}ctor.prototype = parent.prototype;child.prototype = new ctor();child.__super__ = parent.prototype;return child;}, hasProp=({}).hasOwnProperty;Quill = _dereq_("../quill");Tooltip = _dereq_("./tooltip");_ = Quill.require("lodash");dom = Quill.require("dom");Delta = Quill.require("delta");Range = Quill.require("range");ImageTooltip = (function(superClass){extend(ImageTooltip, superClass);ImageTooltip.DEFAULTS = {template:"<input class=\"input\" type=\"textbox\"> <div class=\"preview\"> <span>Preview</span> </div> <a href=\"javascript:;\" class=\"cancel\">Cancel</a> <a href=\"javascript:;\" class=\"insert\">Insert</a>"};function ImageTooltip(quill, options){this.quill = quill;this.options = options;this.options = _.defaults(this.options, Tooltip.DEFAULTS);ImageTooltip.__super__.constructor.call(this, this.quill, this.options);this.preview = this.container.querySelector(".preview");this.textbox = this.container.querySelector(".input");dom(this.container).addClass("ql-image-tooltip");this.initListeners();}ImageTooltip.prototype.initListeners = function(){dom(this.quill.root).on("focus", _.bind(this.hide, this));dom(this.container.querySelector(".insert")).on("click", _.bind(this.insertImage, this));dom(this.container.querySelector(".cancel")).on("click", _.bind(this.hide, this));dom(this.textbox).on("input", _.bind(this._preview, this));this.initTextbox(this.textbox, this.insertImage, this.hide);return this.quill.onModuleLoad("toolbar", (function(_this){return function(toolbar){_this.toolbar = toolbar;return toolbar.initFormat("image", _.bind(_this._onToolbar, _this));};})(this));};ImageTooltip.prototype.insertImage = function(){var index, url;url = this._normalizeURL(this.textbox.value);if(this.range == null){this.range = new Range(0, 0);}if(this.range){this.preview.innerHTML = "<span>Preview</span>";this.textbox.value = "";index = this.range.end;this.quill.insertEmbed(index, "image", url, "user");this.quill.setSelection(index + 1, index + 1);}return this.hide();};ImageTooltip.prototype._onToolbar = function(range, value){if(value){if(!this.textbox.value){this.textbox.value = "http://";}this.show();this.textbox.focus();return _.defer((function(_this){return function(){return _this.textbox.setSelectionRange(_this.textbox.value.length, _this.textbox.value.length);};})(this));}else {this.quill.deleteText(range, "user");return this.toolbar.setActive("image", false);}};ImageTooltip.prototype._preview = function(){var img;if(!this._matchImageURL(this.textbox.value)){return;}if(this.preview.firstChild.tagName === "IMG"){return this.preview.firstChild.setAttribute("src", this.textbox.value);}else {img = document.createElement("img");img.setAttribute("src", this.textbox.value);return this.preview.replaceChild(img, this.preview.firstChild);}};ImageTooltip.prototype._matchImageURL = function(url){return /^https?:\/\/.+\.(jpe?g|gif|png)$/.test(url);};ImageTooltip.prototype._normalizeURL = function(url){if(!/^https?:\/\//.test(url)){url = "http://" + url;}return url;};return ImageTooltip;})(Tooltip);Quill.registerModule("image-tooltip", ImageTooltip);module.exports = ImageTooltip;}, {"../quill":30, "./tooltip":28}], 23:[function(_dereq_, module, exports){var Delta, Keyboard, Quill, _, dom;Quill = _dereq_("../quill");_ = Quill.require("lodash");dom = Quill.require("dom");Delta = Quill.require("delta");Keyboard = (function(){Keyboard.hotkeys = {BOLD:{key:"B", metaKey:true}, INDENT:{key:dom.KEYS.TAB}, ITALIC:{key:"I", metaKey:true}, OUTDENT:{key:dom.KEYS.TAB, shiftKey:true}, UNDERLINE:{key:"U", metaKey:true}};function Keyboard(quill, options){this.quill = quill;this.hotkeys = {};this._initListeners();this._initHotkeys();this.quill.onModuleLoad("toolbar", (function(_this){return function(toolbar){return _this.toolbar = toolbar;};})(this));}Keyboard.prototype.addHotkey = function(hotkeys, callback){if(!Array.isArray(hotkeys)){hotkeys = [hotkeys];}return _.each(hotkeys, (function(_this){return function(hotkey){var base, which;hotkey = _.isObject(hotkey)?_.clone(hotkey):{key:hotkey};hotkey.callback = callback;which = _.isNumber(hotkey.key)?hotkey.key:hotkey.key.toUpperCase().charCodeAt(0);if((base = _this.hotkeys)[which] == null){base[which] = [];}return _this.hotkeys[which].push(hotkey);};})(this));};Keyboard.prototype.toggleFormat = function(range, format){var delta, value;if(range.isCollapsed()){delta = this.quill.getContents(Math.max(0, range.start - 1), range.end);}else {delta = this.quill.getContents(range);}value = delta.ops.length === 0 || !_.all(delta.ops, function(op){var ref;return (ref = op.attributes) != null?ref[format]:void 0;});if(range.isCollapsed()){this.quill.prepareFormat(format, value, Quill.sources.USER);}else {this.quill.formatText(range, format, value, Quill.sources.USER);}if(this.toolbar != null){return this.toolbar.setActive(format, value);}};Keyboard.prototype._initEnter = function(){var keys;keys = [{key:dom.KEYS.ENTER}, {key:dom.KEYS.ENTER, shiftKey:true}];return this.addHotkey(keys, (function(_this){return function(range, hotkey){var delta, leaf, line, offset, ref, ref1;if(range == null){return true;}ref = _this.quill.editor.doc.findLineAt(range.start), line = ref[0], offset = ref[1];ref1 = line.findLeafAt(offset), leaf = ref1[0], offset = ref1[1];delta = new Delta().retain(range.start).insert("\n", line.formats)["delete"](range.end - range.start);_this.quill.updateContents(delta, Quill.sources.USER);_.each(leaf.formats, function(value, format){_this.quill.prepareFormat(format, value);return _this.toolbar.setActive(format, value);});return false;};})(this));};Keyboard.prototype._initDeletes = function(){return this.addHotkey([dom.KEYS.DELETE, dom.KEYS.BACKSPACE], (function(_this){return function(range, hotkey){var format, line, offset, ref;if(range != null && _this.quill.getLength() > 0){if(range.start !== range.end){_this.quill.deleteText(range.start, range.end, Quill.sources.USER);}else {if(hotkey.key === dom.KEYS.BACKSPACE){ref = _this.quill.editor.doc.findLineAt(range.start), line = ref[0], offset = ref[1];if(offset === 0 && (line.formats.bullet || line.formats.list)){format = line.formats.bullet?"bullet":"list";_this.quill.formatLine(range.start, range.start, format, false);}else if(range.start > 0){_this.quill.deleteText(range.start - 1, range.start, Quill.sources.USER);}}else if(range.start < _this.quill.getLength() - 1){_this.quill.deleteText(range.start, range.start + 1, Quill.sources.USER);}}}return false;};})(this));};Keyboard.prototype._initHotkeys = function(){this.addHotkey(Keyboard.hotkeys.INDENT, (function(_this){return function(range){_this._onTab(range, false);return false;};})(this));this.addHotkey(Keyboard.hotkeys.OUTDENT, (function(_this){return function(range){return false;};})(this));_.each(["bold", "italic", "underline"], (function(_this){return function(format){return _this.addHotkey(Keyboard.hotkeys[format.toUpperCase()], function(range){_this.toggleFormat(range, format);return false;});};})(this));this._initDeletes();return this._initEnter();};Keyboard.prototype._initListeners = function(){return dom(this.quill.root).on("keydown", (function(_this){return function(event){var prevent;prevent = false;_.each(_this.hotkeys[event.which], function(hotkey){var metaKey;metaKey = dom.isMac()?event.metaKey:event.metaKey || event.ctrlKey;if(!!hotkey.metaKey !== !!metaKey){return;}if(!!hotkey.shiftKey !== !!event.shiftKey){return;}if(!!hotkey.altKey !== !!event.altKey){return;}prevent = hotkey.callback(_this.quill.getSelection(), hotkey, event) === false || prevent;return true;});return !prevent;};})(this));};Keyboard.prototype._onTab = function(range, shift){var delta;if(shift == null){shift = false;}delta = new Delta().retain(range.start).insert("\t")["delete"](range.end - range.start).retain(this.quill.getLength() - range.end);this.quill.updateContents(delta, Quill.sources.USER);return this.quill.setSelection(range.start + 1, range.start + 1);};return Keyboard;})();Quill.registerModule("keyboard", Keyboard);module.exports = Keyboard;}, {"../quill":30}], 24:[function(_dereq_, module, exports){var LinkTooltip, Quill, Tooltip, _, dom, extend=function extend(child, parent){for(var key in parent) {if(hasProp.call(parent, key))child[key] = parent[key];}function ctor(){this.constructor = child;}ctor.prototype = parent.prototype;child.prototype = new ctor();child.__super__ = parent.prototype;return child;}, hasProp=({}).hasOwnProperty;Quill = _dereq_("../quill");Tooltip = _dereq_("./tooltip");_ = Quill.require("lodash");dom = Quill.require("dom");LinkTooltip = (function(superClass){extend(LinkTooltip, superClass);LinkTooltip.DEFAULTS = {maxLength:50, template:"<span class=\"title\">Visit URL:&nbsp;</span> <a href=\"#\" class=\"url\" target=\"_blank\" href=\"about:blank\"></a> <input class=\"input\" type=\"text\"> <span>&nbsp;&#45;&nbsp;</span> <a href=\"javascript:;\" class=\"change\">Change</a> <a href=\"javascript:;\" class=\"remove\">Remove</a> <a href=\"javascript:;\" class=\"done\">Done</a>"};LinkTooltip.hotkeys = {LINK:{key:"K", metaKey:true}};function LinkTooltip(quill, options){this.quill = quill;this.options = options;this.options = _.defaults(this.options, Tooltip.DEFAULTS);LinkTooltip.__super__.constructor.call(this, this.quill, this.options);dom(this.container).addClass("ql-link-tooltip");this.textbox = this.container.querySelector(".input");this.link = this.container.querySelector(".url");this.initListeners();}LinkTooltip.prototype.initListeners = function(){this.quill.on(this.quill.constructor.events.SELECTION_CHANGE, (function(_this){return function(range){var anchor;if(!(range != null && range.isCollapsed())){return;}anchor = _this._findAnchor(range);if(anchor){_this.setMode(anchor.href, false);return _this.show(anchor);}else if(_this.container.style.left !== Tooltip.HIDE_MARGIN){_this.range = null;return _this.hide();}};})(this));dom(this.container.querySelector(".done")).on("click", _.bind(this.saveLink, this));dom(this.container.querySelector(".remove")).on("click", (function(_this){return function(){return _this.removeLink(_this.range);};})(this));dom(this.container.querySelector(".change")).on("click", (function(_this){return function(){return _this.setMode(_this.link.href, true);};})(this));this.initTextbox(this.textbox, this.saveLink, this.hide);this.quill.onModuleLoad("toolbar", (function(_this){return function(toolbar){_this.toolbar = toolbar;return toolbar.initFormat("link", _.bind(_this._onToolbar, _this));};})(this));return this.quill.onModuleLoad("keyboard", (function(_this){return function(keyboard){return keyboard.addHotkey(LinkTooltip.hotkeys.LINK, _.bind(_this._onKeyboard, _this));};})(this));};LinkTooltip.prototype.saveLink = function(){var anchor, end, url;url = this._normalizeURL(this.textbox.value);if(this.range != null){end = this.range.end;if(this.range.isCollapsed()){anchor = this._findAnchor(this.range);if(anchor != null){anchor.href = url;}}else {this.quill.formatText(this.range, "link", url, "user");}this.quill.setSelection(end, end);}return this.setMode(url, false);};LinkTooltip.prototype.removeLink = function(range){if(range.isCollapsed()){range = this._expandRange(range);}this.hide();this.quill.formatText(range, "link", false, "user");if(this.toolbar != null){return this.toolbar.setActive("link", false);}};LinkTooltip.prototype.setMode = function(url, edit){var text;if(edit == null){edit = false;}if(edit){this.textbox.value = url;_.defer((function(_this){return function(){_this.textbox.focus();return _this.textbox.setSelectionRange(0, url.length);};})(this));}else {this.link.href = url;url = this.link.href;text = url.length > this.options.maxLength?url.slice(0, this.options.maxLength) + "...":url;dom(this.link).text(text);}return dom(this.container).toggleClass("editing", edit);};LinkTooltip.prototype._findAnchor = function(range){var leaf, node, offset, ref;ref = this.quill.editor.doc.findLeafAt(range.start, true), leaf = ref[0], offset = ref[1];if(leaf != null){node = leaf.node;}while(node != null && node !== this.quill.root) {if(node.tagName === "A"){return node;}node = node.parentNode;}return null;};LinkTooltip.prototype._expandRange = function(range){var end, leaf, offset, ref, start;ref = this.quill.editor.doc.findLeafAt(range.start, true), leaf = ref[0], offset = ref[1];start = range.start - offset;end = start + leaf.length;return {start:start, end:end};};LinkTooltip.prototype._onToolbar = function(range, value){return this._toggle(range, value);};LinkTooltip.prototype._onKeyboard = function(){var range;range = this.quill.getSelection();return this._toggle(range, !this._findAnchor(range));};LinkTooltip.prototype._toggle = function(range, value){var nativeRange;if(!range){return;}if(!value){return this.removeLink(range);}else if(!range.isCollapsed()){this.setMode(this._suggestURL(range), true);nativeRange = this.quill.editor.selection._getNativeRange();return this.show(nativeRange);}};LinkTooltip.prototype._normalizeURL = function(url){if(!/^(https?:\/\/|mailto:)/.test(url)){url = "http://" + url;}return url;};LinkTooltip.prototype._suggestURL = function(range){var text;text = this.quill.getText(range);return this._normalizeURL(text);};return LinkTooltip;})(Tooltip);Quill.registerModule("link-tooltip", LinkTooltip);module.exports = LinkTooltip;}, {"../quill":30, "./tooltip":28}], 25:[function(_dereq_, module, exports){var EventEmitter2, MultiCursor, Quill, _, dom, extend=function extend(child, parent){for(var key in parent) {if(hasProp.call(parent, key))child[key] = parent[key];}function ctor(){this.constructor = child;}ctor.prototype = parent.prototype;child.prototype = new ctor();child.__super__ = parent.prototype;return child;}, hasProp=({}).hasOwnProperty;Quill = _dereq_("../quill");EventEmitter2 = _dereq_("eventemitter2").EventEmitter2;_ = Quill.require("lodash");dom = Quill.require("dom");MultiCursor = (function(superClass){extend(MultiCursor, superClass);MultiCursor.DEFAULTS = {template:"<span class=\"cursor-flag\"> <span class=\"cursor-name\"></span> </span> <span class=\"cursor-caret\"></span>", timeout:2500};MultiCursor.events = {CURSOR_ADDED:"cursor-addded", CURSOR_MOVED:"cursor-moved", CURSOR_REMOVED:"cursor-removed"};function MultiCursor(quill, options){this.quill = quill;this.options = options;this.cursors = {};this.container = this.quill.addContainer("ql-multi-cursor", true);this.quill.on(this.quill.constructor.events.TEXT_CHANGE, _.bind(this._applyDelta, this));}MultiCursor.prototype.clearCursors = function(){_.each(Object.keys(this.cursors), _.bind(this.removeCursor, this));return this.cursors = {};};MultiCursor.prototype.moveCursor = function(userId, index){var cursor;cursor = this.cursors[userId];cursor.index = index;dom(cursor.elem).removeClass("hidden");clearTimeout(cursor.timer);cursor.timer = setTimeout((function(_this){return function(){dom(cursor.elem).addClass("hidden");return cursor.timer = null;};})(this), this.options.timeout);this._updateCursor(cursor);return cursor;};MultiCursor.prototype.removeCursor = function(userId){var cursor;cursor = this.cursors[userId];this.emit(MultiCursor.events.CURSOR_REMOVED, cursor);if(cursor != null){cursor.elem.parentNode.removeChild(cursor.elem);}return delete this.cursors[userId];};MultiCursor.prototype.setCursor = function(userId, index, name, color){var cursor;if(this.cursors[userId] == null){this.cursors[userId] = cursor = {userId:userId, index:index, color:color, elem:this._buildCursor(name, color)};this.emit(MultiCursor.events.CURSOR_ADDED, cursor);}_.defer((function(_this){return function(){return _this.moveCursor(userId, index);};})(this));return this.cursors[userId];};MultiCursor.prototype.shiftCursors = function(index, length, authorId){if(authorId == null){authorId = null;}return _.each(this.cursors, (function(_this){return function(cursor, id){if(!(cursor && (cursor.index > index || cursor.userId === authorId))){return;}return cursor.index += Math.max(length, index - cursor.index);};})(this));};MultiCursor.prototype.update = function(){return _.each(this.cursors, (function(_this){return function(cursor, id){if(cursor == null){return;}_this._updateCursor(cursor);return true;};})(this));};MultiCursor.prototype._applyDelta = function(delta){var index;index = 0;_.each(delta.ops, (function(_this){return function(op){var length, ref;length = 0;if(op.insert != null){length = op.insert.length || 1;_this.shiftCursors(index, length, (ref = op.attributes) != null?ref["author"]:void 0);}else if(op["delete"] != null){_this.shiftCursors(index, -1 * op["delete"], null);}else if(op.retain != null){_this.shiftCursors(index, 0, null);length = op.retain;}return index += length;};})(this));return this.update();};MultiCursor.prototype._buildCursor = function(name, color){var cursor, cursorCaret, cursorFlag, cursorName;cursor = document.createElement("span");dom(cursor).addClass("cursor");cursor.innerHTML = this.options.template;cursorFlag = cursor.querySelector(".cursor-flag");cursorName = cursor.querySelector(".cursor-name");dom(cursorName).text(name);cursorCaret = cursor.querySelector(".cursor-caret");cursorCaret.style.backgroundColor = cursorName.style.backgroundColor = color;this.container.appendChild(cursor);return cursor;};MultiCursor.prototype._updateCursor = function(cursor){var bounds, flag;bounds = this.quill.getBounds(cursor.index);cursor.elem.style.top = bounds.top - this.quill.container.scrollTop + "px";cursor.elem.style.left = bounds.left + "px";cursor.elem.style.height = bounds.height + "px";flag = cursor.elem.querySelector(".cursor-flag");dom(cursor.elem).toggleClass("top", parseInt(cursor.elem.style.top) <= flag.offsetHeight).toggleClass("left", parseInt(cursor.elem.style.left) <= flag.offsetWidth).toggleClass("right", this.quill.root.offsetWidth - parseInt(cursor.elem.style.left) <= flag.offsetWidth);return this.emit(MultiCursor.events.CURSOR_MOVED, cursor);};return MultiCursor;})(EventEmitter2);Quill.registerModule("multi-cursor", MultiCursor);module.exports = MultiCursor;}, {"../quill":30, "eventemitter2":2}], 26:[function(_dereq_, module, exports){var Delta, Document, PasteManager, Quill, _, dom;Quill = _dereq_("../quill");Document = _dereq_("../core/document");_ = Quill.require("lodash");dom = Quill.require("dom");Delta = Quill.require("delta");PasteManager = (function(){function PasteManager(quill, options){this.quill = quill;this.options = options;this.container = this.quill.addContainer("ql-paste-manager");this.container.setAttribute("contenteditable", true);dom(this.quill.root).on("paste", _.bind(this._paste, this));}PasteManager.prototype._paste = function(){var oldDocLength, range;oldDocLength = this.quill.getLength();range = this.quill.getSelection();if(range == null){return;}this.container.focus();return _.defer((function(_this){return function(){var delta, doc, lengthAdded, line, lineBottom, offset, ref, windowBottom;doc = new Document(_this.container, _this.quill.options);delta = doc.toDelta();lengthAdded = delta.length() - 1;delta.compose(new Delta().retain(lengthAdded)["delete"](1));if(range.start > 0){delta.ops.unshift({retain:range.start});}delta["delete"](range.end - range.start);_this.quill.updateContents(delta, "user");_this.quill.setSelection(range.start + lengthAdded, range.start + lengthAdded);ref = _this.quill.editor.doc.findLineAt(range.start + lengthAdded), line = ref[0], offset = ref[1];lineBottom = line.node.getBoundingClientRect().bottom;windowBottom = document.documentElement.clientHeight;if(lineBottom > windowBottom){line.node.scrollIntoView(false);}return _this.container.innerHTML = "";};})(this));};return PasteManager;})();Quill.registerModule("paste-manager", PasteManager);module.exports = PasteManager;}, {"../core/document":8, "../quill":30}], 27:[function(_dereq_, module, exports){var Quill, Toolbar, _, dom;Quill = _dereq_("../quill");_ = Quill.require("lodash");dom = Quill.require("dom");Toolbar = (function(){Toolbar.DEFAULTS = {container:null};Toolbar.formats = {LINE:{"align":"align", "bullet":"bullet", "list":"list"}, SELECT:{"align":"align", "background":"background", "color":"color", "font":"font", "size":"size"}, TOGGLE:{"bold":"bold", "bullet":"bullet", "image":"image", "italic":"italic", "link":"link", "list":"list", "strike":"strike", "underline":"underline"}, TOOLTIP:{"image":"image", "link":"link"}};function Toolbar(quill, options){this.quill = quill;this.options = options;if(_.isString(this.options) || _.isElement(this.options)){this.options = {container:this.options};}if(this.options.container == null){throw new Error("container required for toolbar", this.options);}this.container = _.isString(this.options.container)?document.querySelector(this.options.container):this.options.container;this.inputs = {};this.preventUpdate = false;this.triggering = false;_.each(this.quill.options.formats, (function(_this){return function(name){if(Toolbar.formats.TOOLTIP[name] != null){return;}return _this.initFormat(name, _.bind(_this._applyFormat, _this, name));};})(this));this.quill.on(Quill.events.FORMAT_INIT, (function(_this){return function(name){if(Toolbar.formats.TOOLTIP[name] != null){return;}return _this.initFormat(name, _.bind(_this._applyFormat, _this, name));};})(this));this.quill.on(Quill.events.SELECTION_CHANGE, (function(_this){return function(range){if(range != null){return _this.updateActive(range);}};})(this));this.quill.on(Quill.events.TEXT_CHANGE, (function(_this){return function(){return _this.updateActive();};})(this));this.quill.onModuleLoad("keyboard", (function(_this){return function(keyboard){return keyboard.addHotkey([dom.KEYS.BACKSPACE, dom.KEYS.DELETE], function(){return _.defer(_.bind(_this.updateActive, _this));});};})(this));dom(this.container).addClass("ql-toolbar");if(dom.isIOS()){dom(this.container).addClass("ios");}if(dom.isIE(11)){dom(this.container).on("mousedown", (function(_this){return function(){return false;};})(this));}}Toolbar.prototype.initFormat = function(format, callback){var eventName, input, selector;selector = ".ql-" + format;if(Toolbar.formats.SELECT[format] != null){selector = "select" + selector;eventName = "change";}else {eventName = "click";}input = this.container.querySelector(selector);if(input == null){return;}this.inputs[format] = input;return dom(input).on(eventName, (function(_this){return function(){var range, value;value = eventName === "change"?dom(input).value():!dom(input).hasClass("ql-active");_this.preventUpdate = true;_this.quill.focus();range = _this.quill.getSelection();if(range != null){callback(range, value);}_this.preventUpdate = false;return true;};})(this));};Toolbar.prototype.setActive = function(format, value){var $input, input, ref, selectValue;if(format === "image"){value = false;}input = this.inputs[format];if(input == null){return;}$input = dom(input);if(input.tagName === "SELECT"){this.triggering = true;selectValue = $input.value(input);if(value == null){value = (ref = $input["default"]()) != null?ref.value:void 0;}if(Array.isArray(value)){value = "";}if(value !== selectValue){if(value != null){$input.option(value);}else {$input.reset();}}return this.triggering = false;}else {return $input.toggleClass("ql-active", value || false);}};Toolbar.prototype.updateActive = function(range, formats){var activeFormats;if(formats == null){formats = null;}range || (range = this.quill.getSelection());if(!(range != null && !this.preventUpdate)){return;}activeFormats = this._getActive(range);return _.each(this.inputs, (function(_this){return function(input, format){if(!Array.isArray(formats) || formats.indexOf(format) > -1){_this.setActive(format, activeFormats[format]);}return true;};})(this));};Toolbar.prototype._applyFormat = function(format, range, value){if(this.triggering){return;}if(range.isCollapsed()){this.quill.prepareFormat(format, value, "user");}else if(Toolbar.formats.LINE[format] != null){this.quill.formatLine(range, format, value, "user");}else {this.quill.formatText(range, format, value, "user");}return _.defer((function(_this){return function(){_this.updateActive(range, ["bullet", "list"]);return _this.setActive(format, value);};})(this));};Toolbar.prototype._getActive = function(range){var leafFormats, lineFormats;leafFormats = this._getLeafActive(range);lineFormats = this._getLineActive(range);return _.defaults({}, leafFormats, lineFormats);};Toolbar.prototype._getLeafActive = function(range){var contents, formatsArr, line, offset, ref;if(range.isCollapsed()){ref = this.quill.editor.doc.findLineAt(range.start), line = ref[0], offset = ref[1];if(offset === 0){contents = this.quill.getContents(range.start, range.end + 1);}else {contents = this.quill.getContents(range.start - 1, range.end);}}else {contents = this.quill.getContents(range);}formatsArr = _.map(contents.ops, "attributes");return this._intersectFormats(formatsArr);};Toolbar.prototype._getLineActive = function(range){var firstLine, formatsArr, lastLine, offset, ref, ref1;formatsArr = [];ref = this.quill.editor.doc.findLineAt(range.start), firstLine = ref[0], offset = ref[1];ref1 = this.quill.editor.doc.findLineAt(range.end), lastLine = ref1[0], offset = ref1[1];if(lastLine != null && lastLine === firstLine){lastLine = lastLine.next;}while(firstLine != null && firstLine !== lastLine) {formatsArr.push(_.clone(firstLine.formats));firstLine = firstLine.next;}return this._intersectFormats(formatsArr);};Toolbar.prototype._intersectFormats = function(formatsArr){return _.reduce(formatsArr.slice(1), function(activeFormats, formats){var activeKeys, added, formatKeys, intersection, missing;if(formats == null){formats = {};}activeKeys = Object.keys(activeFormats);formatKeys = formats != null?Object.keys(formats):{};intersection = _.intersection(activeKeys, formatKeys);missing = _.difference(activeKeys, formatKeys);added = _.difference(formatKeys, activeKeys);_.each(intersection, function(name){if(Toolbar.formats.SELECT[name] != null){if(Array.isArray(activeFormats[name])){if(activeFormats[name].indexOf(formats[name]) < 0){return activeFormats[name].push(formats[name]);}}else if(activeFormats[name] !== formats[name]){return activeFormats[name] = [activeFormats[name], formats[name]];}}});_.each(missing, function(name){if(Toolbar.formats.TOGGLE[name] != null){return delete activeFormats[name];}else if(Toolbar.formats.SELECT[name] != null && !Array.isArray(activeFormats[name])){return activeFormats[name] = [activeFormats[name]];}});_.each(added, function(name){if(Toolbar.formats.SELECT[name] != null){return activeFormats[name] = [formats[name]];}});return activeFormats;}, formatsArr[0] || {});};return Toolbar;})();Quill.registerModule("toolbar", Toolbar);module.exports = Toolbar;}, {"../quill":30}], 28:[function(_dereq_, module, exports){var Quill, Tooltip, _, dom;Quill = _dereq_("../quill");_ = Quill.require("lodash");dom = Quill.require("dom");Tooltip = (function(){Tooltip.DEFAULTS = {offset:10, template:""};Tooltip.HIDE_MARGIN = "-10000px";function Tooltip(quill, options){this.quill = quill;this.options = options;this.container = this.quill.addContainer("ql-tooltip");this.container.innerHTML = this.options.template;this.hide();this.quill.on(this.quill.constructor.events.TEXT_CHANGE, (function(_this){return function(delta, source){if(_this.container.style.left !== Tooltip.HIDE_MARGIN){_this.range = null;return _this.hide();}};})(this));}Tooltip.prototype.initTextbox = function(textbox, enterCallback, escapeCallback){return dom(textbox).on("keydown", (function(_this){return function(event){switch(event.which){case dom.KEYS.ENTER:event.preventDefault();return enterCallback.call(_this);case dom.KEYS.ESCAPE:event.preventDefault();return escapeCallback.call(_this);default:return true;}};})(this));};Tooltip.prototype.hide = function(){this.container.style.left = Tooltip.HIDE_MARGIN;if(this.range){this.quill.setSelection(this.range);}return this.range = null;};Tooltip.prototype.position = function(reference){var left, offsetBottom, offsetLeft, offsetTop, parentBounds, referenceBounds, top;if(reference != null){referenceBounds = reference.getBoundingClientRect();parentBounds = this.quill.container.getBoundingClientRect();offsetLeft = referenceBounds.left - parentBounds.left;offsetTop = referenceBounds.top - parentBounds.top;offsetBottom = referenceBounds.bottom - parentBounds.bottom;left = offsetLeft + referenceBounds.width / 2 - this.container.offsetWidth / 2;top = offsetTop + referenceBounds.height + this.options.offset;if(top + this.container.offsetHeight > this.quill.container.offsetHeight){top = offsetTop - this.container.offsetHeight - this.options.offset;}left = Math.max(0, Math.min(left, this.quill.container.offsetWidth - this.container.offsetWidth));top = Math.max(0, Math.min(top, this.quill.container.offsetHeight - this.container.offsetHeight));}else {left = this.quill.container.offsetWidth / 2 - this.container.offsetWidth / 2;top = this.quill.container.offsetHeight / 2 - this.container.offsetHeight / 2;}top += this.quill.container.scrollTop;return [left, top];};Tooltip.prototype.show = function(reference){var left, ref, top;this.range = this.quill.getSelection();ref = this.position(reference), left = ref[0], top = ref[1];this.container.style.left = left + "px";this.container.style.top = top + "px";return this.container.focus();};return Tooltip;})();Quill.registerModule("tooltip", Tooltip);module.exports = Tooltip;}, {"../quill":30}], 29:[function(_dereq_, module, exports){var Delta, Quill, UndoManager, _;Quill = _dereq_("../quill");_ = Quill.require("lodash");Delta = Quill.require("delta");UndoManager = (function(){UndoManager.DEFAULTS = {delay:1000, maxStack:100};UndoManager.hotkeys = {UNDO:{key:"Z", metaKey:true}, REDO:{key:"Z", metaKey:true, shiftKey:true}};function UndoManager(quill, options){this.quill = quill;this.options = options != null?options:{};this.lastRecorded = 0;this.ignoreChange = false;this.clear();this.initListeners();}UndoManager.prototype.initListeners = function(){this.quill.onModuleLoad("keyboard", (function(_this){return function(keyboard){keyboard.addHotkey(UndoManager.hotkeys.UNDO, function(){_this.quill.editor.checkUpdate();_this.undo();return false;});return keyboard.addHotkey(UndoManager.hotkeys.REDO, function(){_this.quill.editor.checkUpdate();_this.redo();return false;});};})(this));return this.quill.on(this.quill.constructor.events.TEXT_CHANGE, (function(_this){return function(delta, origin){if(_this.ignoreChange){return;}_this.record(delta, _this.oldDelta);return _this.oldDelta = _this.quill.getContents();};})(this));};UndoManager.prototype.clear = function(){this.stack = {undo:[], redo:[]};return this.oldDelta = this.quill.getContents();};UndoManager.prototype.record = function(changeDelta, oldDelta){var change, ignored, timestamp, undoDelta;if(!(changeDelta.ops.length > 0)){return;}this.stack.redo = [];try{undoDelta = this.quill.getContents().diff(this.oldDelta);timestamp = new Date().getTime();if(this.lastRecorded + this.options.delay > timestamp && this.stack.undo.length > 0){change = this.stack.undo.pop();undoDelta = undoDelta.compose(change.undo);changeDelta = change.redo.compose(changeDelta);}else {this.lastRecorded = timestamp;}this.stack.undo.push({redo:changeDelta, undo:undoDelta});if(this.stack.undo.length > this.options.maxStack){return this.stack.undo.unshift();}}catch(_error) {ignored = _error;console.warn("Could not record change... clearing undo stack.");return this.clear();}};UndoManager.prototype.redo = function(){return this._change("redo", "undo");};UndoManager.prototype.undo = function(){return this._change("undo", "redo");};UndoManager.prototype._getLastChangeIndex = function(delta){var index, lastIndex;lastIndex = 0;index = 0;_.each(delta.ops, function(op){if(op.insert != null){return lastIndex = Math.max(index + (op.insert.length || 1), lastIndex);}else if(op["delete"] != null){return lastIndex = Math.max(index, lastIndex);}else if(op.retain != null){if(op.attributes != null){lastIndex = Math.max(index + op.retain, lastIndex);}return index += op.retain;}});return lastIndex;};UndoManager.prototype._change = function(source, dest){var change, index;if(this.stack[source].length > 0){change = this.stack[source].pop();this.lastRecorded = 0;this.ignoreChange = true;this.quill.updateContents(change[source], "user");this.ignoreChange = false;index = this._getLastChangeIndex(change[source]);this.quill.setSelection(index, index);this.oldDelta = this.quill.getContents();return this.stack[dest].push(change);}};return UndoManager;})();Quill.registerModule("undo-manager", UndoManager);module.exports = UndoManager;}, {"../quill":30}], 30:[function(_dereq_, module, exports){var Delta, Editor, EventEmitter2, Format, Normalizer, Quill, Range, _, dom, pkg, extend=function extend(child, parent){for(var key in parent) {if(hasProp.call(parent, key))child[key] = parent[key];}function ctor(){this.constructor = child;}ctor.prototype = parent.prototype;child.prototype = new ctor();child.__super__ = parent.prototype;return child;}, hasProp=({}).hasOwnProperty, slice=[].slice;_ = _dereq_("lodash");pkg = _dereq_("../package.json");Delta = _dereq_("rich-text/lib/delta");EventEmitter2 = _dereq_("eventemitter2").EventEmitter2;dom = _dereq_("./lib/dom");Editor = _dereq_("./core/editor");Format = _dereq_("./core/format");Normalizer = _dereq_("./core/normalizer");Range = _dereq_("./lib/range");Quill = (function(superClass){extend(Quill, superClass);Quill.version = pkg.version;Quill.editors = [];Quill.modules = [];Quill.themes = [];Quill.DEFAULTS = {formats:["align", "bold", "italic", "strike", "underline", "color", "background", "font", "size", "link", "image", "bullet", "list"], modules:{"keyboard":true, "paste-manager":true, "undo-manager":true}, pollInterval:100, readOnly:false, styles:{}, theme:"base"};Quill.events = {FORMAT_INIT:"format-init", MODULE_INIT:"module-init", POST_EVENT:"post-event", PRE_EVENT:"pre-event", SELECTION_CHANGE:"selection-change", TEXT_CHANGE:"text-change"};Quill.sources = Editor.sources;Quill.registerModule = function(name, module){if(Quill.modules[name] != null){console.warn("Overwriting " + name + " module");}return Quill.modules[name] = module;};Quill.registerTheme = function(name, theme){if(Quill.themes[name] != null){console.warn("Overwriting " + name + " theme");}return Quill.themes[name] = theme;};Quill.require = function(name){switch(name){case "lodash":return _;case "delta":return Delta;case "format":return Format;case "normalizer":return Normalizer;case "dom":return dom;case "range":return Range;default:return null;}};function Quill(container1, options){var html, moduleOptions, themeClass;this.container = container1;if(options == null){options = {};}if(_.isString(this.container)){this.container = document.querySelector(this.container);}if(this.container == null){throw new Error("Invalid Quill container");}moduleOptions = _.defaults(options.modules || {}, Quill.DEFAULTS.modules);html = this.container.innerHTML;this.container.innerHTML = "";this.options = _.defaults(options, Quill.DEFAULTS);this.options.modules = moduleOptions;this.options.id = this.id = "ql-editor-" + (Quill.editors.length + 1);this.modules = {};this.root = this.addContainer("ql-editor");this.editor = new Editor(this.root, this, this.options);Quill.editors.push(this);this.setHTML(html, Quill.sources.SILENT);themeClass = Quill.themes[this.options.theme];if(themeClass == null){throw new Error("Cannot load " + this.options.theme + " theme. Are you sure you registered it?");}this.theme = new themeClass(this, this.options);_.each(this.options.modules, (function(_this){return function(option, name){return _this.addModule(name, option);};})(this));}Quill.prototype.destroy = function(){var html;html = this.getHTML();_.each(this.modules, function(module, name){if(_.isFunction(module.destroy)){return module.destroy();}});this.editor.destroy();this.removeAllListeners();Quill.editors.splice(_.indexOf(Quill.editors, this), 1);return this.container.innerHTML = html;};Quill.prototype.addContainer = function(className, before){var container, refNode;if(before == null){before = false;}refNode = before?this.root:null;container = document.createElement("div");dom(container).addClass(className);this.container.insertBefore(container, refNode);return container;};Quill.prototype.addFormat = function(name, config){this.editor.doc.addFormat(name, config);return this.emit(Quill.events.FORMAT_INIT, name);};Quill.prototype.addModule = function(name, options){var moduleClass;moduleClass = Quill.modules[name];if(moduleClass == null){throw new Error("Cannot load " + name + " module. Are you sure you registered it?");}if(options === true){options = {};}options = _.defaults(options, this.theme.constructor.OPTIONS[name] || {}, moduleClass.DEFAULTS || {});this.modules[name] = new moduleClass(this, options);this.emit(Quill.events.MODULE_INIT, name, this.modules[name]);return this.modules[name];};Quill.prototype.deleteText = function(start, end, source){var delta, formats, ref;if(source == null){source = Quill.sources.API;}ref = this._buildParams(start, end, {}, source), start = ref[0], end = ref[1], formats = ref[2], source = ref[3];if(!(end > start)){return;}delta = new Delta().retain(start)["delete"](end - start);return this.editor.applyDelta(delta, source);};Quill.prototype.emit = function(){var args, eventName;eventName = arguments[0], args = 2 <= arguments.length?slice.call(arguments, 1):[];Quill.__super__.emit.apply(this, [Quill.events.PRE_EVENT, eventName].concat(slice.call(args)));Quill.__super__.emit.apply(this, [eventName].concat(slice.call(args)));return Quill.__super__.emit.apply(this, [Quill.events.POST_EVENT, eventName].concat(slice.call(args)));};Quill.prototype.focus = function(){return this.editor.focus();};Quill.prototype.formatLine = function(start, end, name, value, source){var formats, line, offset, ref, ref1;ref = this._buildParams(start, end, name, value, source), start = ref[0], end = ref[1], formats = ref[2], source = ref[3];ref1 = this.editor.doc.findLineAt(end), line = ref1[0], offset = ref1[1];if(line != null){end += line.length - offset;}return this.formatText(start, end, formats, source);};Quill.prototype.formatText = function(start, end, name, value, source){var delta, formats, ref;ref = this._buildParams(start, end, name, value, source), start = ref[0], end = ref[1], formats = ref[2], source = ref[3];formats = _.reduce(formats, (function(_this){return function(formats, value, name){var format;format = _this.editor.doc.formats[name];if(!(value && value !== format.config["default"])){formats[name] = null;}return formats;};})(this), formats);delta = new Delta().retain(start).retain(end - start, formats);return this.editor.applyDelta(delta, source);};Quill.prototype.getBounds = function(index){return this.editor.getBounds(index);};Quill.prototype.getContents = function(start, end){if(start == null){start = 0;}if(end == null){end = null;}if(_.isObject(start)){end = start.end;start = start.start;}return this.editor.delta.slice(start, end);};Quill.prototype.getHTML = function(){return this.editor.doc.getHTML();};Quill.prototype.getLength = function(){return this.editor.length;};Quill.prototype.getModule = function(name){return this.modules[name];};Quill.prototype.getSelection = function(){this.editor.checkUpdate();return this.editor.selection.getRange();};Quill.prototype.getText = function(start, end){if(start == null){start = 0;}if(end == null){end = null;}return _.map(this.getContents(start, end).ops, function(op){if(_.isString(op.insert)){return op.insert;}else {return "";}}).join("");};Quill.prototype.insertEmbed = function(index, type, url, source){var delta, end, formats, ref;ref = this._buildParams(index, 0, type, url, source), index = ref[0], end = ref[1], formats = ref[2], source = ref[3];delta = new Delta().retain(index).insert(1, formats);return this.editor.applyDelta(delta, source);};Quill.prototype.insertText = function(index, text, name, value, source){var delta, end, formats, ref;ref = this._buildParams(index, 0, name, value, source), index = ref[0], end = ref[1], formats = ref[2], source = ref[3];if(!(text.length > 0)){return;}delta = new Delta().retain(index).insert(text, formats);return this.editor.applyDelta(delta, source);};Quill.prototype.onModuleLoad = function(name, callback){if(this.modules[name]){return callback(this.modules[name]);}return this.on(Quill.events.MODULE_INIT, function(moduleName, module){if(moduleName === name){return callback(module);}});};Quill.prototype.prepareFormat = function(name, value, source){var format, range;if(source == null){source = Quill.sources.API;}format = this.editor.doc.formats[name];if(format == null){return;}range = this.getSelection();if(!(range != null?range.isCollapsed():void 0)){return;}if(format.isType(Format.types.LINE)){return this.formatLine(range, name, value, source);}else {return format.prepare(value);}};Quill.prototype.setContents = function(delta, source){var lastOp;if(source == null){source = Quill.sources.API;}if(Array.isArray(delta)){delta = new Delta(delta.slice());}else {delta = new Delta(delta.ops.slice());}lastOp = _.last(delta.slice(delta.length() - 1).ops);delta["delete"](this.getLength() - 1);if(lastOp != null && _.isString(lastOp.insert) && _.last(lastOp.insert) === "\n"){delta["delete"](1);}return this.updateContents(delta, source);};Quill.prototype.setHTML = function(html, source){if(source == null){source = Quill.sources.API;}if(!html.trim()){html = "<" + dom.DEFAULT_BLOCK_TAG + "><" + dom.DEFAULT_BREAK_TAG + "></" + dom.DEFAULT_BLOCK_TAG + ">";}this.editor.doc.setHTML(html);return this.editor.checkUpdate(source);};Quill.prototype.setSelection = function(start, end, source){var range;if(source == null){source = Quill.sources.API;}if(_.isNumber(start) && _.isNumber(end)){range = new Range(start, end);}else {range = start;source = end || source;}return this.editor.selection.setRange(range, source);};Quill.prototype.setText = function(text, source){var delta;if(source == null){source = Quill.sources.API;}delta = new Delta().insert(text);return this.setContents(delta, source);};Quill.prototype.updateContents = function(delta, source){if(source == null){source = Quill.sources.API;}if(Array.isArray(delta)){delta = {ops:delta};}return this.editor.applyDelta(delta, source);};Quill.prototype._buildParams = function(){var formats, params;params = 1 <= arguments.length?slice.call(arguments, 0):[];if(_.isObject(params[0])){params.splice(0, 1, params[0].start, params[0].end);}if(_.isString(params[2])){formats = {};formats[params[2]] = params[3];params.splice(2, 2, formats);}if(params[3] == null){params[3] = Quill.sources.API;}return params;};return Quill;})(EventEmitter2);Quill.registerTheme("base", _dereq_("./themes/base"));Quill.registerTheme("snow", _dereq_("./themes/snow"));module.exports = Quill;}, {"../package.json":7, "./core/editor":9, "./core/format":10, "./core/normalizer":13, "./lib/dom":17, "./lib/range":20, "./themes/base":32, "./themes/snow":33, "eventemitter2":2, "lodash":1, "rich-text/lib/delta":3}], 31:[function(_dereq_, module, exports){module.exports = ".ql-image-tooltip{padding:10px;width:300px}.ql-image-tooltip:after{clear:both;content:\"\";display:table}.ql-image-tooltip a{border:1px solid #000;box-sizing:border-box;display:inline-block;float:left;padding:5px;text-align:center;width:50%}.ql-image-tooltip img{bottom:0;left:0;margin:auto;max-height:100%;max-width:100%;position:absolute;right:0;top:0}.ql-image-tooltip .input{box-sizing:border-box;width:100%}.ql-image-tooltip .preview{margin:10px 0;position:relative;border:1px dashed #000;height:200px}.ql-image-tooltip .preview span{display:inline-block;position:absolute;text-align:center;top:40%;width:100%}.ql-link-tooltip{padding:5px 10px}.ql-link-tooltip input.input{width:170px}.ql-link-tooltip a.done,.ql-link-tooltip input.input{display:none}.ql-link-tooltip a.change{margin-right:4px}.ql-link-tooltip.editing a.done,.ql-link-tooltip.editing input.input{display:inline-block}.ql-link-tooltip.editing a.change,.ql-link-tooltip.editing a.remove,.ql-link-tooltip.editing a.url{display:none}.ql-multi-cursor{position:absolute;left:0;top:0;z-index:1000}.ql-multi-cursor .cursor{margin-left:-1px;position:absolute}.ql-multi-cursor .cursor-flag{bottom:100%;position:absolute;white-space:nowrap}.ql-multi-cursor .cursor-name{display:inline-block;color:#fff;padding:2px 8px}.ql-multi-cursor .cursor-caret{height:100%;position:absolute;width:2px}.ql-multi-cursor .cursor.hidden .cursor-flag{display:none}.ql-multi-cursor .cursor.top .cursor-flag{bottom:auto;top:100%}.ql-multi-cursor .cursor.right .cursor-flag{right:-2px}.ql-paste-manager{left:-100000px;position:absolute;top:50%}.ql-toolbar{box-sizing:border-box}.ql-tooltip{background-color:#fff;border:1px solid #000;box-sizing:border-box;position:absolute;top:0;white-space:nowrap;z-index:2000}.ql-tooltip a{cursor:pointer;text-decoration:none}.ql-container{box-sizing:border-box;cursor:text;font-family:Helvetica,Arial,sans-serif;font-size:13px;height:100%;line-height:1.42;margin:0;overflow-x:hidden;overflow-y:auto;padding:12px 15px;position:relative}.ql-editor{box-sizing:border-box;min-height:100%;outline:0;tab-size:4;white-space:pre-wrap}.ql-editor div{margin:0;padding:0}.ql-editor a{text-decoration:underline}.ql-editor b{font-weight:700}.ql-editor i{font-style:italic}.ql-editor s{text-decoration:line-through}.ql-editor u{text-decoration:underline}.ql-editor a,.ql-editor b,.ql-editor i,.ql-editor s,.ql-editor span,.ql-editor u{background-color:inherit}.ql-editor img{max-width:100%}.ql-editor blockquote,.ql-editor ol,.ql-editor ul{margin:0 0 0 2em;padding:0}.ql-editor ol{list-style-type:decimal}.ql-editor ul{list-style-type:disc}.ql-editor.ql-ie-10 br,.ql-editor.ql-ie-9 br{display:none}";}, {}], 32:[function(_dereq_, module, exports){var BaseTheme, _, baseStyles, dom;_ = _dereq_("lodash");dom = _dereq_("../../lib/dom");baseStyles = _dereq_("./base.styl");BaseTheme = (function(){BaseTheme.OPTIONS = {};BaseTheme.objToCss = function(obj){return _.map(obj, function(value, key){var innerStr;innerStr = _.map(value, function(innerValue, innerKey){return innerKey + ": " + innerValue + ";";}).join(" ");return key + " { " + innerStr + " }";}).join("\n");};function BaseTheme(quill, options){var version;this.quill = quill;this.options = options;dom(this.quill.container).addClass("ql-container");if(this.options.styles){this.addStyles(baseStyles + BaseTheme.objToCss(this.options.styles));}if(dom.isIE(10)){version = dom.isIE(9)?"9":"10";dom(this.quill.root).addClass("ql-ie-" + version);}}BaseTheme.prototype.addStyles = function(css){var style;if(_.isObject(css)){css = BaseTheme.objToCss(css);}style = document.createElement("style");style.type = "text/css";style.appendChild(document.createTextNode(css));return document.head.appendChild(style);};return BaseTheme;})();module.exports = BaseTheme;}, {"../../lib/dom":17, "./base.styl":31, "lodash":1}], 33:[function(_dereq_, module, exports){var BaseTheme, ColorPicker, Picker, SnowTheme, _, dom, extend=function extend(child, parent){for(var key in parent) {if(hasProp.call(parent, key))child[key] = parent[key];}function ctor(){this.constructor = child;}ctor.prototype = parent.prototype;child.prototype = new ctor();child.__super__ = parent.prototype;return child;}, hasProp=({}).hasOwnProperty;_ = _dereq_("lodash");ColorPicker = _dereq_("../../lib/color-picker");BaseTheme = _dereq_("../base");dom = _dereq_("../../lib/dom");Picker = _dereq_("../../lib/picker");SnowTheme = (function(superClass){extend(SnowTheme, superClass);SnowTheme.COLORS = ["#000000", "#e60000", "#ff9900", "#ffff00", "#008A00", "#0066cc", "#9933ff", "#ffffff", "#facccc", "#ffebcc", "#ffffcc", "#cce8cc", "#cce0f5", "#ebd6ff", "#bbbbbb", "#f06666", "#ffc266", "#ffff66", "#66b966", "#66a3e0", "#c285ff", "#888888", "#a10000", "#b26b00", "#b2b200", "#006100", "#0047b2", "#6b24b2", "#444444", "#5c0000", "#663d00", "#666600", "#003700", "#002966", "#3d1466"];SnowTheme.OPTIONS = {"multi-cursor":{template:"<span class=\"cursor-flag\"> <span class=\"cursor-triangle top\"></span> <span class=\"cursor-name\"></span> <span class=\"cursor-triangle bottom\"></span> </span> <span class=\"cursor-caret\"></span>"}};function SnowTheme(quill, options){this.quill = quill;this.options = options;SnowTheme.__super__.constructor.apply(this, arguments);dom(this.quill.container).addClass("ql-snow");this.pickers = [];this.quill.on(this.quill.constructor.events.SELECTION_CHANGE, (function(_this){return function(range){if(range != null){return _.invoke(_this.pickers, "close");}};})(this));this.quill.onModuleLoad("multi-cursor", _.bind(this.extendMultiCursor, this));this.quill.onModuleLoad("toolbar", _.bind(this.extendToolbar, this));}SnowTheme.prototype.extendMultiCursor = function(module){return module.on(module.constructor.events.CURSOR_ADDED, function(cursor){var bottomTriangle, topTriangle;bottomTriangle = cursor.elem.querySelector(".cursor-triangle.bottom");topTriangle = cursor.elem.querySelector(".cursor-triangle.top");return bottomTriangle.style.borderTopColor = topTriangle.style.borderBottomColor = cursor.color;});};SnowTheme.prototype.extendToolbar = function(module){dom(module.container).addClass("ql-snow");_.each(["color", "background", "font", "size", "align"], (function(_this){return function(format){var picker, select;select = module.container.querySelector(".ql-" + format);if(select == null){return;}switch(format){case "font":case "size":case "align":picker = new Picker(select);break;case "color":case "background":picker = new ColorPicker(select);_.each(picker.container.querySelectorAll(".ql-picker-item"), function(item, i){if(i < 7){return dom(item).addClass("ql-primary-color");}});}if(picker != null){return _this.pickers.push(picker);}};})(this));return _.each(dom(module.container).textNodes(), function(node){if(dom(node).text().trim().length === 0){return dom(node).remove();}});};return SnowTheme;})(BaseTheme);module.exports = SnowTheme;}, {"../../lib/color-picker":16, "../../lib/dom":17, "../../lib/picker":19, "../base":32, "lodash":1}]}, {}, [15])(15);});
}, {}]}, {}, {"1":""})