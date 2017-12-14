
import URL from 'url'
import http from 'http'
import Socket from 'socks'
import SocksAgent from './SocksAgent'
import domain from 'domain'
export default class HTTPServer extends http.Server { 
  constructor(tor) {
    let handle_http = (req, res) => {
      let d = domain.create()
      let url = URL.parse(req.url)
      let buffer = []
      let onIncomingData = chunk => buffer.push(chunk)
      let preConnectClosed = () => req.finished = true
      d.add(req)
      d.add(res)
      req.on('data', onIncomingData)
      req.on('end', preConnectClosed)
      d.on('error', error => {
        tor.emit('error', `[http]: an error occured: ${error.message}`)
        res.end()
      })
      d.run(() => {
        let proxy_req = http.request({
          method: req.method,
          hostname: url.hostname, 
          port: url.port || 80,
          path: url.path,
          headers: req.headers,
          agent: new SocksAgent({
            socksHost: tor.host,
            socksPort: tor.socksPort
          })
        }, proxy_res => {
          d.add(proxy_res)
          proxy_res.on('data', chunk => res.write(chunk))
          proxy_res.on('end', () => res.end())
          res.writeHead(proxy_res.statusCode, proxy_res.headers)
        })

        req.removeListener('data', onIncomingData);
        req.on('data', chunk => proxy_req.write(chunk))
        req.on('end', () => proxy_req.end() )

        while (buffer.length) {
          proxy_req.write(buffer.shift())
        }
        if (req.finished) proxy_req.end()
        d.add(proxy_req)
      })
    }
    let handle_connect = (req, inbound, head) => {
      var buffer = [head]
      var outbound;
      let d = domain.create();
      let host = req.url.split(':').shift()
      let port = Number(req.url.split(':').pop())
      let onInboundData = data => buffer.push(data)
      let onClose = error => {
        inbound && inbound.end()
        outbound && outbound.end()
        inbound = outbound = buffer = void(0)
        if (error) tor.emit('error', `[http]: an error occured: ${error.message}`)
        d.exit()
      }
      d.add(inbound)
      d.on('error', onClose)
      d.run(() => Socket.createConnection({
          proxy: {
            type: 5,
            ipaddress: tor.host,
            port: tor.socksPort,
            command: 'connect'
          },
          target: { port, host }
        }, function(err, socket, info) {
            if(err) return onClose(err)
            outbound = socket;
            d.add(outbound)
            outbound.on('close', onClose)
            outbound.on('error', onClose)
            inbound.write('HTTP/1.1 200 Connection Established\r\n'+'Proxy-agent: tor-stem\r\n' +'\r\n')
            outbound.write(head)
            outbound.pipe(inbound)
            inbound.pipe(outbound)
        })
      )
    }
    super(handle_http)
    this.on('connect', handle_connect)
    this.tor = tor
  }
}