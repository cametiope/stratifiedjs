@ = require('sjs:test/std');
@context("tar") {||
  @stream = require('sjs:nodejs/stream');
  var { @TemporaryDir } = require('sjs:nodejs/tempfile');
  var fixtureDir = @url.normalize('../fixtures', module.id) .. @url.toPath();
  var fixtures = @fs.readdir(fixtureDir) .. @sort;
  @assert.ok(fixtures.length > 5, JSON.stringify(fixtures));

  @tar = require('sjs:nodejs/tar');
  @gzip = require('sjs:nodejs/gzip');

  var hasTar = (function() {
    try {
      @childProcess.run('tar', ['--help'], {stdio:'ignore'});
      return true;
    } catch(e) {
      //console.log(e);
      if(e.code === 'ENOENT') return false;
      throw e;
    }
  })();

  var decode = b -> b.toString('utf-8').trim();

  @context("`tar` compatibility") {||
    ;[false, true] .. @each {|compress|
      var desc = compress?" compressed":" plain";
      var tarFlag = compress?'z':'';
      @test("create" + desc) {||
        @TemporaryDir {|dest|
          @fs.readdir(dest) .. @assert.eq([])
          var input = @tar.pack(fixtureDir);
          if(compress) input = input .. @gzip.compress;
          var proc = @childProcess.launch('tar', ['vx'+tarFlag, '--strip=1'], {stdio:['pipe', 'pipe', 2], cwd:dest});
          waitfor {
            input .. @stream.pump(proc.stdin);
            @info("ending tar");
            proc.stdin.end();
          } and {
            proc.stdout .. @stream.contents .. @transform(decode) .. @each(@logging.print);
          } and {
            proc .. @childProcess.wait({throwing:true});
          }
          @fs.readdir(dest) .. @sort .. @assert.eq(fixtures)
        }
      }

      @test("extract"+desc) {||
        @TemporaryDir {|dest|
          @fs.readdir(dest) .. @assert.eq([])
          var proc = @childProcess.launch('tar',
            ['vc'+tarFlag, @path.basename(fixtureDir)],
            {stdio:['ignore', 'pipe', 'pipe'], cwd:@path.dirname(fixtureDir)}
          );
          waitfor {
            var contents = proc.stdout .. @stream.contents();
            if(compress) contents = contents .. @gzip.decompress;
            contents .. @tar.extract({path: dest, strip:1});
            @fs.readdir(dest) .. @sort .. @assert.eq(fixtures)
          } and {
            proc .. @childProcess.wait({throwing:true});
          }
        }
      }
    }
  }.skipIf(!hasTar, "`tar` not available");

  @context("error thrown by") {||
    var exhaust = s -> s .. @each(->null);
    @test("invalid gzip data") {||
      @assert.raises({message:"incorrect header check"},
        -> ["not likely to be gzip"] .. @toStream() .. @gzip.decompress .. exhaust()
      );
    }

    @test("invalid tar data") {||
      @TemporaryDir {|dest|
        @assert.raises({message:"invalid tar file"},
          -> ["not likely to be tar"] .. @toStream() .. @tar.extract({path:@path.join(dest,'result')})
        );
      }
    }

    @context("file permissions") {||
      @test("unreadable file") {||
        @TemporaryDir {|src|
          var ropath = @path.join(src, "readonly");
          ropath .. @fs.writeFile("secret", 'utf-8');
          ropath .. @fs.chmod(0000);
          try {
            @assert.raises({message:/^EACCES, open .*readonly['"]$/},
              -> @tar.pack(src) .. exhaust()
            );
          } finally {
            // make sure it's deletable
            ropath .. @fs.chmod(0644);
          }
        }
      }

      @test("unwritable directory") {||
        @TemporaryDir {|src|
          src .. @fs.chmod(0500);
          try {
            @assert.raises({message:/^EACCES, mkdir/},
              -> @tar.pack(fixtureDir) .. @tar.extract({path:src})
            );
          } finally {
            // make sure it's deletable
            src .. @fs.chmod(0755);
          }
        }
      }
    }.skipIf(@isWindows, "fs.chmod not functional");
  }
}.serverOnly();
