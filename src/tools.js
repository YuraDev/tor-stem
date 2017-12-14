import fs from 'fs'
import net from 'net'
import Temp from 'temp'
import {join} from 'path'
import { Transform } from 'stream'


// mkdir
Temp.track()
let temp = dir => new Promise(
  (done, error) => Temp.mkdir(dir, (err, res) => err ? error(err) : done(res)) 
)

let isPort = (opts = 0) => new Promise((done, error) => {
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

let defer = (Promise) => {
  if (Promise == null) Promise = global.Promise
  if (this instanceof defer) return defer(Promise, this)
  let deferred = Object.create(defer.prototype)
  deferred.promise = new Promise((resolve, reject) => {
    deferred.resolve = resolve
    deferred.reject = reject
  })
  return deferred
}

let createReply = () => new Transform({
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

export {
  temp,
  defer,
  isPort,
  createReply
}