import path from 'path'
import Tor from '../src'

let tor = new Tor({
  socksPort: 9050,
  controlPort: 9051,
  // cwd: path.resolve(__dirname, '../Tor/tor.exe'),
  cwd: 'D:/node/Tor/tor.exe',
  events: ['STREAM']
})


tor.on('bootstrap', data => console.log('bootstrap: '+data))
tor.on('connect', () => console.log('Tor Connect...'))
tor.on('auth', () => console.log('auth'))
tor.on('error', error => console.log('error', error))
tor.on('exit', data => console.log('Tor end...'))
tor.on('stream', data => console.log('stream:'+data))
tor.on('http', data => console.log(data))

// tor.request({ uri: 'https://wetransfer.com/' })
tor.createHTTPServer(9080) 
tor.request({ uri: 'https://github.com' })
  .then(data => console.log('send'))
  .catch((err) => console.log('[send]', err.message))

