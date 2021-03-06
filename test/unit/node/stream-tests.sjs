var testUtil = require('../../lib/testUtil');
var test = testUtil.test;
@ = require('sjs:test/std');

@context() {||
  var s = @stream = require("sjs:nodejs/stream");

  @test("contents returns a stream of buffers") {||
    @fs.withReadStream(module.id .. @url.toPath) {|stream|
      var contents = s.contents(stream);
      contents .. @isStream .. @assert.ok();
      contents .. @first .. Buffer.isBuffer .. @assert.ok();
    }
  }

  @test("contents(encoding) returns a stream of strings") {||
    @fs.withReadStream(module.id .. @url.toPath) {|stream|
      var contents = s.contents(stream, 'utf-8');
      contents .. @isStream .. @assert.ok();
      contents .. @first .. @isString .. @assert.ok();
    }
  }

  @context("pump") {||
    @test.beforeEach {|s|
      s.dest = @stream.WritableStringStream();
    }

    @test("accepts a nodejs stream") {|s|
      @stream.ReadableStringStream('data', 'ascii') .. @stream.pump(s.dest);
      s.dest.data .. @assert.eq("data");
    }

    @test("allows data transformation (deprecated API)") {|s|
      @stream.ReadableStringStream('data', 'ascii') .. @stream.pump(s.dest, d -> d.toUpperCase());
      s.dest.data .. @assert.eq("DATA");
    }

    @test("accepts a sequence::Stream") {|s|
      ["one", "two", "three"] .. @toStream .. @stream.pump(s.dest);
      s.dest.contents() .. @assert.eq("onetwothree");
    }

    @test("accepts an array") {|s|
      ["one", "two", "three"] .. @stream.pump(s.dest);
      s.dest.contents() .. @assert.eq("onetwothree");
    }

    @test("accepts a buffer") {||
      var dest = new @stream.WritableStream();
      new Buffer("onetwothree") .. @stream.pump(dest);
      dest.contents() .. @assert.eq(new Buffer("onetwothree"));
    }

    @test("accepts a string") {|s|
      "onetwothree" .. @stream.pump(s.dest);
      s.dest.contents() .. @assert.eq("onetwothree");
    }
  }

  // ReadableStringStream:
  test("ReadableStringStream emits data", "data", function() {
    var stream = new s.ReadableStringStream("data");
    var data = '';
    stream.on('data', function(newData) {
      data += newData;
    });
    waitfor() {
      stream.on('end', resume);
    }
    return data;
  });

  test("ReadableStringStream supports pause/resume", "[pause] [resume] data", function() {
    var stream = new s.ReadableStringStream("data", 'ascii');
    stream.pause();
    var data = '';
    stream.on('data', function(newData) {
      data += newData;
    });
    data += "[pause] ";
    hold(100);
    stream.resume();
    data += "[resume] ";
    waitfor() {
      stream.on('end', resume);
    }
    return data;
  });

  test("WritableStringStream", "[data][end]", function() {
    var stream = new s.WritableStringStream();
    waitfor {
      waitfor() { stream.on('finish', resume); }
    }
    and {
      stream.write('[data]');
      stream.end('[end]');
    }
    return stream.data;
  });

  ;[true, false] .. @each {|byteMode|
    var wrap = s.DelimitedReader;
    var chunkyStream = function(chunks) {
      var chunks = (chunks .. @toArray()).slice();
      var rv = new (require('nodejs:events').EventEmitter)();
      var running = true;
      rv.readable = true;
      var ended = false;

      var getChunk = function() {
        if (chunks.length == 0) return null;
        var chunk = chunks.shift();
        if (byteMode) chunk = new Buffer(chunk);
        if (chunks.length == 0) rv.readable = false;
        return chunk;
      };

      rv.resume = function() {
        running = true;
        while(running) {
          var chunk = getChunk();
          if (chunk === null) {
            //console.log("emitting null");
            if(!ended) {
              this.emit('end');
              ended = true;
            }
            break;
          } else {
            //console.log("emitting chunk: #{chunks[0]}");
            this.emit('data', chunk);
          }
          hold(0);
        }
      };
      rv.pause = function() {
        running = false;
      };

      rv.read = function() {
        var rv = getChunk();
        var self = this;
        if(rv == null) {
          if(!ended) {
            ended = true;
            spawn(function() {
              hold(0);
              self.emit('end');
            }());
          }
        }
        return rv;
      };

      return rv;
    }

    @context("DelimitedReader on #{byteMode ? 'byte' : 'string'} streams") {||

      @test("reads up to a given character") {||
        var reader = wrap(chunkyStream(['12345', '678']));
        reader.readUntil('4').toString('utf-8') .. @assert.eq('1234');
        reader.read().toString('utf-8') .. @assert.eq('5');
        reader.read().toString('utf-8') .. @assert.eq('678');
        reader.read() .. @assert.eq(null);
      }

      @test("buffers multiple chunks until sentinel is reached") {||
        var reader = wrap(chunkyStream(['12', '345', '678']));
        reader.readUntil('7').toString('utf-8') .. @assert.eq('1234567');
        reader.read().toString('utf-8') .. @assert.eq('8');
        reader.read() .. @assert.eq(null);
      }

      @test("sentinel at the end of a chunk") {||
        var reader = wrap(chunkyStream(['12', '345', '678']));
        reader.readUntil('2').toString('utf-8') .. @assert.eq('12');
        reader.read().toString('utf-8') .. @assert.eq(''); // could be omitted
        reader.read().toString('utf-8') .. @assert.eq('345');
        reader.read().toString('utf-8') .. @assert.eq('678');
        reader.read() .. @assert.eq(null);
      }

      @test("readUntil returns empty sequence for multiple sentinels") {||
        var reader = wrap(chunkyStream(['12\n\n']));
        reader.readUntil('\n').toString('utf-8') .. @assert.eq('12\n');
        reader.readUntil('\n').toString('utf-8') .. @assert.eq('\n');
        reader.readUntil('\n') .. @assert.eq(null);
      }

      @test("doesnt skip sentinels that appear in th same chunk") {||
        var reader = wrap(chunkyStream(['123543678']));
        reader.readUntil('3').toString('utf-8') .. @assert.eq('123');
        reader.readUntil('3').toString('utf-8') .. @assert.eq('543');
        reader.read().toString('utf-8') .. @assert.eq('678');
        reader.read() .. @assert.eq(null);
      }

      @test("changing sentinel") {||
        var reader = wrap(chunkyStream(['123454321']));
        reader.readUntil('4').toString('utf-8') .. @assert.eq('1234');
        reader.readUntil('2').toString('utf-8') .. @assert.eq('5432');
        reader.read().toString('utf-8') .. @assert.eq('1');
        reader.read() .. @assert.eq(null);
      }

      @test("returns all data if sentinel is not found") {||
        var reader = wrap(chunkyStream(['123', '456']));
        reader.readUntil('8').toString('utf-8') .. @assert.eq('123456');
        reader.read() .. @assert.eq(null);
      }

      @test("lines") {||
        chunkyStream(['123\n456','78\n910'])
          .. s.lines
          .. @map(b -> b.toString('utf-8'))
          .. @assert.eq(['123\n','45678\n','910']);
      }
    }.skipIf(byteMode && (process.versions.node.split('.') .. @map(i -> parseInt(i, 10)) .. @cmp([0, 8]) < 0), "nodejs 0.6 lacks Buffer.concat")
  }
}.serverOnly();
