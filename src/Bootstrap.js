import fs from 'fs'
import net from 'net'
import temp from 'temp'
import path from 'path'
import { Transform } from 'stream'
import { spawn } from 'child_process'
temp.track()

export default class Bootstrap {
  constructor(opts, tor) {
    this.tor = tor
    tor.cwd = opts.cwd || 'tor'
    tor.host = opts.host  || '127.0.0.1',
    tor.socksPort = opts.socksPort || 0,
    tor.controlPort = opts.controlPort || 0,
    tor.controlPass = opts.controlPass
    this.promise = new Promise((resolve, reject) => {
      this.resolve = resolve
      this.reject = reject
    })
    this.run()
      .then(() => this.connect())
      .then(() => this.resolve())
      .catch(err => tor.exit(null, err.message))
  }
  async run() {
    let self = this
    let tor = this.tor
    return new Promise(async function(done, error) {
      try {
        let [socksPort, controlPort] = await Promise.all([
          self.port(tor.socksPort),
          self.port(tor.controlPort)
        ])
        tor.socksPort = socksPort 
        tor.controlPort = controlPort
        tor.dataDir =  await self.temp('Tor')
        let child = spawn(tor.cwd,[
          '--HashedControlPassword', (tor.controlPass || ''),
          '--ControlPort', tor.controlPort,
          '--SocksPort', tor.socksPort,
          '--PidFile', path.join(tor.dataDir, 'pid'),
          '--DataDirectory', tor.dataDir,
        ], { detached: true })
        child.stdout.on('data', async data => {
          const regexp = /Bootstrapped 100%: Done/
          let bootstrapped = data.toString('utf8').match(/Bootstrapped (\d+)/) 
          if (bootstrapped && bootstrapped[1]) tor.emit('bootstrap', bootstrapped[1])
          if (regexp.test(data)) done((tor.pid = child.pid))
        })
        child.on('exit', code => {
          tor.emit('exit', code)
          error(`Tor exited with code ${code}`)
        })
        child.stderr.on('data', data => {
          let message = data.toString('utf8')
          tor.emit('error', '[bootstrap]'+message)
          error(message)
        })
      } catch(err) {
        console.log(err)
        done()
      }
    })
  }
  connect() {
    const self = this
    const tor = this.tor
    return new Promise((res, rej) => {
      tor.client = net.connect({
          host: tor.host,
          port: tor.controlPort,
          password: tor.controlPass,
          persistent: false
      })
      tor.client.pipe(self.createReply())
        .on('data', ({ code, lines }) => {
          switch (code.toString().charAt(0)) {
            case '2':
              // Success
              let { method, done } = tor.stack.pop();
              done(null, lines)
            break;
            case '4':
              // Warning
              tor.stack.pop().done(new Error(lines.join(' ')))
            case '5':
              // Error
              tor.stack.pop().done(new Error(lines.join(' ')))
            break;
            default:
              // Events(6)
              lines.forEach(line => {
                let event = line.split(' ')[0];
                tor.emit(event.toLowerCase(), line.replace(`${event} `, ''))
              })
          }
        });
      tor.client.on('error', error => rej(error))
      tor.client.on('connect', () => tor.emit('connect'))
      tor.client.on('end', () => tor.emit('close'))
      tor.command('AUTHENTICATE'+((tor.controlPass) ? ' "'+tor.controlPass+'"' : ''))
        .then(() => tor.emit('auth'))
        .then(res, rej)
    })
  }
  createReply() {
    return new Transform({
      objectMode: true,
      transform: function(byte, enc, done) {
        let data = byte.toString()
        let code = parseInt(data.substr(0, 3), 10)
        let lines = data.split(/\r?\n/).reduce((res, line) => { 
          if(line.length) res.push(line.substr(4))
          return res
        }, [])
        done(null, {code, lines})
      }
    })
  }
  temp(dir) {
    return new Promise(
      (done, error) => temp.mkdir(dir, (err, res) => err ? error(err) : done(res)) 
    )
  }
  port(opts = 0){
    return new Promise((done, error) => {
      const server = net.createServer()
        .unref()
        .on('error', error)
        .listen(
          (typeof opts === 'number') ? {port:opts} : opts,
          () => {
            let port = server.address().port
            server.close(() => done(port))
          }
        )
    }) 
  }
}