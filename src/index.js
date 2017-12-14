import fs from 'fs'
import net from 'net'
import path from 'path'
import Socket from 'socks'
import request from 'request-promise'
import EventEmitter from 'events'
import Bootstrap from './Bootstrap'
import HTTPServer from './HTTPServer'
import SocksAgent from './SocksAgent'
export default class Tor extends EventEmitter {
  constructor(opts) {
    super();
    this.pid = null
    this.stack = []
    this.client = null
    let run = new Bootstrap({ 
      cwd: opts.cwd,
      host: opts.host,
      socksPort: opts.socksPort,
      controlPort: opts.controlPort,
      controlPass: opts.controlPass
    }, this)
    this.wait = run.promise
    this.resWait = run.resolve
  }
  disconnect(force) {
    return new Promise((res, rej) => {
      if (!this.client) return res()
      this.client.once('end', () => res())
      if(force) this.client.end()
      this.client.write('QUIT\r\n');
      return this;
    })
  }
  command (command) {
    return new Promise(async (res, rej) => {
      if(!this.client) return rej('Not connect!')
      this.stack.unshift({
        method: command.split(' ')[0],
        done: (error, data) => error ? rej(error) : res(data || '')
      })
      this.client.write(command + '\r\n')
    })
  }
  setevent(event, callback) {
    if(callback) this.on('event', callback)
    this.command(`SETEVENTS ${event}`)
  }
  setevents (events) {
    return this.command(`SETEVENTS ${Array.isArray(events) ? events.join(' ') : events}`)
  }
  agent() {
     return new SocksAgent({ 
      socksHost: this.host,
      socksPort: this.socksPort
     }, this)
  }
  exit (signal, message) {
    let sefl = this
    return new Promise(function (res, rej) {
      if(sefl.pid)  {
        console.log(sefl.pid)
        process.kill(sefl.pid, 'SIGTERM')
        process.kill(sefl.pid, 'SIGKILL')
        sefl.on('exit', code => res(`Killing tor sub-process code:${code}`))
      } else {
        rej()
      }
    })
  }
  reload() {
    return this.command('SIGNAL RELOAD')
  }
  async newnym () {
    let out = await this.command('SIGNAL NEWNYM')
    let ip = await check()
    return ip
  } 
  async createHTTPServer(port) {
    await this.wait
    this.httpPort = port || this.httpPort
    let message = `Listening on ${this.host}:${this.httpPort}`
    this.httpServer = new HTTPServer(this)
    this.httpServer.listen(this.httpPort)
    this.emit('http', message)
    return Promise.resolve(message)
  }
  async request(opts) {
    await this.wait
    let agent = this.agent()
    return new Promise(async (res, rej) => {
      request({
        agent,
        pool: { maxSockets: Infinity },
        resolveWithFullResponse: true,
        ...opts
      })
      .then(response => res(response))
      .catch(error => {
        if (error.message === 'Error: Socket Closed' ) { 
          return rej(`Error: Tor Socks5 Proxy ${this.host}:${this.socksPort}`)
        } else if(error.name === 'RequestError' ) { 
          console.log('Tor '+error.message)
          rej(error)
        } else {
          rej(error)
        }
      })
      .finally(() => {
        if (agent && agent.encryptedSocket) {
         agent.encryptedSocket.end()
        }
      })
    })
  }
}