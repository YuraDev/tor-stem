import tls from 'tls'
import http from 'http'
import SocksClient from 'socks'

export default class SocksAgent extends  http.Agent { 
  constructor(opts) {
    super(opts)
    if (!(this instanceof SocksAgent)) return new SocksAgent(opts)
    this.protocol = null
    this.socksHost = opts.socksHost
    this.socksPort = opts.socksPort 
  }
  addRequest (req, opts) {
    req._last = true
    req.shouldKeepAlive = false
    delete opts.agent;
    delete opts.hostname;
    delete opts._defaultAgent;
    delete opts.defaultPort;
    delete opts.createConnection;
    if (opts.host && opts.path) {
      delete opts.path;
    }
    let done = (err, socket) => err ? req.emit('error', err) : req.onSocket(socket)
    SocksClient.createConnection({
      proxy: {
        ipaddress: this.socksHost,
        port: +this.socksPort,
        type: 5
      },
      target: {
        host: opts.host,
        port: +opts.port
      },
      command: 'connect'
    }, function (err, socket) {
      if (err) return done(err);
      let client = socket;
      if (opts.secureEndpoint || opts.port === 443) {
        client = tls.connect(Object.assign({}, opts, {
          socket,
          host: null,
          port: null,
          hostname: null,
          servername: opts.host
        }))
      }
      socket.resume()
      done(null, client)
    })
  }
}