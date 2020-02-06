const ws = require('ws')
    const tmclient = new ws("ws://" + "ec2-54-189-179-159.us-west-2.compute.amazonaws.com:26657" + "/websocket")
    const event = "tm.event='NewBlock'"
    tmclient.on('open', () => {
      console.log("Tendermint connected")
      console.log("Tendermint subscribe: " + event)
      const req= {
          "jsonrpc": "2.0",
          "method": "subscribe",
          "id": "0",
          "params": {
              "query": "tm.event='Tx' AND transfer.recipient='cosmos1kq93474lnp3cdfjngeq0x5a35frwg4tskjukav'"
              }
      }
      const req2= {
          "jsonrpc": "2.0",
          "method": "subscribe",
          "id": "0",
          "params": {
              "query": "tm.event='Tx' AND transfer.recipient='cosmos1qd59rlrm0ymz3r8lpj4yecazd38grxxjtw9zk6'"
              }
      }
      tmclient.send(JSON.stringify(req))
    })
    tmclient.on('message', msg => {
      const obj = JSON.parse(msg)
      if (obj.result === undefined) {
        console.log("Tendermint message error: " + event + ": " + JSON.stringify(obj, null, 2))
        tmclient.close()
        return
      }
      console.log("Tendermint message: " + msg)
      // do stuff
    })
    tmclient.on('close', () => {
      console.log("Tendermint disconnected: " + event)
    })
    tmclient.on('error', err => {
      console.log("Tendermint error: " + err.message)
    })
